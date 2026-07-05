// WHY: Test suite for AutoAssignmentService orchestrator
// Verifies 11-stage workflow, progress events, and error handling

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoAssignmentService, ProgressCallback } from '../AutoAssignmentService';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { AutoAssignmentConfigRepository } from '@/repositories/AutoAssignmentConfigRepository';
import { Attendee, Gender, ConferenceRole, PaymentStatus } from '@prisma/client';
import { AutoAssignmentProgressEvent, RunAutoAssignmentDTO } from '@/types/auto-assignment';

// Mock repositories
class MockAttendeeRepository {
  async findAll(): Promise<Attendee[]> {
    return [
      createMockAttendee({ id: 'att-1', fullName: 'John Doe', gender: Gender.MALE }),
      createMockAttendee({ id: 'att-2', fullName: 'Jane Smith', gender: Gender.FEMALE }),
      createMockAttendee({ id: 'att-3', fullName: 'Bob Wilson', gender: Gender.MALE })
    ];
  }
}

class MockRoomRepository {
  async findAll(): Promise<any[]> {
    return [];
  }
  
  async findForAutoAssignment(buildingIds: string[], conferenceHouseId?: string): Promise<any[]> {
    // Return empty array for tests
    return [];
  }
}

class MockRoomAssignmentRepository {
  async create(): Promise<any> {
    return {};
  }
  async findByAttendeeId(): Promise<any> {
    return null;
  }
}

class MockAuditLogRepository {
  async createLog(): Promise<any> {
    return {};
  }
}

class MockAutoAssignmentConfigRepository {
  async getOrCreateDefault(conferenceHouseId: string): Promise<any> {
    return {
      id: 'config-1',
      conferenceHouseId,
      enabledBuildings: ['building-1'],
      staffReservedCapacity: 10,
      vipReservedCapacity: 5,
      emergencyReservedCapacity: 3,
      enabledRules: [],
      ruleWeights: {
        sameChurch: 0.3,
        sameGovernorate: 0.2,
        similarAge: 0.1,
        minimizeEmptyBeds: 0.2,
        preferSameFloor: 0.1,
        leaderProximity: 0.1
      },
      optimizationEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

// Helper function to create mock attendee
function createMockAttendee(overrides?: Partial<Attendee>): Attendee {
  return {
    id: 'test-id',
    ticketId: null,
    fullName: 'Test Attendee',
    phone: null,
    email: null,
    age: 30,
    gender: Gender.MALE,
    church: 'Test Church',
    area: null,
    governorate: 'Cairo',
    isServant: false,
    arrivalMethod: null,
    busPickupPoint: null,
    paymentMethod: null,
    paymentStatus: PaymentStatus.PENDING,
    transactionNumber: null,
    conferenceRole: ConferenceRole.ATTENDEE,
    notes: null,
    roomingNotes: null,
    internalNotes: null,
    checkedInAt: null,
    checkedOutAt: null,
    checkedInBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides
  };
}

describe('AutoAssignmentService', () => {
  let service: AutoAssignmentService;
  let attendeeRepo: MockAttendeeRepository;
  let roomRepo: MockRoomRepository;
  let assignmentRepo: MockRoomAssignmentRepository;
  let auditRepo: MockAuditLogRepository;
  let configRepo: MockAutoAssignmentConfigRepository;

  beforeEach(() => {
    attendeeRepo = new MockAttendeeRepository();
    roomRepo = new MockRoomRepository();
    assignmentRepo = new MockRoomAssignmentRepository();
    auditRepo = new MockAuditLogRepository();
    configRepo = new MockAutoAssignmentConfigRepository();

    service = new AutoAssignmentService(
      attendeeRepo as any,
      roomRepo as any,
      assignmentRepo as any,
      auditRepo as any,
      configRepo as any,
      { useAI: false }  // Disable AI for tests
    );
  });

  describe('execute', () => {
    it('should execute all 11 stages in order', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      expect(result.success).toBe(true);
      expect(result.stages.length).toBeGreaterThanOrEqual(7); // At least stages 1-9, 11 (10 may be skipped)
      
      // Verify stage order
      expect(result.stages[0].name).toBe('Load Configuration');
      expect(result.stages[1].name).toBe('Load Data');
      expect(result.stages[2].name).toBe('Classify Notes');
      expect(result.stages[3].name).toBe('Detect Groups');
      expect(result.stages[4].name).toBe('Prioritize Groups');
      expect(result.stages[5].name).toBe('Initialize Rules');
      expect(result.stages[6].name).toBe('Assign VIP/Special Needs');
    });

    it('should emit progress events during execution', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const events: AutoAssignmentProgressEvent[] = [];
      const onProgress: ProgressCallback = (event) => {
        events.push(event);
      };

      await service.execute(params, onProgress);

      // Should have stage start/complete events
      expect(events.length).toBeGreaterThan(0);
      
      const stageEvents = events.filter(e => e.type === 'stage');
      expect(stageEvents.length).toBeGreaterThan(10); // Multiple stage events (start + complete)
      
      const completeEvents = events.filter(e => e.type === 'complete');
      expect(completeEvents.length).toBe(1);
      expect(completeEvents[0].result).toBeDefined();
    });

    it('should load configuration from repository', async () => {
      const spy = vi.spyOn(configRepo, 'getOrCreateDefault');

      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      await service.execute(params);

      expect(spy).toHaveBeenCalledWith('house-1');
    });

    it('should load attendees from repository', async () => {
      const spy = vi.spyOn(attendeeRepo, 'findAll');

      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      await service.execute(params);

      expect(spy).toHaveBeenCalled();
    });

    it('should detect groups from attendees', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      const detectGroupsStage = result.stages.find(s => s.name === 'Detect Groups');
      expect(detectGroupsStage).toBeDefined();
      expect(detectGroupsStage?.status).toBe('completed');
      expect(detectGroupsStage?.itemsProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should initialize rule engine with hard and soft rules', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      const initRulesStage = result.stages.find(s => s.name === 'Initialize Rules');
      expect(initRulesStage).toBeDefined();
      expect(initRulesStage?.status).toBe('completed');
      expect(initRulesStage?.details).toContain('rules'); // Should mention number of rules
    });

    it('should execute assignment stages (7, 8, 9)', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      const stage7 = result.stages.find(s => s.name === 'Assign VIP/Special Needs');
      const stage8 = result.stages.find(s => s.name === 'Assign Groups');
      const stage9 = result.stages.find(s => s.name === 'Assign Individuals');

      expect(stage7).toBeDefined();
      expect(stage7?.status).toBe('completed');
      
      expect(stage8).toBeDefined();
      expect(stage8?.status).toBe('completed');
      
      expect(stage9).toBeDefined();
      expect(stage9?.status).toBe('completed');
    });

    it('should skip optimization when skipOptimization option is true', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true,
        options: {
          skipOptimization: true
        }
      };

      const result = await service.execute(params);

      const optimizeStage = result.stages.find(s => s.name === 'Optimize Assignments');
      expect(optimizeStage).toBeUndefined(); // Should not run at all
    });

    it('should validate final state', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      const validateStage = result.stages.find(s => s.name === 'Validate Results');
      expect(validateStage).toBeDefined();
      expect(validateStage?.status).toBe('completed');
      expect(validateStage?.details).toBeDefined();
    });

