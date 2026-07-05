/**
 * Toast Notification Types
 * 
 * WHY: Centralized type definitions for real-time notifications
 * Used across Socket.io events and toast displays
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
  AUTO_ASSIGNMENT_PROGRESS = 'auto-assignment:progress',
  AUTO_ASSIGNMENT_COMPLETE = 'auto-assignment:complete',
  AUTO_ASSIGNMENT_ERROR = 'auto-assignment:error',
  AUTO_ASSIGNMENT_PREVIEW_PROGRESS = 'auto-assignment:preview-progress',
  AUTO_ASSIGNMENT_CONFIG_UPDATED = 'auto-assignment:config-updated',
}

/**
 * Base notification payload
 * WHY: Consistent structure for all notification events
 */
export interface NotificationPayload {
  type: NotificationType;
  event: NotificationEvent;
  message: string;
  title?: string;
  data?: Record<string, unknown>;
  userId?: string; // WHY: Target specific user (if needed)
  timestamp: string;
}

/**
 * Room assignment notification
 */
export interface RoomAssignmentNotification extends NotificationPayload {
  data: {
    attendeeId: string;
    attendeeName: string;
    roomId: string;
    roomNumber: string;
    buildingName: string;
    floorNumber: number;
  };
}

/**
 * Check-in notification
 */
export interface CheckInNotification extends NotificationPayload {
  data: {
    attendeeId: string;
    attendeeName: string;
    roomNumber?: string;
    checkedInAt: string;
  };
}

/**
 * Import progress notification
 */
export interface ImportProgressNotification extends NotificationPayload {
  data: {
    importId: string;
    processedCount: number;
    totalCount: number;
    percentage: number;
    errors?: string[];
  };
}

/**
 * Auto-assignment progress notification
 */
export interface AutoAssignmentProgressNotification extends NotificationPayload {
  data: {
    stage: string;
    progress?: {
      total: number;
      processed: number;
      percentage: number;
    };
    currentAction?: string;
    result?: {
      assignmentsCreated: number;
      roomsUsed: number;
      unassignedCount: number;
    };
    error?: {
      reason: string;
      attendeeId?: string;
    };
  };
}
