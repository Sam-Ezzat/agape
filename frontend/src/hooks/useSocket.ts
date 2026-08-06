/**
 * Socket.io Client Hook
 * 
 * WHY: Centralized Socket.io connection management with auto-reconnect
 * Handles real-time notifications and events
 * 
 * SOLID Principle: Single Responsibility - Only manages Socket.io connection
 */

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { NotificationPayload, NotificationType } from '@/types/notifications';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';

// WHY: The server broadcasts each notification on two channels — a generic
// 'notification' event and the specific event name (e.g. 'room:assigned') —
// so other listeners can subscribe narrowly if they ever need to. The toast
// display only needs one of those, and previously subscribed to both, which
// alone doubled every toast. On top of that, useSocket() used to open a new
// io() connection per call site; App.tsx holds one globally while several
// pages also called it locally, so a page with its own call ended up with
// two live connections — each double-subscribed — quadrupling the toast.
// A module-level singleton, reference-counted across hook consumers, fixes
// both: exactly one connection, exactly one 'notification' listener.
let sharedSocket: Socket | null = null;
let consumerCount = 0;

function getOrCreateSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      withCredentials: true,
    });

    sharedSocket.on('connect', () => {
      console.log('✅ Socket connected:', sharedSocket?.id);
    });

    sharedSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    sharedSocket.on('reconnect', (attemptNumber: number) => {
      console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
      toast.success('Connection restored');
    });

    sharedSocket.on('reconnect_error', () => {
      console.error('❌ Socket reconnection failed');
    });

    sharedSocket.on('notification', (payload: NotificationPayload) => {
      handleNotification(payload);
    });
  }
  return sharedSocket;
}

/**
 * Custom hook for Socket.io connection
 * WHY: Provides a clean API for subscribing to real-time events, backed by
 * a single shared connection no matter how many components use this hook.
 */
export function useSocket(enabled: boolean = true) {
  const socketRef = useRef<Socket | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    // WHY: Only connect once authenticated — the server's handshake
    // middleware verifies the same httpOnly cookie the REST API uses and
    // rejects anonymous connections, so connecting earlier would just error.
    if (!enabled) {
      return;
    }

    socketRef.current = getOrCreateSocket();
    consumerCount += 1;
    forceRender((n) => n + 1);

    return () => {
      consumerCount -= 1;
      if (consumerCount <= 0) {
        sharedSocket?.disconnect();
        sharedSocket = null;
      }
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
