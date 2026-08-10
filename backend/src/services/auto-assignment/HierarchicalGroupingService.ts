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
import { buildNameIndex, resolveRequestedRoommate, MAX_ROOMMATE_GROUP_SIZE } from './nameResolution';

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
  /**
   * Connected components that exceeded MAX_ROOMMATE_GROUP_SIZE and were
   * deliberately NOT formed into one rooming_notes group (see
   * createRoomingNotesGroups) — surfaced so the caller can warn instead of
   * silently either merging or dropping these attendees. They still fall
   * through to church/governorate grouping normally.
   */
  oversizedGroups: Array<{ attendeeIds: string[] }>;
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
    const { groups: roomingGroups, requestedRoommateMap, oversizedGroups } = this.createRoomingNotesGroups(attendees, classifications, processedIds);
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

    return { groups, ungroupedAttendeeIds: ungroupedIds, requestedRoommateMap, oversizedGroups };
  }

  /**
   * Phase 1: Create rooming notes groups with transitive closure
   * If A wants B, and B wants C, create group [A, B, C]
   */
  private createRoomingNotesGroups(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    processedIds: Set<string>
  ): { groups: AttendeeGroup[]; requestedRoommateMap: Map<string, Set<string>>; oversizedGroups: Array<{ attendeeIds: string[] }> } {
    const groups: AttendeeGroup[] = [];
    const oversizedGroups: Array<{ attendeeIds: string[] }> = [];
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));

    // WHY: Built once (O(N)) instead of re-scanning the full attendee list for
    // every requested name (previously O(requests * attendees), and via a
    // first-substring-match-wins `.find()` that could silently pick the wrong
    // person when two attendees share a common name).
    const nameIndex = buildNameIndex(attendees);

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
        const roommate = resolveRequestedRoommate(roommateName, attendees, nameIndex, attendee.id);

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

      // WHY: A one-way mention deliberately pulls in a whole existing group
      // (see RoommateGrouping.test.ts) — that's correct for a real small
      // friend group, but with no ceiling a "hub" attendee mentioned by many
      // UNRELATED requesters merges every one of those separate small
      // requests into one giant component through the shared hub node. Skip
      // forming a group for it (and don't mark members processed) so they
      // still fall through to church/governorate grouping normally, instead
      // of either silently ballooning or being dropped entirely.
      if (groupMembers.size > MAX_ROOMMATE_GROUP_SIZE) {
        logger.warn(
          `Skipping oversized rooming-notes group of ${groupMembers.size} attendees (exceeds MAX_ROOMMATE_GROUP_SIZE=${MAX_ROOMMATE_GROUP_SIZE}) — likely a shared "hub" name merging unrelated requests. Falling through to church/governorate grouping instead.`
        );
        oversizedGroups.push({ attendeeIds: Array.from(groupMembers) });
        continue;
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

    return { groups, requestedRoommateMap: adjacencyMap, oversizedGroups };
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

}
