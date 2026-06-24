/**
 * Dashboard Routes
 * 
 * WHY: REST API endpoints for dashboard statistics and metrics
 * Provides aggregated data for overview displays
 */

import { Router } from 'express';
import { DashboardController } from '@/controllers/dashboard.controller';
import { DashboardService } from '@/services/dashboard.service';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { ConferenceHouseRepository } from '@/repositories/ConferenceHouseRepository';
import { asyncHandler } from '@/middleware/asyncHandler';
import prisma from '@/utils/prisma-client';

const router = Router();

// Dependency injection
const attendeeRepository = new AttendeeRepository(prisma);
const roomRepository = new RoomRepository(prisma);
const assignmentRepository = new RoomAssignmentRepository(prisma);
const auditLogRepository = new AuditLogRepository(prisma);
const conferenceHouseRepository = new ConferenceHouseRepository(prisma);

const dashboardService = new DashboardService(
  attendeeRepository,
  roomRepository,
  assignmentRepository,
  auditLogRepository,
  conferenceHouseRepository
);

const dashboardController = new DashboardController(dashboardService);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get overall system statistics
 * @access  Public (future: admin only)
 */
router.get(
  '/stats',
  asyncHandler(dashboardController.getStats.bind(dashboardController))
);

/**
 * @route   GET /api/dashboard/occupancy
 * @desc    Get room occupancy breakdown by building/floor
 * @access  Public (future: admin only)
 */
router.get(
  '/occupancy',
  asyncHandler(dashboardController.getOccupancy.bind(dashboardController))
);

/**
 * @route   GET /api/dashboard/recent-activity
 * @desc    Get recent system activity
 * @access  Public (future: admin only)
 */
router.get(
  '/recent-activity',
  asyncHandler(dashboardController.getRecentActivity.bind(dashboardController))
);

/**
 * @route   GET /api/dashboard/check-ins
 * @desc    Get check-in/check-out report
 * @access  Public (future: admin only)
 */
router.get(
  '/check-ins',
  asyncHandler(dashboardController.getCheckInReport.bind(dashboardController))
);

export default router;
