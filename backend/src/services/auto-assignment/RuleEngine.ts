// WHY: Core rule evaluation engine for auto-assignment
// Manages registration and execution of pluggable assignment rules
// Separates hard constraints (must satisfy) from soft constraints (scoring)

import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from './rules/IAssignmentRule';

/**
 * Combined evaluation result from all rules
 */
export interface RuleEngineResult {
  valid: boolean;                        // Overall validation (all hard constraints passed)
  score: number;                         // Overall score (0-100) from soft constraints
  validationResults: Map<string, RuleValidationResult>;
  scoringResults: Map<string, RuleScoringResult>;
  rejectionReason?: string;              // Why assignment was rejected
  scoreBreakdown: Record<string, number>; // Per-rule contribution to final score
}

/**
 * Rule engine that evaluates assignment rules
 * 
 * Supports:
 * - Hard constraints: Must be satisfied (reject assignment if violated)
 * - Soft constraints: Contribute to assignment quality score
 * - Rule priority ordering
 * - Weighted scoring
 * - Detailed explanations
 */
export class RuleEngine {
  private rules: Map<string, IAssignmentRule> = new Map();

  /**
   * Register a rule with the engine
   * 
   * @param rule - Rule to register
   */
  registerRule(rule: IAssignmentRule): void {
    if (this.rules.has(rule.name)) {
      throw new Error(`Rule with name "${rule.name}" is already registered`);
    }
    this.rules.set(rule.name, rule);
  }

  /**
   * Register multiple rules at once
   * 
   * @param rules - Array of rules to register
   */
  registerRules(rules: IAssignmentRule[]): void {
    rules.forEach(rule => this.registerRule(rule));
  }

  /**
   * Get a registered rule by name
   * 
   * @param name - Rule name
   * @returns The rule, or undefined if not found
   */
  getRule(name: string): IAssignmentRule | undefined {
    return this.rules.get(name);
  }

  /**
   * Get all registered rules
   * 
   * @returns Array of all rules
   */
  getAllRules(): IAssignmentRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get enabled rules sorted by priority
   * 
   * @returns Array of enabled rules in priority order
   */
  getEnabledRules(): IAssignmentRule[] {
    return Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Evaluate all hard constraints for an assignment
   * 
   * Stops at first violation for efficiency
   * 
   * @param context - Assignment context
   * @returns Combined validation result
   */
  evaluateHardConstraints(context: AssignmentContext): {
    valid: boolean;
    reason?: string;
    violatedRule?: string;
    results: Map<string, RuleValidationResult>;
  } {
    const results = new Map<string, RuleValidationResult>();
    
    // Get enabled hard constraint rules, sorted by priority
    const hardRules = this.getEnabledRules().filter(rule => rule.isHardConstraint);
    
    for (const rule of hardRules) {
      const result = rule.validate(context);
      results.set(rule.name, result);
      
      // Stop at first violation
      if (!result.valid) {
        return {
          valid: false,
          reason: result.reason || `Violated rule: ${rule.name}`,
          violatedRule: rule.name,
          results
        };
      }
    }
    
    return { valid: true, results };
  }

  /**
   * Score an assignment using all soft constraints
   * 
   * Combines weighted scores from all enabled soft constraint rules
   * 
   * @param context - Assignment context
   * @returns Combined scoring result
   */
  scoreSoftConstraints(context: AssignmentContext): {
    score: number;
    breakdown: Record<string, number>;
    results: Map<string, RuleScoringResult>;
  } {
    const results = new Map<string, RuleScoringResult>();
    const breakdown: Record<string, number> = {};
    
    // Get enabled soft constraint rules
    const softRules = this.getEnabledRules().filter(rule => !rule.isHardConstraint);
    
    if (softRules.length === 0) {
      return { score: 0, breakdown, results };
    }
    
    // Calculate total weight for normalization
    const totalWeight = softRules.reduce((sum, rule) => sum + rule.weight, 0);
    
    if (totalWeight === 0) {
      return { score: 0, breakdown, results };
    }
    
    // Score each rule and combine
    let weightedScore = 0;
    
    for (const rule of softRules) {
      const result = rule.score(context);
      results.set(rule.name, result);
      
      // Normalize score to 0-100 if needed
      const normalizedScore = Math.max(0, Math.min(100, result.score));
      
      // Calculate weighted contribution
      const contribution = (normalizedScore * rule.weight) / totalWeight;
      weightedScore += contribution;
      breakdown[rule.name] = contribution;
    }
    
    return {
      score: Math.round(weightedScore * 100) / 100, // Round to 2 decimal places
      breakdown,
      results
    };
  }

  /**
   * Evaluate both hard and soft constraints
   * 
   * @param context - Assignment context
   * @returns Complete evaluation result
   */
  evaluate(context: AssignmentContext): RuleEngineResult {
    // First check hard constraints
    const hardResult = this.evaluateHardConstraints(context);
    
    if (!hardResult.valid) {
      return {
        valid: false,
        score: 0,
        validationResults: hardResult.results,
        scoringResults: new Map(),
        rejectionReason: hardResult.reason,
        scoreBreakdown: {}
      };
    }
    
    // If valid, calculate soft constraint score
    const softResult = this.scoreSoftConstraints(context);
    
    return {
      valid: true,
      score: softResult.score,
      validationResults: hardResult.results,
      scoringResults: softResult.results,
      scoreBreakdown: softResult.breakdown
    };
  }

  /**
   * Generate human-readable explanation for an evaluation
   * 
   * @param context - Assignment context
   * @param result - Evaluation result
   * @returns Explanation text
   */
  explainDecision(context: AssignmentContext, result: RuleEngineResult): string {
    const lines: string[] = [];
    
    lines.push(`Assignment: ${context.attendee.fullName} → Room ${context.room.floor.building.name}`);
    lines.push(`Overall: ${result.valid ? 'ACCEPTED' : 'REJECTED'} (Score: ${result.score}/100)`);
    lines.push('');
    
    // Explain hard constraints
    if (result.validationResults.size > 0) {
      lines.push('Hard Constraints:');
      result.validationResults.forEach((validationResult, ruleName) => {
        const rule = this.rules.get(ruleName);
        if (rule) {
          const explanation = rule.explain(context, validationResult);
          const status = validationResult.valid ? '✓' : '✗';
          lines.push(`  ${status} ${rule.description}: ${explanation}`);
        }
      });
      lines.push('');
    }
    
    // Explain soft constraints
    if (result.scoringResults.size > 0) {
      lines.push('Soft Constraints (Score Contributions):');
      result.scoringResults.forEach((scoringResult, ruleName) => {
        const rule = this.rules.get(ruleName);
        if (rule) {
          const contribution = result.scoreBreakdown[ruleName] || 0;
          const explanation = rule.explain(context, scoringResult);
          lines.push(`  ${rule.description}: ${scoringResult.score}/100 (weight: ${contribution.toFixed(2)}) - ${explanation}`);
        }
      });
    }
    
    return lines.join('\n');
  }

  /**
   * Clear all registered rules
   */
  clear(): void {
    this.rules.clear();
  }

  /**
   * Get statistics about registered rules
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    hardConstraints: number;
    softConstraints: number;
  } {
    const all = this.getAllRules();
    return {
      total: all.length,
      enabled: all.filter(r => r.enabled).length,
      disabled: all.filter(r => !r.enabled).length,
      hardConstraints: all.filter(r => r.isHardConstraint).length,
      softConstraints: all.filter(r => !r.isHardConstraint).length
    };
  }
}
