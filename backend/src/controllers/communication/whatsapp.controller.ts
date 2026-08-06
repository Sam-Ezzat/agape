/**
 * WhatsApp Controller
 *
 * Handles HTTP requests for WhatsApp connection management.
 * Each organization has its own WhatsApp session — resolved per-request
 * from the authenticated user's organizationId via the WhatsApp registry.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import logger from '@/utils/logger';
import { getOrCreateWhatsAppService } from '@/services/communication/whatsapp.registry';
import { getIO } from '@/utils/socket-singleton';

const getServiceForRequest = (req: Request) =>
  getOrCreateWhatsAppService(req.user!.organizationId, getIO());

/**
 * Initialize WhatsApp session
 * POST /api/communication/whatsapp/initialize
 */
export const initializeWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  const whatsappService = getServiceForRequest(req);

  await whatsappService.initialize();

  logger.info('WhatsApp initialization started', { organizationId: req.user!.organizationId });

  res.json({
    success: true,
    message: 'WhatsApp initialization started. Please scan QR code.',
  });
});

/**
 * Get WhatsApp QR code
 * GET /api/communication/whatsapp/qr
 */
export const getQRCode = asyncHandler(async (req: Request, res: Response) => {
  const whatsappService = getServiceForRequest(req);
  const status = whatsappService.getStatus();

  if (status.qrCode) {
    res.json({
      success: true,
      data: {
        qr: status.qrCode,
      },
    });
  } else if (status.isReady) {
    res.json({
      success: true,
      message: 'WhatsApp already connected',
      data: {
        status: 'ready',
      },
    });
  } else {
    res.json({
      success: false,
      message: 'QR code not available. Initialize WhatsApp first.',
    });
  }
});

/**
 * Get WhatsApp status
 * GET /api/communication/whatsapp/status
 */
export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const whatsappService = getServiceForRequest(req);
  const status = whatsappService.getStatus();
  const rateLimit = whatsappService.getRateLimitStatus();

  res.json({
    success: true,
    data: {
      ...status,
      rateLimit,
    },
  });
});

/**
 * Disconnect WhatsApp
 * POST /api/communication/whatsapp/disconnect
 */
export const disconnectWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  const whatsappService = getServiceForRequest(req);
  await whatsappService.disconnect();

  logger.info('WhatsApp disconnected', { organizationId: req.user!.organizationId });

  res.json({
    success: true,
    message: 'WhatsApp disconnected successfully',
  });
});

/**
 * Send test message
 * POST /api/communication/whatsapp/test
 */
export const sendTestMessage = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required',
    });
  }

  const whatsappService = getServiceForRequest(req);
  await whatsappService.sendTestMessage(phone);

  logger.info('Test message sent to:', phone);

  res.json({
    success: true,
    message: 'Test message sent successfully',
  });
});

/**
 * Check if phone number is registered on WhatsApp
 * POST /api/communication/whatsapp/check-number
 */
export const checkNumber = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required',
    });
  }

  const whatsappService = getServiceForRequest(req);
  const isRegistered = await whatsappService.isRegisteredUser(phone);

  res.json({
    success: true,
    data: {
      phone,
      isRegistered,
    },
  });
});
