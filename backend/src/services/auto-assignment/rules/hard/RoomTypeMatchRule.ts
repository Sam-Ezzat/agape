// WHY: Hard constraint ensuring room type matches attendee requirements
// VIP attendees get VIP rooms, families get FAMILY rooms, etc.

import { ConferenceRole } from '@prisma/client';
import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Validates room type matches attendee requirements
 * 
 * Rules:
 * - VIP role → VIP room type required
 * - FAMILY attendees (from classified notes) → FAMILY room type required
 * - GENERAL attendees → GENERAL or VIP rooms allowed (if VIP has space)
 * - LEADER/PASTOR → Prefer VIP but can use GENERAL
 */
export class RoomTypeMatchRule implements IAssignmentRule {
  readonly name = 'room_type_match';
  readonly description = 'Room type must match attendee requirements';
  readonly priority = RulePriority.HIGH;
  readonly weight = 0;
  readonly isHardConstraint = true;
  enabled = true;

  validate(context: AssignmentContext): RuleValidationResult {
    const { attendee, room } = context;
    
    // VIP role requires VIP room
    if (attendee.conferenceRole === ConferenceRole.VIP && room.roomType !== 'VIP') {
      return {
        valid: false,
        reason: 'VIP attendees must be assigned to VIP rooms',
        conflictingRule: this.name
      };
    }
    
    // Check if attendee requires FAMILY room
    // This would come from classified rooming notes
    const requiresFamily = (context.configuration as any)?.requiresFamily;
    if (requiresFamily && room.roomType !== 'FAMILY') {
      return {
        valid: false,
        reason: 'Family groups must be assigned to FAMILY rooms',
        conflictingRule: this.name
      };
    }
    
    // FAMILY rooms should only be used for families
    // Don't assign non-family attendees to FAMILY rooms unless necessary
    if (room.roomType === 'FAMILY' && !requiresFamily) {
      return {
        valid: false,
        reason: 'FAMILY rooms are reserved for family groups',
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
      const { attendee, room } = context;
      
      if (result.valid) {
        return `Room type ${room.roomType} is appropriate for ${attendee.conferenceRole}`;
      } else {
        return result.reason || 'Room type mismatch';
      }
    }
    return 'N/A';
  }
}
