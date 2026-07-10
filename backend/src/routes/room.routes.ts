/**
 * Room Routes
 * 
 * WHY: Defines REST API endpoints for room operations
 * Applies validation middleware and connects to controller
 * 
 * Endpoints:
 * - POST   /api/rooms                       - Create room
 * - GET    /api/floors/:floorId/rooms       - List rooms on floor
 * - GET    /api/rooms/available             - List available rooms (filtered)
 * - GET    /api/rooms/search                - Search rooms with filters
 * - GET    /api/rooms/:id                   - Get single room
 * - PATCH  /api/rooms/:id                   - Update room
 * - POST   /api/rooms/:id/toggle-availability - Toggle room availability
 * - DELETE /api/rooms/:id                   - Delete room
 */

import { Router } from 'express';
import { RoomController } from '@/controllers/room.controller';
import { RoomService } from '@/services/room.service';
import { RoomRepository } from '@/repositories/RoomRepository';
import { FloorRepository } from '@/repositories/FloorRepository';
import { validate } from '@/middleware/validate';
import { asyncHandler } from '@/middleware/asyncHandler';
import {
  createRoomSchema,
  updateRoomSchema,
  roomIdSchema,
  floorIdSchema,
  roomFilterSchema,
  searchSchema,
} from '@/validators/schemas';
import prisma from '@/utils/prisma-client';

// Dependency injection
const roomRepository = new RoomRepository(prisma);
const floorRepository = new FloorRepository(prisma);
const roomService = new RoomService(roomRepository, floorRepository);
const roomController = new RoomController(roomService);

const router = Router();

// List all rooms
router.get('/', validate(searchSchema, 'query'), asyncHandler(roomController.list));

// Get available rooms (must be before /:id to avoid route conflict)
router.get(
  '/available',
  validate(roomFilterSchema, 'query'),
  asyncHandler(roomController.getAvailable)
);

// Search rooms with filters
router.get('/search', validate(roomFilterSchema, 'query'), asyncHandler(roomController.search));

// Create room
router.post('/', validate(createRoomSchema, 'body'), asyncHandler(roomController.create));

// Get rooms by floor (nested route - will be mounted under floors)
router.get(
  '/floors/:floorId/rooms',
  validate(floorIdSchema, 'params'),
  asyncHandler(roomController.getByFloor)
);

// Get room by ID
router.get('/:id', validate(roomIdSchema, 'params'), asyncHandler(roomController.getById));

// Update room
router.patch(
  '/:id',
  validate(roomIdSchema, 'params'),
  validate(updateRoomSchema, 'body'),
  asyncHandler(roomController.update)
);
router.put(
  '/:id',
  validate(roomIdSchema, 'params'),
  validate(updateRoomSchema, 'body'),
  asyncHandler(roomController.update)
);

// Delete room
router.delete('/:id', validate(roomIdSchema, 'params'), asyncHandler(roomController.delete));

export default router;
