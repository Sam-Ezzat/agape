/**
 * WhatsApp Controller
 * 
 * Handles HTTP requests for WhatsApp connection management
 */

import { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/asyncHandler';
import logger from '@/utils/logger';

// WhatsApp service will be injected via app context
let whatsappService: any;

export const setWhatsAppService = (service: any) => {
  whatsappService = service;
};

export const getWhatsAppServiceInstance = (): any => whatsappService;

/**
 * Initialize WhatsApp session
 * POST /api/whatsapp/initialize
 */
export const initializeWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(500).json({
      success: false,
      message: 'WhatsApp service not initialized',
    });
  }
  
  await whatsappService.initialize();
  
  logger.info('WhatsApp initialization started');
  
  res.json({
    success: true,
    message: 'WhatsApp initialization started. Please scan QR code.',
  });
});

/**
 * Get WhatsApp QR code
 * GET /api/whatsapp/qr
 */
export const getQRCode = asyncHandler(async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(500).json({
      success: false,
      message: 'WhatsApp service not initialized',
    });
  }
  
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
 * GET /api/whatsapp/status
 */
export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(500).json({
      success: false,
      message: 'WhatsApp service not initialized',
    });
  }
  
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
 * POST /api/whatsapp/disconnect
 */
export const disconnectWhatsApp = asyncHandler(async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(500).json({
      success: false,
      message: 'WhatsApp service not initialized',
    });
  }
  
  await whatsappService.disconnect();
  
  logger.info('WhatsApp disconnected');
  
  res.json({
    success: true,
    message: 'WhatsApp disconnected successfully',
  });
});

/**
 * Send test message
 * POST /api/whatsapp/test
 */
export const sendTestMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(500).json({
      success: false,
      message: 'WhatsApp service not initialized',
    });
  }
  
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required',
    });
  }
  
  await whatsappService.sendTestMessage(phone);
  
  logger.info('Test message sent to:', phone);
  
  res.json({
    success: true,
    message: 'Test message sent successfully',
  });
});

/**
 * Check if phone number is registered on WhatsApp
 * POST /api/whatsapp/check-number
 */
export const checkNumber = asyncHandler(async (req: Request, res: Response) => {
  if (!whatsappService) {
    return res.status(500).json({
      success: false,
      message: 'WhatsApp service not initialized',
    });
  }
  
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required',
    });
  }
  
  const isRegistered = await whatsappService.isRegisteredUser(phone);
  
  res.json({
    success: true,
    data: {
      phone,
      isRegistered,
    },
  });
});
