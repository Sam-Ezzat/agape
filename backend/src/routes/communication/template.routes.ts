/**
 * Template Routes
 */

import { Router } from 'express';
import * as templateController from '@/controllers/communication/template.controller';
import { validate } from '@/middleware/validate';
import { createTemplateSchema, updateTemplateSchema } from '@/validators/template.schemas';

const router = Router();

// Template CRUD
router.get('/', templateController.getTemplates);
router.get('/:id', templateController.getTemplateById);
router.post('/', validate(createTemplateSchema, 'body'), templateController.createTemplate);
router.put('/:id', validate(updateTemplateSchema, 'body'), templateController.updateTemplate);
router.delete('/:id', templateController.deleteTemplate);

// Template actions
router.post('/:id/preview', templateController.previewTemplate);
router.get('/:id/stats', templateController.getTemplateStats);

export default router;
