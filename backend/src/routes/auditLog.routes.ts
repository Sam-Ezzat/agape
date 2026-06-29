/**
 * Audit Log Routes
 * 
 * WHY: REST API endpoints for audit log access
 * Provides visibility into system action history
 */

import { Router } from 'express';
import { AuditLogController } from '@/controllers/auditLog.controller';
import { AuditLogService } from '@/services/auditLog.service';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { asyncHandler } from '@/middleware/asyncHandler';
import prisma from '@/utils/prisma-client';

const router = Router();

// Dependency injection
const auditLogRepository = new AuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditLogRepository);
const auditLogController = new AuditLogController(auditLogService);

/**
 * @route   GET /api/audit-logs/recent
 * @desc    Get recent activity
 * @access  Public (future: admin only)
 * @note    Must be before /:entityType route to avoid conflict
 */
router.get(
  '/recent',
  asyncHandler(auditLogController.getRecent.bind(auditLogController))
);

/**
 * @route   GET /api/audit-logs/stats
 * @desc    Get audit log statistics
 * @access  Public (future: admin only)
 * @note    Must be before /:entityType route to avoid conflict
 */
router.get(
  '/stats',
  asyncHandler(auditLogController.getStats.bind(auditLogController))
);

/**
 * @route   GET /api/audit-logs
 * @desc    List audit logs with filters
 * @access  Public (future: admin only)
 */
router.get(
  '/',
  asyncHandler(auditLogController.getAll.bind(auditLogController))
);

/**
 * @route   GET /api/audit-logs/entity/:entityType/:entityId
 * @desc    Get audit logs for specific entity
 * @access  Public (future: admin only)
 */
router.get(
  '/entity/:entityType/:entityId',
  asyncHandler(auditLogController.getByEntity.bind(auditLogController))
);

export default router;
