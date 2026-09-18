/**
 * Message Controller
 * 
 * Handles HTTP requests for individual message management
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '@/middleware/asyncHandler';
import { messageQueueService, templateService } from '@/services/communication';
import { normalizePhoneNumber } from '@/utils/phone';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

/**
 * Get all messages
 * GET /api/messages
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const { status, campaignId, attendeeId, limit = 50, offset = 0 } = req.query;
  const organizationId = req.user!.organizationId;

  const where: any = { organizationId };
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
  const organizationId = req.user!.organizationId;

  const message = await prisma.message.findFirst({
    where: { id, organizationId },
    include: {
      attendee: true,
      campaign: {
        include: {
          template: true,
        },
      },
      template: true,
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
  const organizationId = req.user!.organizationId;

  const message = await prisma.message.findFirst({
    where: { id, organizationId },
  });

  if (!message) {
    return res.status(404).json({
      success: false,
      message: 'Message not found',
    });
  }

  if (!message.campaignId) {
    return res.status(400).json({
      success: false,
      message: 'This message was sent manually and cannot be retried through the queue',
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
    organizationId,
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
 * Get each given attendee's most recent message (status + template name) —
 * used by the Attendees list to show "last template sent" / "last message
 * status" columns without an N+1 query per row.
 * GET /api/messages/last-by-attendee?attendeeIds=id1,id2,...
 */
export const getLastMessagesByAttendee = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  const attendeeIdsParam = req.query.attendeeIds;

  const attendeeIds = (typeof attendeeIdsParam === 'string' ? attendeeIdsParam.split(',') : [])
    .map((id) => id.trim())
    .filter(Boolean);

  if (attendeeIds.length === 0) {
    return res.json({ success: true, data: {} });
  }

  // WHY: `distinct` combined with `orderBy` gives one row per attendee — the
  // most recent one, per Prisma's documented distinct-after-order semantics.
  const lastMessages = await prisma.message.findMany({
    where: { attendeeId: { in: attendeeIds }, organizationId },
    orderBy: { createdAt: 'desc' },
    distinct: ['attendeeId'],
    select: {
      attendeeId: true,
      status: true,
      createdAt: true,
      template: { select: { name: true } },
    },
  });

  const data = Object.fromEntries(
    lastMessages.map((m) => [
      m.attendeeId,
      { status: m.status, templateName: m.template?.name ?? null, sentAt: m.createdAt },
    ])
  );

  res.json({ success: true, data });
});

/**
 * Log a message sent manually via the "copy to WhatsApp" flow (an admin
 * picks a template, reviews/edits the rendered text, and sends it themselves
 * through wa.me — no automation, so no ban risk, but we still want it
 * tracked alongside campaign sends so nobody gets double-messaged and
 * "who's been contacted" stays accurate).
 * POST /api/messages/manual
 */
export const logManualMessage = asyncHandler(async (req: Request, res: Response) => {
  const { attendeeId, templateId, body } = req.body;
  const organizationId = req.user!.organizationId;

  if (!attendeeId || !templateId || !body) {
    return res.status(400).json({
      success: false,
      message: 'attendeeId, templateId, and body are required',
    });
  }

  const attendee = await prisma.attendee.findFirst({
    where: { id: attendeeId, organizationId },
  });

  if (!attendee) {
    return res.status(404).json({
      success: false,
      message: 'Attendee not found',
    });
  }

  let recipient: string;
  try {
    recipient = normalizePhoneNumber(attendee.phone);
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid phone number',
    });
  }

  const message = await prisma.message.create({
    data: {
      organizationId,
      attendeeId,
      templateId,
      recipient,
      body,
      channel: 'WHATSAPP',
      status: 'SENT',
      sentAt: new Date(),
    },
  });

  await templateService.incrementUsageCount(templateId);

  logger.info('Manual WhatsApp message logged:', message.id);

  res.status(201).json({
    success: true,
    data: message,
    message: 'Manual message logged',
  });
});

/**
 * Get overall message statistics
 * GET /api/messages/stats
 */
export const getMessageStats = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;

  const [total, sent, failed, pending] = await Promise.all([
    prisma.message.count({ where: { organizationId } }),
    prisma.message.count({ where: { status: 'SENT', organizationId } }),
    prisma.message.count({ where: { status: 'FAILED', organizationId } }),
    prisma.message.count({ where: { status: { in: ['PENDING', 'QUEUED', 'SENDING'] }, organizationId } }),
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
