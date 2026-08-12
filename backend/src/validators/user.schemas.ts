import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email address').optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'MEMBER', 'CONFERENCE_HOUSE_MANAGER']),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'CONFERENCE_HOUSE_MANAGER']),
});

export const userIdSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
});

export type UpdateProfileDTO = z.infer<typeof updateProfileSchema>;
export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;
export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserRoleDTO = z.infer<typeof updateUserRoleSchema>;
