// WHY: Soft constraint preferring attendees from the same governorate
// Helps group people from the same region for comfort and community

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Scores assignments based on governorate proximity
 * 
 * Higher scores when assigning attendees to rooms with people from the same governorate
 * This is a soft constraint - it influences scoring but doesn't block assignments
 */
export class SameGovernorateRule implements IAssignmentRule {
  readonly name = 'same_governorate';
  readonly description = 'Prefer assigning attendees to rooms with same governorate members';
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
    const { attendee, room, allAttendees = [] } = context;
    
    // If attendee has no governorate, return neutral score
    if (!attendee.governorate) {
      return { 
        score: 50,
        explanation: 'Attendee has no governorate information'
      };
    }

    // Get current room occupants using room's current assignments
    const occupantIds = room.currentAssignments.map(a => a.attendeeId);
    const roomOccupants = allAttendees.filter(a => occupantIds.includes(a.id));

    // Empty room - neutral score
    if (roomOccupants.length === 0) {
      return {
        score: 50,
        explanation: 'Room is empty (neutral score)'
      };
    }

    // Count how many occupants are from the same governorate
    const sameGovernorateCount = roomOccupants.filter(occupant => 
      occupant.governorate?.toLowerCase() === attendee.governorate.toLowerCase()
    ).length;

    // Calculate score based on percentage of same-governorate occupants
    const percentage = sameGovernorateCount / roomOccupants.length;
    
    // Score: 100 if all are same governorate, 0 if none are same governorate
    const score = percentage * 100;

    return {
      score,
      explanation: `${sameGovernorateCount} of ${roomOccupants.length} occupants from same governorate (${attendee.governorate})`
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'No governorate information available';
  }
}
