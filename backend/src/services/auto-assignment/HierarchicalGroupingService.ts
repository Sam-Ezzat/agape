/**
 * Hierarchical Grouping Service
 * 
 * WHY: Creates prioritized groups for auto-assignment
 * Phase 1: Rooming notes groups (highest priority)
 * Phase 2: Church groups (medium priority)
 * Phase 3: Governorate groups (lowest priority)
 * 
 * SOLID: Single Responsibility - Only handles grouping logic
 */

import { Attendee, Gender } from '@prisma/client';
import { ClassifiedNotes } from '@/types/auto-assignment';
import logger from '@/utils/logger';

export interface AttendeeGroup {
  id: string;
  type: 'rooming_notes' | 'church' | 'governorate' | 'individual';
  priority: number; // 1 = highest (rooming notes), 2 = church, 3 = governorate
  attendeeIds: Set<string>;
  metadata: {
    church?: string;
    governorate?: string;
    roomingReason?: string;
    hasFamily?: boolean;
    hasMedical?: boolean;
    hasVIP?: boolean;
  };
}

export interface GroupingResult {
  groups: AttendeeGroup[];
  ungroupedAttendeeIds: Set<string>;
  /**
   * attendeeId -> set of attendeeIds they explicitly asked to room with,
   * resolved from rooming notes. Exposed so downstream scoring (e.g. a soft
   * rule) can still nudge attendees toward their requested roommates even
   * when they couldn't all be placed together as one group.
   */
  requestedRoommateMap: Map<string, Set<string>>;
}

export class HierarchicalGroupingService {
  /**
   * Main entry point: Create hierarchical groups
   */
  public createHierarchicalGroups(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>
  ): GroupingResult {
    logger.info('Starting hierarchical grouping', { totalAttendees: attendees.length });

    const groups: AttendeeGroup[] = [];
    const processedIds = new Set<string>();

    // Phase 1: Rooming Notes Groups (Priority 1)
    const { groups: roomingGroups, requestedRoommateMap } = this.createRoomingNotesGroups(attendees, classifications, processedIds);
    groups.push(...roomingGroups);
    logger.info(`Created ${roomingGroups.length} rooming notes groups`, {
      attendeesGrouped: processedIds.size,
    });

    // Phase 2: Church Groups (Priority 2)
    const churchGroups = this.createChurchGroups(attendees, processedIds);
    groups.push(...churchGroups);
    logger.info(`Created ${churchGroups.length} church groups`, {
      attendeesGrouped: processedIds.size,
    });

    // Phase 3: Governorate Groups (Priority 3)
    const governorateGroups = this.createGovernorateGroups(attendees, processedIds);
    groups.push(...governorateGroups);
    logger.info(`Created ${governorateGroups.length} governorate groups`, {
      attendeesGrouped: processedIds.size,
    });

    // Remaining ungrouped attendees
    const ungroupedIds = new Set(
      attendees.filter(a => !processedIds.has(a.id)).map(a => a.id)
    );

    logger.info('Hierarchical grouping complete', {
      totalGroups: groups.length,
      ungroupedAttendees: ungroupedIds.size,
    });

    return { groups, ungroupedAttendeeIds: ungroupedIds, requestedRoommateMap };
  }

