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
  app.use(
    cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    })
  );

  // WHY: Compress responses to reduce bandwidth and improve performance
  app.use(compression());

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
