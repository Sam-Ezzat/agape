// WHY: Soft constraint keeping group members on the same floor
// Makes it easier for groups to meet and interact during the conference

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Scores assignments based on floor proximity for group members
 * 
 * Prefers keeping group members (roommates, families, churches) on the same floor
 * or at least in the same building for easier coordination
 * 
 * NOTE: This is a simplified implementation. Full implementation requires
 * tracking where all group members are assigned across the building.
 */
export class PreferSameFloorRule implements IAssignmentRule {
  readonly name = 'prefer_same_floor';
  readonly description = 'Prefer keeping group members on the same floor';
  readonly priority = RulePriority.LOW;
  readonly isHardConstraint = false;
  enabled = true;
  weight: number;

  constructor(weight = 0.1) {
    this.weight = weight;
  }

  validate(context: AssignmentContext): RuleValidationResult {
    // Soft constraints always validate successfully
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    const { attendee, room, allAttendees = [], configuration } = context;
    
    // Check if we have floor preference data in configuration
    // This would be set by the AutoAssignmentService based on group detection
    const preferredFloorId = configuration?.preferredFloorId;
    
    if (preferredFloorId) {
      // If group has a preferred floor, score based on match
      if (room.floorId === preferredFloorId) {
        return {
          score: 100,
          explanation: 'Room is on group\'s preferred floor'
        };
      } else if (room.floor.building.id === configuration?.preferredBuildingId) {
        return {
          score: 60,
          explanation: 'Room is in group\'s preferred building but different floor'
        };
      } else {
        return {
          score: 30,
          explanation: 'Room is in different building from group'
        };
      }
    }

    // Without group context, return neutral score
    // (Will be enhanced when integrated with AutoAssignmentService)
    return {
      score: 50,
      explanation: 'No floor preference available (neutral score)'
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'No group floor proximity information available';
  }
}

