/**
 * Auto-Assignment Routes
 * 
 * WHY: REST API endpoints for auto-assignment execution and configuration
 * Provides intelligent automatic room assignment with real-time progress updates
 */

import { Router } from 'express';
import { AutoAssignmentController } from '@/controllers/autoAssignment.controller';
import { AutoAssignmentService } from '@/services/auto-assignment/AutoAssignmentService';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { AutoAssignmentConfigRepository } from '@/repositories/AutoAssignmentConfigRepository';
import { NotificationService } from '@/services/notification.service';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  runAutoAssignmentSchema,
  updateAutoAssignmentConfigSchema,
  conferenceHouseIdParamSchema,
} from '@/validators/autoAssignment.schemas';
import prisma from '@/utils/prisma-client';
import { getNotificationService } from '@/utils/notification-singleton';

const router = Router();

// Dependency injection
const attendeeRepository = new AttendeeRepository(prisma);
const roomRepository = new RoomRepository(prisma);
const assignmentRepository = new RoomAssignmentRepository(prisma);
const auditLogRepository = new AuditLogRepository(prisma);
const configRepository = new AutoAssignmentConfigRepository(prisma);

// Auto-assignment service (AI enabled by default)
const autoAssignmentService = new AutoAssignmentService(
  attendeeRepository,
  roomRepository,
  assignmentRepository,
  auditLogRepository,
  configRepository
);

// Get notification service singleton
const notificationService = getNotificationService();

const autoAssignmentController = new AutoAssignmentController(
  autoAssignmentService,
  configRepository,
  notificationService
);

/**
 * @route   POST /api/auto-assignment/execute
 * @desc    Execute auto-assignment algorithm
 * @access  Public (future: protected, admin only)
 * @body    { conferenceHouseId, buildingIds?, dryRun?, options? }
 * @returns Auto-assignment execution result with assignments, errors, warnings
 */
router.post(
  '/execute',
  validate(runAutoAssignmentSchema, 'body'),
  asyncHandler(autoAssignmentController.execute.bind(autoAssignmentController))
);

/**
 * @route   POST /api/auto-assignment/preview
 * @desc    Preview auto-assignment results (dry run, no database changes)
 * @access  Public (future: protected, admin only)
 * @body    { conferenceHouseId, buildingIds?, options? }
 * @returns Preview of what would be assigned (dry run mode)
 */
router.post(
  '/preview',
  validate(runAutoAssignmentSchema, 'body'),
  asyncHandler(autoAssignmentController.preview.bind(autoAssignmentController))
);

/**
 * @route   GET /api/auto-assignment/config/:conferenceHouseId
 * @desc    Get auto-assignment configuration
 * @access  Public (future: protected)
 * @param   conferenceHouseId - Conference house UUID
 * @returns Configuration with enabled buildings, rule weights, etc.
 */
router.get(
  '/config/:conferenceHouseId',
  validate(conferenceHouseIdParamSchema, 'params'),
  asyncHandler(autoAssignmentController.getConfig.bind(autoAssignmentController))
);

/**
 * @route   PUT /api/auto-assignment/config/:conferenceHouseId
 * @desc    Update auto-assignment configuration
 * @access  Public (future: protected, admin only)
 * @param   conferenceHouseId - Conference house UUID
 * @body    Configuration updates (enabledBuildings, ruleWeights, etc.)
 * @returns Updated configuration
 */
router.put(
  '/config/:conferenceHouseId',
  validate(conferenceHouseIdParamSchema, 'params'),
  validate(updateAutoAssignmentConfigSchema, 'body'),
  asyncHandler(autoAssignmentController.updateConfig.bind(autoAssignmentController))
);

/**
 * @route   GET /api/auto-assignment/status/:conferenceHouseId
 * @desc    Get auto-assignment status and statistics
 * @access  Public (future: protected)
 * @param   conferenceHouseId - Conference house UUID
 * @returns Current status, last execution time, enabled buildings, etc.
 */
router.get(
  '/status/:conferenceHouseId',
  validate(conferenceHouseIdParamSchema, 'params'),
  asyncHandler(autoAssignmentController.getStatus.bind(autoAssignmentController))
);

export default router;
