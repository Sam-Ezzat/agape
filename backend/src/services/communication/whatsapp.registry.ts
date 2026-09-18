/**
 * Per-organization WhatsApp service registry
 *
 * WHY: Each organization connects its own WhatsApp number (own QR scan, own
 * session file, own rate limits). The set of organizations isn't known at
 * server boot, so instances are created lazily the first time an org
 * initializes WhatsApp, and kept in memory for the life of the process.
 */

import { Server as SocketServer } from 'socket.io';
import { WhatsAppService } from './whatsapp.service';

const registry = new Map<string, WhatsAppService>();

export function getOrCreateWhatsAppService(organizationId: string, io: SocketServer): WhatsAppService {
  let service = registry.get(organizationId);
  if (!service) {
    service = new WhatsAppService(io, organizationId);
    registry.set(organizationId, service);
  }
  return service;
}

export function getWhatsAppService(organizationId: string): WhatsAppService | undefined {
  return registry.get(organizationId);
}

export function getAllWhatsAppServices(): WhatsAppService[] {
  return Array.from(registry.values());
}
