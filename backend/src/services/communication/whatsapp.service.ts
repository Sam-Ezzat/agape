/**
 * WhatsApp Service
 *
 * Handles WhatsApp automation using Baileys — a protocol-level WebSocket
 * client that speaks WhatsApp Web's own connection protocol directly.
 * Provides message sending, session management, and rate limiting.
 *
 * WHY Baileys instead of whatsapp-web.js: whatsapp-web.js drives a full
 * headless Chromium instance per organization (~300-500MB+ RAM each) via
 * Puppeteer. Baileys needs no browser at all (~30-80MB per session), and
 * doesn't present the "automated Chrome" fingerprint that WhatsApp's
 * anti-bot detection is tuned to catch.
 */

import path from 'path';
import fs from 'fs/promises';
import pino from 'pino';
import type { WASocket, ConnectionState, AnyMessageContent } from '@whiskeysockets/baileys';
import { Server as SocketServer } from 'socket.io';
import logger from '@/utils/logger';
import prisma from '@/utils/prisma-client';
import { normalizePhoneNumber } from '@/utils/phone';

// WHY: Matches a reply that's ENTIRELY (trim + case-insensitive) one of
// these opt-out phrases — deliberately not a substring match, so a message
// that merely mentions "stop" in a longer sentence doesn't false-positive
// unsubscribe someone.
const OPT_OUT_KEYWORDS = /^(stop|unsubscribe|opt\s*out|توقف|الغاء الاشتراك|إلغاء الاشتراك|وقف الرسائل)$/i;

const baileysLogger = pino({ level: process.env.WHATSAPP_LOG_LEVEL || 'warn' });

let baileysModulePromise: Promise<typeof import('@whiskeysockets/baileys')> | null = null;

// WHY: @whiskeysockets/baileys ships ESM-only ("type": "module" in its own
// package.json). This backend compiles to CommonJS, and while modern Node
// can `require()` an ESM-only package directly, that support only landed in
// Node 20.19+/22.12+ — CI and deploy are still pinned to Node 18. A genuine
// dynamic `import()` works on any Node version, but TypeScript's CommonJS
// output downlevels a bare `import()` back into a `require()` call, which
// would defeat the point — wrapping it in `Function(...)` hides it from that
// transform so it survives as a real dynamic import at runtime.
function importBaileys(): Promise<typeof import('@whiskeysockets/baileys')> {
  if (!baileysModulePromise) {
    baileysModulePromise = Function('return import("@whiskeysockets/baileys")')();
  }
  return baileysModulePromise;
}

function getDisconnectStatusCode(error: unknown): number | undefined {
  return (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

export interface WhatsAppStatus {
  isConnected: boolean;
  isReady: boolean;
  isInitializing: boolean;
  sessionActive: boolean;
  lastActivity?: Date;
  qrCode?: string;
  loadingPercent?: number;
  loadingMessage?: string;
  initializationError?: string;
}

export interface WarmupInfo {
  stage: 'unknown' | 'day1' | 'day2-3' | 'day4-7' | 'established';
  limitMultiplier: number;
  delayMultiplier: number;
  hoursSinceActive: number | null;
}

export interface RateLimitStatus {
  hourlyCount: number;
  dailyCount: number;
  hourlyLimit: number;
  dailyLimit: number;
  hourlyRemaining: number;
  dailyRemaining: number;
  canSend: boolean;
  warmup: WarmupInfo;
}

// Baileys' DisconnectReason.loggedOut is the numeric value 401. Kept as a
// literal (rather than importing DisconnectReason at module scope) so this
// classifier stays a plain, synchronously-testable function that doesn't
// depend on the async ESM import below.
const WHATSAPP_LOGGED_OUT_STATUS_CODE = 401;

// DisconnectReason.timedOut (408), .connectionClosed (428), .restartRequired
// (515) — transient network-level hiccups worth retrying, as opposed to
// genuinely fatal reasons like forbidden/badSession/connectionReplaced.
const TRANSIENT_DISCONNECT_STATUS_CODES = new Set([408, 428, 515]);

export function isTransientInitializationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('initialization timed out')) return true;
  if (message.includes('stale session cleared')) return true;

  const codeMatch = message.match(/\(code (\d+)\)/);
  if (codeMatch && TRANSIENT_DISCONNECT_STATUS_CODES.has(Number(codeMatch[1]))) return true;

  return false;
}

