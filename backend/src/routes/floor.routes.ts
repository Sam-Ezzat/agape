/**
 * Floor Routes
 * 
 * WHY: Defines REST API endpoints for floor operations
 * Applies validation middleware and connects to controller
 * 
 * Endpoints:
 * - POST   /api/floors                      - Create floor
 * - GET    /api/buildings/:buildingId/floors - List floors in building
 * - GET    /api/floors/:id                  - Get single floor
 * - GET    /api/floors/:id/details          - Get floor with full details
 * - PATCH  /api/floors/:id                  - Update floor
 * - DELETE /api/floors/:id                  - Delete floor
 */

import { Router } from 'express';
import { FloorController } from '@/controllers/floor.controller';
import { FloorService } from '@/services/floor.service';
import { FloorRepository } from '@/repositories/FloorRepository';
import { BuildingRepository } from '@/repositories/BuildingRepository';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  createFloorSchema,
  updateFloorSchema,
  floorIdSchema,
  buildingIdSchema,
  searchSchema,
} from '@/validators/schemas';
import prisma from '@/utils/prisma-client';

// Dependency injection
const floorRepository = new FloorRepository(prisma);
const buildingRepository = new BuildingRepository(prisma);
const floorService = new FloorService(floorRepository, buildingRepository);
const floorController = new FloorController(floorService);

const router = Router();

// List all floors
router.get('/', validate(searchSchema, 'query'), asyncHandler(floorController.list));

// Create floor
router.post('/', validate(createFloorSchema, 'body'), asyncHandler(floorController.create));

// Get floors by building (nested route - will be mounted under buildings)
router.get(
  '/buildings/:buildingId/floors',
  validate(buildingIdSchema, 'params'),
  asyncHandler(floorController.getByBuilding)
);

// Get floor by ID
router.get('/:id', validate(floorIdSchema, 'params'), asyncHandler(floorController.getById));

// Get floor with full details
router.get(
  '/:id/details',
  validate(floorIdSchema, 'params'),
  asyncHandler(floorController.getDetails)
);

// Update floor
router.patch(
  '/:id',
  validate(floorIdSchema, 'params'),
  validate(updateFloorSchema, 'body'),
  asyncHandler(floorController.update)
);
router.put(
  '/:id',
  validate(floorIdSchema, 'params'),
  validate(updateFloorSchema, 'body'),
  asyncHandler(floorController.update)
);

// Delete floor
router.delete('/:id', validate(floorIdSchema, 'params'), asyncHandler(floorController.delete));

export default router;
