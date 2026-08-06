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
import cookie from 'cookie';
import { createApp } from './app';
import logger from '@/utils/logger';
import prisma from '@/utils/prisma-client';
import { initializeNotificationService } from '@/services/notification.service';
import { getAllWhatsAppServices } from '@/services/communication/whatsapp.registry';
import { createMessageProcessingService } from '@/services/communication/messageProcessing.service';
import { setIO } from '@/utils/socket-singleton';
import { AUTH_COOKIE_NAME, verifyToken } from '@/utils/jwt';

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
    const socketCorsOrigin = process.env.SOCKET_CORS_ORIGIN
      ? process.env.SOCKET_CORS_ORIGIN
      : (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
          // Allow any localhost port in development
          if (!origin || origin.match(/^http:\/\/localhost:\d+$/)) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        };

    const io = new SocketServer(httpServer, {
      cors: {
        origin: socketCorsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });
    setIO(io);

    // WHY: Authenticate the handshake using the same httpOnly cookie the
    // REST API trusts, so a socket can never be opened by an anonymous or
    // cross-tenant client. Without this, any client could join any
    // `org:<id>`/conference room just by knowing (or guessing) its id.
    io.use((socket, next) => {
      try {
        const cookieHeader = socket.handshake.headers.cookie;
        const token = cookieHeader ? cookie.parse(cookieHeader)[AUTH_COOKIE_NAME] : undefined;
        if (!token) {
          return next(new Error('Unauthorized'));
        }
        const user = verifyToken(token);
        socket.data.userId = user.id;
        socket.data.organizationId = user.organizationId;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });

    // Socket.io connection handling
    // WHY: Log connections for monitoring and setup notification service
    const notificationService = initializeNotificationService(io);

    io.on('connection', (socket) => {
      const { organizationId, userId } = socket.data as { organizationId: string; userId: string };
      logger.info(`✅ Socket connected: ${socket.id} (org: ${organizationId})`);

      // WHY: Every socket auto-joins its own organization's room — this is
      // the only room real-time broadcasts target, so tenants are isolated
      // by construction rather than by trusting client-supplied ids.
      socket.join(`org:${organizationId}`);
      socket.join(userId);

      // WHY: Conference rooms are still opt-in (multiple conferences per
      // org), but scoped under the org namespace so a client can't join
      // another organization's conference room.
      socket.on('join-conference', (conferenceId: string) => {
        socket.join(`org:${organizationId}:conference:${conferenceId}`);
        logger.info(`Socket ${socket.id} joined conference room: ${conferenceId}`);
      });

      socket.on('leave-conference', (conferenceId: string) => {
        socket.leave(`org:${organizationId}:conference:${conferenceId}`);
        logger.info(`Socket ${socket.id} left conference room: ${conferenceId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`❌ Socket disconnected: ${socket.id}`);
      });

      // WHY: Ping-pong for connection health check
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });

    // WHY: notificationService is initialized (wires up Socket.io) even
    // though nothing here emits through it directly anymore — the startup
    // smoke-test notification was removed since broadcast() now requires an
    // organizationId, which doesn't exist at server-boot time (no request).
    void notificationService;

    // Initialize Communication Services
    logger.info('💬 Initializing communication services...');

    // WHY: WhatsApp clients are created lazily per-organization (see
    // whatsapp.registry.ts) the first time an org initializes WhatsApp from
    // the UI — the set of orgs isn't known at boot. The message processor
    // resolves the right org's client per-job via the same registry.
    const messageProcessingService = createMessageProcessingService(io);

    logger.info('✅ Communication services initialized');
    logger.info('📱 WhatsApp: Ready to initialize (scan QR code when ready)');

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
      
      // Shutdown communication services
      logger.info('Shutting down communication services...');
      try {
        await Promise.all(getAllWhatsAppServices().map((service) => service.disconnect()));
        await messageProcessingService.shutdown();
      } catch (error) {
        logger.error('Error shutting down communication services:', error);
      }
      
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
