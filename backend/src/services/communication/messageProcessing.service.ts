/**
 * Message Processing Service
 * 
 * Handles message processing worker that consumes jobs from the queue
 * Sends messages via WhatsApp and updates status
 */

import { Job } from 'bull';
import { MessageStatus } from '@prisma/client';
import { Server as SocketServer } from 'socket.io';
import prisma from '@/utils/prisma-client';
import logger from '@/utils/logger';
import { MessageJob, messageQueueService } from './messageQueue.service';
import { getWhatsAppService } from './whatsapp.registry';
import { campaignService } from './campaign.service';
import { InvalidPhoneNumberError } from '@/utils/phone';

/**
 * Message Processing Service Class
 *
 * WHY: A single queue serves all organizations; each job carries its own
 * organizationId so the correct org's WhatsApp client is resolved per-job
 * via the registry, rather than binding one client at construction time.
 */
export class MessageProcessingService {
  private io: SocketServer;
  private isProcessing = false;

  constructor(io: SocketServer) {
    this.io = io;
  }
  
  /**
   * Initialize the message processor
   * Sets up queue event handlers and workers
   */
  initialize(): void {
    const queue = messageQueueService.getQueue();
    
    // Process jobs from the queue
    queue.process(async (job: Job<MessageJob>) => {
      return await this.processMessage(job);
    });
    
    // Event handlers
    queue.on('completed', async (job: Job<MessageJob>) => {
      logger.info(`Job completed: ${job.id}`);
      await this.onJobCompleted(job);
    });
    
    queue.on('failed', async (job: Job<MessageJob>, err: Error) => {
      logger.error(`Job failed: ${job.id}`, err);
      await this.onJobFailed(job, err);
    });
    
    queue.on('stalled', (job: Job<MessageJob>) => {
      logger.warn(`Job stalled: ${job.id}`);
    });
    
    queue.on('active', (job: Job<MessageJob>) => {
      logger.debug(`Job active: ${job.id}`);
    });
    
    logger.info('Message processor initialized');
  }
  
  /**
   * Process a single message job
   */
  private async processMessage(job: Job<MessageJob>): Promise<void> {
    const { messageId, organizationId, phone, body, subject, attachmentUrl } = job.data;

    logger.info(`Processing message: ${messageId}`);

    // Check if this org's WhatsApp is connected and ready
    const whatsappService = getWhatsAppService(organizationId);
    const status = whatsappService?.getStatus();
    if (!whatsappService || !status?.isReady) {
      throw new Error('WhatsApp is not ready');
    }

    // WHY: Avoid wasting a send attempt (and the ban-risk signal that comes
    // with it) on a number that isn't even on WhatsApp. Fails OPEN on a
    // lookup error — a flaky check shouldn't block an otherwise-legitimate
    // send.
    let isRegistered = true;
    try {
      isRegistered = await whatsappService.isRegisteredUser(phone);
    } catch (error) {
      logger.warn(`isRegisteredUser check failed for ${messageId}, proceeding with send:`, error);
    }
    if (!isRegistered) {
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.FAILED,
          failedAt: new Date(),
          errorMessage: 'Phone number is not registered on WhatsApp',
        },
      });
      logger.warn(`Message permanently failed (not a WhatsApp number): ${messageId}`);
      return;
    }

    // Update message status to SENDING
    await prisma.message.update({
      where: { id: messageId },
      data: { status: MessageStatus.SENDING },
    });

    // Send message
    try {
      if (attachmentUrl) {
        await whatsappService.sendMessageWithAttachment(phone, body, attachmentUrl);
      } else {
        await whatsappService.sendMessage(phone, body);
      }
      
      // Update message status to SENT
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.SENT,
          sentAt: new Date(),
        },
      });
      
      logger.info(`Message sent successfully: ${messageId}`);
    } catch (error) {
      logger.error(`Failed to send message: ${messageId}`, error);

      // An invalid number (e.g. missing country code) will never succeed on
      // retry — fail it permanently now instead of burning 3 attempts against
      // whatsapp-web.js.
      if (error instanceof InvalidPhoneNumberError) {
        await prisma.message.update({
          where: { id: messageId },
          data: {
            status: MessageStatus.FAILED,
            failedAt: new Date(),
            errorMessage: error.message,
          },
        });
        logger.error(`Message permanently failed (invalid phone number): ${messageId}`);
        return;
      }

      throw error; // Let Bull handle retries for transient failures
    }
  }
  
  /**
   * Handle job completion
   */
  private async onJobCompleted(job: Job<MessageJob>): Promise<void> {
    const { messageId, campaignId, organizationId } = job.data;

    // Update campaign statistics
    await campaignService.updateCampaignStats(campaignId, organizationId);

    // Emit progress event via Socket.io, scoped to the owning organization
    const stats = await campaignService.getCampaignStats(campaignId, organizationId);
    this.io.to(`org:${organizationId}`).emit('campaign:progress', {
      campaignId,
      messageId,
      status: 'completed',
      stats,
    });
  }
  
  /**
   * Handle job failure
   */
  private async onJobFailed(job: Job<MessageJob>, error: Error): Promise<void> {
    const { messageId, campaignId, organizationId } = job.data;

    // Check if max retries exceeded
    const maxRetries = 3;
    if (job.attemptsMade >= maxRetries) {
      // Mark message as permanently failed
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.FAILED,
          failedAt: new Date(),
          errorMessage: error.message,
        },
      });
      
      logger.error(`Message permanently failed: ${messageId}`);
    } else {
      // Message will be retried by Bull
      logger.warn(`Message failed, will retry: ${messageId} (attempt ${job.attemptsMade}/${maxRetries})`);
    }
    
    // Update campaign statistics
    await campaignService.updateCampaignStats(campaignId, organizationId);

    // Emit error event via Socket.io, scoped to the owning organization
    this.io.to(`org:${organizationId}`).emit('campaign:message-failed', {
      campaignId,
      messageId,
      error: error.message,
      attempt: job.attemptsMade,
      maxRetries,
    });
  }
  
  /**
   * Validate recipient
   */
  validateRecipient(phone: string): boolean {
    // Basic phone validation
    if (!phone) return false;
    
    // Remove non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Should have at least 10 digits
    return cleaned.length >= 10;
  }
  
  /**
   * Validate message
   */
  validateMessage(body: string): boolean {
    // Message should not be empty
    if (!body || body.trim().length === 0) return false;
    
    // WhatsApp message length limit (roughly 65,536 characters)
    if (body.length > 65000) return false;
    
    return true;
  }
  
  /**
   * Get processing status
   */
  isActive(): boolean {
    return this.isProcessing;
  }
  
  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down message processor...');
    const queue = messageQueueService.getQueue();
    await queue.close();
    logger.info('Message processor shut down');
  }
}

/**
 * Create and initialize message processing service
 */
export const createMessageProcessingService = (
  io: SocketServer
): MessageProcessingService => {
  const service = new MessageProcessingService(io);
  service.initialize();
  return service;
};
