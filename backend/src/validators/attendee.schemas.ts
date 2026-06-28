/**
 * Attendee Validation Schemas
 * 
 * WHY: Type-safe input validation for all attendee operations
 * Uses Zod for runtime validation + TypeScript type inference
 * Updated to match conference registration Excel structure
 */

import { z } from 'zod';
import { Gender, ConferenceRole, PaymentStatus } from '@prisma/client';

/**
 * Create Attendee Schema
 * WHY: Validates attendee registration data with all conference fields
 */
export const createAttendeeSchema = z.object({
  ticketId: z.string().max(50).optional(),
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(200),
  phone: z.string().max(20).optional(),
  email: z.string().email('Invalid email format').optional(),
  age: z.number().int().positive().max(150).optional(),
  gender: z.nativeEnum(Gender).optional(),
  church: z.string().max(200).optional(),
  area: z.string().max(200).optional(),
  governorate: z.string().max(100).optional(),
  arrivalMethod: z.string().max(100).optional(),
  busPickupPoint: z.string().max(200).optional(),
  paymentMethod: z.string().max(100).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).default('PENDING'),
  transactionNumber: z.string().max(100).optional(),
  conferenceRole: z.nativeEnum(ConferenceRole).default('ATTENDEE'),
  notes: z.string().optional(),
  roomingNotes: z.string().optional(),
  internalNotes: z.string().optional(),
  checkedInBy: z.string().max(100).optional(),
});

/**
 * Update Attendee Schema
 * WHY: All fields optional for partial updates
 */
export const updateAttendeeSchema = createAttendeeSchema.partial();

/**
 * Attendee Filter Schema
 * WHY: Validates query parameters for attendee search/listing
 */
export const attendeeFilterSchema = z.object({
  search: z.string().optional(), // Full-text search on fullName
  role: z.nativeEnum(ConferenceRole).optional(),
  gender: z.nativeEnum(Gender).optional(),
  checkedIn: z.enum(['true', 'false']).optional().transform((val) => val === 'true'),
  hasAssignment: z.enum(['true', 'false']).optional().transform((val) => val === 'true'),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

/**
 * Check-in/Check-out Schema
 * WHY: Optional metadata for check-in/check-out operations
 */
export const checkInOutSchema = z.object({
  notes: z.string().optional(),
});

/**
 * TypeScript Types (inferred from Zod schemas)
 */
export type CreateAttendeeDTO = z.infer<typeof createAttendeeSchema>;
export type UpdateAttendeeDTO = z.infer<typeof updateAttendeeSchema>;
export type AttendeeFilterParams = z.infer<typeof attendeeFilterSchema>;
export type CheckInOutDTO = z.infer<typeof checkInOutSchema>;
