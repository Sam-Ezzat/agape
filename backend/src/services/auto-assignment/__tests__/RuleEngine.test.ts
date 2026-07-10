// WHY: Unit tests for RuleEngine core functionality
// Ensures rule registration, evaluation, and scoring work correctly

import { RuleEngine } from '../RuleEngine';
import {
  IAssignmentRule,
  RulePriority,
  RuleValidationResult,
  RuleScoringResult,
  AssignmentContext
} from '../rules/IAssignmentRule';
import { Gender, ConferenceRole } from '@prisma/client';

// Mock rule implementation for testing
class MockHardConstraintRule implements IAssignmentRule {
  name = 'mock_hard';
  description = 'Mock hard constraint';
  priority = RulePriority.CRITICAL;
  weight = 0;
  isHardConstraint = true;
  enabled = true;
  
  shouldPass: boolean;
  
  constructor(shouldPass: boolean = true) {
    this.shouldPass = shouldPass;
  }
  
  validate(context: AssignmentContext): RuleValidationResult {
    return {
      valid: this.shouldPass,
      reason: this.shouldPass ? undefined : 'Mock validation failed'
    };
  }
  
  score(context: AssignmentContext): RuleScoringResult {
    return { score: 0 };
  }
  
  explain(context: AssignmentContext, result: any): string {
    return this.shouldPass ? 'Passed' : 'Failed';
  }
}

class MockSoftConstraintRule implements IAssignmentRule {
  name = 'mock_soft';
  description = 'Mock soft constraint';
  priority = RulePriority.MEDIUM;
  weight = 0.5;
  isHardConstraint = false;
  enabled = true;
  
  mockScore: number;
  
  constructor(mockScore: number = 100) {
    this.mockScore = mockScore;
  }
  
  validate(context: AssignmentContext): RuleValidationResult {
    return { valid: true };
  }
  
  score(context: AssignmentContext): RuleScoringResult {
    return { score: this.mockScore, explanation: 'Mock score' };
  }
  
  explain(context: AssignmentContext, result: any): string {
    return `Score: ${this.mockScore}`;
  }
}

// Helper to create mock context
function createMockContext(): AssignmentContext {
  return {
    attendee: {
      id: 'attendee-1',
      fullName: 'Test Attendee',
      gender: Gender.MALE,
      conferenceRole: ConferenceRole.ATTENDEE,
      ticketId: null,
      phone: null,
      email: null,
      age: 25,
      church: 'Test Church',
      area: null,
      governorate: null,
      isServant: false,
      arrivalMethod: null,
      busPickupPoint: null,
      paymentMethod: null,
      paymentStatus: null,
      transactionNumber: null,
      notes: null,
      roomingNotes: null,
      internalNotes: null,
      checkedInAt: null,
      checkedOutAt: null,
      checkedInBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    },
    room: {
      id: 'room-1',
      floorId: 'floor-1',
      roomNumber: '101',
      capacity: 4,
      roomType: 'GENERAL',
      amenities: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      currentOccupancy: 2,
      currentAssignments: [],
      floor: {
        floorNumber: 1,
        building: {
          id: 'building-1',
          name: 'Building A',
          conferenceHouseId: 'house-1'
        }
      }
    }
  } as AssignmentContext;
}

