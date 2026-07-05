// WHY: Group Detection Service for Auto-Assignment
// Detects various group types (roommate, family, church) from attendee data
// Uses classified rooming notes to identify bidirectional roommate requests

import { Attendee, Gender, ConferenceRole } from '@prisma/client';
import { AttendeeGroup, GroupType, ClassifiedNotes } from '../../types/auto-assignment';
import { RoomingNotesClassifier } from './RoomingNotesClassifier';

/**
 * Service to detect and form groups of attendees based on:
 * - Roommate requests (bidirectional matching)
 * - Family connections (same governorate + family keyword)
 * - Church affiliations
 * 
 * Groups are prioritized based on medical needs, accessibility requirements,
 * VIP status, and group size.
 */
export class GroupDetectionService {
  private classifier: RoomingNotesClassifier;

  constructor(classifier?: RoomingNotesClassifier) {
    this.classifier = classifier || new RoomingNotesClassifier({ useAI: false });
  }

  /**
   * Detect all groups from a list of attendees
   * 
   * Priority order:
   * 1. Roommate groups (explicit bidirectional requests)
   * 2. Family groups (same governorate + family keyword)
   * 3. Church groups (same church, 2+ people)
   * 4. Individuals (unmatched attendees)
   * 
   * @param attendees - List of conference attendees
   * @returns Array of detected groups with priorities and constraints
   */
  detectGroups(attendees: Attendee[]): AttendeeGroup[] {
    if (attendees.length === 0) {
      return [];
    }

    // Track which attendees have been assigned to groups
    const assigned = new Set<string>();
    const groups: AttendeeGroup[] = [];

    // Classify all rooming notes first (synchronous for tests)
    const classifications = new Map<string, ClassifiedNotes>();
    for (const attendee of attendees) {
      // Use sync version for now (tests don't use async)
      const classified = this.classifySync(attendee.roomingNotes);
      classifications.set(attendee.id, classified);
    }

    // 1. Detect roommate groups (highest priority)
    const roommateGroups = this.detectRoommateGroups(attendees, classifications, assigned);
    groups.push(...roommateGroups);

    // 2. Detect family groups
    const familyGroups = this.detectFamilyGroups(attendees, classifications, assigned);
    groups.push(...familyGroups);

    // 3. Detect church groups
    const churchGroups = this.detectChurchGroups(attendees, assigned, classifications);
    groups.push(...churchGroups);

    // 4. Create individual groups for remaining attendees
    for (const attendee of attendees) {
      if (!assigned.has(attendee.id)) {
        const individualGroup = this.createIndividualGroup(attendee, classifications.get(attendee.id)!);
        groups.push(individualGroup);
        assigned.add(attendee.id);
      }
    }

    return groups;
  }

  /**
   * Synchronous classification wrapper for testing
   */
  private classifySync(notes: string | null): ClassifiedNotes {
    if (!notes) {
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
        raw: ''
      };
    }

    const keywords = notes.toLowerCase();
    
