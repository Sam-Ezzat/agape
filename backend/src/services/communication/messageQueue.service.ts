/**
 * Message Queue Service
 * 
 * Handles message queue management using Bull
 * Processes messages in batches with rate limiting
 */

import Bull, { Queue, Job } from 'bull';
import { PrismaClient, MessageStatus } from '@prisma/client';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

export interface MessageJob {
  messageId: string;
  campaignId: string;
  organizationId: string;
  phone: string;
  body: string;
  subject?: string;
  attachmentUrl?: string;
}

export interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * Message Queue Service Class
 */
export class MessageQueueService {
  private queue: Queue<MessageJob>;
  private redisUrl: string;
  
  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    // Check if using TLS (Upstash uses rediss://)
    const useTLS = this.redisUrl.startsWith('rediss://');
    
    // Initialize Bull queue with TLS support for Upstash
    this.queue = new Bull('message-queue', this.redisUrl, {
      redis: useTLS ? {
        tls: {
          rejectUnauthorized: false, // Required for Upstash
        }
      } : undefined,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: false, // Keep failed jobs for analysis
      },
    });
    
    logger.info('Message queue initialized with Redis:', useTLS ? 'Upstash (TLS)' : 'Local');
  }
  
  /**
   * Get the Bull queue instance
   */
  getQueue(): Queue<MessageJob> {
    return this.queue;
  }
  
  /**
   * Add a single message to the queue
   */
  async addMessage(message: MessageJob, delay: number = 0): Promise<Job<MessageJob>> {
    logger.debug(`Adding message to queue: ${message.messageId}`);

    // WHY: jobId is always the messageId, reused across retries — a message
    // can be sent, fail, and be retried multiple times over its life. Bull's
    // add() is a silent no-op if a job with that ID already exists in ANY
    // state, and this queue keeps failed jobs forever (removeOnFail: false,
    // for post-mortem analysis) — so without clearing the old job first,
    // every retry would silently do nothing: the DB row flips back to
    // PENDING/QUEUED but the message never actually gets reprocessed.
    const existing = await this.queue.getJob(message.messageId);
    if (existing) {
      await existing.remove();
    }

    // Update message status to QUEUED
    await prisma.message.update({
      where: { id: message.messageId },
      data: { status: MessageStatus.QUEUED },
    });

    const job = await this.queue.add(message, {
      delay,
      jobId: message.messageId, // Use messageId as jobId for easy tracking
    });

    return job;
  }
  
  /**
   * Add multiple messages to the queue
   */
  async addMessages(messages: MessageJob[], startDelay: number = 0): Promise<Job<MessageJob>[]> {
    logger.info(`Adding ${messages.length} messages to queue`);
    
    // Update all messages status to QUEUED
    await prisma.message.updateMany({
      where: {
        id: { in: messages.map(m => m.messageId) },
      },
      data: { status: MessageStatus.QUEUED },
    });
    
    // Add messages with incremental delays to spread them out
    const delayBetween = 5000; // 5 seconds between each message
    const jobs = await Promise.all(
      messages.map((message, index) => 
        this.queue.add(message, {
          delay: startDelay + (index * delayBetween),
          jobId: message.messageId,
        })
      )
    );
    
    logger.info(`${messages.length} messages added to queue`);
    return jobs;
  }
  
  /**
   * Add messages for an entire campaign to the queue
   */
  async addCampaignMessages(campaignId: string): Promise<number> {
    logger.info(`Adding campaign messages to queue: ${campaignId}`);
    
    // Get all pending messages for campaign
    const messages = await prisma.message.findMany({
      where: {
        campaignId,
        status: MessageStatus.PENDING,
      },
      include: {
        attendee: true,
        campaign: true,
      },
    });
    
    if (messages.length === 0) {
      // WHY debug not warn: this is the expected steady-state for a campaign
      // that's fully queued/sent, and is now also hit routinely by
      // messageProcessing.service.ts's reconciliation sweep — logging it as
      // a warning would spam the logs every few minutes for every active
      // campaign with nothing left to do.
      logger.debug(`No pending messages found for campaign: ${campaignId}`);
      return 0;
    }
    
    // Get campaign settings
    const campaign = messages[0]!.campaign;
    const delayBetween = campaign.delayBetweenMessages;
    const batchSize = campaign.batchSize;
    
    // Get org-scoped communication settings for batch delay
    const settings = campaign.organizationId
      ? await prisma.communicationSettings.findUnique({ where: { organizationId: campaign.organizationId } })
      : null;
    const batchDelay = settings?.whatsappBatchDelay || 120000; // 2 minutes default

    // Add messages in batches
    let totalAdded = 0;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize);
      const batchStartDelay = batchNumber * batchDelay;

      const jobs: MessageJob[] = batch.map(msg => ({
        messageId: msg.id,
        campaignId: msg.campaignId,
        organizationId: msg.campaign.organizationId!,
        phone: msg.recipient,
        body: msg.body,
        subject: msg.subject || undefined,
        attachmentUrl: msg.attachmentUrl || undefined,
      }));
      
      await Promise.all(
        jobs.map((job, index) => 
          this.addMessage(job, batchStartDelay + (index * delayBetween))
        )
      );
      
      totalAdded += batch.length;
      logger.debug(`Added batch ${batchNumber + 1}: ${batch.length} messages`);
    }
    
    logger.info(`Campaign messages added to queue: ${totalAdded}`);
    return totalAdded;
  }
  
  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<QueueStatus> {
    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.isPaused(),
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: isPaused,
    };
  }
  
  /**
   * Get waiting jobs count
   */
  async getQueueLength(): Promise<number> {
    return await this.queue.getWaitingCount();
  }
  
  /**
   * Pause the queue
   */
  async pauseQueue(): Promise<void> {
    await this.queue.pause();
    logger.info('Queue paused');
  }
  
  /**
   * Resume the queue
   */
  async resumeQueue(): Promise<void> {
    await this.queue.resume();
    logger.info('Queue resumed');
  }
  
  /**
   * Clear the queue
   */
  async clearQueue(): Promise<void> {
    await this.queue.empty();
    logger.info('Queue cleared');
  }
  
  /**
   * Remove a specific job from the queue
   */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
      logger.debug(`Job removed: ${jobId}`);
    }
  }
  
  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.retry();
      logger.debug(`Job retried: ${jobId}`);
    }
  }
  
  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job<MessageJob> | null> {
    return await this.queue.getJob(jobId);
  }
  
  /**
   * Get failed jobs
   */
  async getFailedJobs(start: number = 0, end: number = 10): Promise<Job<MessageJob>[]> {
    return await this.queue.getFailed(start, end);
  }
  
  /**
   * Get active jobs
   */
  async getActiveJobs(start: number = 0, end: number = 10): Promise<Job<MessageJob>[]> {
    return await this.queue.getActive(start, end);
  }
  
  /**
   * Get completed jobs
   */
  async getCompletedJobs(start: number = 0, end: number = 10): Promise<Job<MessageJob>[]> {
    return await this.queue.getCompleted(start, end);
  }
  
  /**
   * Clean old jobs
   */
  async cleanOldJobs(olderThan: number = 24 * 60 * 60 * 1000): Promise<void> {
    // Clean completed jobs older than specified time
    await this.queue.clean(olderThan, 'completed');
    logger.info(`Cleaned completed jobs older than ${olderThan}ms`);
  }
  
  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<{
    status: QueueStatus;
    throughput: number;
    avgProcessingTime: number;
  }> {
    const status = await this.getQueueStatus();
    
    // Get recent completed jobs to calculate metrics
    const recentJobs = await this.getCompletedJobs(0, 100);
    
    let totalProcessingTime = 0;
    let jobsWithTime = 0;
    
    for (const job of recentJobs) {
      if (job.processedOn && job.finishedOn) {
        totalProcessingTime += job.finishedOn - job.processedOn;
        jobsWithTime++;
      }
    }
    
    const avgProcessingTime = jobsWithTime > 0 ? totalProcessingTime / jobsWithTime : 0;
    const throughput = recentJobs.length; // Jobs completed recently
    
    return {
      status,
      throughput,
      avgProcessingTime,
    };
  }
  
  /**
   * Shutdown the queue gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down message queue...');
    await this.queue.close();
    logger.info('Message queue shut down');
  }
}

// Export singleton instance
export const messageQueueService = new MessageQueueService();
