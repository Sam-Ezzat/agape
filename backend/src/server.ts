/**
 * Server Entry Point
 * 
 * WHY: Starts the Express server and Socket.io for real-time features
 * Handles graceful shutdown on process termination
 * 
 * SOLID Principle: Single Responsibility - Only handles server startup
 */

import 'dotenv/config'; // WHY: Load environment variables first
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import logger from '@/utils/logger';
import prisma from '@/utils/prisma-client';
import { initializeNotificationService } from '@/services/notification.service';

const PORT = process.env.PORT || 3000;

/**
 * Start server
 * WHY: Async function allows awaiting database connection and other setup
 */
async function startServer(): Promise<void> {
  try {
    // Create Express app
    const app = createApp();

    // WHY: Create HTTP server to attach both Express and Socket.io
    const httpServer = createServer(app);

    // WHY: Setup Socket.io for real-time updates (assignment changes, check-ins)
    const io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    // Socket.io connection handling
    // WHY: Log connections for monitoring and setup notification service
    const notificationService = initializeNotificationService(io);

    io.on('connection', (socket) => {
      logger.info(`✅ Socket connected: ${socket.id}`);

      // WHY: Allow clients to join conference-specific rooms for targeted notifications
      socket.on('join-conference', (conferenceId: string) => {
        socket.join(conferenceId);
        logger.info(`Socket ${socket.id} joined conference room: ${conferenceId}`);
      });

      // WHY: Allow clients to leave conference rooms
      socket.on('leave-conference', (conferenceId: string) => {
        socket.leave(conferenceId);
        logger.info(`Socket ${socket.id} left conference room: ${conferenceId}`);
      });

      // WHY: Handle user-specific room joining (for targeted notifications)
      socket.on('join-user-room', (userId: string) => {
        socket.join(userId);
        logger.info(`Socket ${socket.id} joined user room: ${userId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`❌ Socket disconnected: ${socket.id}`);
      });

      // WHY: Ping-pong for connection health check
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });

    // WHY: Test notification on startup (development only)
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        notificationService.info(
          'Real-time notifications are working! 🎉',
          'System Ready'
        );
      }, 2000);
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
      
      if (process.env.NODE_ENV === 'development') {
        logger.info(`📚 API Docs: http://localhost:${PORT}/api`);
      }
    });

    // WHY: Graceful shutdown on SIGTERM (Vercel, Docker, Ctrl+C)
    // Ensures all connections are closed properly
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });

      await prisma.$disconnect();
      logger.info('Database disconnected');
      
      process.exit(0);
    });

    // WHY: Handle unexpected errors to prevent silent crashes
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Don't exit in development for better debugging
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