export function isRecoverableSessionLogout(statusCode: unknown): boolean {
  return statusCode === WHATSAPP_LOGGED_OUT_STATUS_CODE;
}

const INITIALIZATION_ATTEMPT_TIMEOUT_MS = 45_000;

/**
 * Scales send limits down / delay up for a freshly-connected WhatsApp
 * session, ramping to full configured capacity over a week. A brand-new
 * number sending at full volume immediately is one of the strongest ban
 * signals — this spreads that risk out.
 *
 * WHY `sessionActiveSince: null` -> 'established' (no throttling): sessions
 * that were already active before this feature shipped have no recorded
 * start time — treating that as "day 1" would retroactively (and
 * incorrectly) throttle an already-trusted, established number.
 *
 * Exported as a standalone pure function (not a class method) so it's
 * directly unit-testable without spinning up a WhatsAppService instance.
 */
export function computeWarmupFactor(sessionActiveSince: Date | null, now: Date = new Date()): WarmupInfo {
  if (!sessionActiveSince) {
    return { stage: 'established', limitMultiplier: 1, delayMultiplier: 1, hoursSinceActive: null };
  }

  const hoursSinceActive = (now.getTime() - sessionActiveSince.getTime()) / (60 * 60 * 1000);

  if (hoursSinceActive < 24) {
    return { stage: 'day1', limitMultiplier: 0.2, delayMultiplier: 2, hoursSinceActive };
  }
  if (hoursSinceActive < 72) {
    return { stage: 'day2-3', limitMultiplier: 0.5, delayMultiplier: 1.5, hoursSinceActive };
  }
  if (hoursSinceActive < 168) {
    return { stage: 'day4-7', limitMultiplier: 0.75, delayMultiplier: 1.2, hoursSinceActive };
  }
  return { stage: 'established', limitMultiplier: 1, delayMultiplier: 1, hoursSinceActive };
}

/**
 * WhatsApp Service Class
 */
export class WhatsAppService {
  private sock: WASocket | null = null;
  private initializationPromise: Promise<void> | null = null;
  private io: SocketServer;
  private organizationId: string;
  private isInitialized = false;
  private isReady = false;
  private qrCode: string | null = null;
  private loadingMessage: string | null = null;
  private initializationError: string | null = null;

  // Rate limiting counters
  private messagesSentThisHour = 0;
  private messagesSentThisDay = 0;
  private hourlyResetTimer?: NodeJS.Timeout;
  private dailyResetTimer?: NodeJS.Timeout;

  // WHY: Baileys does not reconnect on its own — the caller is expected to
  // recreate the socket on every non-logout close. This isn't just for real
  // network blips: WhatsApp's servers routinely send a "restartRequired"
  // close immediately after a *successful* first-time QR pairing, as a
  // normal part of the handshake, not a failure. Capped + backed-off so a
  // persistently broken connection doesn't hammer WhatsApp's servers
  // (repeated automated reconnects are themselves a ban signal).
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private static readonly MAX_AUTO_RECONNECT_ATTEMPTS = 8;

  // WHY: null until this org's session has a recorded first-activation
  // timestamp (see computeWarmupFactor) — drives the warm-up ramp-up.
  private sessionActiveSince: Date | null = null;

  // Settings
  private settings: {
    delayMin: number;
    delayMax: number;
    maxPerHour: number;
    maxPerDay: number;
  } = {
    delayMin: 3000,
    delayMax: 8000,
    maxPerHour: 100,
    maxPerDay: 300,
  };

