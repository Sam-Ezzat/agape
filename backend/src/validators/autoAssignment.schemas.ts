/**
 * Auto-Assignment Validation Schemas
 * 
 * WHY: Type-safe input validation for auto-assignment operations
 * Ensures configuration and execution parameters are validated
 */

import { z } from 'zod';

/**
 * Run Auto-Assignment Schema
 * WHY: Validates auto-assignment execution parameters
 */
export const runAutoAssignmentSchema = z.object({
  conferenceHouseId: z.string().uuid('Invalid conference house ID'),
  buildingIds: z.array(z.string().uuid()).optional(),
  // WHY: Manual per-building gender pin — buildings absent from this map
  // keep the automatic first-come gender behavior.
  buildingGenderOverrides: z.record(z.string().uuid(), z.enum(['MALE', 'FEMALE'])).optional(),
  dryRun: z.boolean().optional().default(false),
  options: z.object({
    onlyUnassigned: z.boolean().optional().default(true),
    skipOptimization: z.boolean().optional().default(false),
  }).optional(),
});

/**
 * Update Config Schema
 * WHY: Validates auto-assignment configuration updates
 */
export const updateAutoAssignmentConfigSchema = z.object({
  enabledBuildings: z.array(z.string().uuid()).optional(),
  buildingGenderOverrides: z.record(z.string().uuid(), z.enum(['MALE', 'FEMALE'])).optional(),
  staffReservedCapacity: z.number().int().min(0).max(1000).optional(),
  vipReservedCapacity: z.number().int().min(0).max(1000).optional(),
  emergencyReservedCapacity: z.number().int().min(0).max(100).optional(),
  leaderReservedSlots: z.number().int().min(0).max(10).optional(),
  enabledRules: z.array(z.string()).optional(),
  ruleWeights: z.record(z.string(), z.number().min(0).max(1)).optional(),
  optimizationEnabled: z.boolean().optional(),
});

/**
 * Conference House ID Param Schema
 * WHY: Validates route parameter
 */
export const conferenceHouseIdParamSchema = z.object({
  conferenceHouseId: z.string().uuid('Invalid conference house ID'),
});

/**
 * Preview Session ID Param Schema
 * WHY: Validates route parameter for the shared preview-session endpoints
 */
export const previewSessionIdParamSchema = z.object({
  id: z.string().uuid('Invalid preview session ID'),
});

/**
 * Apply Preview Edit Schema
 * WHY: The frontend already computes the resulting full draft state using
 * the same pure logic it always has (unassign/assign/swap); the server
 * just persists it with an optimistic-concurrency version check and logs
 * a human-readable activity summary.
 */
export const applyPreviewEditSchema = z.object({
  expectedVersion: z.number().int().min(1),
  data: z.record(z.string(), z.any()),
  activitySummary: z.string().min(1).max(300),
});

/**
 * TypeScript Types (inferred from Zod schemas)
 */
export type RunAutoAssignmentValidationDTO = z.infer<typeof runAutoAssignmentSchema>;
export type UpdateAutoAssignmentConfigDTO = z.infer<typeof updateAutoAssignmentConfigSchema>;
export type ConferenceHouseIdParam = z.infer<typeof conferenceHouseIdParamSchema>;
export type PreviewSessionIdParam = z.infer<typeof previewSessionIdParamSchema>;
export type ApplyPreviewEditDTO = z.infer<typeof applyPreviewEditSchema>;
