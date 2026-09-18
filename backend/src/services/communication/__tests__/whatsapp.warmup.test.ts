import { describe, expect, it } from 'vitest';
import {
  computeWarmupFactor,
  isRecoverableSessionLogout,
  isTransientInitializationError,
} from '../whatsapp.service';

describe('isTransientInitializationError', () => {
  it('recognizes a bounded initialization timeout as retryable', () => {
    expect(isTransientInitializationError(new Error('WhatsApp client initialization timed out after 45 seconds'))).toBe(true);
  });

  it('recognizes a stale session cleared after an expired-session logout as retryable', () => {
    expect(
      isTransientInitializationError(
        new Error('WhatsApp session expired (stale session cleared); retrying with a fresh QR code')
      )
    ).toBe(true);
  });

  it('recognizes transient Baileys disconnect codes (timedOut/connectionClosed/restartRequired) as retryable', () => {
    expect(isTransientInitializationError(new Error('WhatsApp disconnected during initialization (code 408)'))).toBe(true);
    expect(isTransientInitializationError(new Error('WhatsApp disconnected during initialization (code 428)'))).toBe(true);
    expect(isTransientInitializationError(new Error('WhatsApp disconnected during initialization (code 515)'))).toBe(true);
  });

  it('does not classify fatal disconnect codes as transient', () => {
    expect(isTransientInitializationError(new Error('WhatsApp disconnected during initialization (code 403)'))).toBe(false);
    expect(isTransientInitializationError(new Error('WhatsApp disconnected during initialization (code 500)'))).toBe(false);
  });

  it('does not classify unrelated startup failures as transient', () => {
    expect(isTransientInitializationError(new Error('Failed to download attachment (HTTP 404)'))).toBe(false);
  });
});

describe('isRecoverableSessionLogout', () => {
  it('allows Baileys to reset an expired auth state after a loggedOut (401) disconnect', () => {
    expect(isRecoverableSessionLogout(401)).toBe(true);
  });

  it('keeps genuine connection failures fatal during initialization', () => {
    expect(isRecoverableSessionLogout(403)).toBe(false);
    expect(isRecoverableSessionLogout(440)).toBe(false);
    expect(isRecoverableSessionLogout(undefined)).toBe(false);
  });
});

describe('computeWarmupFactor', () => {
  const now = new Date('2026-08-11T00:00:00.000Z');

  it('returns established/1.0 when there is no recorded activation timestamp', () => {
    const result = computeWarmupFactor(null, now);
    expect(result).toEqual({
      stage: 'established',
      limitMultiplier: 1,
      delayMultiplier: 1,
      hoursSinceActive: null,
    });
  });

  it('returns day1 (0.2/2.0) for a session active less than 24h', () => {
    const sessionActiveSince = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('day1');
    expect(result.limitMultiplier).toBe(0.2);
    expect(result.delayMultiplier).toBe(2);
    expect(result.hoursSinceActive).toBeCloseTo(12, 5);
  });

  it('returns day2-3 (0.5/1.5) for a session active between 24h and 72h', () => {
    const sessionActiveSince = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('day2-3');
    expect(result.limitMultiplier).toBe(0.5);
    expect(result.delayMultiplier).toBe(1.5);
  });

  it('returns day4-7 (0.75/1.2) for a session active between 72h and 168h', () => {
    const sessionActiveSince = new Date(now.getTime() - 100 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('day4-7');
    expect(result.limitMultiplier).toBe(0.75);
    expect(result.delayMultiplier).toBe(1.2);
  });

  it('returns established (1.0/1.0) for a session active 168h or more', () => {
    const sessionActiveSince = new Date(now.getTime() - 200 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('established');
    expect(result.limitMultiplier).toBe(1);
    expect(result.delayMultiplier).toBe(1);
  });

  it('treats exactly 24h as day2-3, not day1', () => {
    const sessionActiveSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('day2-3');
  });

  it('treats exactly 72h as day4-7, not day2-3', () => {
    const sessionActiveSince = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('day4-7');
  });

  it('treats exactly 168h as established, not day4-7', () => {
    const sessionActiveSince = new Date(now.getTime() - 168 * 60 * 60 * 1000);
    const result = computeWarmupFactor(sessionActiveSince, now);
    expect(result.stage).toBe('established');
  });
});
