// WHY: Core interface for pluggable assignment rules in the auto-assignment engine
// Enables adding new rules without modifying the engine (Open/Closed Principle)
// Each rule evaluates constraints and contributes to assignment quality scoring

import { Attendee, Room, RoomAssignment } from '@prisma/client';

/**
 * Priority levels for rule execution ordering
 */
export enum RulePriority {
  CRITICAL = 1,    // Must evaluate first (e.g., capacity, gender)
  HIGH = 2,        // Important constraints (e.g., room type, availability)
  MEDIUM = 3,      // Preference rules (e.g., same church, same floor)
  LOW = 4          // Nice-to-have rules (e.g., age similarity)
}

/**
 * Rule evaluation result for hard constraints
 */
export interface RuleValidationResult {
  valid: boolean;
  reason?: string;      // Human-readable explanation why assignment is invalid
  conflictingRule?: string;
}

/**
 * Rule scoring result for soft constraints
 */
export interface RuleScoringResult {
  score: number;        // Numeric score (0-100), higher is better
  explanation?: string; // Why this score was assigned
  factors?: Record<string, number>; // Breakdown of scoring factors
}

/**
 * Context provided to rules for evaluation
 */
export interface AssignmentContext {
  attendee: Attendee;
  room: Room & {
    currentOccupancy: number;
    currentAssignments: RoomAssignment[];
    floor: {
      floorNumber: number;
      building: {
        id: string;
        name: string;
        conferenceHouseId: string;
      };
    };
  };
  allAttendees?: Attendee[];        // For group-based rules
  allRooms?: Room[];                // For optimization rules
  configuration?: Record<string, any>; // Rule-specific config
}

/**
 * Core interface that all assignment rules must implement
 * 
 * Rules come in two types:
 * - Hard constraints: Must be satisfied (validate() returns false = reject assignment)
 * - Soft constraints: Improve quality (score() contributes to assignment ranking)
 */
export interface IAssignmentRule {
  /**
   * Unique identifier for the rule (e.g., "room_capacity", "gender_match")
   */
  readonly name: string;

  /**
   * Human-readable description of what this rule enforces
   */
  readonly description: string;

  /**
   * Priority level for rule evaluation ordering
   */
  readonly priority: RulePriority;

  /**
   * Weight for soft constraint scoring (0.0 - 1.0)
   * Higher weight = more influence on final assignment score
   */
  readonly weight: number;

  /**
   * Whether this rule is currently enabled
   * Disabled rules are skipped during evaluation
   */
  enabled: boolean;

  /**
   * Whether this is a hard constraint (must satisfy) or soft constraint (scoring only)
   */
  readonly isHardConstraint: boolean;

  /**
   * Validate a potential assignment against this rule
   * 
   * For hard constraints: Returns { valid: false } if assignment violates the rule
   * For soft constraints: Always returns { valid: true } (use score() instead)
   * 
   * @param context - Full context about the assignment being evaluated
   * @returns Validation result with explanation if invalid
   */
  validate(context: AssignmentContext): RuleValidationResult;

  /**
   * Score a potential assignment for soft constraint optimization
   * 
   * Only called for soft constraints. Hard constraints should return { score: 0 }
   * 
   * @param context - Full context about the assignment being evaluated
   * @returns Score (0-100) with optional explanation
   */
  score(context: AssignmentContext): RuleScoringResult;

  /**
   * Generate human-readable explanation of why this rule accepted/rejected/scored an assignment
   * 
   * Used for debugging and showing organizers why assignments were made
   * 
   * @param context - The assignment context
   * @param result - The validation or scoring result
   * @returns Explanation text
   */
  explain(context: AssignmentContext, result: RuleValidationResult | RuleScoringResult): string;
}
