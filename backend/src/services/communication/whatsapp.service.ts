/**
 * WhatsApp Service
 * 
 * Handles WhatsApp Web automation using whatsapp-web.js
 * Provides message sending, session management, and rate limiting
 */

import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import puppeteer from 'puppeteer';
import { Server as SocketServer } from 'socket.io';
import logger from '@/utils/logger';
import { PrismaClient } from '@prisma/client';
import { normalizePhoneNumber } from '@/utils/phone';

const prisma = new PrismaClient();

export interface WhatsAppStatus {
  isConnected: boolean;
  isReady: boolean;
  sessionActive: boolean;
  lastActivity?: Date;
  qrCode?: string;
  loadingPercent?: number;
  loadingMessage?: string;
}

export interface RateLimitStatus {
  messagesThisHour: number;
  messagesThisDay: number;
  maxPerHour: number;
  maxPerDay: number;
  canSend: boolean;
}

/**
 * WhatsApp Service Class
 */
export class WhatsAppService {
  private client: Client | null = null;
  private io: SocketServer;
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
  
  constructor(io: SocketServer) {
    this.io = io;
    this.loadSettings();
    this.startRateLimitResetTimers();
  }
  
  /**
   * Load settings from database
   */
  private async loadSettings() {
    try {
      const settings = await prisma.communicationSettings.findFirst();
      if (settings) {
        this.settings = {
          delayMin: settings.whatsappDelayMin,
          delayMax: settings.whatsappDelayMax,
          maxPerHour: settings.maxMessagesPerHour,
          maxPerDay: settings.maxMessagesPerDay,
        };
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
      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'agape-conference',
          dataPath: './whatsapp-session',
        }),
        puppeteer: {
          headless: true,
          executablePath: puppeteer.executablePath(),
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
      this.io.emit('whatsapp:qr', { qr });
    });

    // Ready event - client is ready to send messages
    this.client.on('ready', async () => {
      logger.info('WhatsApp client is ready!');
      this.isReady = true;
      this.qrCode = null;
      this.loadingPercent = null;
      this.loadingMessage = null;
      this.io.emit('whatsapp:ready');

      // Update database
      await this.updateSessionStatus(true);
    });
    
    // Authenticated event
    this.client.on('authenticated', () => {
      logger.info('WhatsApp authenticated');
      this.io.emit('whatsapp:authenticated');
    });
    
    // Authentication failure
    this.client.on('auth_failure', (error) => {
      logger.error('WhatsApp authentication failed:', error);
      this.isReady = false;
      this.isInitialized = false;
      this.io.emit('whatsapp:auth_failure', { 
        error: typeof error === 'string' ? error : JSON.stringify(error) 
      });
    });
    
    // Disconnected
    this.client.on('disconnected', async (reason) => {
      logger.warn('WhatsApp disconnected:', reason);
      this.isReady = false;
      this.isInitialized = false;
      this.qrCode = null;
      this.io.emit('whatsapp:disconnected', { reason });
      
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
      this.io.emit('whatsapp:loading', { percent, message });
    });
  }
  
  /**
   * Update session status in database
   */
  private async updateSessionStatus(active: boolean): Promise<void> {
    try {
      await prisma.communicationSettings.updateMany({
        data: {
          whatsappSessionActive: active,
        },
      });
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
    const min = this.settings.delayMin * multiplier;
    const max = this.settings.delayMax * multiplier;
    
    // Random delay between min and max
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    
    logger.debug(`Applying rate limit delay: ${delay}ms`);
    
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
  
  /**
   * Check if we can send more messages (rate limit check)
   */
  checkRateLimit(): boolean {
    const hourly = this.messagesSentThisHour < this.settings.maxPerHour;
    const daily = this.messagesSentThisDay < this.settings.maxPerDay;
    
    return hourly && daily;
  }
  
  /**
   * Get rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    return {
      messagesThisHour: this.messagesSentThisHour,
      messagesThisDay: this.messagesSentThisDay,
      maxPerHour: this.settings.maxPerHour,
      maxPerDay: this.settings.maxPerDay,
      canSend: this.checkRateLimit(),
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

// Export singleton instance factory
export const createWhatsAppService = (io: SocketServer): WhatsAppService => {
  return new WhatsAppService(io);
};
