// WHY: Soft constraint keeping leaders near their group members
// Facilitates leadership and pastoral care during the conference

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';
import { ConferenceRole } from '@prisma/client';

/**
 * Scores assignments based on leader proximity to their group
 * 
 * Leaders (SERVANT role) should be placed near their church/governorate members
 * for easier coordination and pastoral care
 * 
 * NOTE: This is a simplified implementation. Full implementation requires
 * tracking where all group members are assigned across the building.
 */
export class LeaderProximityRule implements IAssignmentRule {
  readonly name = 'leader_proximity';
  readonly description = 'Prefer keeping leaders near their group members';
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

  /**
   * Check if attendee is a leader (servant role or explicitly marked)
   */
  private isLeader(attendee: any): boolean {
    return attendee.conferenceRole === ConferenceRole.LEADER ||
           attendee.conferenceRole === ConferenceRole.PASTOR ||
           attendee.isServant === true;
  }

  score(context: AssignmentContext): RuleScoringResult {
    const { attendee, room, allAttendees = [], configuration } = context;
    
    const isAttendeeLeader = this.isLeader(attendee);

    // Check if we have leader placement preferences in configuration
    // This would be set by the AutoAssignmentService based on group detection
    const preferredFloorId = configuration?.leaderPreferredFloorId;
    
    if (preferredFloorId && isAttendeeLeader) {
      // If leader has a preferred floor (where their group is), score based on match
      if (room.floorId === preferredFloorId) {
        return {
          score: 100,
          explanation: 'Leader placed on same floor as group members'
        };
      } else if (room.floor.building.id === configuration?.leaderPreferredBuildingId) {
        return {
          score: 65,
          explanation: 'Leader in same building as group but different floor'
        };
      } else {
        return {
          score: 30,
          explanation: 'Leader in different building from group'
        };
      }
    }

    // For non-leaders, slightly prefer being near leaders of their group
    if (!isAttendeeLeader && preferredFloorId) {
      if (room.floorId === preferredFloorId) {
        return {
          score: 80,
          explanation: 'Attendee placed on same floor as their leaders'
        };
      } else {
        return {
          score: 50,
          explanation: 'Attendee on different floor from leaders (neutral)'
        };
      }
    }

    // Without group/leader context, return neutral score
    // (Will be enhanced when integrated with AutoAssignmentService)
    return {
      score: 50,
      explanation: 'No leader proximity preference available'
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'No leader proximity information available';
  }
}

