/**
 * Room Assignment Routes
 * 
 * WHY: REST API endpoints for room assignment management
 * Registers routes with validation middleware and async error handling
 */

import { Router } from 'express';
import { AssignmentController } from '@/controllers/assignment.controller';
import { AssignmentService } from '@/services/assignment.service';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  createAssignmentSchema,
  updateAssignmentSchema,
  batchAssignmentSchema,
  assignmentFilterSchema,
} from '@/validators/assignment.schemas';
import prisma from '@/utils/prisma-client';

const router = Router();

// Dependency injection
const assignmentRepository = new RoomAssignmentRepository(prisma);
const attendeeRepository = new AttendeeRepository(prisma);
const roomRepository = new RoomRepository(prisma);
const auditLogRepository = new AuditLogRepository(prisma);
const assignmentService = new AssignmentService(
  assignmentRepository,
  attendeeRepository,
  roomRepository,
  auditLogRepository
);
const assignmentController = new AssignmentController(assignmentService);

/**
 * @route   POST /api/assignments/batch
 * @desc    Batch assign multiple attendees to rooms
 * @access  Public (future: protected)
 * @note    Must be before /:id route to avoid conflict
 */
router.post(
  '/batch',
  validate(batchAssignmentSchema, 'body'),
  asyncHandler(assignmentController.batchAssign.bind(assignmentController))
);

/**
 * @route   GET /api/assignments/availability
 * @desc    Get room availability
 * @access  Public
 * @note    Must be before /:id route to avoid conflict
 */
router.get(
  '/availability',
  asyncHandler(assignmentController.getAvailability.bind(assignmentController))
);

/**
 * @route   POST /api/assignments
 * @desc    Create room assignment
 * @access  Public (future: protected)
 */
router.post(
  '/',
  validate(createAssignmentSchema, 'body'),
  asyncHandler(assignmentController.create.bind(assignmentController))
);

/**
 * @route   GET /api/assignments
 * @desc    List assignments with filters
 * @access  Public
 */
router.get(
  '/',
  validate(assignmentFilterSchema, 'query'),
  asyncHandler(assignmentController.getAll.bind(assignmentController))
);

/**
 * @route   GET /api/assignments/:id
 * @desc    Get single assignment
 * @access  Public
 */
router.get(
  '/:id',
  asyncHandler(assignmentController.getById.bind(assignmentController))
);

/**
 * @route   GET /api/assignments/room/:roomId
 * @desc    Get assignments for a room
 * @access  Public
 */
router.get(
  '/room/:roomId',
  asyncHandler(assignmentController.getByRoom.bind(assignmentController))
);

/**
 * @route   PATCH /api/assignments/:id
 * @desc    Update assignment (move to different room)
 * @access  Public (future: protected)
 */
router.patch(
  '/:id',
  validate(updateAssignmentSchema, 'body'),
  asyncHandler(assignmentController.update.bind(assignmentController))
);

/**
 * @route   DELETE /api/assignments/:id
 * @desc    Delete assignment (unassign attendee)
 * @access  Public (future: protected)
 */
router.delete(
  '/:id',
  asyncHandler(assignmentController.delete.bind(assignmentController))
);

export default router;
