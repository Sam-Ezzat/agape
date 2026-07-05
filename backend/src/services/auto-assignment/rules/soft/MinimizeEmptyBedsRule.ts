// WHY: Soft constraint minimizing wasted bed capacity
// Encourages efficient room utilization by preferring to fill rooms completely

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Scores assignments based on room utilization efficiency
 * 
 * Prefers assignments that:
 * 1. Fill nearly-full rooms (minimize empty beds)
 * 2. Avoid leaving single empty beds (hard to fill later)
 * 3. Balance occupancy across available rooms
 */
export class MinimizeEmptyBedsRule implements IAssignmentRule {
  readonly name = 'minimize_empty_beds';
  readonly description = 'Prefer filling rooms efficiently to minimize empty beds';
  readonly priority = RulePriority.MEDIUM;
  readonly isHardConstraint = false;
  enabled = true;
  weight: number;

  constructor(weight = 0.2) {
    this.weight = weight;
  }

  validate(context: AssignmentContext): RuleValidationResult {
    // Soft constraints always validate successfully
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    const { room } = context;
    const { capacity, currentOccupancy } = room;
    
    // Calculate how full the room will be after this assignment
    const occupancyAfterAssignment = currentOccupancy + 1;
    const utilizationPercentage = (occupancyAfterAssignment / capacity) * 100;
    
    // Remaining beds after this assignment
    const remainingBeds = capacity - occupancyAfterAssignment;

    // Scoring strategy:
    // - Filling the last bed (100% utilization): 100 points (perfect!)
    // - Nearly full (80%+) with 2+ beds remaining: 85-95 points (good)
    // - Half full (50%): 50 points (neutral)
    // - Leaving 1 empty bed in smaller rooms (capacity <= 5): -15 penalty
    // - Empty or low occupancy: Lower scores

    let score = utilizationPercentage;

    // Bonus for completely filling a room
    if (remainingBeds === 0) {
      score = 100;
    }
    // Penalty for leaving exactly 1 empty bed in smaller rooms (capacity <= 5)
    else if (remainingBeds === 1 && capacity <= 5) {
      score = Math.max(0, score - 15);
    }
    // Bonus for high utilization (80%+) with 2+ beds remaining
    else if (utilizationPercentage >= 80 && remainingBeds >= 2) {
      score = Math.min(95, utilizationPercentage + 10);
    }
    // Bonus for good utilization (75-79%)
    else if (utilizationPercentage >= 75) {
      score = Math.min(90, utilizationPercentage + 5);
    }

    const explanation = remainingBeds === 0
      ? `Room will be completely filled (${occupancyAfterAssignment}/${capacity})`
      : remainingBeds === 1
      ? `Room will have 1 empty bed remaining (${occupancyAfterAssignment}/${capacity}) - penalty applied`
      : `Room will be ${Math.round(utilizationPercentage)}% full (${occupancyAfterAssignment}/${capacity})`;

    return {
      score,
      explanation
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'Room utilization information unavailable';
  }
}
