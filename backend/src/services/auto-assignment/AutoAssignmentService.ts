// WHY: Main orchestrator for auto-assignment system
// Coordinates all components: classifiers, group detection, rule engine, assignment execution
// Implements 11-stage workflow with progress tracking and validation

import { Attendee, RoomAssignment, Gender } from '@prisma/client';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { AutoAssignmentConfigRepository } from '@/repositories/AutoAssignmentConfigRepository';
import { RoomingNotesClassifier } from './RoomingNotesClassifier';
import { GroupDetectionService } from './GroupDetectionService';
import { RuleEngine } from './RuleEngine';
import { AssignmentContext } from './rules/IAssignmentRule';
import {
  AttendeeGroup,
  GroupType,
  AutoAssignmentExecutionResult,
  AutoAssignmentProgressEvent,
  AssignmentResult,
  ValidationError,
  StageResult,
  RunAutoAssignmentDTO
} from '@/types/auto-assignment';

// Import hard constraint rules
import { RoomCapacityRule } from './rules/hard/RoomCapacityRule';
import { GenderMatchRule } from './rules/hard/GenderMatchRule';
import { RoomTypeMatchRule } from './rules/hard/RoomTypeMatchRule';
import { RoomAvailabilityRule } from './rules/hard/RoomAvailabilityRule';
import { BuildingEnabledRule } from './rules/hard/BuildingEnabledRule';

// Import soft constraint rules
import { SameChurchRule } from './rules/soft/SameChurchRule';
import { SameGovernorateRule } from './rules/soft/SameGovernorateRule';
import { SimilarAgeRule } from './rules/soft/SimilarAgeRule';
import { MinimizeEmptyBedsRule } from './rules/soft/MinimizeEmptyBedsRule';
import { PreferSameFloorRule } from './rules/soft/PreferSameFloorRule';
import { LeaderProximityRule } from './rules/soft/LeaderProximityRule';

export type ProgressCallback = (event: AutoAssignmentProgressEvent) => void;

interface RoomWithDetails {
  id: string;
  roomNumber: string;
  roomType: 'GENERAL' | 'VIP' | 'FAMILY';
  capacity: number;
  floorId: string;
  amenities: any; // JsonValue from Prisma
  currentOccupancy: number;
  currentAssignments: RoomAssignment[];
  floor: {
    floorNumber: number;
    building: {
      id: string;
      name: string;
      conferenceHouseId: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Auto-Assignment Service Orchestrator
 * 
 * Implements 11-stage workflow:
 * 1. Load configuration and rooms
 * 2. Load unassigned attendees
 * 3. Classify rooming notes (AI-powered)
 * 4. Detect groups (roommate, family, church)
 * 5. Prioritize groups by constraints
 * 6. Initialize rule engine
 * 7. Assign VIP/special needs first
 * 8. Assign groups (keep together)
 * 9. Assign individuals
 * 10. Run optimization pass (if enabled)
 * 11. Validate final state
 */
export class AutoAssignmentService {
  private classifier: RoomingNotesClassifier;
  private groupDetector: GroupDetectionService;
  private engine: RuleEngine;

  constructor(
    private attendeeRepository: AttendeeRepository,
    private roomRepository: RoomRepository,
    private assignmentRepository: RoomAssignmentRepository,
    private auditLogRepository: AuditLogRepository,
    private configRepository: AutoAssignmentConfigRepository,
    options?: {
      useAI?: boolean;  // Allow disabling AI for tests
    }
  ) {
    this.classifier = new RoomingNotesClassifier({ 
      useAI: options?.useAI !== false  // Default to true, but allow override
    });
    this.groupDetector = new GroupDetectionService(this.classifier);
    this.engine = new RuleEngine();
  }

  /**
   * Execute auto-assignment workflow
   * 
   * @param params - Execution parameters
   * @param onProgress - Optional callback for progress events
   * @returns Execution result with assignments and errors
   */
  async execute(
    params: RunAutoAssignmentDTO,
    onProgress?: ProgressCallback
  ): Promise<AutoAssignmentExecutionResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      // Stage 1: Load configuration
      const stage1Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 1, name: 'Load Configuration', status: 'started' }
      });

      const config = await this.configRepository.getOrCreateDefault(params.conferenceHouseId);
      const enabledBuildings = params.buildingIds || config.enabledBuildings;