    return {
      roommateRequests: this.extractNames(notes),
      healthIssues: /(?:diabetes|asthma|allerg|heart|medical|medication)/i.test(notes) ? ['health issue detected'] : [],
      accessibility: /(?:accessible|wheelchair|special needs)/i.test(keywords),
      wheelchair: /wheelchair/i.test(keywords),
      elderly: /(?:elderly|old|senior|aged)/i.test(keywords),
      nearBathroom: /(?:near bathroom|bathroom)/i.test(keywords),
      nearElevator: /(?:elevator|lift)/i.test(keywords),
      family: /(?:family|wife|husband|kids|children|عائل|أسر|زوج|أطفال)/iu.test(notes),
      noPreference: /(?:no preference|any|none)/i.test(keywords),
      other: [],
      raw: notes
    };
  }

  /**
   * Extract names from rooming notes
   */
  private extractNames(notes: string): string[] {
    const names = new Set<string>();
    
    // Simple approach: Find roommate keywords, then capture following capitalized words
    // Pattern: keyword + optional "with" + capitalized name (1-3 words)
    const pattern = /(?:room\s+with|roommate\s+with|roommate|with|together\s+with|pair\s+with|share\s+with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
    
    const matches = notes.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        const name = match[1].trim();
        // Validate name (3-40 chars, not a common word)
        if (name.length >= 3 && name.length <= 40 && 
            !/(Room|With|The|And|Or)$/i.test(name)) {
          names.add(name);
        }
      }
    }

    // Arabic patterns
    const arabicPattern = /(?:مع|زميل|صديق|أريد\s*أن\s*أكون\s*مع)\s+([\u0600-\u06FF\s]{3,40})(?:\s|$|،|,)/gu;
    const arabicMatches = notes.matchAll(arabicPattern);
    for (const match of arabicMatches) {
      if (match[1]) {
        const name = match[1].trim();
        if (name.length >= 3 && name.length <= 40) {
          names.add(name);
        }
      }
    }

    return Array.from(names);
  }

  /**
   * Detect roommate groups via bidirectional matching
   * Uses graph traversal to find connected components
   */
  private detectRoommateGroups(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    assigned: Set<string>
  ): AttendeeGroup[] {
    const groups: AttendeeGroup[] = [];
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));

    // Build adjacency list of bidirectional matches
    const adjacencyList = new Map<string, Set<string>>();

    for (const attendee of attendees) {
      if (assigned.has(attendee.id)) continue;

      const classification = classifications.get(attendee.id);
      if (!classification || classification.roommateRequests.length === 0) continue;

      // Find matches for each requested roommate
      for (const requestedName of classification.roommateRequests) {
        const match = this.findAttendeeByName(attendees, requestedName, attendee.id);
        if (!match || assigned.has(match.id)) continue;

        // Check if match also requests this attendee (bidirectional)
        const matchClassification = classifications.get(match.id);
        if (!matchClassification) continue;

        const matchRequests = matchClassification.roommateRequests;
        const isBidirectional = matchRequests.some(name =>
          this.namesMatch(name, attendee.fullName)
        );

        if (isBidirectional) {
          // Add bidirectional edge
          if (!adjacencyList.has(attendee.id)) {
            adjacencyList.set(attendee.id, new Set());
          }
          if (!adjacencyList.has(match.id)) {
            adjacencyList.set(match.id, new Set());
          }
          adjacencyList.get(attendee.id)!.add(match.id);
          adjacencyList.get(match.id)!.add(attendee.id);
        }
      }
    }

    // Find connected components using DFS
    const visited = new Set<string>();

    for (const [attendeeId, neighbors] of adjacencyList) {
      if (visited.has(attendeeId) || assigned.has(attendeeId)) continue;

      const component: string[] = [];
      const stack = [attendeeId];

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;

        visited.add(current);
        component.push(current);

        const currentNeighbors = adjacencyList.get(current);
        if (currentNeighbors) {
          for (const neighbor of currentNeighbors) {
            if (!visited.has(neighbor) && !assigned.has(neighbor)) {
              stack.push(neighbor);
            }
          }
        }
      }

      // Create group from component
      if (component.length >= 2) {
        const members = component.map(id => attendeeMap.get(id)!);
        const group = this.createRoommateGroup(members, classifications);
        groups.push(group);
        component.forEach(id => assigned.add(id));
      }
    }

    return groups;
  }

  /**
   * Detect family groups (same governorate + family keyword)
   */
  private detectFamilyGroups(
    attendees: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    assigned: Set<string>
  ): AttendeeGroup[] {
    const groups: AttendeeGroup[] = [];
    
    // Group by governorate and family indicator
    const familyByGovernorate = new Map<string, Attendee[]>();

    for (const attendee of attendees) {
      if (assigned.has(attendee.id) || !attendee.governorate) continue;

      const classification = classifications.get(attendee.id);
      if (!classification || !classification.family) continue;

      const key = attendee.governorate.toLowerCase();
      if (!familyByGovernorate.has(key)) {
        familyByGovernorate.set(key, []);
      }
      familyByGovernorate.get(key)!.push(attendee);
    }

    // Create family groups for governorates with multiple family indicators
    for (const [governorate, members] of familyByGovernorate) {
      if (members.length >= 2) {
        // Create one family group per governorate
        const group = this.createFamilyGroup(members, classifications);
        groups.push(group);
        members.forEach(m => assigned.add(m.id));
      }
    }

    return groups;
  }

  /**
   * Detect church groups (same church, at least 2 people)
   * Only groups attendees who don't have:
   * - Explicit roommate requests
   * - Medical/accessibility needs
   * - VIP status
   */
  private detectChurchGroups(
    attendees: Attendee[],
    assigned: Set<string>,
    classifications: Map<string, ClassifiedNotes>
  ): AttendeeGroup[] {
    const groups: AttendeeGroup[] = [];

    // Group by church
    const byChurch = new Map<string, Attendee[]>();

    for (const attendee of attendees) {
      if (assigned.has(attendee.id) || !attendee.church) continue;

      const classification = classifications.get(attendee.id);
      
      // Skip if attendee has explicit roommate requests
      if (classification && classification.roommateRequests.length > 0) continue;
      
      // Skip if attendee has special needs (should be placed individually with care)
      if (classification && (
        classification.healthIssues.length > 0 ||
        classification.wheelchair ||
        classification.elderly ||
        classification.accessibility
      )) continue;
      
      // Skip VIP attendees (should be placed individually)
      if (attendee.conferenceRole === ConferenceRole.VIP) continue;

      const key = attendee.church.toLowerCase();
      if (!byChurch.has(key)) {
        byChurch.set(key, []);
      }
      byChurch.get(key)!.push(attendee);
    }

    // Create church groups for churches with 2+ people
    for (const [church, members] of byChurch) {
      if (members.length >= 2) {
        const group = this.createChurchGroup(members, classifications);
        groups.push(group);
        members.forEach(m => assigned.add(m.id));
      }
    }

    return groups;
  }

  /**
   * Create roommate group from members
   */
  private createRoommateGroup(
    members: Attendee[],
    classifications: Map<string, ClassifiedNotes>
  ): AttendeeGroup {
    const priority = this.calculatePriority(members, classifications, GroupType.ROOMMATE);
    const constraints = this.calculateConstraints(members, classifications);

    return {
      id: `roommate-${members.map(m => m.id).join('-')}`,
      type: GroupType.ROOMMATE,
      members,
      priority,
      constraints,
      preferSameFloor: true, // Roommates strongly prefer same floor
      minRoomCount: Math.ceil(members.length / 4) // Assuming max 4 per room
    };
  }

  /**
   * Create family group from members
   */
  private createFamilyGroup(
    members: Attendee[],
    classifications: Map<string, ClassifiedNotes>
  ): AttendeeGroup {
    const priority = this.calculatePriority(members, classifications, GroupType.FAMILY);
    const constraints = this.calculateConstraints(members, classifications);
    
    // Family groups require FAMILY room type
    constraints.requiredRoomType = 'FAMILY';

    return {
      id: `family-${members[0].governorate}-${Date.now()}`,
      type: GroupType.FAMILY,
      members,
      priority,
      constraints,
      preferSameFloor: true,
      minRoomCount: Math.ceil(members.length / 4)
    };
  }

  /**
   * Create church group from members
   */
  private createChurchGroup(
    members: Attendee[],
    classifications: Map<string, ClassifiedNotes>
  ): AttendeeGroup {
    const priority = this.calculatePriority(members, classifications, GroupType.CHURCH);
    const constraints = this.calculateConstraints(members, classifications);

    return {
      id: `church-${members[0].church}-${Date.now()}`,
      type: GroupType.CHURCH,
      members,
      priority,
      constraints,
      preferSameFloor: false, // Church groups can be on different floors
      minRoomCount: Math.ceil(members.length / 4)
    };
  }

  /**
   * Create individual group for single attendee
   */
  private createIndividualGroup(
    attendee: Attendee,
    classification: ClassifiedNotes
  ): AttendeeGroup {
    const priority = this.calculatePriority([attendee], new Map([[attendee.id, classification]]), GroupType.INDIVIDUAL);
    const constraints = this.calculateConstraints([attendee], new Map([[attendee.id, classification]]));

    return {
      id: `individual-${attendee.id}`,
      type: GroupType.INDIVIDUAL,
      members: [attendee],
      priority,
      constraints,
      preferSameFloor: false,
      minRoomCount: 1
    };
  }

  /**
   * Calculate group priority based on multiple factors
   * Higher priority = assigned first
   */
  private calculatePriority(
    members: Attendee[],
    classifications: Map<string, ClassifiedNotes>,
    groupType: GroupType
  ): number {
    let priority = 50; // Base priority

    // Medical cases: +40 (highest priority)
    const hasHealthIssues = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.healthIssues.length > 0;
    });
    if (hasHealthIssues) priority += 40;

    // Wheelchair users: +35
    const hasWheelchair = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.wheelchair;
    });
    if (hasWheelchair) priority += 35;

    // Elderly: +25
    const hasElderly = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.elderly;
    });
    if (hasElderly) priority += 25;

    // VIP: +20
    const hasVIP = members.some(m => m.conferenceRole === ConferenceRole.VIP);
    if (hasVIP) priority += 20;

    // Family groups: +15
    if (groupType === GroupType.FAMILY) priority += 15;

    // Roommate groups: +10
    if (groupType === GroupType.ROOMMATE) priority += 10;

    // Large groups (harder to place): +5 per person over 2
    if (members.length > 2) {
      priority += (members.length - 2) * 5;
    }

    return Math.min(priority, 100); // Cap at 100
  }

  /**
   * Calculate group constraints from member requirements
   */
  private calculateConstraints(
    members: Attendee[],
    classifications: Map<string, ClassifiedNotes>
  ): AttendeeGroup['constraints'] {
    const constraints: AttendeeGroup['constraints'] = {};

    // Accessibility requirements
    const requiresWheelchair = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.wheelchair;
    });

    const requiresElderly = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.elderly;
    });

    const requiresAccessibility = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.accessibility;
    });

    if (requiresWheelchair) {
      constraints.requiresAccessibility = true;
      constraints.requiresGroundFloor = true;
      constraints.requiresElevator = true;
    } else if (requiresElderly) {
      constraints.requiresElevator = true;
      constraints.requiresGroundFloor = true;
    } else if (requiresAccessibility) {
      constraints.requiresAccessibility = true;
    }

    // Bathroom/elevator proximity
    const needsNearBathroom = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.nearBathroom;
    });
    if (needsNearBathroom) {
      constraints.requiresNearBathroom = true;
    }

    const needsNearElevator = members.some(m => {
      const classification = classifications.get(m.id);
      return classification && classification.nearElevator;
    });
    if (needsNearElevator || requiresElderly) {
      constraints.requiresElevator = true;
    }

    // Gender constraint (if all members have same gender)
    const genders = members.map(m => m.gender).filter(g => g);
    if (genders.length > 0 && genders.every(g => g === genders[0])) {
      constraints.requiredGender = genders[0] as Gender;
    }

    // VIP room type (if any VIP member)
    const hasVIP = members.some(m => m.conferenceRole === ConferenceRole.VIP);
    if (hasVIP) {
      constraints.requiredRoomType = 'VIP';
    }

    return constraints;
  }

  /**
   * Find attendee by name (case-insensitive, fuzzy matching)
   */
  private findAttendeeByName(
    attendees: Attendee[],
    name: string,
    excludeId?: string
  ): Attendee | null {
    for (const attendee of attendees) {
      if (excludeId && attendee.id === excludeId) continue;
      if (this.namesMatch(attendee.fullName, name)) {
        return attendee;
      }
    }

    return null;
  }

  /**
   * Check if two names match (case-insensitive, handles partial matches)
   */
  private namesMatch(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();

    // Exact match
    if (n1 === n2) return true;

    // Check if one contains the other (for partial name matches)
    // But require at least 3 characters to avoid false positives
    if (n1.length >= 3 && n2.length >= 3) {
      return n1.includes(n2) || n2.includes(n1);
    }

    return false;
  }
}
