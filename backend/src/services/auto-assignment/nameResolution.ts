// WHY: Shared name-matching logic for resolving a free-text requested-roommate
// name to a real attendee. Extracted from HierarchicalGroupingService so the
// same matching rules can be reused by RoomingNotesCacheService's cluster
// expansion — keeping "what the cache pre-computes" and "what live grouping
// computes" from silently diverging into two different matching behaviors.

import { Attendee } from '@prisma/client';
import logger from '@/utils/logger';

/**
 * Hard cap on how many attendees a single requested-roommate connected
 * component can contain, in both HierarchicalGroupingService (live
 * grouping) and RoomingNotesCacheService (cache expansion).
 *
 * WHY: One-way mentions are deliberately allowed to pull a whole existing
 * group together (see RoommateGrouping.test.ts) — that's correct for a
 * real small friend group. But with no size limit, a "hub" attendee
 * mentioned by many UNRELATED requesters (e.g. a well-known servant/
 * leader everyone asks to be near) merges every one of those unrelated
 * small requests into one giant component through the shared hub node —
 * this is the single place to tune that ceiling.
 */
export const MAX_ROOMMATE_GROUP_SIZE = 10;

/**
 * Normalize a name for comparison: trim, lowercase, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build an index of normalized full name -> attendees sharing that exact name.
 * WHY: Lets requested-roommate resolution do an O(1) exact-match lookup
 * instead of an O(N) scan per request.
 */
export function buildNameIndex(attendees: Attendee[]): Map<string, Attendee[]> {
  const index = new Map<string, Attendee[]>();
  for (const attendee of attendees) {
    const key = normalizeName(attendee.fullName);
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(attendee);
  }
  return index;
}

/**
 * Reported when a requested roommate name couldn't be safely resolved, so
 * callers (currently HierarchicalGroupingService) can surface it as a
 * visible warning instead of it only ever reaching the server log — an
 * admin looking at "why didn't this rooming request apply?" had no way to
 * tell "ambiguous name" from "no match at all" from the preview UI before.
 */
export interface UnresolvedRoommateRequest {
  requesterId: string;
  requestedName: string;
  reason: 'ambiguous' | 'not_found';
  candidateCount?: number; // set when reason === 'ambiguous'
}

/**
 * Resolve a requested roommate's free-text name to a single attendee.
 *
 * WHY: A naive `attendees.find(a => a.fullName.includes(name) ||
 * name.includes(a.fullName))` lets the FIRST loosely-matching attendee
 * silently win — a real accuracy risk with common names (e.g. multiple
 * "Mohamed"s). This prefers an exact normalized full-name match; if that's
 * ambiguous (shared by more than one attendee) or absent, it falls back to
 * whole-word token overlap and only resolves when exactly one candidate has
 * the best score — an ambiguous result is skipped (logged) rather than
 * guessed, since a wrong pairing is worse than no pairing.
 */
export function resolveRequestedRoommate(
  requestedName: string,
  attendees: Attendee[],
  nameIndex: Map<string, Attendee[]>,
  excludeAttendeeId: string,
  onUnresolved?: (info: UnresolvedRoommateRequest) => void
): Attendee | null {
  const normalized = normalizeName(requestedName);
  if (!normalized) return null;

  // Exact match — O(1)
  const exactMatches = (nameIndex.get(normalized) || []).filter(a => a.id !== excludeAttendeeId);
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) {
    logger.warn(
      `Ambiguous roommate name request "${requestedName}": ${exactMatches.length} attendees share this exact name — skipping to avoid a wrong pairing`
    );
    onUnresolved?.({ requesterId: excludeAttendeeId, requestedName, reason: 'ambiguous', candidateCount: exactMatches.length });
    return null;
  }

  // Fuzzy fallback: whole-word token overlap, best-match-wins only if unambiguous
  const requestedTokens = new Set(normalized.split(' ').filter(Boolean));
  let bestScore = 0;
  let bestMatches: Attendee[] = [];

  for (const attendee of attendees) {
    if (attendee.id === excludeAttendeeId) continue;
    const candidateTokens = normalizeName(attendee.fullName).split(' ').filter(Boolean);
    const overlap = candidateTokens.filter(t => requestedTokens.has(t)).length;
    if (overlap === 0) continue;

    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatches = [attendee];
    } else if (overlap === bestScore) {
      bestMatches.push(attendee);
    }
  }

  if (bestMatches.length === 1) return bestMatches[0];
  if (bestMatches.length > 1) {
    logger.warn(
      `Ambiguous roommate name request "${requestedName}": ${bestMatches.length} candidates tied on name similarity — skipping to avoid a wrong pairing`
    );
    onUnresolved?.({ requesterId: excludeAttendeeId, requestedName, reason: 'ambiguous', candidateCount: bestMatches.length });
    return null;
  }

  // No candidate shares even one name token — a typo, nickname, or the
  // person simply isn't in this attendee pool.
  onUnresolved?.({ requesterId: excludeAttendeeId, requestedName, reason: 'not_found' });
  return null;
}
