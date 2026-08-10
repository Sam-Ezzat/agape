/**
 * WhatsApp Service
 * 
 * Handles WhatsApp Web automation using whatsapp-web.js
 * Provides message sending, session management, and rate limiting
 */

import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import puppeteer from 'puppeteer';
import path from 'path';
import { Server as SocketServer } from 'socket.io';
import logger from '@/utils/logger';
import prisma from '@/utils/prisma-client';
import { normalizePhoneNumber } from '@/utils/phone';

// Matches the --path used in the "postinstall" script (package.json), so the
// browser Puppeteer downloads at install time is always the one it launches,
// regardless of any PUPPETEER_CACHE_DIR set (or not set) in the host environment.
process.env.PUPPETEER_CACHE_DIR = path.join(process.cwd(), '.cache', 'puppeteer');

// WHY: Matches a reply that's ENTIRELY (trim + case-insensitive) one of
// these opt-out phrases — deliberately not a substring match, so a message
// that merely mentions "stop" in a longer sentence doesn't false-positive
// unsubscribe someone.
const OPT_OUT_KEYWORDS = /^(stop|unsubscribe|opt\s*out|توقف|الغاء الاشتراك|إلغاء الاشتراك|وقف الرسائل)$/i;

export interface WhatsAppStatus {
  isConnected: boolean;
  isReady: boolean;
  sessionActive: boolean;
  lastActivity?: Date;
  qrCode?: string;
  loadingPercent?: number;
  loadingMessage?: string;
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
  private client: Client | null = null;
  private io: SocketServer;
  private organizationId: string;
  private isInitialized = false;
  private isReady = false;
  private qrCode: string | null = null;
  private loadingPercent: number | null = null;
  private loadingMessage: string | null = null;
  
  // Rate limiting counters
  private messagesSentThisHour = 0;
  private messagesSentThisDay = 0;
  private hourlyResetTimer?: NodeJS.Timeout;
  private dailyResetTimer?: NodeJS.Timeout;

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
    