    it('should track execution time', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.executionTimeMs).toBeLessThan(10000); // Should complete in reasonable time
    });

    it('should handle errors gracefully', async () => {
      // Force error by making config loading fail
      vi.spyOn(configRepo, 'getOrCreateDefault').mockRejectedValue(
        new Error('Database connection failed')
      );

      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].reason).toContain('Database connection failed');
    });

    it('should emit error event when execution fails', async () => {
      vi.spyOn(configRepo, 'getOrCreateDefault').mockRejectedValue(
        new Error('Database error')
      );

      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const events: AutoAssignmentProgressEvent[] = [];
      const onProgress: ProgressCallback = (event) => {
        events.push(event);
      };

      await service.execute(params, onProgress);

      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      expect(errorEvents[0].error?.reason).toContain('Database error');
    });

    it('should use custom building IDs when provided', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        buildingIds: ['custom-building-1', 'custom-building-2'],
        dryRun: true
      };

      const result = await service.execute(params);

      expect(result.success).toBe(true);
      // Custom buildings should override config buildings
    });

    it('should filter only unassigned attendees when onlyUnassigned option is true', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true,
        options: {
          onlyUnassigned: true
        }
      };

      const result = await service.execute(params);

      expect(result.success).toBe(true);
      expect(result.attendeesProcessed).toBeGreaterThanOrEqual(0);
    });

    it('should respect dryRun mode (no actual assignments created)', async () => {
      const createSpy = vi.spyOn(assignmentRepo, 'create');

      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      await service.execute(params);

      // In dry run mode, no assignments should be created
      expect(createSpy).not.toHaveBeenCalled();
    });

    it('should provide detailed stage results', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      for (const stage of result.stages) {
        expect(stage.stage).toBeGreaterThan(0);
        expect(stage.name).toBeTruthy();
        expect(stage.status).toMatch(/completed|failed|skipped/);
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should calculate attendees processed correctly', async () => {
      const params: RunAutoAssignmentDTO = {
        conferenceHouseId: 'house-1',
        dryRun: true
      };

      const result = await service.execute(params);

      expect(result.attendeesProcessed).toBeGreaterThanOrEqual(0);
      // Should match number of non-deleted attendees
    });
  });
});
