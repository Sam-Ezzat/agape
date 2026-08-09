// WHY: Auto-assignment previously re-classified every unassigned attendee's
// rooming notes (AI or keyword fallback) on EVERY preview/execute run — the
// same note, re-parsed over and over. This service computes and persists the
// classification once (triggered after import/create/update), so later runs
// can read a cached result instead of paying AI latency/cost repeatedly.

import { Attendee } from '@prisma/client';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomingNotesClassifier } from './RoomingNotesClassifier';
import { mapWithConcurrency } from '@/utils/concurrency';
import { ClassifiedNotes } from '@/types/auto-assignment';
import { buildNameIndex, resolveRequestedRoommate } from './nameResolution';
import logger from '@/utils/logger';

function emptyClassification(raw: string): ClassifiedNotes {
  return {
    roommateRequests: [],
    healthIssues: [],
    accessibility: false,
    wheelchair: false,
    elderly: false,
    nearBathroom: false,
    nearElevator: false,
    family: false,
    noPreference: false,
    other: [],
    raw,
  };
}

export class RoomingNotesCacheService {
  private classifier: RoomingNotesClassifier;

  constructor(private attendeeRepository: AttendeeRepository) {
    this.classifier = new RoomingNotesClassifier();
  }

  /**
   * A cached classification is usable when it exists and was computed from
   * the attendee's CURRENT rooming notes text (the cached `raw` field is the
   * staleness marker — no separate timestamp column needed).
   */
  static isFresh(attendee: Pick<Attendee, 'roomingNotes' | 'roomingNotesClassification'>): boolean {
    const notes = attendee.roomingNotes?.trim() || '';
    if (!notes) return true; // nothing to classify — trivially "fresh"
    const cached = attendee.roomingNotesClassification as unknown as ClassifiedNotes | null;
    return !!cached && cached.raw === notes;
  }

  /**
   * Classify and persist rooming notes for the given attendees, skipping
   * anyone whose cached classification is already fresh. Safe to call with
   * a full attendee list — only stale/missing ones do any work.
   */
  async classifyAndPersist(attendees: Attendee[]): Promise<void> {
    const toClassify = attendees.filter(a => !RoomingNotesCacheService.isFresh(a));
    if (toClassify.length === 0) return;

    logger.info(`Classifying rooming notes for ${toClassify.length} attendee(s) in the background`);

    await mapWithConcurrency(toClassify, 8, async (attendee) => {
      try {
        const classified = await this.classifier.classify(attendee.roomingNotes);
        await this.attendeeRepository.update(attendee.id, {
          roomingNotesClassification: classified as any,
        });
      } catch (error) {
        logger.error(`Failed to classify rooming notes for attendee ${attendee.id}:`, error);
      }
    });

    logger.info(`Finished classifying rooming notes for ${toClassify.length} attendee(s)`);
  }

  /**
   * Fire-and-forget wrapper — logs but never throws, so callers (import/create/
   * update request handlers) can trigger this without awaiting or risking an
   * unhandled rejection taking down the response.
   */
  classifyAndPersistInBackground(attendees: Attendee[]): void {
    this.classifyAndPersist(attendees).catch(error => {
      logger.error('Background rooming notes classification failed:', error);
    });
  }

  /**
   * Persist ALREADY-COMPUTED classification results (no classifier calls).
   * WHY: callers that had to classify live as a cache-miss fallback (e.g.
   * auto-assignment Stage 3) already paid for the AI call once — this writes
   * that result to the cache without classifying it a second time, unlike
   * classifyAndPersist()/classifyAndPersistInBackground() which recompute.
   */
  persistResultsInBackground(results: Array<{ attendeeId: string; classified: ClassifiedNotes }>): void {
    if (results.length === 0) return;

    Promise.all(
      results.map(({ attendeeId, classified }) =>
        this.attendeeRepository.update(attendeeId, { roomingNotesClassification: classified as any })
          .catch(error => logger.error(`Failed to persist cached classification for attendee ${attendeeId}:`, error))
      )
    ).catch(error => logger.error('Background rooming notes cache persist failed:', error));
  }

