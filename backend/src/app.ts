/**
 * Express Application Configuration
 * 
 * WHY: Centralized Express app setup with middleware, routes, and error handling
 * Separates app config from server startup for better testability
 * 
 * SOLID Principle: Single Responsibility - Only configures Express app
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import logger from '@/utils/logger';
import routes from '@/routes';

/**
 * Create and configure Express application
 * 
 * WHY: Factory function allows creating multiple app instances (useful for testing)
 */
export function createApp(): Application {
  const app = express();

  // WHY: Helmet adds security headers to protect against common vulnerabilities
  app.use(helmet());

  // WHY: Enable CORS for frontend to communicate with backend
  // In production, restrict to specific frontend URL from env variable
  const corsOrigin = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL
    : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow any localhost port in development
        if (!origin || origin.match(/^http:\/\/localhost:\d+$/)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      };

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    })
  );

  // WHY: Compress responses to reduce bandwidth and improve performance
  app.use(compression());

  // WHY: Parse the httpOnly auth cookie set at login
  app.use(cookieParser());

  // WHY: Parse JSON request bodies (limit to 10MB for Excel imports)
  app.use(express.json({ limit: '10mb' }));

  // WHY: Parse URL-encoded bodies (for form submissions)
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // WHY: Log all incoming requests in development
  if (process.env.NODE_ENV === 'development') {
    app.use((req, _res, next) => {
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  // Health check endpoint
  // WHY: Vercel and monitoring tools need this to check if app is running
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
    });
  });

  // API Routes
  // WHY: Mount all API routes under /api prefix
  app.use('/api', routes);

  // WHY: Handle 404 errors for undefined routes
  app.use(notFoundHandler);

  // WHY: Global error handler catches all errors (must be last middleware)
  app.use(errorHandler);

  return app;
}
