// WHY: Hard constraint ensuring room capacity is never exceeded
// Prevents overbooking at the application level (database only has unique attendeeId)

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Validates that assigning an attendee won't exceed room capacity
 * 
 * This is a critical safety rule that must never be violated
 */
export class RoomCapacityRule implements IAssignmentRule {
  readonly name = 'room_capacity';
  readonly description = 'Room capacity must not be exceeded';
  readonly priority = RulePriority.CRITICAL;
  readonly weight = 0; // Hard constraints don't use weight
  readonly isHardConstraint = true;
  enabled = true;

  validate(context: AssignmentContext): RuleValidationResult {
    const { room } = context;
    const currentOccupancy = room.currentOccupancy;
    const capacity = room.capacity;
    
    // Check if adding one more attendee would exceed capacity
    if (currentOccupancy >= capacity) {
      return {
        valid: false,
        reason: `Room is at full capacity (${currentOccupancy}/${capacity})`,
        conflictingRule: this.name
      };
    }
    
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    // Hard constraints don't contribute to scoring
    return { score: 0 };
  }

  explain(context: AssignmentContext, result: RuleValidationResult | RuleScoringResult): string {
    if ('valid' in result) {
      const { room } = context;
      if (result.valid) {
        return `Room has space (${room.currentOccupancy}/${room.capacity})`;
      } else {
        return result.reason || 'Room is full';
      }
    }
    return 'N/A';
  }
}
