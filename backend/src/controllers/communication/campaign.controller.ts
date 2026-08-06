/**
 * Campaign Controller
 *
 * Handles HTTP requests for campaign management
 */

import { Request, Response } from 'express';
import { campaignService } from '@/services/communication';
import { asyncHandler } from '@/middleware/asyncHandler';
import { messageQueueService } from '@/services/communication';
import { getWhatsAppService } from '@/services/communication/whatsapp.registry';
import logger from '@/utils/logger';

/**
 * Get all campaigns
 * GET /api/campaigns
 */
export const getCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const { status, channel } = req.query;
  const organizationId = req.user!.organizationId;

  const campaigns = await campaignService.getCampaigns(organizationId, {
    status: status as any,
    channel: channel as any,
  });

  res.json({
    success: true,
    data: campaigns,
    count: campaigns.length,
  });
});

/**
 * Get campaign by ID
 * GET /api/campaigns/:id
 */
export const getCampaignById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const campaign = await campaignService.getCampaignById(id, organizationId);

  res.json({
    success: true,
    data: campaign,
  });
});

/**
 * Create new campaign
 * POST /api/campaigns
 */
export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  const campaign = await campaignService.createCampaign(req.body, organizationId);

  logger.info('Campaign created:', campaign.id);

  res.status(201).json({
    success: true,
    data: campaign,
    message: 'Campaign created successfully',
  });
});

/**
 * Update campaign
 * PUT /api/campaigns/:id
 */
export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const campaign = await campaignService.updateCampaign(id, req.body, organizationId);

  logger.info('Campaign updated:', id);

  res.json({
    success: true,
    data: campaign,
    message: 'Campaign updated successfully',
  });
});

/**
 * Delete campaign
 * DELETE /api/campaigns/:id
 */
export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  await campaignService.deleteCampaign(id, organizationId);

  logger.info('Campaign deleted:', id);

  res.json({
    success: true,
    message: 'Campaign deleted successfully',
  });
});

/**
 * Start campaign
 * POST /api/campaigns/:id/start
 */
export const startCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  // Fail fast instead of creating messages that are guaranteed to fail in the worker
  const whatsappService = getWhatsAppService(organizationId);
  if (!whatsappService || !whatsappService.getStatus().isReady) {
    return res.status(400).json({
      success: false,
      message: 'WhatsApp is not connected. Set it up on the WhatsApp Setup page before starting a campaign.',
    });
  }

  // Start campaign (creates messages)
  const result = await campaignService.startCampaign(id, organizationId);

  // Add messages to queue
  await messageQueueService.addCampaignMessages(id);

  logger.info('Campaign started:', id);

  res.json({
    success: true,
    data: result.campaign,
    message: `Campaign started with ${result.messages.length} messages`,
  });
});

/**
 * Pause campaign
 * POST /api/campaigns/:id/pause
 */
export const pauseCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const campaign = await campaignService.pauseCampaign(id, organizationId);

  // Pause the queue
  await messageQueueService.pauseQueue();

  logger.info('Campaign paused:', id);

  res.json({
    success: true,
    data: campaign,
    message: 'Campaign paused successfully',
  });
});

/**
 * Resume campaign
 * POST /api/campaigns/:id/resume
 */
export const resumeCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const whatsappService = getWhatsAppService(organizationId);
  if (!whatsappService || !whatsappService.getStatus().isReady) {
    return res.status(400).json({
      success: false,
      message: 'WhatsApp is not connected. Set it up on the WhatsApp Setup page before resuming a campaign.',
    });
  }

  const campaign = await campaignService.resumeCampaign(id, organizationId);

  // Resume the queue
  await messageQueueService.resumeQueue();

  logger.info('Campaign resumed:', id);

  res.json({
    success: true,
    data: campaign,
    message: 'Campaign resumed successfully',
  });
});

/**
 * Cancel campaign
 * POST /api/campaigns/:id/cancel
 */
export const cancelCampaign = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const campaign = await campaignService.cancelCampaign(id, organizationId);

  logger.info('Campaign cancelled:', id);

  res.json({
    success: true,
    data: campaign,
    message: 'Campaign cancelled successfully',
  });
});

/**
 * Get campaign statistics
 * GET /api/campaigns/:id/stats
 */
export const getCampaignStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const stats = await campaignService.getCampaignStats(id, organizationId);

  res.json({
    success: true,
    data: stats,
  });
});

/**
 * Get campaign messages
 * GET /api/campaigns/:id/messages
 */
export const getCampaignMessages = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, limit, offset } = req.query;
  const organizationId = req.user!.organizationId;

  const { messages, total } = await campaignService.getCampaignMessages(id, organizationId, {
    status: status as any,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  });

  res.json({
    success: true,
    data: messages,
    total,
  });
});

/**
 * Preview campaign recipients
 * POST /api/campaigns/preview
 */
export const previewRecipients = asyncHandler(async (req: Request, res: Response) => {
  const { targetFilter } = req.body;
  const organizationId = req.user!.organizationId;

  if (!targetFilter) {
    return res.status(400).json({
      success: false,
      message: 'targetFilter is required',
    });
  }

  const recipients = await campaignService.previewRecipients(targetFilter, organizationId);

  res.json({
    success: true,
    data: recipients,
    count: recipients.length,
  });
});
