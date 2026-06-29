/**
 * Prisma Client Singleton
 * 
 * WHY: Ensure single Prisma instance across the application
 * Prevents connection pool exhaustion and improves performance
 * 
 * SOLID Principle: Single Responsibility - Manages database connection lifecycle
 */

import { PrismaClient } from '@prisma/client';
import logger from './logger';

// WHY: Global variable to store singleton instance (survives hot reloads in dev)
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// WHY: Enable query logging in development for debugging
const prismaClientOptions = {
  log: (process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn']
    : ['error']) as Array<'query' | 'error' | 'warn'>,
};

// WHY: Reuse existing client in development (hot reload), create new in production
const prisma = global.prisma || new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV === 'development') {
  global.prisma = prisma;
}

// WHY: Log database connection status for monitoring
prisma.$connect()
  .then(() => {
    logger.info('✅ Database connected successfully');
  })
  .catch((error) => {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  });

// WHY: Graceful shutdown - disconnect from database when process terminates
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  logger.info('Database disconnected');
});

export default prisma;
