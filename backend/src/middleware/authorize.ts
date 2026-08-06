/**
 * Role Authorization Middleware
 *
 * WHY: Some endpoints (org user management) are admin-only. Must run after
 * `authenticate` so req.user is already populated.
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from './errorHandler';

export const requireRole =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user || !roles.includes(req.user.role)) {
        throw new AppError(403, 'Forbidden');
      }
      next();
    } catch {
      next(new AppError(403, 'Forbidden'));
    }
  };
