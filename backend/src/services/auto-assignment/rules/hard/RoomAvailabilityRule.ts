// WHY: Hard constraint ensuring room is available for assignment
// Checks room is not disabled or reserved

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Validates that a room is available for assignment
 * 
 * Rules:
 * - Room must exist
 * - Room must not be marked as unavailable (future enhancement)
 * - Room must not be fully occupied (overlaps with capacity rule but checks first)
 */
export class RoomAvailabilityRule implements IAssignmentRule {
  readonly name = 'room_availability';
  readonly description = 'Room must be available for assignment';
  readonly priority = RulePriority.CRITICAL;
  readonly weight = 0;
  readonly isHardConstraint = true;
  enabled = true;

  validate(context: AssignmentContext): RuleValidationResult {
    const { room } = context;
    
    // Check if room exists (should always be true if context is valid)
    if (!room || !room.id) {
      return {
        valid: false,
        reason: 'Room does not exist',
        conflictingRule: this.name
      };
    }
    
    // Check if room is disabled (future enhancement - would need isDisabled field)
    const isDisabled = (room as any).isDisabled;
    if (isDisabled) {
      return {
        valid: false,
        reason: 'Room is disabled and unavailable for assignment',
        conflictingRule: this.name
      };
    }
    
    // Check if room has any capacity left
    if (room.currentOccupancy >= room.capacity) {
      return {
        valid: false,
        reason: 'Room is fully occupied',
        conflictingRule: this.name
      };
    }
    
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    return { score: 0 };
  }

  explain(context: AssignmentContext, result: RuleValidationResult | RuleScoringResult): string {
    if ('valid' in result) {
      if (result.valid) {
        return 'Room is available';
      } else {
        return result.reason || 'Room is unavailable';
      }
    }
    return 'N/A';
  }
}
