/**
 * Global Error Handler Middleware
 * 
 * WHY: Centralized error handling with consistent response format
 * Prevents error details from leaking in production
 * Logs all errors for debugging and monitoring
 * 
 * SOLID Principle: Single Responsibility - Only handles error responses
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '@/utils/logger';

/**
 * Custom Application Error Class
 * 
 * WHY: Structured error type with HTTP status codes
 * Allows throwing errors with specific status codes throughout the app
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error Response Interface
 * WHY: Consistent error response structure for frontend handling
 */
interface ErrorResponse {
  status: 'error';
  statusCode: number;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  stack?: string;
}

/**
 * Global Error Handler
 * 
 * WHY: Catches all errors thrown in the application
 * Converts them to consistent JSON responses
 * Logs errors for debugging and monitoring
 */
export const errorHandler = (
  error: Error | AppError | ZodError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // WHY: Log all errors for debugging (include request details)
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // WHY: Handle Zod validation errors with detailed field-level messages
  if (error instanceof ZodError) {
    const validationErrors = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    const response: ErrorResponse = {
      status: 'error',
      statusCode: 400,
      message: 'Validation failed',
      errors: validationErrors,
    };

    res.status(400).json(response);
    return;
  }

  // WHY: Handle custom AppError instances with specific status codes
  if (error instanceof AppError) {
    const response: ErrorResponse = {
      status: 'error',
      statusCode: error.statusCode,
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    };

    res.status(error.statusCode).json(response);
    return;
  }

  // WHY: Generic error handling for unexpected errors
  // Don't leak internal error details in production
  const response: ErrorResponse = {
    status: 'error',
    statusCode: 500,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  };

  res.status(500).json(response);
};

/**
 * 404 Not Found Handler
 * 
 * WHY: Handle routes that don't exist with consistent error format
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ErrorResponse = {
    status: 'error',
    statusCode: 404,
    message: `Route ${req.method} ${req.path} not found`,
  };

  res.status(404).json(response);
};
