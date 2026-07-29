/**
 * Campaign Routes
 */

import { Router } from 'express';
import * as campaignController from '@/controllers/communication/campaign.controller';

const router = Router();

// Campaign CRUD
router.get('/', campaignController.getCampaigns);
router.get('/:id', campaignController.getCampaignById);
router.post('/', campaignController.createCampaign);
router.put('/:id', campaignController.updateCampaign);
router.delete('/:id', campaignController.deleteCampaign);

// Campaign actions
router.post('/:id/start', campaignController.startCampaign);
router.post('/:id/pause', campaignController.pauseCampaign);
router.post('/:id/resume', campaignController.resumeCampaign);
router.post('/:id/cancel', campaignController.cancelCampaign);

// Campaign data
router.get('/:id/stats', campaignController.getCampaignStats);
router.get('/:id/messages', campaignController.getCampaignMessages);

// Preview
router.post('/preview', campaignController.previewRecipients);

export default router;
