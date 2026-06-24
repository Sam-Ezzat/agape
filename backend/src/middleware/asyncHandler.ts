/**
 * Async Handler Middleware
 * 
 * WHY: Eliminates try-catch boilerplate in route handlers
 * Automatically catches async errors and passes to error handling middleware
 * 
 * SOLID Principle: Single Responsibility - Only handles async error catching
 * 
 * Usage:
 * router.get('/attendees', asyncHandler(async (req, res) => {
 *   const attendees = await attendeeService.getAll();
 *   res.json(attendees);
 * }));
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps async route handlers to catch errors automatically
 * 
 * WHY: Prevents unhandled promise rejections that crash the server
 * All errors are forwarded to Express error handler middleware
 */
export const asyncHandler = (fn: Function): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
