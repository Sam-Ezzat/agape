/**
 * WhatsApp Routes
 */

import { Router } from 'express';
import * as whatsappController from '@/controllers/communication/whatsapp.controller';

const router = Router();

// WhatsApp session management
router.post('/initialize', whatsappController.initializeWhatsApp);
router.get('/qr', whatsappController.getQRCode);
router.get('/status', whatsappController.getStatus);
router.post('/disconnect', whatsappController.disconnectWhatsApp);

// WhatsApp actions
router.post('/test', whatsappController.sendTestMessage);
router.post('/check-number', whatsappController.checkNumber);

export default router;