  constructor(io: SocketServer, organizationId: string) {
    this.io = io;
    this.organizationId = organizationId;
    this.loadSettings();
    this.startRateLimitResetTimers();
  }

  /**
   * Emit an event scoped to this WhatsApp instance's organization only.
   */
  private emit(event: string, payload?: unknown): void {
    this.io.to(`org:${this.organizationId}`).emit(event, payload);
  }

  // WHY: Defaults to the app's own (ephemeral, per-deploy) working directory.
  // Set DATA_DIR to a Render persistent Disk's mount path in production so
  // the authenticated session survives redeploys instead of forcing a QR
  // re-scan every time.
  private get sessionDataPath(): string {
    return path.join(process.env.DATA_DIR || process.cwd(), 'whatsapp-sessions', this.organizationId);
  }

  /**
   * Load settings from database
   */
  private async loadSettings() {
    try {
      const settings = await prisma.communicationSettings.findUnique({
        where: { organizationId: this.organizationId },
      });
      if (settings) {
        this.settings = {
          delayMin: settings.whatsappDelayMin,
          delayMax: settings.whatsappDelayMax,
          maxPerHour: settings.maxMessagesPerHour,
          maxPerDay: settings.maxMessagesPerDay,
        };
        this.sessionActiveSince = settings.whatsappSessionActiveSince;
      }
    } catch (error) {
      logger.error('Failed to load WhatsApp settings:', error);
    }
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.isReady) {
      logger.warn('WhatsApp client already initialized and ready');
      return;
    }

    if (this.initializationPromise) {
      logger.info('WhatsApp client initialization already in progress');
      return this.initializationPromise;
    }

    this.initializationPromise = this.initializeClient();
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeClient(): Promise<void> {
    // If initialized but not ready (disconnected), allow re-initialization
    if (this.isInitialized && !this.isReady) {
      logger.info('WhatsApp client was disconnected, re-initializing...');
      await this.destroySocket();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info('Initializing WhatsApp client...');
    this.loadingMessage = 'Starting WhatsApp client...';
    this.initializationError = null;

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, fetchLatestBaileysVersion } =
          await importBaileys();

        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDataPath);

        let version: [number, number, number] | undefined;
        try {
          version = (await fetchLatestBaileysVersion()).version;
        } catch (error) {
          logger.warn('Failed to fetch latest WhatsApp Web version; using library default:', error);
        }

