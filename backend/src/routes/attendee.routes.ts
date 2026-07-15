/**
 * Attendee Routes
 * 
 * WHY: REST API endpoints for attendee management
 * Registers routes with validation middleware and async error handling
 */

import { Router } from 'express';
import { AttendeeController } from '@/controllers/attendee.controller';
import { AttendeeService } from '@/services/attendee.service';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  createAttendeeSchema,
  updateAttendeeSchema,
  attendeeFilterSchema,
  unassignedFilterSchema,
  checkInOutSchema,
} from '@/validators/attendee.schemas';
import prisma from '@/utils/prisma-client';

const router = Router();

// Dependency injection
const attendeeRepository = new AttendeeRepository(prisma);
const assignmentRepository = new RoomAssignmentRepository(prisma);
const auditLogRepository = new AuditLogRepository(prisma);
const attendeeService = new AttendeeService(
  attendeeRepository,
  assignmentRepository,
  auditLogRepository
);
const attendeeController = new AttendeeController(attendeeService);

/**
 * @route   POST /api/attendees
 * @desc    Create new attendee
 * @access  Public (future: protected)
 */
router.post(
  '/',
  validate(createAttendeeSchema, 'body'),
  asyncHandler(attendeeController.create.bind(attendeeController))
);

/**
 * @route   GET /api/attendees/unassigned
 * @desc    Get attendees without room assignment
 * @access  Public
 * @note    Must be before /:id route to avoid conflict
 * @note    Supports optional search and dual-language search
 */
router.get(
  '/unassigned',
  validate(unassignedFilterSchema, 'query'),
  asyncHandler(attendeeController.getUnassigned.bind(attendeeController))
);

/**
 * @route   GET /api/attendees/search-assigned
 * @desc    Search assigned attendees with dual-language support
 * @access  Public
 * @note    Must be before /:id route to avoid conflict
 */
router.get(
  '/search-assigned',
  asyncHandler(attendeeController.searchAssigned.bind(attendeeController))
);

/**
 * @route   GET /api/attendees/stats
 * @desc    Get attendee statistics
 * @access  Public
 * @note    Must be before /:id route to avoid conflict
 */
router.get(
  '/stats',
  asyncHandler(attendeeController.getStats.bind(attendeeController))
);

/**
 * @route   GET /api/attendees
 * @desc    List attendees with filters
 * @access  Public
 */
router.get(
  '/',
  validate(attendeeFilterSchema, 'query'),
  asyncHandler(attendeeController.getAll.bind(attendeeController))
);

/**
 * @route   GET /api/attendees/:id
 * @desc    Get single attendee
 * @access  Public
 */
router.get(
  '/:id',
  asyncHandler(attendeeController.getById.bind(attendeeController))
);

/**
 * @route   GET /api/attendees/:id/details
 * @desc    Get attendee with assignment details
 * @access  Public
 */
router.get(
  '/:id/details',
  asyncHandler(attendeeController.getDetails.bind(attendeeController))
);

/**
 * @route   PATCH /api/attendees/:id
 * @desc    Update attendee
 * @access  Public (future: protected)
 */
router.patch(
  '/:id',
  validate(updateAttendeeSchema, 'body'),
  asyncHandler(attendeeController.update.bind(attendeeController))
);

/**
 * @route   DELETE /api/attendees/:id
 * @desc    Soft delete attendee
 * @access  Public (future: protected)
 */
router.delete(
  '/:id',
  asyncHandler(attendeeController.delete.bind(attendeeController))
);

/**
 * @route   POST /api/attendees/:id/reactivate
 * @desc    Reactivate soft-deleted attendee
 * @access  Public (future: protected)
 */
router.post(
  '/:id/reactivate',
  asyncHandler(attendeeController.reactivate.bind(attendeeController))
);

/**
 * @route   POST /api/attendees/:id/check-in
 * @desc    Check in attendee
 * @access  Public (future: protected)
 */
router.post(
  '/:id/check-in',
  validate(checkInOutSchema, 'body'),
  asyncHandler(attendeeController.checkIn.bind(attendeeController))
);

/**
 * @route   POST /api/attendees/:id/check-out
 * @desc    Check out attendee
 * @access  Public (future: protected)
 */
router.post(
  '/:id/check-out',
  validate(checkInOutSchema, 'body'),
  asyncHandler(attendeeController.checkOut.bind(attendeeController))
);

export default router;