    // If initialized but not ready (disconnected), allow re-initialization
    if (this.isInitialized && !this.isReady) {
      logger.info('WhatsApp client was disconnected, re-initializing...');
      await this.disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info('Initializing WhatsApp client...');
    this.loadingPercent = 0;
    this.loadingMessage = 'Starting WhatsApp client...';

    try {
      const executablePath = await puppeteer.executablePath();
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: `org-${this.organizationId}`,
          // WHY: Defaults to the app's own (ephemeral, per-deploy) working
          // directory. Set DATA_DIR to a Render persistent Disk's mount path
          // in production so the authenticated session survives redeploys
          // instead of forcing a QR re-scan every time.
          dataPath: path.join(process.env.DATA_DIR || process.cwd(), 'whatsapp-sessions', this.organizationId),
        }),
        puppeteer: {
          headless: true,
          executablePath,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
          ],
          timeout: 60000, // Increase timeout to 60 seconds
        },
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        },
      });
      
      this.setupEventHandlers();
      
      logger.info('Starting WhatsApp client initialization...');
      await this.client.initialize();
      this.isInitialized = true;
      
      logger.info('WhatsApp client initialization completed');
    } catch (error) {
      logger.error('Failed to initialize WhatsApp client:', error);
      this.isInitialized = false;
      this.loadingPercent = null;
      this.loadingMessage = null;
      throw new Error(`WhatsApp initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Setup event handlers for WhatsApp client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;
    
    // QR Code event - user needs to scan this
    this.client.on('qr', (qr) => {
      logger.info('QR Code received');
      this.qrCode = qr;
      this.loadingPercent = null;
      this.loadingMessage = null;
      this.emit('whatsapp:qr', { qr });
    });

    // Ready event - client is ready to send messages
    this.client.on('ready', async () => {
      logger.info('WhatsApp client is ready!');
      this.isReady = true;
      this.qrCode = null;
      this.loadingPercent = null;
      this.loadingMessage = null;
      this.emit('whatsapp:ready');

      // Update database
      await this.updateSessionStatus(true);
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      logger.info('WhatsApp authenticated');
      this.emit('whatsapp:authenticated');
    });

    // Authentication failure
    this.client.on('auth_failure', (error) => {
      logger.error('WhatsApp authentication failed:', error);
      this.isReady = false;
      this.isInitialized = false;
      this.emit('whatsapp:auth_failure', {
        error: typeof error === 'string' ? error : JSON.stringify(error)
      });
    });

    // Disconnected
    this.client.on('disconnected', async (reason) => {
      logger.warn('WhatsApp disconnected:', reason);
      this.isReady = false;
      this.isInitialized = false;
      this.qrCode = null;
      this.emit('whatsapp:disconnected', { reason });

      // Update database
      await this.updateSessionStatus(false);

      // Notify user to reconnect
      logger.info('To reconnect, please initialize WhatsApp again from the UI');
    });

    // Loading screen
    this.client.on('loading_screen', (percent, message) => {
      logger.debug(`WhatsApp loading: ${percent}%`);
      this.loadingPercent = typeof percent === 'number' ? percent : Number(percent) || 0;
      this.loadingMessage = message || null;
      this.emit('whatsapp:loading', { percent, message });
    });

    // Incoming message — watch for opt-out/unsubscribe replies.
    // WHY: repeat-messaging someone who's opted out is a direct path to
    // being reported/blocked, which is itself a ban signal, and violates
    // WhatsApp Business policy. This is the only place a recipient can
    // reach us to ask to stop.
    this.client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return;
        if (!OPT_OUT_KEYWORDS.test(msg.body.trim())) return;

        // WHY: `msg.from` is WhatsApp's canonical normalized digits, but
        // `Attendee.phone` is stored as originally typed (may have local
        // formatting — spaces, dashes, a leading trunk 0, no country code).
        // A raw string comparison would miss most real matches, so
        // normalize each candidate the same way sends already do and
        // compare the canonical forms.
        const incomingPhone = msg.from.replace('@c.us', '');
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
          await this.client?.sendMessage(
            msg.from,
            'You have been unsubscribed and will not receive further messages. تم إلغاء اشتراكك ولن تصلك رسائل أخرى.'
          );
        }
      } catch (error) {
        logger.error('Failed to process incoming message for opt-out detection:', error);
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
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp client is not ready');
    }

    // Check rate limits
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    // Validate/normalize before touching WhatsApp — an unnormalized number
    // (e.g. missing country code) crashes deep inside puppeteer with an
    // opaque error, so fail with a clear message up front instead.
    const chatId = this.formatPhoneNumber(phone);

    try {
      logger.info(`Sending message to ${chatId}`);

      // Send message
      await this.client.sendMessage(chatId, message);
      
      // Increment counters
      this.messagesSentThisHour++;
      this.messagesSentThisDay++;
      
      // Apply rate limiting delay
      await this.applyDelay();
      
      logger.info(`Message sent successfully to ${chatId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send message to ${phone}:`, error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }
  
  /**
   * Send a message with attachment
   */
  async sendMessageWithAttachment(
    phone: string,
    message: string,
    attachmentUrl: string
  ): Promise<boolean> {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp client is not ready');
    }
    
    // Check rate limits
    if (!this.checkRateLimit()) {
      throw new Error('Rate limit exceeded');
    }

    // Validate/normalize before touching WhatsApp — see sendMessage() for why.
    const chatId = this.formatPhoneNumber(phone);

    try {
      logger.info(`Sending message with attachment to ${chatId}`);

      // Download and prepare media
      const media = await MessageMedia.fromUrl(attachmentUrl);
      
      // Send message with media
      await this.client.sendMessage(chatId, media, {
        caption: message,
      });
      
      // Increment counters
      this.messagesSentThisHour++;
      this.messagesSentThisDay++;
      
      // Apply rate limiting delay (longer for media)
      await this.applyDelay(1.5);
      
      logger.info(`Message with attachment sent successfully to ${chatId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send message with attachment to ${phone}:`, error);
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }
  
  /**
   * Format phone number for WhatsApp
   * Ensures format is correct: countryCode + number + @c.us
   * Throws InvalidPhoneNumberError if the number can't be normalized to a valid
   * international number (e.g. missing/invalid country code).
   */
  private formatPhoneNumber(phone: string): string {
    const normalized = normalizePhoneNumber(phone);
    return `${normalized}@c.us`;
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
      sessionActive: this.isReady,
      qrCode: this.qrCode || undefined,
      lastActivity: this.isReady ? new Date() : undefined,
      loadingPercent: this.loadingPercent ?? undefined,
      loadingMessage: this.loadingMessage ?? undefined,
    };
  }
  
  /**
   * Check if a phone number is registered on WhatsApp
   */
  async isRegisteredUser(phone: string): Promise<boolean> {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp client is not ready');
    }
    
    try {
      const chatId = this.formatPhoneNumber(phone);
      const isRegistered = await this.client.isRegisteredUser(chatId);
      return isRegistered;
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
    
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
    
    this.isInitialized = false;
    this.isReady = false;
    this.qrCode = null;
    this.loadingPercent = null;
    this.loadingMessage = null;

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