  /**
   * Expand each attendee's cached roommateRequests into the FULL connected
   * cluster of everyone who (directly or transitively) requested to room
   * together.
   *
   * Example: A asks for B,C; B asks for C; C asks for D,E; D asks for A,E;
   * E asks for B. Individually these are five different, partial lists, but
   * the request graph is fully connected — after expansion every one of the
   * five has their cached roommateRequests rewritten to the full five-person
   * list (including themselves), instead of just what they personally typed.
   *
   * WHY this is safe on top of the existing BFS grouping in
   * HierarchicalGroupingService: that BFS already collapses this exact graph
   * into one group at assignment time — this doesn't change that outcome,
   * it makes it more ROBUST (writes back each attendee's real `fullName`, so
   * later resolution is a guaranteed exact match instead of depending on a
   * single fragile chain of loosely-typed mentions) and makes the cached
   * "Parsed" notes shown for review reflect the whole group, not just what
   * one person happened to type.
   *
   * `raw` is left untouched for every member — only `roommateRequests` is
   * rewritten — so the original note and staleness detection (isFresh) keep
   * working exactly as before.
   *
   * WHY this needs the FULL org attendee list (not just recently-changed
   * ones): resolving names requires every possible target, including people
   * with no note of their own who are only named by others; and expansion is
   * a graph pass across everyone's CURRENT cache, not a per-attendee op.
   */
  async expandRoommateClusters(allAttendees: Attendee[]): Promise<void> {
    const nameIndex = buildNameIndex(allAttendees);
    const attendeeMap = new Map(allAttendees.map(a => [a.id, a]));

    // Build adjacency strictly from FRESH cached classifications — a stale
    // cache doesn't reflect the attendee's current note and shouldn't be
    // trusted to draw a connection.
    const adjacency = new Map<string, Set<string>>();

    for (const attendee of allAttendees) {
      if (!RoomingNotesCacheService.isFresh(attendee)) continue;
      const classification = attendee.roomingNotesClassification as unknown as ClassifiedNotes | null;
      if (!classification?.roommateRequests?.length) continue;

      if (!adjacency.has(attendee.id)) adjacency.set(attendee.id, new Set());

      for (const name of classification.roommateRequests) {
        const match = resolveRequestedRoommate(name, allAttendees, nameIndex, attendee.id);
        if (!match) continue;

        adjacency.get(attendee.id)!.add(match.id);
        if (!adjacency.has(match.id)) adjacency.set(match.id, new Set());
        adjacency.get(match.id)!.add(attendee.id);
      }
    }

    // Connected components via BFS
    const visited = new Set<string>();
    const updates: Array<{ attendeeId: string; classified: ClassifiedNotes }> = [];

    for (const startId of adjacency.keys()) {
      if (visited.has(startId)) continue;

      const component: string[] = [];
      const queue = [startId];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        component.push(currentId);

        for (const neighborId of adjacency.get(currentId) || []) {
          if (!visited.has(neighborId)) queue.push(neighborId);
        }
      }

      if (component.length < 2) continue; // nothing to expand for a lone node

      // Canonical full-name list for the whole cluster (including self, per
      // the requested format) — written verbatim from each member's stored
      // fullName so future matching against this list is always exact.
      const fullNames = component
        .map(id => attendeeMap.get(id)?.fullName)
        .filter((n): n is string => !!n);

      for (const memberId of component) {
        const member = attendeeMap.get(memberId);
        if (!member) continue;

        const existing = member.roomingNotesClassification as unknown as ClassifiedNotes | null;
        const base = existing ?? emptyClassification((member.roomingNotes || '').trim());

        // Skip a no-op write (already expanded to this exact set, e.g. a
        // second run over the same data)
        const alreadyExpanded =
          base.roommateRequests.length === fullNames.length &&
          new Set(base.roommateRequests).size === new Set(fullNames).size &&
          fullNames.every(n => base.roommateRequests.includes(n));
        if (alreadyExpanded) continue;

        updates.push({
          attendeeId: memberId,
          classified: { ...base, roommateRequests: fullNames, raw: (member.roomingNotes || '').trim() },
        });
      }
    }

    if (updates.length === 0) return;

    logger.info(`Expanding roommate request clusters for ${updates.length} attendee(s)`);

    // WHY: awaited directly (not persistResultsInBackground's fire-and-forget)
    // so this method's own promise only resolves once the writes are actually
    // done — callers that await expandRoommateClusters() get a real
    // completion guarantee, and it's testable without arbitrary timing waits.
    await Promise.all(
      updates.map(({ attendeeId, classified }) =>
        this.attendeeRepository.update(attendeeId, { roomingNotesClassification: classified as any })
          .catch(error => logger.error(`Failed to persist expanded roommate cluster for attendee ${attendeeId}:`, error))
      )
    );
  }

  /**
   * Classify (cache-first) THEN expand clusters across the whole
   * organization, all in the background. This is the entry point
   * import/create/update handlers should call — expansion needs the full
   * org attendee list re-read AFTER classification finishes writing, since
   * a newly classified note might connect to an already-existing chain.
   */
  classifyAndExpandInBackground(attendees: Attendee[]): void {
    const organizationId = attendees[0]?.organizationId;

    this.classifyAndPersist(attendees)
      .then(async () => {
        if (!organizationId) return;
        const allAttendees = await this.attendeeRepository.findAllByOrganization(organizationId);
        await this.expandRoommateClusters(allAttendees);
      })
      .catch(error => {
        logger.error('Background rooming notes classification/expansion failed:', error);
      });
  }
}
