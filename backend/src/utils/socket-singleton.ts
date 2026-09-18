/**
 * Socket.io instance singleton
 *
 * WHY: Controllers (e.g. whatsapp.controller.ts) need the `io` instance to
 * hand to the per-organization WhatsAppService registry, but `io` is created
 * in server.ts, outside the DI chain used by routes. Mirrors the
 * notification-singleton pattern already used for NotificationService.
 */

import { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function setIO(instance: SocketServer): void {
  io = instance;
}

export function getIO(): SocketServer {
  if (!io) {
    throw new Error('Socket.io server not initialized. Call setIO first.');
  }
  return io;
}
