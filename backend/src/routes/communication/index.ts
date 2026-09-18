/**
 * Communication Routes Index
 * 
 * Central mount point for all communication routes
 */

import { Router } from 'express';
import templateRoutes from './template.routes';
import campaignRoutes from './campaign.routes';
import messageRoutes from './message.routes';
import whatsappRoutes from './whatsapp.routes';

const router = Router();

// Mount routes
router.use('/templates', templateRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/messages', messageRoutes);
router.use('/whatsapp', whatsappRoutes);

export default router;
