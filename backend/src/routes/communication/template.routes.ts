/**
 * Template Routes
 */

import { Router } from 'express';
import * as templateController from '@/controllers/communication/template.controller';

const router = Router();

// Template CRUD
router.get('/', templateController.getTemplates);
router.get('/:id', templateController.getTemplateById);
router.post('/', templateController.createTemplate);
router.put('/:id', templateController.updateTemplate);
router.delete('/:id', templateController.deleteTemplate);

// Template actions
router.post('/:id/preview', templateController.previewTemplate);
router.get('/:id/stats', templateController.getTemplateStats);

export default router;
