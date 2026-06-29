/**
 * Building Routes
 * 
 * WHY: Defines REST API endpoints for building operations
 * Applies validation middleware and connects to controller
 * 
 * Endpoints:
 * - POST   /api/buildings                              - Create building
 * - GET    /api/conference-houses/:conferenceHouseId/buildings - List buildings in house
 * - GET    /api/buildings/:id                          - Get single building
 * - GET    /api/buildings/:id/details                  - Get building with full details
 * - PATCH  /api/buildings/:id                          - Update building
 * - DELETE /api/buildings/:id                          - Delete building
 */

import { Router } from 'express';
import { BuildingController } from '@/controllers/building.controller';
import { BuildingService } from '@/services/building.service';
import { BuildingRepository } from '@/repositories/BuildingRepository';
import { ConferenceHouseRepository } from '@/repositories/ConferenceHouseRepository';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  createBuildingSchema,
  updateBuildingSchema,
  buildingIdSchema,
  conferenceHouseIdSchema,
  searchSchema,
} from '@/validators/schemas';
import prisma from '@/utils/prisma-client';

// Dependency injection
const buildingRepository = new BuildingRepository(prisma);
const conferenceHouseRepository = new ConferenceHouseRepository(prisma);
const buildingService = new BuildingService(buildingRepository, conferenceHouseRepository);
const buildingController = new BuildingController(buildingService);

const router = Router();

// List all buildings
router.get(
  '/',
  validate(searchSchema, 'query'),
  asyncHandler(buildingController.list)
);

// Create building
router.post(
  '/',
  validate(createBuildingSchema, 'body'),
  asyncHandler(buildingController.create)
);

// Get buildings by conference house (nested route - will be mounted under conference houses)
router.get(
  '/conference-houses/:conferenceHouseId/buildings',
  validate(conferenceHouseIdSchema, 'params'),
  validate(searchSchema, 'query'),
  asyncHandler(buildingController.getByConferenceHouse)
);

// Get building by ID
router.get('/:id', validate(buildingIdSchema, 'params'), asyncHandler(buildingController.getById));

// Get building with full details
router.get(
  '/:id/details',
  validate(buildingIdSchema, 'params'),
  asyncHandler(buildingController.getDetails)
);

// Update building
router.patch(
  '/:id',
  validate(buildingIdSchema, 'params'),
  validate(updateBuildingSchema, 'body'),
  asyncHandler(buildingController.update)
);

// Delete building
router.delete(
  '/:id',
  validate(buildingIdSchema, 'params'),
  asyncHandler(buildingController.delete)
);

export default router;