describe('RuleEngine', () => {
  let engine: RuleEngine;
  
  beforeEach(() => {
    engine = new RuleEngine();
  });
  
  describe('Rule Registration', () => {
    it('should register a rule successfully', () => {
      const rule = new MockHardConstraintRule();
      engine.registerRule(rule);
      
      expect(engine.getRule('mock_hard')).toBe(rule);
    });
    
    it('should throw error when registering duplicate rule name', () => {
      const rule1 = new MockHardConstraintRule();
      const rule2 = new MockHardConstraintRule();
      
      engine.registerRule(rule1);
      
      expect(() => engine.registerRule(rule2)).toThrow('already registered');
    });
    
    it('should register multiple rules at once', () => {
      const rules = [
        new MockHardConstraintRule(),
        new MockSoftConstraintRule()
      ];
      
      engine.registerRules(rules);
      
      expect(engine.getAllRules()).toHaveLength(2);
    });
  });
  
  describe('Rule Retrieval', () => {
    it('should get all registered rules', () => {
      engine.registerRule(new MockHardConstraintRule());
      engine.registerRule(new MockSoftConstraintRule());
      
      expect(engine.getAllRules()).toHaveLength(2);
    });
    
    it('should get only enabled rules', () => {
      const rule1 = new MockHardConstraintRule();
      const rule2 = new MockSoftConstraintRule();
      rule2.enabled = false;
      
      engine.registerRules([rule1, rule2]);
      
      const enabled = engine.getEnabledRules();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe('mock_hard');
    });
    
    it('should sort enabled rules by priority', () => {
      const lowPriority = new MockSoftConstraintRule();
      lowPriority.priority = RulePriority.LOW;
      lowPriority.name = 'low';
      
      const highPriority = new MockHardConstraintRule();
      highPriority.priority = RulePriority.CRITICAL;
      highPriority.name = 'high';
      
      engine.registerRules([lowPriority, highPriority]);
      
      const enabled = engine.getEnabledRules();
      expect(enabled[0].name).toBe('high');
      expect(enabled[1].name).toBe('low');
    });
  });
  
  describe('Hard Constraint Evaluation', () => {
    it('should pass when all hard constraints are satisfied', () => {
      const rule = new MockHardConstraintRule(true);
      engine.registerRule(rule);
      
      const context = createMockContext();
      const result = engine.evaluateHardConstraints(context);
      
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });
    
    it('should fail when any hard constraint is violated', () => {
      const passingRule = new MockHardConstraintRule(true);
      passingRule.name = 'passing';
      
      const failingRule = new MockHardConstraintRule(false);
      failingRule.name = 'failing';
      
      engine.registerRules([passingRule, failingRule]);
      
      const context = createMockContext();
      const result = engine.evaluateHardConstraints(context);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Mock validation failed');
      expect(result.violatedRule).toBe('failing');
    });
    
    it('should stop at first violation for efficiency', () => {
      const rule1 = new MockHardConstraintRule(false);
      rule1.name = 'fail1';
      
      const rule2 = new MockHardConstraintRule(false);
      rule2.name = 'fail2';
      
      engine.registerRules([rule1, rule2]);
      
      const context = createMockContext();
      const result = engine.evaluateHardConstraints(context);
      
      // Should only evaluate first rule
      expect(result.results.size).toBe(1);
      expect(result.violatedRule).toBe('fail1');
    });
    
    it('should skip disabled hard constraints', () => {
      const rule = new MockHardConstraintRule(false);
      rule.enabled = false;
      engine.registerRule(rule);
      
      const context = createMockContext();
      const result = engine.evaluateHardConstraints(context);
      
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Soft Constraint Scoring', () => {
    it('should calculate weighted score from soft constraints', () => {
      const rule1 = new MockSoftConstraintRule(100);
      rule1.name = 'soft1';
      rule1.weight = 0.6;
      
      const rule2 = new MockSoftConstraintRule(50);
      rule2.name = 'soft2';
      rule2.weight = 0.4;
      
      engine.registerRules([rule1, rule2]);
      
      const context = createMockContext();
      const result = engine.scoreSoftConstraints(context);
      
      // Expected: (100 * 0.6 + 50 * 0.4) / (0.6 + 0.4) / 100 = (60 + 20) / 1 / 100 = 0.8
      expect(result.score).toBe(0.8);
    });
    
    it('should return 0 when no soft constraints are registered', () => {
      const context = createMockContext();
      const result = engine.scoreSoftConstraints(context);
      
      expect(result.score).toBe(0);
    });
    
    it('should normalize scores to 0-1 range', () => {
      const rule = new MockSoftConstraintRule(150); // Out of range
      rule.weight = 1.0;
      engine.registerRule(rule);
      
      const context = createMockContext();
      const result = engine.scoreSoftConstraints(context);
      
      expect(result.score).toBe(1); // Capped at 1.0 (was 100, now 1.0 after dividing by 100)
    });
    
    it('should provide score breakdown by rule', () => {
      const rule1 = new MockSoftConstraintRule(100);
      rule1.name = 'soft1';
      rule1.weight = 1.0;
      
      engine.registerRule(rule1);
      
      const context = createMockContext();
      const result = engine.scoreSoftConstraints(context);
      
      expect(result.breakdown).toHaveProperty('soft1');
    });
  });
  
  describe('Complete Evaluation', () => {
    it('should return valid with score when all constraints pass', () => {
      const hardRule = new MockHardConstraintRule(true);
      const softRule = new MockSoftConstraintRule(80);
      
      engine.registerRules([hardRule, softRule]);
      
      const context = createMockContext();
      const result = engine.evaluate(context);
      
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });
    
    it('should return invalid with zero score when hard constraint fails', () => {
      const hardRule = new MockHardConstraintRule(false);
      const softRule = new MockSoftConstraintRule(100);
      
      engine.registerRules([hardRule, softRule]);
      
      const context = createMockContext();
      const result = engine.evaluate(context);
      
      expect(result.valid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.rejectionReason).toBeDefined();
    });
  });
  
  describe('Statistics', () => {
    it('should provide accurate rule statistics', () => {
      // Create new engine to avoid conflicts with other tests
      const statsEngine = new RuleEngine();
      
      const hardRule = new MockHardConstraintRule();
      hardRule.name = 'stats_hard';
      
      const softRule1 = new MockSoftConstraintRule();
      softRule1.name = 'stats_soft1';
      
      const softRule2 = new MockSoftConstraintRule();
      softRule2.name = 'stats_soft2';
      softRule2.enabled = false;
      
      statsEngine.registerRules([hardRule, softRule1, softRule2]);
      
      const stats = statsEngine.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
      expect(stats.hardConstraints).toBe(1);
      expect(stats.softConstraints).toBe(2);
    });
  });
  
  describe('Clear', () => {
    it('should clear all registered rules', () => {
      engine.registerRule(new MockHardConstraintRule());
      engine.registerRule(new MockSoftConstraintRule());
      
      engine.clear();
      
      expect(engine.getAllRules()).toHaveLength(0);
    });
  });
});
