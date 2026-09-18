/**
 * Template Controller
 *
 * Handles HTTP requests for message template management
 */

import { Request, Response } from 'express';
import { templateService } from '@/services/communication';
import { asyncHandler } from '@/middleware/asyncHandler';
import logger from '@/utils/logger';

/**
 * Get all templates
 * GET /api/templates
 */
export const getTemplates = asyncHandler(async (req: Request, res: Response) => {
  const { category, isActive, language } = req.query;
  const organizationId = req.user!.organizationId;

  const templates = await templateService.getTemplates(organizationId, {
    category: category as string,
    isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    language: language as string,
  });

  res.json({
    success: true,
    data: templates,
    count: templates.length,
  });
});

/**
 * Get template by ID
 * GET /api/templates/:id
 */
export const getTemplateById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const template = await templateService.getTemplateById(id, organizationId);

  res.json({
    success: true,
    data: template,
  });
});

/**
 * Create new template
 * POST /api/templates
 */
export const createTemplate = asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user!.organizationId;
  const template = await templateService.createTemplate(req.body, organizationId);

  logger.info('Template created:', template.id);

  res.status(201).json({
    success: true,
    data: template,
    message: 'Template created successfully',
  });
});

/**
 * Update template
 * PUT /api/templates/:id
 */
export const updateTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const template = await templateService.updateTemplate(id, req.body, organizationId);

  logger.info('Template updated:', id);

  res.json({
    success: true,
    data: template,
    message: 'Template updated successfully',
  });
});

/**
 * Delete template
 * DELETE /api/templates/:id
 */
export const deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  await templateService.deleteTemplate(id, organizationId);

  logger.info('Template deleted:', id);

  res.json({
    success: true,
    message: 'Template deleted successfully',
  });
});

/**
 * Preview template with sample attendee
 * POST /api/templates/:id/preview
 */
export const previewTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { attendeeId } = req.body;
  const organizationId = req.user!.organizationId;

  if (!attendeeId) {
    return res.status(400).json({
      success: false,
      message: 'attendeeId is required',
    });
  }

  const preview = await templateService.previewTemplate(id, attendeeId, organizationId);

  res.json({
    success: true,
    data: {
      preview,
    },
  });
});

/**
 * Get template statistics
 * GET /api/templates/:id/stats
 */
export const getTemplateStats = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const organizationId = req.user!.organizationId;

  const stats = await templateService.getTemplateStats(id, organizationId);

  res.json({
    success: true,
    data: stats,
  });
});
