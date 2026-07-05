// WHY: Hard constraint ensuring room's building is enabled in configuration
// Allows organizers to selectively use certain buildings for auto-assignment

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../IAssignmentRule';

/**
 * Validates that the room's building is enabled in the auto-assignment configuration
 * 
 * Allows organizers to exclude certain buildings from auto-assignment
 * (e.g., reserve buildings for specific groups, maintenance, etc.)
 */
export class BuildingEnabledRule implements IAssignmentRule {
  readonly name = 'building_enabled';
  readonly description = 'Room building must be enabled in configuration';
  readonly priority = RulePriority.HIGH;
  readonly weight = 0;
  readonly isHardConstraint = true;
  enabled = true;

  private enabledBuildings: Set<string>;

  /**
   * @param enabledBuildingIds - Array of building IDs that are enabled for auto-assignment
   */
  constructor(enabledBuildingIds: string[] = []) {
    this.enabledBuildings = new Set(enabledBuildingIds);
  }

  /**
   * Update the list of enabled buildings
   */
  setEnabledBuildings(buildingIds: string[]): void {
    this.enabledBuildings = new Set(buildingIds);
  }

  validate(context: AssignmentContext): RuleValidationResult {
    const { room } = context;
    const buildingId = room.floor.building.id;
    
    // If no buildings are configured, allow all (permissive default)
    if (this.enabledBuildings.size === 0) {
      return { valid: true };
    }
    
    // Check if building is in enabled list
    if (!this.enabledBuildings.has(buildingId)) {
      return {
        valid: false,
        reason: `Building "${room.floor.building.name}" is not enabled for auto-assignment`,
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
      const { room } = context;
      
      if (result.valid) {
        return `Building "${room.floor.building.name}" is enabled`;
      } else {
        return result.reason || 'Building is not enabled';
      }
    }
    return 'N/A';
  }
}
