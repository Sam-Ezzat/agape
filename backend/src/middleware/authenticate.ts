/**
 * Auth Middleware
 *
 * WHY: Reads the JWT from the httpOnly cookie set at login, verifies it,
 * and attaches the decoded user (incl. organizationId) to req.user so every
 * downstream controller can scope its queries to the caller's organization.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { AUTH_COOKIE_NAME, verifyToken } from '@/utils/jwt';

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      throw new AppError(401, 'Unauthorized');
    }

    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError(401, 'Unauthorized'));
  }
};
