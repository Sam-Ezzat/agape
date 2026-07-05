// WHY: Soft constraint preferring attendees with similar ages
// Promotes comfort and relatability among roommates

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Scores assignments based on age similarity
 * 
 * Higher scores when assigning attendees to rooms with people of similar age
 * Uses age brackets to group: <25, 25-35, 36-50, 51-65, 65+
 */
export class SimilarAgeRule implements IAssignmentRule {
  readonly name = 'similar_age';
  readonly description = 'Prefer assigning attendees to rooms with similar-aged people';
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
   * Get age bracket for categorization
   */
  private getAgeBracket(age: number | null): string {
    if (age === null || age === undefined) return 'unknown';
    if (age < 25) return 'youth';
    if (age <= 35) return 'young_adult';
    if (age <= 50) return 'adult';
    if (age <= 65) return 'senior';
    return 'elderly';
  }

  /**
   * Calculate age difference penalty (0-30 points)
   */
  private calculateAgeDifference(age1: number, age2: number): number {
    const diff = Math.abs(age1 - age2);
    if (diff <= 5) return 0;    // Within 5 years - no penalty
    if (diff <= 10) return 10;  // Within 10 years - small penalty
    if (diff <= 20) return 20;  // Within 20 years - medium penalty
    return 30;                  // Over 20 years - high penalty
  }

  score(context: AssignmentContext): RuleScoringResult {
    const { attendee, room, allAttendees = [] } = context;
    
    // If attendee has no age, return neutral score
    if (!attendee.age) {
      return { 
        score: 50,
        explanation: 'Attendee age not specified'
      };
    }

    // Get current room occupants using room's current assignments
    const occupantIds = room.currentAssignments.map(a => a.attendeeId);
    const roomOccupants = allAttendees.filter(a => 
      occupantIds.includes(a.id) && a.age
    );

    // Empty room - neutral score
    if (roomOccupants.length === 0) {
      return {
        score: 50,
        explanation: 'Room is empty (neutral score)'
      };
    }

    const attendeeBracket = this.getAgeBracket(attendee.age);

    // Count occupants in same age bracket
    const sameBracketCount = roomOccupants.filter(occupant => 
      this.getAgeBracket(occupant.age) === attendeeBracket
    ).length;

    // Calculate average age difference
    const ageDifferences = roomOccupants.map(occupant => 
      this.calculateAgeDifference(attendee.age!, occupant.age!)
    );
    const avgDifference = ageDifferences.reduce((sum, diff) => sum + diff, 0) / ageDifferences.length;

    // Score based on same bracket percentage (60%) + age difference penalty (40%)
    const bracketScore = (sameBracketCount / roomOccupants.length) * 60;
    const ageScore = Math.max(0, 40 - avgDifference);
    const totalScore = bracketScore + ageScore;

    return {
      score: totalScore,
      explanation: `${sameBracketCount}/${roomOccupants.length} in same age bracket (${attendeeBracket}), avg diff: ${Math.round(avgDifference)} years`
    };
  }

  explain(context: AssignmentContext, result: RuleScoringResult): string {
    return result.explanation || 'No age information available';
  }
}
