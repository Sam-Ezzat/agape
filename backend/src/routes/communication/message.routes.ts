/**
 * Message Routes
 */

import { Router } from 'express';
import * as messageController from '@/controllers/communication/message.controller';

const router = Router();

// Message queries
router.get('/', messageController.getMessages);
router.get('/stats', messageController.getMessageStats);
router.get('/:id', messageController.getMessageById);

// Message actions
router.post('/:id/retry', messageController.retryMessage);
router.post('/manual', messageController.logManualMessage);

export default router;
