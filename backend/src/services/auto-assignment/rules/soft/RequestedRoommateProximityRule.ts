// WHY: Soft constraint that keeps explicitly-requested roommates near each other
// even when they couldn't all be placed together as one group. The rule engine
// otherwise has no visibility into rooming-note requests at all — cohesion was
// previously enforced only by the group-placement step, which has no fallback
// once a group can't fit in a single room (see tryAssignRoommatesTogether).
// This acts as a safety net during per-attendee scoring: a stray attendee is
// steered toward whatever room already has one of their requested roommates,
// instead of being scored purely on church/age/occupancy signals that know
// nothing about who they actually asked to room with.

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

export class RequestedRoommateProximityRule implements IAssignmentRule {
  readonly name = 'requested_roommate_proximity';
  readonly description = 'Prefer rooms that already contain an explicitly requested roommate';
  readonly priority = RulePriority.MEDIUM;
  readonly isHardConstraint = false;
  enabled = true;
  weight: number;

  /** attendeeId -> set of attendeeIds they explicitly asked to room with (resolved from rooming notes) */
  private requestedRoommateMap: Map<string, Set<string>>;

  constructor(requestedRoommateMap: Map<string, Set<string>>, weight = 0.25) {
    this.requestedRoommateMap = requestedRoommateMap;
    this.weight = weight;
  }

  validate(context: AssignmentContext): RuleValidationResult {
    // Soft constraints always validate successfully
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    const { attendee, room } = context;
    const requested = this.requestedRoommateMap.get(attendee.id);

    if (!requested || requested.size === 0) {
      return {
        score: 50,
        explanation: 'Attendee made no explicit roommate request'
      };
    }

    const occupantIds = new Set(room.currentAssignments.map(a => a.attendeeId));

    if (occupantIds.size === 0) {
      // Empty room: neutral — someone in the request cluster has to go first,
      // and an empty room is a perfectly good place for the rest to join later.
      return {
        score: 50,
        explanation: 'Room is empty (neutral score)'
      };
    }

    const matchedCount = Array.from(requested).filter(id => occupantIds.has(id)).length;

    if (matchedCount === 0) {
      // Room already has other people in it, but none are who this attendee asked
      // for — actively discourage this over an empty room or one with their friends.
      return {
        score: 10,
        explanation: 'Room has occupants but none are this attendee\'s requested roommates'
      };
    }

    const score = Math.min(100, 50 + (matchedCount / requested.size) * 50);
    return {
      score,
      explanation: `${matchedCount} of ${requested.size} requested roommate(s) already in this room`
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'No roommate-request proximity information available';
  }
}
