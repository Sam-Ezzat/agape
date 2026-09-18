/**
 * User Routes (organization user management)
 *
 * WHY: Admin-only — every route here requires the ADMIN role, in addition
 * to the global `authenticate` gate already applied in routes/index.ts.
 *
 * Endpoints:
 * - GET    /api/users        - List users in the caller's organization
 * - POST   /api/users        - Add a new user (server generates the password)
 * - PATCH  /api/users/:id/role - Change a user's role
 * - DELETE /api/users/:id    - Remove a user
 */

import { Router } from 'express';
import { UserController } from '@/controllers/user.controller';
import { UserService } from '@/services/user.service';
import { validate } from '@/middleware/validate';
import { requireRole } from '@/middleware/authorize';
import { asyncHandler } from '@/middleware/asyncHandler';
import { createUserSchema, updateUserRoleSchema, userIdSchema } from '@/validators/user.schemas';

const userService = new UserService();
const userController = new UserController(userService);

const router = Router();

router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(userController.list.bind(userController)));
router.post('/', validate(createUserSchema, 'body'), asyncHandler(userController.create.bind(userController)));
router.patch(
  '/:id/role',
  validate(userIdSchema, 'params'),
  validate(updateUserRoleSchema, 'body'),
  asyncHandler(userController.updateRole.bind(userController))
);
router.delete('/:id', validate(userIdSchema, 'params'), asyncHandler(userController.remove.bind(userController)));

export default router;
