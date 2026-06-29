/**
 * Winston Logger Configuration
 * 
 * WHY: Centralized structured logging for debugging, monitoring, and audit trails
 * Uses Winston for flexible log levels, formatting, and transport options
 * 
 * SOLID Principle: Single Responsibility - Only handles logging configuration
 */

import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// WHY: Custom format for readable console output during development
const consoleFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  // WHY: Include error stack traces for debugging
  if (stack) {
    log += `\n${stack}`;
  }
  
  // WHY: Include additional metadata (request IDs, user IDs, etc.)
  if (Object.keys(metadata).length > 0) {
    log += `\n${JSON.stringify(metadata, null, 2)}`;
  }
  
  return log;
});

// WHY: JSON format for production logs (easier to parse and analyze)
const jsonFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  winston.format.json()
);

// WHY: Different log levels and formats for dev vs production
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? jsonFormat : combine(
    colorize(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    consoleFormat
  ),
  transports: [
    // WHY: Console transport for all environments (Vercel shows these logs)
    new winston.transports.Console(),
    
    // WHY: File transports for production (can be sent to external logging service)
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  // WHY: Continue running even if logger encounters an error
  exitOnError: false,
});

export default logger;
