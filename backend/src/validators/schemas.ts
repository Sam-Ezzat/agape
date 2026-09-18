/**
 * Validation Schemas
 * 
 * WHY: Centralized Zod schemas for request validation
 * Ensures type safety and data integrity across API endpoints
 * 
 * SOLID Principle: Single Responsibility - Only validation logic
 */

import { z } from 'zod';
import { ConferenceRole, Gender, RoomType } from '@prisma/client';

/**
 * Conference House Schemas
 */
export const createConferenceHouseSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional(),
});

export const updateConferenceHouseSchema = createConferenceHouseSchema.partial();

export const conferenceHouseIdSchema = z.object({
  id: z.string().uuid('Invalid conference house ID'),
});

/**
 * Building Schemas
 */
export const createBuildingSchema = z.object({
  name: z.string().min(1, 'Building name is required').max(100),
  conferenceHouseId: z.string().uuid('Invalid conference house ID'),
  floorCount: z.number().int().positive('Must have at least 1 floor').max(50, 'Maximum 50 floors'),
});

export const updateBuildingSchema = createBuildingSchema.partial().omit({ conferenceHouseId: true });

export const buildingIdSchema = z.object({
  id: z.string().uuid('Invalid building ID'),
});

/**
 * Floor Schemas
 */
export const createFloorSchema = z.object({
  floorNumber: z.number().int().min(-5, 'Floor number too low').max(200, 'Floor number too high'),
  name: z.string().min(1, 'Floor name is required').max(100),
  buildingId: z.string().uuid('Invalid building ID'),
});

export const updateFloorSchema = createFloorSchema.partial().omit({ buildingId: true });

export const floorIdSchema = z.object({
  id: z.string().uuid('Invalid floor ID'),
});

/**
 * Room Schemas
 */
export const createRoomSchema = z.object({
  roomNumber: z.string().min(1, 'Room number is required').max(20),
  floorId: z.string().uuid('Invalid floor ID'),
  // WHY: capacity and amenities are derived server-side from bed counts
  // (see @/utils/roomCapacity) — not accepted as direct input.
  individualBeds: z.number().int().nonnegative().optional().default(0),
  bunkBeds: z.number().int().nonnegative().optional().default(0),
  kingBeds: z.number().int().nonnegative().optional().default(0),
  roomType: z.nativeEnum(RoomType, { errorMap: () => ({ message: 'Invalid room type' }) }),
});

export const updateRoomSchema = createRoomSchema.partial().omit({ floorId: true });

export const roomIdSchema = z.object({
  id: z.string().uuid('Invalid room ID'),
});

/**
 * Query Parameter Schemas
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const searchSchema = z.object({
  search: z.string().max(100).optional(),
  ...paginationSchema.shape,
});

export const roomFilterSchema = z.object({
  buildingId: z.string().uuid().optional(),
  floorId: z.string().uuid().optional(),
  roomType: z.nativeEnum(RoomType).optional(),
  minCapacity: z.coerce.number().int().positive().optional(),
  maxCapacity: z.coerce.number().int().positive().optional(),
  ...paginationSchema.shape,
});

/**
 * Attendee Schemas (for Phase 3, but defining structure now)
 */
export const createAttendeeSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email').max(100).optional(),
  phone: z.string().max(20).optional(),
  gender: z.nativeEnum(Gender).optional(),
  conferenceRole: z.nativeEnum(ConferenceRole).default(ConferenceRole.ATTENDEE),
  notes: z.string().max(1000).optional(),
});

export const updateAttendeeSchema = createAttendeeSchema.partial();

export const attendeeIdSchema = z.object({
  id: z.string().uuid('Invalid attendee ID'),
});

/**
 * Room Assignment Schemas (for Phase 4)
 */
export const createRoomAssignmentSchema = z.object({
  attendeeId: z.string().uuid('Invalid attendee ID'),
  roomId: z.string().uuid('Invalid room ID'),
  notes: z.string().max(500).optional(),
});

export const updateRoomAssignmentSchema = z.object({
  roomId: z.string().uuid('Invalid room ID').optional(),
  notes: z.string().max(500).optional(),
});

export const roomAssignmentIdSchema = z.object({
  id: z.string().uuid('Invalid assignment ID'),
});

/**
 * Type inference helpers
 * WHY: Export TypeScript types derived from Zod schemas
 */
export type CreateConferenceHouseDTO = z.infer<typeof createConferenceHouseSchema>;
export type UpdateConferenceHouseDTO = z.infer<typeof updateConferenceHouseSchema>;
export type CreateBuildingDTO = z.infer<typeof createBuildingSchema>;
export type UpdateBuildingDTO = z.infer<typeof updateBuildingSchema>;
export type CreateFloorDTO = z.infer<typeof createFloorSchema>;
export type UpdateFloorDTO = z.infer<typeof updateFloorSchema>;
export type CreateRoomDTO = z.infer<typeof createRoomSchema>;
export type UpdateRoomDTO = z.infer<typeof updateRoomSchema>;
export type PaginationParams = z.infer<typeof paginationSchema>;
export type SearchParams = z.infer<typeof searchSchema>;
export type RoomFilterParams = z.infer<typeof roomFilterSchema>;
export type CreateAttendeeDTO = z.infer<typeof createAttendeeSchema>;
export type UpdateAttendeeDTO = z.infer<typeof updateAttendeeSchema>;
export type CreateRoomAssignmentDTO = z.infer<typeof createRoomAssignmentSchema>;
export type UpdateRoomAssignmentDTO = z.infer<typeof updateRoomAssignmentSchema>;
