/**
 * Socket.io Client Hook
 * 
 * WHY: Centralized Socket.io connection management with auto-reconnect
 * Handles real-time notifications and events
 * 
 * SOLID Principle: Single Responsibility - Only manages Socket.io connection
 */

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  NotificationPayload,
  NotificationType,
  NotificationEvent,
} from '@/types/notifications';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

/**
 * Custom hook for Socket.io connection
 * WHY: Provides a clean API for subscribing to real-time events
 */
export function useSocket(enabled: boolean = true) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // WHY: Only connect once authenticated — the server's handshake
    // middleware verifies the same httpOnly cookie the REST API uses and
    // rejects anonymous connections, so connecting earlier would just error.
    if (!enabled) {
      return;
    }

    // WHY: Create socket connection once
    socketRef.current = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      withCredentials: true,
    });

    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    socket.on('reconnect', (attemptNumber: number) => {
      console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
      toast.success('Connection restored');
    });

    socket.on('reconnect_error', () => {
      console.error('❌ Socket reconnection failed');
    });

    // WHY: Listen for generic notification events
    socket.on('notification', (payload: NotificationPayload) => {
      handleNotification(payload);
    });

    // WHY: Listen for specific events (can be extended)
    Object.values(NotificationEvent).forEach((event) => {
      socket.on(event, (payload: NotificationPayload) => {
        handleNotification({ ...payload, event });
      });
    });

    // WHY: Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, [enabled]);

  return socketRef.current;
}

/**
 * Handle incoming notifications
 * WHY: Display toast notifications based on type
 */
function handleNotification(payload: NotificationPayload): void {
  const { type, message, title } = payload;

  const toastMessage = title ? `${title}: ${message}` : message;

  switch (type) {
    case NotificationType.SUCCESS:
      toast.success(toastMessage, {
        duration: 4000,
        icon: '✅',
      });
      break;

    case NotificationType.ERROR:
      toast.error(toastMessage, {
        duration: 6000,
        icon: '❌',
      });
      break;

    case NotificationType.WARNING:
      toast(toastMessage, {
        duration: 5000,
        icon: '⚠️',
      });
      break;

    case NotificationType.INFO:
    default:
      toast(toastMessage, {
        duration: 4000,
        icon: 'ℹ️',
      });
      break;
  }
}

/**
 * Hook to emit socket events
 * WHY: Provides type-safe way to emit events from components
 */
export function useSocketEmit() {
  const socket = useSocket();

  const emit = (event: string, data: unknown) => {
    if (socket?.connected) {
      socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  return { emit, isConnected: socket?.connected || false };
}
