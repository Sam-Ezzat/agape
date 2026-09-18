/**
 * Excel Routes
 * 
 * WHY: REST API endpoints for Excel import/export operations
 * Handles file uploads and downloads for bulk operations
 */

import { Router } from 'express';
import multer from 'multer';
import { ExcelController } from '@/controllers/excel.controller';
import { ExcelService } from '@/services/excel.service';
import { AttendeeService } from '@/services/attendee.service';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { RoomingNotesCacheService } from '@/services/auto-assignment/RoomingNotesCacheService';
import { asyncHandler } from '@/middleware/asyncHandler';
import prisma from '@/utils/prisma-client';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  },
});

// Dependency injection
const attendeeRepository = new AttendeeRepository(prisma);
const assignmentRepository = new RoomAssignmentRepository(prisma);
const auditLogRepository = new AuditLogRepository(prisma);

const attendeeService = new AttendeeService(
  attendeeRepository,
  assignmentRepository,
  auditLogRepository
);

const roomingNotesCacheService = new RoomingNotesCacheService(attendeeRepository);

const excelService = new ExcelService();
const excelController = new ExcelController(
  excelService,
  attendeeService,
  assignmentRepository,
  roomingNotesCacheService
);

/**
 * @route   GET /api/excel/attendees/template
 * @desc    Download Excel template for attendee import
 * @access  Public
 * @note    Must be before /import route
 */
router.get(
  '/attendees/template',
  asyncHandler(excelController.downloadTemplate.bind(excelController))
);

/**
 * @route   GET /api/excel/attendees/export
 * @desc    Export attendees to Excel file
 * @access  Public (future: protected)
 */
router.get(
  '/attendees/export',
  asyncHandler(excelController.exportAttendees.bind(excelController))
);

/**
 * @route   POST /api/excel/attendees/import
 * @desc    Import attendees from Excel file
 * @access  Public (future: protected)
 */
router.post(
  '/attendees/import',
  upload.single('file'),
  asyncHandler(excelController.importAttendees.bind(excelController))
);

/**
 * @route   GET /api/excel/assignments/export
 * @desc    Export room assignments to Excel file
 * @access  Public (future: protected)
 */
router.get(
  '/assignments/export',
  asyncHandler(excelController.exportAssignments.bind(excelController))
);

/**
 * @route   GET /api/excel/rooms/template
 * @desc    Download Excel template for rooms import
 * @access  Public
 */
router.get(
  '/rooms/template',
  asyncHandler(excelController.downloadRoomsTemplate.bind(excelController))
);

/**
 * @route   GET /api/excel/rooms/export
 * @desc    Export rooms layout to Excel file
 * @access  Public
 */
router.get(
  '/rooms/export',
  asyncHandler(excelController.exportRooms.bind(excelController))
);

/**
 * @route   POST /api/excel/rooms/import
 * @desc    Import rooms layout from Excel file
 * @access  Public
 */
router.post(
  '/rooms/import',
  upload.single('file'),
  asyncHandler(excelController.importRooms.bind(excelController))
);

export default router;
