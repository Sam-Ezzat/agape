// WHY: Type definitions for the auto-assignment system
// Centralizes all types used across the auto-assignment module

import { Attendee, Gender, ConferenceRole } from '@prisma/client';

/**
 * Group types detected from attendee relationships
 */
export enum GroupType {
  ROOMMATE = 'roommate',         // Explicit roommate requests (bidirectional)
  FAMILY = 'family',             // Family members traveling together
  CHURCH = 'church',             // Same church group
  GOVERNORATE = 'governorate',   // Same governorate/region
  INDIVIDUAL = 'individual'      // No group affiliation
}

/**
 * Detected group of attendees that should be assigned together
 */
export interface AttendeeGroup {
  id: string;                    // Unique group identifier
  type: GroupType;               // What kind of group this is
  members: Attendee[];           // Attendees in this group
  priority: number;              // Assignment priority (higher = assign first)
  constraints: GroupConstraints; // Constraints that apply to this group
  preferSameFloor?: boolean;     // Whether to prefer same floor for large groups
  preferSameBuilding?: boolean;  // Whether to prefer same building
  minRoomCount: number;          // Minimum rooms needed for this group
  metadata?: Record<string, any>; // Additional group-specific data
}

/**
 * Constraints that apply to an attendee group
 */
export interface GroupConstraints {
  requiredRoomType?: 'GENERAL' | 'VIP' | 'FAMILY';
  requiredGender?: Gender;
  mustBeNearby?: boolean;        // Must be in nearby rooms
  requiresAccessibility?: boolean;
  requiresGroundFloor?: boolean;
  requiresElevator?: boolean;
  maxRoomCapacity?: number;      // Max people per room for this group
}

/**
 * Categories extracted from free-text rooming notes
 */
export interface ClassifiedNotes {
  roommateRequests: string[];    // Names of requested roommates
  healthIssues: string[];        // Health conditions mentioned
  accessibility: boolean;         // Needs accessibility features
  wheelchair: boolean;            // Wheelchair user
  elderly: boolean;               // Elderly, needs special accommodation
  nearBathroom: boolean;          // Prefers room near bathroom
  nearElevator: boolean;          // Prefers room near elevator
  family: boolean;                // Traveling with family
  noPreference: boolean;          // No special preferences
  other: string[];                // Unclassified notes
  raw: string;                    // Original rooming notes text
}

/**
 * Configuration for auto-assignment execution
 */
export interface AutoAssignmentConfig {
  id: string;
  conferenceHouseId: string;
  enabledBuildings: string[];           // Building IDs to use for assignment
  staffReservedCapacity: number;        // Beds reserved for staff
  vipReservedCapacity: number;          // Beds reserved for VIP
  emergencyReservedCapacity: number;    // Beds reserved for emergencies
  leaderReservedSlots: number;          // Beds withheld per room for a leader to be added manually later
  enabledRules: string[];               // Rule names to enable
  ruleWeights: Record<string, number>;  // Rule name → weight mapping
  optimizationEnabled: boolean;         // Whether to run optimization pass
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Assignment operation result
 */
export interface AssignmentResult {
  attendeeId: string;
  roomId: string;
  score: number;                  // Assignment quality score
  appliedRules: string[];         // Rules that contributed to this assignment
  warnings?: string[];            // Non-critical issues
  reason?: string;                // Explanation of why this assignment was made
  groupInfo?: {                   // Group membership information
    groupId: string;
    groupType: GroupType;
    groupSize: number;
    roommatesInSameRoom?: number;  // How many roommates assigned to this room
  };
  scoreBreakdown?: Record<string, number>; // Score contribution by each rule
  // Enriched details for preview (populated before returning to client)
  attendeeName?: string;
  gender?: string | null;
  age?: number | null;
  church?: string | null;
  area?: string | null;
  governorate?: string | null;
  roomingNotes?: string | null;
  parsedRoomingNotes?: string | null; // Clean, human-reviewable list of extracted roommate names (from cached classification)
  roomNumber?: string;
  buildingName?: string;
  floorNumber?: number;
  existingOccupancy?: number; // Occupants already in the room before this run (manual or prior assignments)
  // WHY: Distinguishes a REAL, already-committed RoomAssignment (seeded into
  // the preview session so admins can see/manage it) from a new placement
  // this dry run made — committing the session needs to know whether to
  // insert, no-op, or move/delete an existing DB row.
  isExisting?: boolean;
  originalRoomId?: string; // Where this attendee actually was in the DB when the session was created
}

/**
 * Validation error for rejected assignments
 */
export interface ValidationError {
  attendeeId: string;
  attendeeName: string;
  reason: string;
  violatedRule: string;
  severity: 'error' | 'warning';
}

/**
 * Auto-assignment execution result
 */
export interface AutoAssignmentExecutionResult {
  success: boolean;
  assignmentsCreated: number;
  attendeesProcessed: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  assignments: AssignmentResult[];
  // WHY: attendees from the processing pool who did NOT end up in
  // `assignments` after this run — previously declared on the frontend type
  // but never actually populated here, so the preview's "Unassigned" list/
  // count silently showed nothing.
  unassignedAttendees: Array<{
    id: string;
    name: string;
    reason: string;
    roomingNotes?: string | null;
    area?: string | null;
    governorate?: string | null;
    church?: string | null;
    age?: number | null;
    gender?: string | null;
    // WHY: Set when this attendee was a REAL, already-assigned attendee who
    // got dragged into "Unassigned" within the draft — commit needs this to
    // know to release their actual RoomAssignment, not just drop a draft row.
    originalRoomId?: string;
  }>;
  executionTimeMs: number;
  stages: StageResult[];
}

/**
 * Result from a specific execution stage
 */
export interface StageResult {
  stage: number;
  name: string;
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
  details?: string;
  itemsProcessed?: number;
}

/**
 * DTO for running auto-assignment
 */
export interface RunAutoAssignmentDTO {
  conferenceHouseId: string;
  buildingIds?: string[];         // Optional: override config buildings
  buildingGenderOverrides?: Record<string, 'MALE' | 'FEMALE'>; // Optional: manual per-building gender pin, overrides config; buildings absent keep automatic behavior
  dryRun?: boolean;               // Preview without saving
  options?: {
    skipOptimization?: boolean;
    maxAssignments?: number;      // Limit for testing
    onlyUnassigned?: boolean;     // Only assign unassigned attendees
  };
}

/**
 * DTO for auto-assignment configuration
 */
export interface AutoAssignmentConfigDTO {
  conferenceHouseId: string;
  enabledBuildings: string[];
  buildingGenderOverrides?: Record<string, 'MALE' | 'FEMALE'>;
  staffReservedCapacity?: number;
  vipReservedCapacity?: number;
  emergencyReservedCapacity?: number;
  leaderReservedSlots?: number;
  enabledRules?: string[];
  ruleWeights?: Record<string, number>;
  optimizationEnabled?: boolean;
}

/**
 * Progress event for real-time updates (WebSocket)
 */
export interface AutoAssignmentProgressEvent {
  type: 'stage' | 'progress' | 'assignment' | 'error' | 'complete';
  stage?: {
    number: number;
    name: string;
    status: 'started' | 'completed' | 'failed';
  };
  progress?: {
    total: number;
    processed: number;
    percentage: number;
  };
  assignment?: {
    attendeeId: string;
    attendeeName: string;
    roomId: string;
    roomNumber: string;
  };
  error?: ValidationError;
  result?: AutoAssignmentExecutionResult;
}
