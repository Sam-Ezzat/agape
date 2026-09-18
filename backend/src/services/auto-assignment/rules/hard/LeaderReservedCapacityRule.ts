// WHY: Auto-assignment can fill every room to 100% capacity, leaving no room
// for a leader to be added later — staff often don't know who the leader for
// a given room/group will be until after the initial pass, and want at least
// one bed physically held open regardless of whether anyone in the pool
// currently carries the LEADER/PASTOR conference role. This rule withholds
// `leaderReservedSlots` beds per room from ordinary auto-assignment.
//
// Attendees who ARE leader-type (LEADER/PASTOR/VIP role, or flagged isServant
// — the same "is this effectively a leader" signal used elsewhere in this
// codebase) are exempt: if a real leader comes through auto-assignment, they
// can use the reserved slot themselves, since that satisfies the intent.

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

function isLeaderType(attendee: AssignmentContext['attendee']): boolean {
  return attendee.isServant === true ||
    attendee.conferenceRole === 'LEADER' ||
    attendee.conferenceRole === 'PASTOR' ||
    attendee.conferenceRole === 'VIP';
}

export class LeaderReservedCapacityRule implements IAssignmentRule {
  readonly name = 'leader_reserved_capacity';
  readonly description = 'Keep a configurable number of beds per room open for a leader to be assigned manually later';
  readonly priority = RulePriority.HIGH;
  readonly weight = 0; // Hard constraints don't use weight
  readonly isHardConstraint = true;
  enabled = true;

  constructor(private leaderReservedSlots: number = 0) {}

  validate(context: AssignmentContext): RuleValidationResult {
    if (this.leaderReservedSlots <= 0) return { valid: true };

    const { attendee, room } = context;

    // FAMILY rooms are a different accommodation category — the leader
    // reservation is about general/VIP dorm-style rooms, not family units.
    if (room.roomType === 'FAMILY') return { valid: true };

    // A leader-type attendee may use the reserved slot themselves.
    if (isLeaderType(attendee)) return { valid: true };

    const remainingAfterAssignment = room.capacity - (room.currentOccupancy + 1);
    if (remainingAfterAssignment < this.leaderReservedSlots) {
      return {
        valid: false,
        reason: `Room must keep ${this.leaderReservedSlots} bed(s) open for a leader (${room.currentOccupancy}/${room.capacity} occupied)`,
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
      return result.valid
        ? 'Room keeps enough space reserved for a leader'
        : (result.reason || 'Room must keep a bed open for a leader');
    }
    return 'N/A';
  }
}
