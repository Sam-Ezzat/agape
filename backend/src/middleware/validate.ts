/**
 * Validation Middleware
 * 
 * WHY: Reusable middleware for request validation using Zod schemas
 * Validates request body, query params, and URL params
 * 
 * SOLID Principle: Single Responsibility - Only validates requests
 */

import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from './errorHandler';

/**
 * Validate request data against Zod schema
 * WHY: Type-safe request validation with detailed error messages
 * 
 * @param schema - Zod schema to validate against
 * @param source - Which part of request to validate ('body' | 'query' | 'params')
 */
export const validate =
  (schema: AnyZodObject, source: 'body' | 'query' | 'params' = 'body') =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // WHY: Parse and validate the specified request data
      const validated = await schema.parseAsync(req[source]);
      
      // WHY: Replace request data with validated (and coerced) data
      req[source] = validated;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // WHY: Convert Zod errors to user-friendly format
        const errorMessage = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        
        next(new AppError(400, `Validation failed: ${errorMessage}`));
      } else {
        next(error);
      }
    }
  };