      stages.push({
        stage: 1,
        name: 'Load Configuration',
        status: 'completed',
        durationMs: Date.now() - stage1Start,
        details: `Loaded config for ${params.conferenceHouseId}`
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 1, name: 'Load Configuration', status: 'completed' }
      });

      // Stage 2: Load attendees and rooms
      const stage2Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 2, name: 'Load Data', status: 'started' }
      });

      const allAttendees = await this.attendeeRepository.findAll();
      const availableRooms = await this.loadAvailableRooms(enabledBuildings);
      
      // Filter out deleted attendees
      let unassignedAttendees = allAttendees.filter(a => !a.deletedAt);
      
      // If onlyUnassigned option is set, filter out attendees with existing assignments
      if (params.options?.onlyUnassigned) {
        const assignedAttendeeIds = new Set<string>();
        
        // Collect all currently assigned attendee IDs from room assignments
        for (const room of availableRooms) {
          for (const assignment of room.currentAssignments) {
            assignedAttendeeIds.add(assignment.attendeeId);
          }
        }
        
        // Filter out assigned attendees
        unassignedAttendees = unassignedAttendees.filter(
          a => !assignedAttendeeIds.has(a.id)
        );
      }

      stages.push({
        stage: 2,
        name: 'Load Data',
        status: 'completed',
        durationMs: Date.now() - stage2Start,
        details: `${unassignedAttendees.length} attendees, ${availableRooms.length} rooms`
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 2, name: 'Load Data', status: 'completed' }
      });

      // Stage 3: Classify rooming notes
      const stage3Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 3, name: 'Classify Notes', status: 'started' }
      });

      // Classification happens inside group detector
      // Already integrated in GroupDetectionService

      stages.push({
        stage: 3,
        name: 'Classify Notes',
        status: 'completed',
        durationMs: Date.now() - stage3Start,
        details: 'AI-powered note classification complete'
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 3, name: 'Classify Notes', status: 'completed' }
      });

      // Stage 4: Detect groups
      const stage4Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 4, name: 'Detect Groups', status: 'started' }
      });

      const groups = this.groupDetector.detectGroups(unassignedAttendees);

      stages.push({
        stage: 4,
        name: 'Detect Groups',
        status: 'completed',
        durationMs: Date.now() - stage4Start,
        details: `Detected ${groups.length} groups`,
        itemsProcessed: groups.length
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 4, name: 'Detect Groups', status: 'completed' }
      });

      // Stage 5: Sort groups by priority
      const stage5Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 5, name: 'Prioritize Groups', status: 'started' }
      });

      const sortedGroups = this.sortGroupsByPriority(groups);

      stages.push({
        stage: 5,
        name: 'Prioritize Groups',
        status: 'completed',
        durationMs: Date.now() - stage5Start,
        details: `Sorted ${sortedGroups.length} groups by priority`
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 5, name: 'Prioritize Groups', status: 'completed' }
      });

      // Stage 6: Initialize rule engine
      const stage6Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 6, name: 'Initialize Rules', status: 'started' }
      });

      this.initializeRuleEngine(config, enabledBuildings);

      stages.push({
        stage: 6,
        name: 'Initialize Rules',
        status: 'completed',
        durationMs: Date.now() - stage6Start,
        details: `Registered ${this.engine['rules'].size} rules`
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 6, name: 'Initialize Rules', status: 'completed' }
      });

      // Stage 7-9: Execute assignments
      const assignmentStart = Date.now();
      const assignmentResults = await this.executeAssignments(
        sortedGroups,
        availableRooms,
        allAttendees,
        params.dryRun || false,
        onProgress
      );

      assignments.push(...assignmentResults.assignments);
      errors.push(...assignmentResults.errors);
      warnings.push(...assignmentResults.warnings);

      stages.push(...assignmentResults.stages);

      // Stage 10: Optimization (if enabled)
      if (config.optimizationEnabled && !params.options?.skipOptimization) {
        const stage10Start = Date.now();
        this.emitProgress(onProgress, {
          type: 'stage',
          stage: { number: 10, name: 'Optimize Assignments', status: 'started' }
        });

        // TODO: Implement optimization pass in future phase
        // For now, skip optimization

        stages.push({
          stage: 10,
          name: 'Optimize Assignments',
          status: 'skipped',
          durationMs: Date.now() - stage10Start,
          details: 'Optimization not yet implemented'
        });

        this.emitProgress(onProgress, {
          type: 'stage',
          stage: { number: 10, name: 'Optimize Assignments', status: 'completed' }
        });
      }

      // Stage 11: Final validation
      const stage11Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 11, name: 'Validate Results', status: 'started' }
      });

      const validationResult = this.validateFinalState(assignments, errors);

      stages.push({
        stage: 11,
        name: 'Validate Results',
        status: 'completed',
        durationMs: Date.now() - stage11Start,
        details: validationResult
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 11, name: 'Validate Results', status: 'completed' }
      });

      // Build result
      // Success = workflow completed all stages (even if no assignments made)
      // Failure = only if system crash/exception occurred
      const result: AutoAssignmentExecutionResult = {
        success: true,  // Workflow completed successfully
        assignmentsCreated: assignments.length,
        attendeesProcessed: unassignedAttendees.length,
        errors,
        warnings,
        assignments,
        executionTimeMs: Date.now() - startTime,
        stages
      };

      // Emit completion event
      this.emitProgress(onProgress, {
        type: 'complete',
        result
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      this.emitProgress(onProgress, {
        type: 'error',
        error: {
          attendeeId: '',
          attendeeName: 'System',
          reason: errorMessage,
          violatedRule: 'System',
          severity: 'error'
        }
      });

      return {
        success: false,
        assignmentsCreated: 0,
        attendeesProcessed: 0,
        errors: [{
          attendeeId: '',
          attendeeName: 'System',
          reason: errorMessage,
          violatedRule: 'System',
          severity: 'error'
        }],
        warnings: [],
        assignments: [],
        executionTimeMs: Date.now() - startTime,
        stages
      };
    }
  }

  /**
   * Load available rooms from enabled buildings
   */
  private async loadAvailableRooms(enabledBuildingIds: string[]): Promise<RoomWithDetails[]> {
    const rooms = await this.roomRepository.findForAutoAssignment(enabledBuildingIds);
    
    // Transform to RoomWithDetails format and calculate current occupancy
    return rooms.map(room => ({
      id: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType as 'GENERAL' | 'VIP' | 'FAMILY',
      capacity: room.capacity,
      floorId: room.floorId,
      amenities: room.amenities,
      currentOccupancy: room.assignments.length,
      currentAssignments: room.assignments,
      floor: {
        floorNumber: room.floor.floorNumber,
        building: {
          id: room.floor.building.id,
          name: room.floor.building.name,
          conferenceHouseId: room.floor.building.conferenceHouseId
        }
      },
      createdAt: room.createdAt,
      updatedAt: room.updatedAt
    }));
  }

  /**
   * Sort groups by priority (highest first)
   * Priority factors: medical needs, VIP, wheelchair, group size
   */
  private sortGroupsByPriority(groups: AttendeeGroup[]): AttendeeGroup[] {
    return [...groups].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Initialize rule engine with all hard and soft constraint rules
   */
  private initializeRuleEngine(config: any, enabledBuildings: string[]): void {
    // Clear any previously registered rules to avoid duplicates
    this.engine.clear();

    // Register hard constraint rules
    this.engine.registerRule(new RoomCapacityRule());
    this.engine.registerRule(new GenderMatchRule());
    this.engine.registerRule(new RoomTypeMatchRule());
    this.engine.registerRule(new RoomAvailabilityRule());
    this.engine.registerRule(new BuildingEnabledRule(enabledBuildings));

    // Register soft constraint rules with configured weights
    const weights = config.ruleWeights || {};
    this.engine.registerRule(new SameChurchRule(weights.sameChurch || 0.3));
    this.engine.registerRule(new SameGovernorateRule(weights.sameGovernorate || 0.2));
    this.engine.registerRule(new SimilarAgeRule(weights.similarAge || 0.1));
    this.engine.registerRule(new MinimizeEmptyBedsRule(weights.minimizeEmptyBeds || 0.2));
    this.engine.registerRule(new PreferSameFloorRule(weights.preferSameFloor || 0.1));
    this.engine.registerRule(new LeaderProximityRule(weights.leaderProximity || 0.1));
  }

  /**
   * Execute assignment stages 7-9
   * Stage 7: VIP/special needs
   * Stage 8: Groups
   * Stage 9: Individuals
   */
  private async executeAssignments(
    groups: AttendeeGroup[],
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    dryRun: boolean,
    onProgress?: ProgressCallback
  ): Promise<{
    assignments: AssignmentResult[];
    errors: ValidationError[];
    warnings: ValidationError[];
    stages: StageResult[];
  }> {
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const stages: StageResult[] = [];

    // Stage 7: Assign VIP and special needs first
    const stage7Start = Date.now();
    this.emitProgress(onProgress, {
      type: 'stage',
      stage: { number: 7, name: 'Assign VIP/Special Needs', status: 'started' }
    });

    const specialGroups = groups.filter(g => 
      g.constraints.requiredRoomType === 'VIP' ||
      g.constraints.requiresAccessibility ||
      g.constraints.requiresGroundFloor
    );

    for (const group of specialGroups) {
      const result = await this.assignGroup(group, rooms, allAttendees, dryRun, onProgress);
      assignments.push(...result.assignments);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    stages.push({
      stage: 7,
      name: 'Assign VIP/Special Needs',
      status: 'completed',
      durationMs: Date.now() - stage7Start,
      itemsProcessed: specialGroups.length
    });

    this.emitProgress(onProgress, {
      type: 'stage',
      stage: { number: 7, name: 'Assign VIP/Special Needs', status: 'completed' }
    });

    // Stage 8: Assign regular groups
    const stage8Start = Date.now();
    this.emitProgress(onProgress, {
      type: 'stage',
      stage: { number: 8, name: 'Assign Groups', status: 'started' }
    });

    const regularGroups = groups.filter(g => 
      !specialGroups.includes(g) && g.type !== GroupType.INDIVIDUAL
    );

    for (const group of regularGroups) {
      const result = await this.assignGroup(group, rooms, allAttendees, dryRun, onProgress);
      assignments.push(...result.assignments);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    stages.push({
      stage: 8,
      name: 'Assign Groups',
      status: 'completed',
      durationMs: Date.now() - stage8Start,
      itemsProcessed: regularGroups.length
    });

    this.emitProgress(onProgress, {
      type: 'stage',
      stage: { number: 8, name: 'Assign Groups', status: 'completed' }
    });

    // Stage 9: Assign individuals
    const stage9Start = Date.now();
    this.emitProgress(onProgress, {
      type: 'stage',
      stage: { number: 9, name: 'Assign Individuals', status: 'started' }
    });

    const individuals = groups.filter(g => g.type === GroupType.INDIVIDUAL);

    for (const group of individuals) {
      const result = await this.assignGroup(group, rooms, allAttendees, dryRun, onProgress);
      assignments.push(...result.assignments);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    stages.push({
      stage: 9,
      name: 'Assign Individuals',
      status: 'completed',
      durationMs: Date.now() - stage9Start,
      itemsProcessed: individuals.length
    });

    this.emitProgress(onProgress, {
      type: 'stage',
      stage: { number: 9, name: 'Assign Individuals', status: 'completed' }
    });

    return { assignments, errors, warnings, stages };
  }

  /**
   * Assign a single group to rooms
   * Attempts to find best-scoring valid assignments for all members
   */
  private async assignGroup(
    group: AttendeeGroup,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    dryRun: boolean,
    onProgress?: ProgressCallback
  ): Promise<{
    assignments: AssignmentResult[];
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Determine preferred floor for this group (if applicable)
    const preferredFloorId = this.determinePreferredFloor(group, rooms);
    
    // Determine leader preferred floor (if group has leaders)
    const leaderPreferredFloorId = this.determineLeaderPreferredFloor(group, rooms);

    // Try to assign each member of the group
    for (const attendee of group.members) {
      try {
        // Find candidate rooms that pass hard constraints
        const candidateRooms = this.findCandidateRooms(attendee, rooms, allAttendees);

        if (candidateRooms.length === 0) {
          errors.push({
            attendeeId: attendee.id,
            attendeeName: attendee.fullName,
            reason: 'No available rooms match hard constraints',
            violatedRule: 'System',
            severity: 'error'
          });
          continue;
        }

        // Score each candidate room with soft constraints
        const scoredRooms = this.scoreRooms(
          attendee,
          candidateRooms,
          allAttendees,
          preferredFloorId,
          leaderPreferredFloorId
        );

        if (scoredRooms.length === 0) {
          errors.push({
            attendeeId: attendee.id,
            attendeeName: attendee.fullName,
            reason: 'No rooms passed validation',
            violatedRule: 'System',
            severity: 'error'
          });
          continue;
        }

        // Select best-scoring room
        const bestMatch = scoredRooms[0]; // Already sorted by score (highest first)

        // Create assignment (if not dry run)
        if (!dryRun) {
          await this.createAssignment(attendee.id, bestMatch.room.id);
          
          // Update room occupancy in memory for subsequent assignments
          bestMatch.room.currentOccupancy++;
          bestMatch.room.currentAssignments.push({
            id: `temp-${attendee.id}`,
            attendeeId: attendee.id,
            roomId: bestMatch.room.id,
            assignedAt: new Date(),
            assignedBy: 'auto-assignment',
            isLocked: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }

        // Record successful assignment
        assignments.push({
          attendeeId: attendee.id,
          roomId: bestMatch.room.id,
          score: bestMatch.score,
          appliedRules: bestMatch.appliedRules,
          warnings: bestMatch.score < 50 ? ['Low quality score'] : undefined
        });

        // Emit progress event
        this.emitProgress(onProgress, {
          type: 'assignment',
          assignment: {
            attendeeId: attendee.id,
            attendeeName: attendee.fullName,
            roomId: bestMatch.room.id,
            roomNumber: bestMatch.room.roomNumber
          }
        });

        // Add warning if score is low
        if (bestMatch.score < 50) {
          warnings.push({
            attendeeId: attendee.id,
            attendeeName: attendee.fullName,
            reason: `Low assignment quality score: ${bestMatch.score.toFixed(1)}`,
            violatedRule: 'Quality',
            severity: 'warning'
          });
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          attendeeId: attendee.id,
          attendeeName: attendee.fullName,
          reason: errorMessage,
          violatedRule: 'System',
          severity: 'error'
        });
      }
    }

    return { assignments, errors, warnings };
  }

  /**
   * Find candidate rooms that pass all hard constraints
   */
  private findCandidateRooms(
    attendee: Attendee,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[]
  ): RoomWithDetails[] {
    const candidates: RoomWithDetails[] = [];

    for (const room of rooms) {
      const context: AssignmentContext = {
        attendee,
        room,
        allAttendees
      };

      // Evaluate hard constraints
      const validation = this.engine.evaluateHardConstraints(context);
      
      if (validation.valid) {
        candidates.push(room);
      }
    }

    return candidates;
  }

  /**
   * Score candidate rooms using soft constraints
   * Returns rooms sorted by score (highest first)
   */
  private scoreRooms(
    attendee: Attendee,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    preferredFloorId?: string,
    leaderPreferredFloorId?: string
  ): Array<{ room: RoomWithDetails; score: number; appliedRules: string[] }> {
    const scored: Array<{ room: RoomWithDetails; score: number; appliedRules: string[] }> = [];

    for (const room of rooms) {
      const context: AssignmentContext = {
        attendee,
        room,
        allAttendees,
        configuration: {
          preferredFloorId,
          leaderPreferredFloorId
        }
      };

      // Score with soft constraints
      const result = this.engine.scoreSoftConstraints(context);
      
      scored.push({
        room,
        score: result.score,
        appliedRules: Array.from(result.results.keys())
      });
    }

    // Sort by score (highest first)
    return scored.sort((a, b) => b.score - a.score);
  }

  /**
   * Determine preferred floor for group members
   * Returns floor ID where most members are already assigned, or undefined
   */
  private determinePreferredFloor(
    group: AttendeeGroup,
    rooms: RoomWithDetails[]
  ): string | undefined {
    // Count floor occurrences for assigned group members
    const floorCounts = new Map<string, number>();
    
    for (const member of group.members) {
      // Find which room this member is currently assigned to
      const assignedRoom = rooms.find(room => 
        room.currentAssignments.some(assignment => assignment.attendeeId === member.id)
      );
      
      if (assignedRoom) {
        const count = floorCounts.get(assignedRoom.floorId) || 0;
        floorCounts.set(assignedRoom.floorId, count + 1);
      }
    }
    
    // Return the floor with the most group members, or undefined if none assigned
    if (floorCounts.size === 0) {
      return undefined;
    }
    
    let maxCount = 0;
    let preferredFloorId: string | undefined = undefined;
    
    for (const [floorId, count] of floorCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        preferredFloorId = floorId;
      }
    }
    
    return preferredFloorId;
  }

  /**
   * Determine preferred floor for leaders near their group
   * Returns floor ID where most group members are, or undefined
   */
  private determineLeaderPreferredFloor(
    group: AttendeeGroup,
    rooms: RoomWithDetails[]
  ): string | undefined {
    // Identify leaders in the group (by role or health issues)
    const leaders: Attendee[] = [];
    const nonLeaders: Attendee[] = [];
    
    for (const member of group.members) {
      const isLeader = 
        member.conferenceRole === 'LEADER' ||
        member.conferenceRole === 'PASTOR' ||
        member.conferenceRole === 'VIP' ||
        (member.age !== null && member.age !== undefined && member.age >= 65) || // Elderly
        (member.roomingNotes && this.hasHealthIssues(member.roomingNotes));
      
      if (isLeader) {
        leaders.push(member);
      } else {
        nonLeaders.push(member);
      }
    }
    
    // If no leaders or no non-leaders, return undefined
    if (leaders.length === 0 || nonLeaders.length === 0) {
      return undefined;
    }
    
    // Count floor occurrences for non-leader members
    const floorCounts = new Map<string, number>();
    
    for (const member of nonLeaders) {
      const assignedRoom = rooms.find(room => 
        room.currentAssignments.some(assignment => assignment.attendeeId === member.id)
      );
      
      if (assignedRoom) {
        const count = floorCounts.get(assignedRoom.floorId) || 0;
        floorCounts.set(assignedRoom.floorId, count + 1);
      }
    }
    
    // Return the floor with the most non-leader members
    if (floorCounts.size === 0) {
      return undefined;
    }
    
    let maxCount = 0;
    let preferredFloorId: string | undefined = undefined;
    
    for (const [floorId, count] of floorCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        preferredFloorId = floorId;
      }
    }
    
    return preferredFloorId;
  }
  
  /**
   * Check if rooming notes mention health issues
   */
  private hasHealthIssues(notes: string): boolean {
    if (!notes) return false;
    
    const healthKeywords = [
      // English
      'health', 'medical', 'condition', 'disease', 'illness', 'disability',
      'wheelchair', 'walker', 'cane', 'mobility', 'chronic',
      'diabetes', 'heart', 'blood pressure', 'asthma', 'arthritis',
      // Arabic
      'صحة', 'مرض', 'حالة', 'كرسي متحرك', 'عكاز', 'مزمن',
      'سكر', 'قلب', 'ضغط', 'ربو', 'مفاصل'
    ];
    
    const lowerNotes = notes.toLowerCase();
    return healthKeywords.some(keyword => lowerNotes.includes(keyword.toLowerCase()));
  }

  /**
   * Create room assignment in database
   */
  private async createAssignment(attendeeId: string, roomId: string): Promise<void> {
    await this.assignmentRepository.create({
      attendeeId,
      roomId,
      assignedBy: 'auto-assignment'
    });

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'assign',
      entityType: 'room_assignment',
      entityId: attendeeId,
      details: {
        attendeeId,
        roomId,
        assignedBy: 'auto-assignment',
        reason: 'Auto-assignment execution'
      },
      performedBy: 'system'
    });
  }

  /**
   * Validate final assignment state
   */
  private validateFinalState(
    assignments: AssignmentResult[],
    errors: ValidationError[]
  ): string {
    if (errors.length === 0 && assignments.length > 0) {
      return `Successfully assigned ${assignments.length} attendees with no errors`;
    } else if (errors.length > 0 && assignments.length > 0) {
      return `Assigned ${assignments.length} attendees with ${errors.length} errors`;
    } else if (errors.length > 0 && assignments.length === 0) {
      return `Failed to assign any attendees due to ${errors.length} errors`;
    } else {
      return 'No attendees to assign';
    }
  }

  /**
   * Emit progress event to callback
   */
  private emitProgress(
    callback: ProgressCallback | undefined,
    event: AutoAssignmentProgressEvent
  ): void {
    if (callback) {
      callback(event);
    }
  }
}
