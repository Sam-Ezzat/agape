// WHY: Soft constraint preferring attendees from the same church
// Promotes community building and comfort among church members

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Scores assignments based on church affiliation
 * 
 * Higher scores when assigning attendees to rooms with people from the same church
 * This is a soft constraint - it influences scoring but doesn't block assignments
 */
export class SameChurchRule implements IAssignmentRule {
  readonly name = 'same_church';
  readonly description = 'Prefer assigning attendees to rooms with same church members';
  readonly priority = RulePriority.MEDIUM;
  readonly isHardConstraint = false;
  enabled = true;
  weight: number;

  constructor(weight = 0.3) {
    this.weight = weight;
  }

  validate(context: AssignmentContext): RuleValidationResult {
    // Soft constraints always validate successfully
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    const { attendee, room, allAttendees = [] } = context;
    
    // If attendee has no church affiliation, return neutral score
    if (!attendee.church) {
      return { 
        score: 50,
        explanation: 'Attendee has no church affiliation'
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

    // Count how many occupants are from the same church
    const sameChurchCount = roomOccupants.filter(occupant => 
      occupant.church?.toLowerCase() === attendee.church.toLowerCase()
    ).length;

    // Calculate score based on percentage of same-church occupants
    const percentage = sameChurchCount / roomOccupants.length;
    
    // Score: 100 if all are same church, 0 if none are same church, scaled in between
    const score = percentage * 100;

    return {
      score,
      explanation: `${sameChurchCount} of ${roomOccupants.length} occupants from same church (${attendee.church})`
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'No church affinity information available';
  }
}