        const sock = makeWASocket({
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
          },
          logger: baileysLogger,
          browser: Browsers.ubuntu('Chrome'),
          version,
          syncFullHistory: false,
          markOnlineOnConnect: false,
          generateHighQualityLinkPreview: false,
        });

        this.sock = sock;
        sock.ev.on('creds.update', saveCreds);
        this.setupEventHandlers(sock);

        logger.info(`Starting WhatsApp client initialization (attempt ${attempt}/${maxAttempts})...`);
        await this.waitForSocketStartup(sock);
        this.isInitialized = true;

        logger.info('WhatsApp client initialization completed');
        return;
      } catch (error) {
        await this.destroySocket();

        if (attempt < maxAttempts && isTransientInitializationError(error)) {
          const reason = error instanceof Error ? error.message : String(error);
          logger.warn(`WhatsApp initialization attempt failed (${reason}); retrying with a fresh client...`);
          this.loadingMessage = 'WhatsApp startup was interrupted. Retrying...';
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        logger.error('Failed to initialize WhatsApp client:', error);
        this.isInitialized = false;
        this.loadingMessage = null;
        this.initializationError = error instanceof Error ? error.message : String(error);
        throw new Error(`WhatsApp initialization failed: ${this.initializationError}`);
      }
    }
  }

  /**
   * Race a fresh socket's connection.update events against a timeout,
   * resolving as soon as either a QR code or an open connection shows up.
   */
  private async waitForSocketStartup(sock: WASocket): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    let resolveStartup!: () => void;
    let rejectStartup!: (error: Error) => void;

    const startupSignal = new Promise<void>((resolve, reject) => {
      resolveStartup = resolve;
      rejectStartup = reject;
    });

    const onUpdate = async (update: Partial<ConnectionState>) => {
      try {
        if (update.qr) {
          resolveStartup();
          return;
        }
        if (update.connection === 'open') {
          resolveStartup();
          return;
        }
        if (update.connection === 'close') {
          const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);

          if (isRecoverableSessionLogout(statusCode)) {
            // WHY: a LOGOUT this early (a restored session got rejected, or
            // even a brand-new session got immediately bounced) means the
            // local auth state is no longer valid. We own this cleanup
            // ourselves (unlike whatsapp-web.js, whose internal cleanup used
            // to crash the whole process on Windows) — clear it and let the
            // attempt loop above retry with a genuinely fresh session.
            this.loadingMessage = 'Previous session expired. Generating a new QR code...';
            await this.clearAuthState();
            rejectStartup(new Error('WhatsApp session expired (stale session cleared); retrying with a fresh QR code'));
            return;
          }

          rejectStartup(new Error(`WhatsApp disconnected during initialization (code ${statusCode ?? 'unknown'})`));
        }
      } catch (error) {
        rejectStartup(error instanceof Error ? error : new Error(String(error)));
      }
    };

    sock.ev.on('connection.update', onUpdate);

    try {
      await Promise.race([
        startupSignal,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`WhatsApp client initialization timed out after ${INITIALIZATION_ATTEMPT_TIMEOUT_MS / 1000} seconds`)),
            INITIALIZATION_ATTEMPT_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      sock.ev.off('connection.update', onUpdate);
    }
  }

  /**
   * Delete this org's local Baileys auth state so the next connection
   * attempt starts fresh (and presents a new QR). Wrapped so that a failure
   * here (e.g. a file transiently locked) is logged, not fatal — see
   * waitForSocketStartup for why that matters.
   */
  private async clearAuthState(): Promise<void> {
    try {
      await fs.rm(this.sessionDataPath, { recursive: true, force: true });
    } catch (error) {
      logger.warn(`Failed to clear stale WhatsApp session directory for org ${this.organizationId}:`, error);
    }
  }

  private async destroySocket(): Promise<void> {
    const sock = this.sock;
    this.sock = null;
    if (!sock) return;

    sock.ev.removeAllListeners('connection.update');
    sock.ev.removeAllListeners('messages.upsert');
    sock.ev.removeAllListeners('creds.update');
    try {
      sock.end(undefined);
    } catch (error) {
      logger.warn('Failed to fully close WhatsApp socket:', error);
    }
  }

  /**
   * Wire up the socket's lifetime event handlers: connection state changes
   * (QR / ready / disconnected) and incoming messages (opt-out detection).
   */
  private setupEventHandlers(sock: WASocket): void {
    sock.ev.on('connection.update', async (update) => {
      try {
        if (update.qr) {
          logger.info('QR Code received');
          this.qrCode = update.qr;
          this.loadingMessage = null;
          this.emit('whatsapp:qr', { qr: update.qr });
        }

        if (update.connection === 'open') {
          logger.info('WhatsApp client is ready!');
          this.isReady = true;
          this.qrCode = null;
          this.loadingMessage = null;
          this.reconnectAttempts = 0;
          this.emit('whatsapp:ready');

          // Update database
          await this.updateSessionStatus(true);
        }

        if (update.connection === 'close') {
          const statusCode = getDisconnectStatusCode(update.lastDisconnect?.error);
          logger.warn('WhatsApp disconnected:', statusCode ?? update.lastDisconnect?.error);
          this.isReady = false;
          this.isInitialized = false;
          this.qrCode = null;
          this.emit('whatsapp:disconnected', { reason: statusCode });

          // Update database
          await this.updateSessionStatus(false);

          if (isRecoverableSessionLogout(statusCode)) {
            this.reconnectAttempts = 0;
            await this.clearAuthState();
            logger.info('WhatsApp session logged out. Initialize again from the UI to scan a new QR code.');
            return;
          }

          // WHY: reconnect automatically here rather than just logging and
          // waiting for the user — see the reconnectAttempts field comment.
          // This is what makes the routine post-pairing "restartRequired"
          // close (and any other transient drop) invisible to the user
          // instead of dumping them back to "click Initialize".
          if (this.reconnectAttempts >= WhatsAppService.MAX_AUTO_RECONNECT_ATTEMPTS) {
            logger.error(
              `WhatsApp gave up auto-reconnecting after ${this.reconnectAttempts} attempts (last code ${statusCode ?? 'unknown'}). Initialize again from the UI.`
            );
            return;
          }

          this.reconnectAttempts++;
          const delayMs = Math.min(30_000, 1000 * 2 ** this.reconnectAttempts);
          logger.info(
            `Reconnecting WhatsApp in ${delayMs}ms (attempt ${this.reconnectAttempts}/${WhatsAppService.MAX_AUTO_RECONNECT_ATTEMPTS})...`
          );
          this.reconnectTimer = setTimeout(() => {
            this.initialize().catch((error) => {
              logger.error('WhatsApp automatic reconnect failed:', error);
            });
          }, delayMs);
        }
      } catch (error) {
        logger.error('Error handling WhatsApp connection update:', error);
      }
    });

    // Incoming message — watch for opt-out/unsubscribe replies.
    // WHY: repeat-messaging someone who's opted out is a direct path to
    // being reported/blocked, which is itself a ban signal, and violates
    // WhatsApp Business policy. This is the only place a recipient can
    // reach us to ask to stop.
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // WHY: only 'notify' events are live incoming messages — 'append' etc.
      // are historical sync data replayed on connect, which we don't want
      // to reprocess as fresh opt-out requests.
      if (type !== 'notify') return;

      for (const msg of messages) {
        try {
          if (msg.key.fromMe) continue;

          const text = msg.message?.conversation ?? msg.message?.extendedTextMessage?.text;
          if (!text || !OPT_OUT_KEYWORDS.test(text.trim())) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid) continue;

          // WHY: `remoteJid` is WhatsApp's canonical normalized digits, but
          // `Attendee.phone` is stored as originally typed (may have local
          // formatting — spaces, dashes, a leading trunk 0, no country code).
          // A raw string comparison would miss most real matches, so
          // normalize each candidate the same way sends already do and
          // compare the canonical forms.
          const incomingPhone = remoteJid.replace('@s.whatsapp.net', '');
          const candidates = await prisma.attendee.findMany({
            where: { organizationId: this.organizationId, phone: { not: null }, whatsappOptOut: false },
            select: { id: true, phone: true },
          });
          const matchingIds = candidates
            .filter((a) => {
              try {
                return normalizePhoneNumber(a.phone) === incomingPhone;
              } catch {
                return false;
              }
            })
            .map((a) => a.id);

          if (matchingIds.length > 0) {
            await prisma.attendee.updateMany({
              where: { id: { in: matchingIds } },
              data: { whatsappOptOut: true, whatsappOptOutAt: new Date() },
            });
            logger.info(`Opt-out recorded for ${incomingPhone} (${matchingIds.length} matching attendee record(s))`);
            await this.sock?.sendMessage(remoteJid, {
              text: 'You have been unsubscribed and will not receive further messages. تم إلغاء اشتراكك ولن تصلك رسائل أخرى.',
            });
          }
        } catch (error) {
          logger.error('Failed to process incoming message for opt-out detection:', error);
        }
      }
    });
  }

  /**
   * Update session status in database
   */
  private async updateSessionStatus(active: boolean): Promise<void> {
    try {
      await prisma.communicationSettings.updateMany({
        where: { organizationId: this.organizationId },
        data: {
          whatsappSessionActive: active,
        },
      });

      // WHY: Only stamp the warm-up start time ONCE, on this session's
      // first-ever activation — a later reconnect of the SAME authenticated
      // number must not reset the ramp-up clock (see computeWarmupFactor).
      if (active && !this.sessionActiveSince) {
        const now = new Date();
        const result = await prisma.communicationSettings.updateMany({
          where: { organizationId: this.organizationId, whatsappSessionActiveSince: null },
          data: { whatsappSessionActiveSince: now },
        });
        if (result.count > 0) {
          this.sessionActiveSince = now;
        }
      }
    } catch (error) {
      logger.error('Failed to update session status:', error);
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(phone: string, message: string): Promise<boolean> {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp client is not ready');
    }

    // Check rate limits
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    // Validate/normalize before touching WhatsApp — an unnormalized number
    // (e.g. missing country code) crashes deep inside puppeteer with an
    // opaque error, so fail with a clear message up front instead.
    const jid = this.formatPhoneNumber(phone);

    try {
      logger.info(`Sending message to ${jid}`);

      // Send message
      await this.sock.sendMessage(jid, { text: message });

      // Increment counters
      this.messagesSentThisHour++;
      this.messagesSentThisDay++;

      // Apply rate limiting delay
      await this.applyDelay();

      logger.info(`Message sent successfully to ${jid}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send message to ${phone}:`, error);
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send a message with attachment
   */
  async sendMessageWithAttachment(phone: string, message: string, attachmentUrl: string): Promise<boolean> {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp client is not ready');
    }

    // Check rate limits
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    // Validate/normalize before touching WhatsApp — see sendMessage() for why.
    const jid = this.formatPhoneNumber(phone);

    try {
      logger.info(`Sending message with attachment to ${jid}`);

      const media = await this.downloadAttachment(attachmentUrl);
      const content: AnyMessageContent = media.mimetype.startsWith('image/')
        ? { image: media.buffer, caption: message, mimetype: media.mimetype }
        : { document: media.buffer, mimetype: media.mimetype, fileName: media.fileName, caption: message };

      // Send message with media
      await this.sock.sendMessage(jid, content);

      // Increment counters
      this.messagesSentThisHour++;
      this.messagesSentThisDay++;

      // Apply rate limiting delay (longer for media)
      await this.applyDelay(1.5);

      logger.info(`Message with attachment sent successfully to ${jid}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send message with attachment to ${phone}:`, error);
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async downloadAttachment(url: string): Promise<{ buffer: Buffer; mimetype: string; fileName: string }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment (HTTP ${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mimetype = response.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
    const fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'attachment');

    return { buffer, mimetype, fileName };
  }

  /**
   * Format phone number for WhatsApp
   * Ensures format is correct: countryCode + number + @s.whatsapp.net
   * Throws InvalidPhoneNumberError if the number can't be normalized to a valid
   * international number (e.g. missing/invalid country code).
   */
  private formatPhoneNumber(phone: string): string {
    const normalized = normalizePhoneNumber(phone);
    return `${normalized}@s.whatsapp.net`;
  }

  /**
   * Apply rate limiting delay
   */
  private async applyDelay(multiplier: number = 1): Promise<void> {
    const warmup = computeWarmupFactor(this.sessionActiveSince);
    const min = this.settings.delayMin * multiplier * warmup.delayMultiplier;
    const max = this.settings.delayMax * multiplier * warmup.delayMultiplier;

    // Random delay between min and max
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;

    logger.debug(`Applying rate limit delay: ${delay}ms (warmup stage: ${warmup.stage})`);

    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Check if we can send more messages (rate limit check)
   * WHY: Limits are scaled down by the warm-up multiplier for a
   * freshly-connected session — see computeWarmupFactor.
   */
  checkRateLimit(): boolean {
    const warmup = computeWarmupFactor(this.sessionActiveSince);
    const maxPerHour = Math.max(1, Math.floor(this.settings.maxPerHour * warmup.limitMultiplier));
    const maxPerDay = Math.max(1, Math.floor(this.settings.maxPerDay * warmup.limitMultiplier));

    const hourly = this.messagesSentThisHour < maxPerHour;
    const daily = this.messagesSentThisDay < maxPerDay;

    return hourly && daily;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    const warmup = computeWarmupFactor(this.sessionActiveSince);
    const hourlyLimit = Math.max(1, Math.floor(this.settings.maxPerHour * warmup.limitMultiplier));
    const dailyLimit = Math.max(1, Math.floor(this.settings.maxPerDay * warmup.limitMultiplier));

    return {
      hourlyCount: this.messagesSentThisHour,
      dailyCount: this.messagesSentThisDay,
      hourlyLimit,
      dailyLimit,
      hourlyRemaining: Math.max(0, hourlyLimit - this.messagesSentThisHour),
      dailyRemaining: Math.max(0, dailyLimit - this.messagesSentThisDay),
      canSend: this.checkRateLimit(),
      warmup,
    };
  }

  /**
   * Start timers to reset rate limit counters
   */
  private startRateLimitResetTimers(): void {
    // Reset hourly counter every hour
    this.hourlyResetTimer = setInterval(() => {
      logger.info('Resetting hourly message counter');
      this.messagesSentThisHour = 0;
    }, 60 * 60 * 1000); // 1 hour

    // Reset daily counter every 24 hours
    this.dailyResetTimer = setInterval(() => {
      logger.info('Resetting daily message counter');
      this.messagesSentThisDay = 0;
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Get current WhatsApp status
   */
  getStatus(): WhatsAppStatus {
    return {
      isConnected: this.isInitialized,
      isReady: this.isReady,
      isInitializing: this.initializationPromise !== null,
      sessionActive: this.isReady,
      qrCode: this.qrCode || undefined,
      lastActivity: this.isReady ? new Date() : undefined,
      loadingPercent: undefined,
      loadingMessage: this.loadingMessage ?? undefined,
      initializationError: this.initializationError ?? undefined,
    };
  }

  /**
   * Check if a phone number is registered on WhatsApp
   */
  async isRegisteredUser(phone: string): Promise<boolean> {
    if (!this.isReady || !this.sock) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      const jid = this.formatPhoneNumber(phone);
      const results = await this.sock.onWhatsApp(jid);
      return Boolean(results?.[0]?.exists);
    } catch (error) {
      logger.error(`Failed to check if user is registered: ${phone}`, error);
      return false;
    }
  }

  /**
   * Send a test message
   */
  async sendTestMessage(phone: string): Promise<boolean> {
    const testMessage = '🧪 اختبار: هذه رسالة اختبارية من نظام إدارة المؤتمرات';
    return await this.sendMessage(phone, testMessage);
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    logger.info('Disconnecting WhatsApp client...');

    if (this.hourlyResetTimer) {
      clearInterval(this.hourlyResetTimer);
    }

    if (this.dailyResetTimer) {
      clearInterval(this.dailyResetTimer);
    }

    // WHY: a deliberate disconnect must cancel any auto-reconnect already
    // scheduled from a prior close event — otherwise it fires a few seconds
    // later and silently reconnects right after the user asked to disconnect.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.reconnectAttempts = 0;

    await this.destroySocket();

    this.isInitialized = false;
    this.isReady = false;
    this.qrCode = null;
    this.loadingMessage = null;
    this.initializationError = null;

    await this.updateSessionStatus(false);

    logger.info('WhatsApp client disconnected');
  }

  /**
   * Reconnect to WhatsApp
   */
  async reconnect(): Promise<void> {
    logger.info('Reconnecting WhatsApp client...');

    await this.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.initialize();
  }
}

// WHY: Instances are now created per-organization via whatsapp.registry.ts's
// getOrCreateWhatsAppService — this direct factory is kept only for tests.
export const createWhatsAppService = (io: SocketServer, organizationId: string): WhatsAppService => {
  return new WhatsAppService(io, organizationId);
};
