/**
 * Auth Routes
 *
 * WHY: Public login/logout endpoints plus a protected /me endpoint used by
 * the frontend to restore session state on load.
 *
 * Endpoints:
 * - POST  /api/auth/login           - Authenticate, sets httpOnly cookie
 * - POST  /api/auth/logout          - Clears the auth cookie
 * - GET   /api/auth/me              - Returns the current authenticated user
 * - PATCH /api/auth/me              - Update own name/email
 * - POST  /api/auth/change-password - Change own password
 */

import { Router } from 'express';
import { AuthController } from '@/controllers/auth.controller';
import { AuthService } from '@/services/auth.service';
import { validate } from '@/middleware/validate';
import { authenticate } from '@/middleware/authenticate';
import { asyncHandler } from '@/middleware/asyncHandler';
import { loginSchema } from '@/validators/auth.schemas';
import { updateProfileSchema, changePasswordSchema } from '@/validators/user.schemas';

const authService = new AuthService();
const authController = new AuthController(authService);

const router = Router();

router.post('/login', validate(loginSchema, 'body'), asyncHandler(authController.login.bind(authController)));
router.post('/logout', asyncHandler(authController.logout.bind(authController)));
router.get('/me', authenticate, asyncHandler(authController.me.bind(authController)));
router.patch(
  '/me',
  authenticate,
  validate(updateProfileSchema, 'body'),
  asyncHandler(authController.updateProfile.bind(authController))
);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema, 'body'),
  asyncHandler(authController.changePassword.bind(authController))
);

export default router;
