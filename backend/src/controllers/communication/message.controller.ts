/**
 * Message Controller
 * 
 * Handles HTTP requests for individual message management
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '@/middleware/asyncHandler';
import { messageQueueService } from '@/services/communication';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

/**
 * Get all messages
 * GET /api/messages
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const { status, campaignId, attendeeId, limit = 50, offset = 0 } = req.query;
  
  const where: any = {};
  if (status) where.status = status;
  if (campaignId) where.campaignId = campaignId as string;
  if (attendeeId) where.attendeeId = attendeeId as string;
  
  const messages = await prisma.message.findMany({
    where,
    include: {
      attendee: {
        select: {
          id: true,
          fullName: true,
          phone: true,
        },
      },
      campaign: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
    orderBy: { createdAt: 'desc' },
  });
  
  res.json({
    success: true,
    data: messages,
    count: messages.length,
  });
});

/**
 * Get message by ID
 * GET /api/messages/:id
 */
export const getMessageById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      attendee: true,
      campaign: {
        include: {
          template: true,
        },
      },
    },
  });
  
  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
    });
  }
  
  res.json({
    success: true,
    data: message,
  });
});

/**
 * Retry failed message
 * POST /api/messages/:id/retry
 */
export const retryMessage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  const message = await prisma.message.findUnique({
    where: { id },
  });
  
  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
    });
  }
  
  if (message.status !== 'FAILED') {
    return res.status(400).json({
      success: false,
      message: 'Can only retry failed messages',
    });
  }
  
  // Reset message status and add back to queue
  await prisma.message.update({
    where: { id },
    data: {
      status: 'PENDING',
      retryCount: 0,
      errorMessage: null,
      failedAt: null,
    },
  });
  
  // Add to queue
  await messageQueueService.addMessage({
    messageId: message.id,
    campaignId: message.campaignId,
    phone: message.recipient,
    body: message.body,
    subject: message.subject || undefined,
    attachmentUrl: message.attachmentUrl || undefined,
  });
  
  logger.info('Message retried:', id);
  
  res.json({
    success: true,
    message: 'Message retry scheduled',
  });
});

/**
 * Get overall message statistics
 * GET /api/messages/stats
 */
export const getMessageStats = asyncHandler(async (req: Request, res: Response) => {
  const [total, sent, failed, pending] = await Promise.all([
    prisma.message.count(),
    prisma.message.count({ where: { status: 'SENT' } }),
    prisma.message.count({ where: { status: 'FAILED' } }),
    prisma.message.count({ where: { status: { in: ['PENDING', 'QUEUED', 'SENDING'] } } }),
  ]);
  
  const successRate = total > 0 ? (sent / total) * 100 : 0;
  
  res.json({
    success: true,
    data: {
      total,
      sent,
      failed,
      pending,
      successRate,
    },
  });
});
