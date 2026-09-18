/**
 * Message Template Validation Schemas
 *
 * WHY: Type-safe input validation for template CRUD operations.
 * Uses Zod for runtime validation + TypeScript type inference.
 */

import { z } from 'zod';
import { TemplateCategory } from '@prisma/client';

/**
 * Helper to transform empty strings to undefined
 * WHY: Prevent storing empty strings for optional fields
 */
const emptyStringToUndefined = (val: string | undefined) => (val === '' || val === null ? undefined : val);

/**
 * Create Template Schema
 */
export const createTemplateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(200),
  description: z.string().max(1000).optional().transform(emptyStringToUndefined),
  category: z.nativeEnum(TemplateCategory),
  subject: z.string().max(300).optional().transform(emptyStringToUndefined),
  body: z.string().min(1, 'Template body is required').max(65000),
  language: z.string().max(10).optional(),
  hasAttachment: z.boolean().optional(),
  attachmentUrl: z
    .string()
    .url('Invalid attachment URL')
    .max(2000)
    .optional()
    .or(z.literal(''))
    .transform(emptyStringToUndefined),
  attachmentType: z.string().max(100).optional().transform(emptyStringToUndefined),
});

/**
 * Update Template Schema
 * WHY: All fields optional for partial updates; isActive is only settable on update
 * (new templates always start active — see the Prisma model default).
 */
export const updateTemplateSchema = createTemplateSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/**
 * TypeScript Types (inferred from Zod schemas)
 */
export type CreateTemplateDTO = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateDTO = z.infer<typeof updateTemplateSchema>;