  /**
   * Phase 1: Create rooming notes groups with transitive closure
   * If A wants B, and B wants C, create group [A, B, C]
   */
  private createRoomingNotesGroups(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    processedIds: Set<string>
  ): { groups: AttendeeGroup[]; requestedRoommateMap: Map<string, Set<string>> } {
    const groups: AttendeeGroup[] = [];
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));

    // WHY: Built once (O(N)) instead of re-scanning the full attendee list for
    // every requested name (previously O(requests * attendees), and via a
    // first-substring-match-wins `.find()` that could silently pick the wrong
    // person when two attendees share a common name).
    const nameIndex = this.buildNameIndex(attendees);

    // Build adjacency map for transitive grouping
    const adjacencyMap = new Map<string, Set<string>>();

    for (const attendee of attendees) {
      if (processedIds.has(attendee.id)) continue;

      const classification = classifications.get(attendee.id);
      if (!classification?.roommateRequests?.length) continue;

      // Initialize adjacency set
      if (!adjacencyMap.has(attendee.id)) {
        adjacencyMap.set(attendee.id, new Set());
      }

      // Add connections
      for (const roommateName of classification.roommateRequests) {
        const roommate = this.resolveRequestedRoommate(roommateName, attendees, nameIndex, attendee.id);

        if (roommate && !processedIds.has(roommate.id)) {
          adjacencyMap.get(attendee.id)!.add(roommate.id);

          // Bidirectional connection
          if (!adjacencyMap.has(roommate.id)) {
            adjacencyMap.set(roommate.id, new Set());
          }
          adjacencyMap.get(roommate.id)!.add(attendee.id);
        }
      }
    }

    // Find connected components (transitive groups)
    const visited = new Set<string>();

    for (const [attendeeId, connections] of adjacencyMap.entries()) {
      if (visited.has(attendeeId) || processedIds.has(attendeeId)) continue;

      // BFS to find all connected attendees
      const groupMembers = new Set<string>();
      const queue = [attendeeId];
      
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;

        visited.add(currentId);
        groupMembers.add(currentId);

        const neighbors = adjacencyMap.get(currentId) || new Set();
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId) && !processedIds.has(neighborId)) {
            queue.push(neighborId);
          }
        }
      }

      // Create group
      if (groupMembers.size > 0) {
        const groupAttendees = Array.from(groupMembers)
          .map(id => attendeeMap.get(id))
          .filter(a => a !== undefined) as Attendee[];

        const hasFamily = groupAttendees.some(a => {
          const classification = classifications.get(a.id);
          return classification?.family === true;
        });

        const hasMedical = groupAttendees.some(a => 
          a.notes && a.notes.trim().length > 0 && 
          (a.notes.toLowerCase().includes('medical') || a.notes.toLowerCase().includes('health'))
        );

        const hasVIP = groupAttendees.some(a => a.isServant || a.conferenceRole === 'VIP' || a.conferenceRole === 'LEADER');

        groups.push({
          id: `rooming-${groups.length + 1}`,
          type: 'rooming_notes',
          priority: 1,
          attendeeIds: groupMembers,
          metadata: {
            roomingReason: 'Explicit rooming request',
            hasFamily,
            hasMedical,
            hasVIP,
          },
        });

        // Mark as processed
        groupMembers.forEach(id => processedIds.add(id));
      }
    }

    return { groups, requestedRoommateMap: adjacencyMap };
  }

  /**
   * Phase 2: Create church groups for remaining attendees
   */
  private createChurchGroups(
    attendees: Attendee[],
    processedIds: Set<string>
  ): AttendeeGroup[] {
    const groups: AttendeeGroup[] = [];
    const churchMap = new Map<string, Set<string>>();

    // Group by church
    for (const attendee of attendees) {
      if (processedIds.has(attendee.id)) continue;
      if (!attendee.church || attendee.church.trim() === '') continue;

      const church = attendee.church.trim();
      if (!churchMap.has(church)) {
        churchMap.set(church, new Set());
      }
      churchMap.get(church)!.add(attendee.id);
    }

    // Create groups
    let groupIndex = 0;
    for (const [church, attendeeIds] of churchMap.entries()) {
      if (attendeeIds.size === 0) continue;

      const groupAttendees = attendees.filter(a => attendeeIds.has(a.id));
      const hasMedical = groupAttendees.some(a => 
        a.notes && a.notes.trim().length > 0 &&
        (a.notes.toLowerCase().includes('medical') || a.notes.toLowerCase().includes('health'))
      );
      const hasVIP = groupAttendees.some(a => a.isServant || a.conferenceRole === 'VIP' || a.conferenceRole === 'LEADER');

      groups.push({
        id: `church-${groupIndex++}`,
        type: 'church',
        priority: 2,
        attendeeIds,
        metadata: {
          church,
          hasMedical,
          hasVIP,
        },
      });

      // Mark as processed
      attendeeIds.forEach(id => processedIds.add(id));
    }

    return groups;
  }

  /**
   * Phase 3: Create governorate groups for remaining attendees
   */
  private createGovernorateGroups(
    attendees: Attendee[],
    processedIds: Set<string>
  ): AttendeeGroup[] {
    const groups: AttendeeGroup[] = [];
    const governorateMap = new Map<string, Set<string>>();

    // Group by governorate
    for (const attendee of attendees) {
      if (processedIds.has(attendee.id)) continue;
      if (!attendee.governorate || attendee.governorate.trim() === '') continue;

      const governorate = attendee.governorate.trim();
      if (!governorateMap.has(governorate)) {
        governorateMap.set(governorate, new Set());
      }
      governorateMap.get(governorate)!.add(attendee.id);
    }

    // Create groups
    let groupIndex = 0;
    for (const [governorate, attendeeIds] of governorateMap.entries()) {
      if (attendeeIds.size === 0) continue;

      const groupAttendees = attendees.filter(a => attendeeIds.has(a.id));
      const hasMedical = groupAttendees.some(a => 
        a.notes && a.notes.trim().length > 0 &&
        (a.notes.toLowerCase().includes('medical') || a.notes.toLowerCase().includes('health'))
      );
      const hasVIP = groupAttendees.some(a => a.isServant || a.conferenceRole === 'VIP' || a.conferenceRole === 'LEADER');

      groups.push({
        id: `governorate-${groupIndex++}`,
        type: 'governorate',
        priority: 3,
        attendeeIds,
        metadata: {
          governorate,
          hasMedical,
          hasVIP,
        },
      });

      // Mark as processed
      attendeeIds.forEach(id => processedIds.add(id));
    }

    return groups;
  }

  /**
   * Split group by gender (strict constraint)
   */
  public splitByGender(
    group: AttendeeGroup,
    attendees: Attendee[]
  ): Map<Gender, AttendeeGroup> {
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));
    const genderGroups = new Map<Gender, AttendeeGroup>();

    const maleIds = new Set<string>();
    const femaleIds = new Set<string>();

    for (const attendeeId of group.attendeeIds) {
      const attendee = attendeeMap.get(attendeeId);
      if (!attendee) continue;

      if (attendee.gender === 'MALE') {
        maleIds.add(attendeeId);
      } else {
        femaleIds.add(attendeeId);
      }
    }

    if (maleIds.size > 0) {
      genderGroups.set('MALE', {
        ...group,
        id: `${group.id}-male`,
        attendeeIds: maleIds,
      });
    }

    if (femaleIds.size > 0) {
      genderGroups.set('FEMALE', {
        ...group,
        id: `${group.id}-female`,
        attendeeIds: femaleIds,
      });
    }

    return genderGroups;
  }

  /**
   * Extract special cases (Medical, VIP) from group
   */
  public extractSpecialCases(
    group: AttendeeGroup,
    attendees: Attendee[]
  ): { 
    medical: AttendeeGroup | null; 
    vip: AttendeeGroup | null; 
    regular: AttendeeGroup;
  } {
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));

    const medicalIds = new Set<string>();
    const vipIds = new Set<string>();
    const regularIds = new Set<string>();

    for (const attendeeId of group.attendeeIds) {
      const attendee = attendeeMap.get(attendeeId);
      if (!attendee) continue;

      const hasMedical = attendee.notes && attendee.notes.trim().length > 0 &&
        (attendee.notes.toLowerCase().includes('medical') || attendee.notes.toLowerCase().includes('health'));
      const isVIP = attendee.isServant || attendee.conferenceRole === 'VIP' || attendee.conferenceRole === 'LEADER';

      if (hasMedical) {
        medicalIds.add(attendeeId);
      } else if (isVIP) {
        vipIds.add(attendeeId);
      } else {
        regularIds.add(attendeeId);
      }
    }

    return {
      medical: medicalIds.size > 0 ? {
        ...group,
        id: `${group.id}-medical`,
        attendeeIds: medicalIds,
        metadata: { ...group.metadata, hasMedical: true },
      } : null,
      vip: vipIds.size > 0 ? {
        ...group,
        id: `${group.id}-vip`,
        attendeeIds: vipIds,
        metadata: { ...group.metadata, hasVIP: true },
      } : null,
      regular: {
        ...group,
        id: `${group.id}-regular`,
        attendeeIds: regularIds,
      },
    };
  }

  /**
   * Split group by age ranges
   * Preferred: 5-year buckets, fallback to 10-year
   */
  public splitByAge(
    group: AttendeeGroup,
    attendees: Attendee[],
    preferredRange: 5 | 10 = 5
  ): AttendeeGroup[] {
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));
    const ageBuckets = new Map<number, Set<string>>();

    for (const attendeeId of group.attendeeIds) {
      const attendee = attendeeMap.get(attendeeId);
      if (!attendee || !attendee.age) continue;

      const bucket = Math.floor(attendee.age / preferredRange) * preferredRange;
      if (!ageBuckets.has(bucket)) {
        ageBuckets.set(bucket, new Set());
      }
      ageBuckets.get(bucket)!.add(attendeeId);
    }

    const subGroups: AttendeeGroup[] = [];
    let subGroupIndex = 0;

    for (const [bucket, attendeeIds] of ageBuckets.entries()) {
      if (attendeeIds.size === 0) continue;

      subGroups.push({
        ...group,
        id: `${group.id}-age${bucket}-${bucket + preferredRange}`,
        attendeeIds,
        metadata: {
          ...group.metadata,
        },
      });
      subGroupIndex++;
    }

    return subGroups;
  }

  /**
   * Normalize a name for comparison: trim, lowercase, collapse whitespace.
   */
  private normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Build an index of normalized full name -> attendees sharing that exact name.
   * WHY: Lets requested-roommate resolution do an O(1) exact-match lookup
   * instead of an O(N) scan per request.
   */
  private buildNameIndex(attendees: Attendee[]): Map<string, Attendee[]> {
    const index = new Map<string, Attendee[]>();
    for (const attendee of attendees) {
      const key = this.normalizeName(attendee.fullName);
      if (!index.has(key)) index.set(key, []);
      index.get(key)!.push(attendee);
    }
    return index;
  }

  /**
   * Resolve a requested roommate's free-text name to a single attendee.
   *
   * WHY: The previous implementation used `attendees.find(a =>
   * a.fullName.includes(name) || name.includes(a.fullName))` — the FIRST
   * loosely-matching attendee silently won, which is a real accuracy risk
   * with common names (e.g. multiple "Mohamed"s). This prefers an exact
   * normalized full-name match; if that's ambiguous (shared by more than
   * one attendee) or absent, it falls back to whole-word token overlap and
   * only resolves when exactly one candidate has the best score — an
   * ambiguous result is skipped (logged) rather than guessed, since a wrong
   * pairing is worse than no pairing.
   */
  private resolveRequestedRoommate(
    requestedName: string,
    attendees: Attendee[],
    nameIndex: Map<string, Attendee[]>,
    excludeAttendeeId: string
  ): Attendee | null {
    const normalized = this.normalizeName(requestedName);
    if (!normalized) return null;

    // Exact match — O(1)
    const exactMatches = (nameIndex.get(normalized) || []).filter(a => a.id !== excludeAttendeeId);
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) {
      logger.warn(
        `Ambiguous roommate name request "${requestedName}": ${exactMatches.length} attendees share this exact name — skipping to avoid a wrong pairing`
      );
      return null;
    }

    // Fuzzy fallback: whole-word token overlap, best-match-wins only if unambiguous
    const requestedTokens = new Set(normalized.split(' ').filter(Boolean));
    let bestScore = 0;
    let bestMatches: Attendee[] = [];

    for (const attendee of attendees) {
      if (attendee.id === excludeAttendeeId) continue;
      const candidateTokens = this.normalizeName(attendee.fullName).split(' ').filter(Boolean);
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
    }
    return null;
  }
}
