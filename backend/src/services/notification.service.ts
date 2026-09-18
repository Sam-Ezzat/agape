/**
 * Notification Service
 * 
 * WHY: Centralized service for emitting Socket.io notifications
 * Provides consistent API for sending real-time updates to clients
 * 
 * SOLID Principle: Single Responsibility - Only handles notifications
 * SOLID Principle: Dependency Injection - Socket.io instance injected
 */

import { Server as SocketServer } from 'socket.io';
import {
  NotificationPayload,
  NotificationType,
  NotificationEvent,
} from '@/types/notifications';
import logger from '@/utils/logger';

/**
 * NotificationService Class
 * WHY: Encapsulates Socket.io notification logic
 */
export class NotificationService {
  private io: SocketServer;

  constructor(io: SocketServer) {
    this.io = io;
  }

  /**
   * Emit notification to every client in an organization
   * WHY: Broadcast events like new attendees, room changes — scoped to the
   * caller's organization (via the `org:${organizationId}` Socket.io room
   * every authenticated socket auto-joins) so tenants never see each other's activity.
   */
  broadcast(
    organizationId: string,
    event: NotificationEvent,
    type: NotificationType,
    message: string,
    title?: string,
    data?: Record<string, unknown>
  ): void {
    const payload: NotificationPayload = {
      type,
      event,
      message,
      title,
      data,
      timestamp: new Date().toISOString(),
    };

    const room = this.io.to(`org:${organizationId}`);
    room.emit('notification', payload);
    room.emit(event, payload);

    logger.info('Notification broadcast:', {
      organizationId,
      event,
      type,
      message,
    });
  }

  /**
   * Emit notification to specific user
   * WHY: For user-specific events like assignment confirmations
   */
  notifyUser(
    userId: string,
    event: NotificationEvent,
    type: NotificationType,
    message: string,
    title?: string,
    data?: Record<string, unknown>
  ): void {
    const payload: NotificationPayload = {
      type,
      event,
      message,
      title,
      data,
      userId,
      timestamp: new Date().toISOString(),
    };

    // WHY: Emit to room named after userId (user must join this room on connect)
    this.io.to(userId).emit('notification', payload);
    this.io.to(userId).emit(event, payload);

    logger.info('User notification sent:', {
      userId,
      event,
      type,
      message,
    });
  }

  /**
   * Emit notification to specific room/conference
   * WHY: For conference-specific events (all admins viewing same conference)
   */
  notifyRoom(
    roomId: string,
    event: NotificationEvent,
    type: NotificationType,
    message: string,
    title?: string,
    data?: Record<string, unknown>
  ): void {
    const payload: NotificationPayload = {
      type,
      event,
      message,
      title,
      data,
      timestamp: new Date().toISOString(),
    };

    this.io.to(roomId).emit('notification', payload);
    this.io.to(roomId).emit(event, payload);

    logger.info('Room notification sent:', {
      roomId,
      event,
      type,
      message,
    });
  }

  /**
   * Success notification
   */
  success(organizationId: string, message: string, title?: string, data?: Record<string, unknown>): void {
    this.broadcast(
      organizationId,
      NotificationEvent.ATTENDEE_UPDATED, // Default event, can be overridden
      NotificationType.SUCCESS,
      message,
      title,
      data
    );
  }

  /**
   * Error notification
   */
  error(organizationId: string, message: string, title?: string, data?: Record<string, unknown>): void {
    this.broadcast(
      organizationId,
      NotificationEvent.IMPORT_FAILED, // Default event
      NotificationType.ERROR,
      message,
      title,
      data
    );
  }

  /**
   * Info notification
   */
  info(organizationId: string, message: string, title?: string, data?: Record<string, unknown>): void {
    this.broadcast(
      organizationId,
      NotificationEvent.ATTENDEE_CREATED, // Default event
      NotificationType.INFO,
      message,
      title,
      data
    );
  }

  /**
   * Warning notification
   */
  warning(organizationId: string, message: string, title?: string, data?: Record<string, unknown>): void {
    this.broadcast(
      organizationId,
      NotificationEvent.ROOM_UPDATED, // Default event
      NotificationType.WARNING,
      message,
      title,
      data
    );
  }
}

// WHY: Export singleton instance factory
let notificationService: NotificationService | null = null;

export function initializeNotificationService(io: SocketServer): NotificationService {
  notificationService = new NotificationService(io);
  return notificationService;
}

export function getNotificationService(): NotificationService {
  if (!notificationService) {
    throw new Error('NotificationService not initialized. Call initializeNotificationService first.');
  }
  return notificationService;
}
