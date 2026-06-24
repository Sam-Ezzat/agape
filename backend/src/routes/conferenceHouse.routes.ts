/**
 * ConferenceHouse Routes
 * 
 * WHY: Defines REST API endpoints for conference house operations
 * Applies validation middleware and connects to controller
 * 
 * Endpoints:
 * - POST   /api/conference-houses           - Create conference house
 * - GET    /api/conference-houses           - List all conference houses (with pagination/search)
 * - GET    /api/conference-houses/:id       - Get single conference house
 * - GET    /api/conference-houses/:id/hierarchy - Get with full hierarchy
 * - PATCH  /api/conference-houses/:id       - Update conference house
 * - DELETE /api/conference-houses/:id       - Delete conference house
 */

import { Router } from 'express';
import { ConferenceHouseController } from '@/controllers/conferenceHouse.controller';
import { ConferenceHouseService } from '@/services/conferenceHouse.service';
import { ConferenceHouseRepository } from '@/repositories/ConferenceHouseRepository';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  createConferenceHouseSchema,
  updateConferenceHouseSchema,
  conferenceHouseIdSchema,
  searchSchema,
} from '@/validators/schemas';
import prisma from '@/utils/prisma-client';

// WHY: Dependency injection - create instances
const conferenceHouseRepository = new ConferenceHouseRepository(prisma);
const conferenceHouseService = new ConferenceHouseService(conferenceHouseRepository);
const conferenceHouseController = new ConferenceHouseController(conferenceHouseService);

const router = Router();

// Create conference house
router.post(
  '/',
  validate(createConferenceHouseSchema, 'body'),
  asyncHandler(conferenceHouseController.create)
);

// Get all conference houses (with search/pagination)
router.get('/', validate(searchSchema, 'query'), asyncHandler(conferenceHouseController.getAll));

// Get conference house by ID
router.get(
  '/:id',
  validate(conferenceHouseIdSchema, 'params'),
  asyncHandler(conferenceHouseController.getById)
);

// Get conference house with full hierarchy
router.get(
  '/:id/hierarchy',
  validate(conferenceHouseIdSchema, 'params'),
  asyncHandler(conferenceHouseController.getHierarchy)
);

// Update conference house
router.patch(
  '/:id',
  validate(conferenceHouseIdSchema, 'params'),
  validate(updateConferenceHouseSchema, 'body'),
  asyncHandler(conferenceHouseController.update)
);

// Delete conference house
router.delete(
  '/:id',
  validate(conferenceHouseIdSchema, 'params'),
  asyncHandler(conferenceHouseController.delete)
);

export default router;
