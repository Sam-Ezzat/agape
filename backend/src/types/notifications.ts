/**
 * Notification Types (Backend)
 * 
 * WHY: Shared type definitions for Socket.io notifications
 * Ensures consistency between backend emits and frontend handling
 */

export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  INFO = 'info',
  WARNING = 'warning',
}

export enum NotificationEvent {
  // Room Assignment Events
  ROOM_ASSIGNED = 'room:assigned',
  ROOM_UNASSIGNED = 'room:unassigned',
  
  // Check-in Events
  ATTENDEE_CHECKED_IN = 'attendee:checked-in',
  ATTENDEE_CHECKED_OUT = 'attendee:checked-out',
  
  // Data Changes
  ATTENDEE_CREATED = 'attendee:created',
  ATTENDEE_UPDATED = 'attendee:updated',
  ATTENDEE_DELETED = 'attendee:deleted',
  
  ROOM_CREATED = 'room:created',
  ROOM_UPDATED = 'room:updated',
  ROOM_DELETED = 'room:deleted',
  
  // Import Events
  IMPORT_STARTED = 'import:started',
  IMPORT_PROGRESS = 'import:progress',
  IMPORT_COMPLETED = 'import:completed',
  IMPORT_FAILED = 'import:failed',
  
  // Auto-Assignment Events
  AUTO_ASSIGNMENT_PROGRESS = 'auto-assignment-progress',
  AUTO_ASSIGNMENT_COMPLETE = 'auto-assignment-complete',
  AUTO_ASSIGNMENT_ERROR = 'auto-assignment-error',
  AUTO_ASSIGNMENT_PREVIEW_PROGRESS = 'auto-assignment-preview-progress',
  AUTO_ASSIGNMENT_CONFIG_UPDATED = 'auto-assignment-config-updated',
}

/**
 * Base notification payload
 */
export interface NotificationPayload {
  type: NotificationType;
  event: NotificationEvent;
  message: string;
  title?: string;
  data?: Record<string, unknown>;
  userId?: string;
  timestamp: string;
}
