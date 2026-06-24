/**
 * Room Assignment Validation Schemas
 * 
 * WHY: Type-safe input validation for room assignment operations
 * Ensures capacity and business rules are validated at the input level
 */

import { z } from 'zod';

/**
 * Create Assignment Schema
 * WHY: Validates single room assignment
 */
export const createAssignmentSchema = z.object({
  roomId: z.string().uuid('Invalid room ID'),
  attendeeId: z.string().uuid('Invalid attendee ID'),
  assignedBy: z.string().optional(), // Future: user ID
  notes: z.string().optional(),
});

/**
 * Update Assignment Schema
 * WHY: Allows moving attendee to different room
 */
export const updateAssignmentSchema = z.object({
  roomId: z.string().uuid('Invalid room ID').optional(),
  notes: z.string().optional(),
});

/**
 * Batch Assignment Schema
 * WHY: Validates bulk assignment operations
 */
export const batchAssignmentSchema = z.object({
  assignments: z.array(
    z.object({
      roomId: z.string().uuid(),
      attendeeId: z.string().uuid(),
    })
  ).min(1, 'At least one assignment required').max(100, 'Maximum 100 assignments per batch'),
});

/**
 * Assignment Filter Schema
 * WHY: Validates query parameters for assignment listing
 */
export const assignmentFilterSchema = z.object({
  roomId: z.string().uuid().optional(),
  buildingId: z.string().uuid().optional(),
  floorId: z.string().uuid().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

/**
 * TypeScript Types (inferred from Zod schemas)
 */
export type CreateAssignmentDTO = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentDTO = z.infer<typeof updateAssignmentSchema>;
export type BatchAssignmentDTO = z.infer<typeof batchAssignmentSchema>;
export type AssignmentFilterParams = z.infer<typeof assignmentFilterSchema>;
