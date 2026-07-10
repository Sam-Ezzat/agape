// WHY: Hard constraint ensuring gender compatibility in room assignments
// Mixed-gender rooms are not allowed (except for FAMILY room type)

import { Gender } from '@prisma/client';
import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Validates gender compatibility for room assignments
 * 
 * Rules:
 * - FAMILY rooms: Can have mixed genders
 * - GENERAL/VIP rooms: All occupants must have same gender
 * - If attendee gender is OTHER or null: Can only assign to empty rooms or FAMILY rooms
 */
export class GenderMatchRule implements IAssignmentRule {
  readonly name = 'gender_match';
  readonly description = 'Room gender must match attendee gender';
  readonly priority = RulePriority.CRITICAL;
  readonly weight = 0;
  readonly isHardConstraint = true;
  enabled = true;

  validate(context: AssignmentContext): RuleValidationResult {
    const { attendee, room } = context;
    
    // FAMILY rooms can have mixed genders
    if (room.roomType === 'FAMILY') {
      return { valid: true };
    }
    
    // If room is empty, any gender can be assigned
    if (room.currentOccupancy === 0) {
      return { valid: true };
    }
    
    // Room has occupants - check gender compatibility
    const attendeeGender = attendee.gender;
    
    // If attendee has no gender or OTHER gender, only allow in empty rooms or FAMILY rooms
    if (!attendeeGender || attendeeGender === Gender.OTHER) {
      return {
        valid: false,
        reason: 'Attendees with unspecified or OTHER gender can only be assigned to empty rooms or FAMILY rooms',
        conflictingRule: this.name
      };
    }
    
    // Check gender of current occupants
    const currentOccupants = room.currentAssignments;
    if (currentOccupants && currentOccupants.length > 0) {
      // Get the gender from first occupant by looking up in allAttendees
      const firstOccupantId = currentOccupants[0].attendeeId;
      
      // Defensive: check if allAttendees is provided (may not be in tests)
      if (context.allAttendees && context.allAttendees.length > 0) {
        const firstOccupant = context.allAttendees.find(a => a.id === firstOccupantId);
        
        if (firstOccupant && firstOccupant.gender) {
          const roomGender = firstOccupant.gender;
          
          if (roomGender !== attendeeGender) {
            return {
              valid: false,
              reason: `Room is assigned to ${roomGender} attendees, cannot assign ${attendeeGender} attendee`,
              conflictingRule: this.name
            };
          }
        }
      }
    }
    
    return { valid: true };
  }

  score(context: AssignmentContext): RuleScoringResult {
    return { score: 0 };
  }

  explain(context: AssignmentContext, result: RuleValidationResult | RuleScoringResult): string {
    if ('valid' in result) {
      const { attendee, room } = context;
      
      if (room.roomType === 'FAMILY') {
        return 'FAMILY room allows mixed genders';
      }
      
      if (room.currentOccupancy === 0) {
        return 'Empty room, gender compatibility established';
      }
      
      if (result.valid) {
        return `Gender compatible: ${attendee.gender || 'unspecified'}`;
      } else {
        return result.reason || 'Gender mismatch';
      }
    }
    return 'N/A';
  }
}
