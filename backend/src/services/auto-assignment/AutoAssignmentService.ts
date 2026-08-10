// WHY: Main orchestrator for auto-assignment system
// Coordinates all components: classifiers, hierarchical grouping, rule engine, assignment execution
// Implements new hierarchical workflow with 3-level grouping and smart room proximity

import { Attendee, RoomAssignment, Gender } from '@prisma/client';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { AutoAssignmentConfigRepository } from '@/repositories/AutoAssignmentConfigRepository';
import { RoomingNotesClassifier } from './RoomingNotesClassifier';
import { RoomingNotesCacheService } from './RoomingNotesCacheService';
import { HierarchicalGroupingService, AttendeeGroup as HierarchicalGroup } from './HierarchicalGroupingService';
import { RoomProximityMatcher, RoomWithDetails as ProximityRoom } from './RoomProximityMatcher';
import { AIGroupEnhancementService } from './AIGroupEnhancementService';
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
  RunAutoAssignmentDTO,
  ClassifiedNotes
} from '@/types/auto-assignment';
import logger from '@/utils/logger';
import { mapWithConcurrency } from '@/utils/concurrency';

// Import hard constraint rules
import { RoomCapacityRule } from './rules/hard/RoomCapacityRule';
import { GenderMatchRule } from './rules/hard/GenderMatchRule';
import { RoomTypeMatchRule } from './rules/hard/RoomTypeMatchRule';
import { RoomAvailabilityRule } from './rules/hard/RoomAvailabilityRule';
import { BuildingEnabledRule } from './rules/hard/BuildingEnabledRule';
import { LeaderReservedCapacityRule } from './rules/hard/LeaderReservedCapacityRule';

// Import soft constraint rules
import { SameChurchRule } from './rules/soft/SameChurchRule';
import { SameGovernorateRule } from './rules/soft/SameGovernorateRule';
import { SimilarAgeRule } from './rules/soft/SimilarAgeRule';
import { MinimizeEmptyBedsRule } from './rules/soft/MinimizeEmptyBedsRule';
import { PreferSameFloorRule } from './rules/soft/PreferSameFloorRule';
import { LeaderProximityRule } from './rules/soft/LeaderProximityRule';
import { RequestedRoommateProximityRule } from './rules/soft/RequestedRoommateProximityRule';

export type ProgressCallback = (event: AutoAssignmentProgressEvent) => void;

interface RoomWithDetails {
  id: string;
  roomNumber: string;
  roomType: 'GENERAL' | 'VIP' | 'FAMILY';
  capacity: number;
  individualBeds: number;
  bunkBeds: number;
  kingBeds: number;
  floorId: string;
  amenities: string | null;
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
 * Implements new hierarchical workflow:
 * 1. Load configuration and rooms
 * 2. Load unassigned attendees
 * 3. Classify rooming notes (AI-powered text parsing)
 * 4. Create hierarchical groups (rooming notes → church → governorate)
 * 5. Split groups by gender (strict constraint)
 * 6. Extract medical/VIP cases
 * 7. Sub-group by age ranges
 * 8. Initialize rule engine
 * 9. Assign groups with proximity matching for splits
 * 10. AI Enhancement (optional)
 * 11. Validate final state
 */
export class AutoAssignmentService {
  private classifier: RoomingNotesClassifier;
  private roomingNotesCacheService: RoomingNotesCacheService;
  private hierarchicalGrouping: HierarchicalGroupingService;
  private proximityMatcher: RoomProximityMatcher;
  private aiEnhancer: AIGroupEnhancementService;
  private engine: RuleEngine;
  private buildingGenderMap: Map<string, Gender>; // Track which gender is assigned to each building
  private requestedRoommateMap: Map<string, Set<string>>; // attendeeId -> explicitly requested roommate attendeeIds

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
    this.roomingNotesCacheService = new RoomingNotesCacheService(attendeeRepository);
    this.hierarchicalGrouping = new HierarchicalGroupingService();
    this.proximityMatcher = new RoomProximityMatcher();
    this.aiEnhancer = new AIGroupEnhancementService({
      useAI: options?.useAI !== false  // Default to true, but allow override
    });
    this.engine = new RuleEngine();
    this.buildingGenderMap = new Map(); // Initialize building gender tracking
    this.requestedRoommateMap = new Map();
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
    organizationId: string,
    onProgress?: ProgressCallback
  ): Promise<AutoAssignmentExecutionResult> {
    const startTime = Date.now();
    const stages: StageResult[] = [];
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Reset building gender tracking for this execution
    this.buildingGenderMap.clear();
    this.requestedRoommateMap.clear();

    try {
      // Stage 1: Load configuration
      const stage1Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 1, name: 'Load Configuration', status: 'started' }
      });

      const config = await this.configRepository.getOrCreateDefault(params.conferenceHouseId, organizationId);
      const enabledBuildings = params.buildingIds || config.enabledBuildings;

      // WHY: Manual per-building gender pins take priority over the automatic
      // first-come-first-served behavior below — pre-seed the tracking map so
      // findCandidateRooms() enforces the pin from the very first assignment.
      // Buildings absent from this map fall through to the existing dynamic logic.
      const buildingGenderOverrides =
        params.buildingGenderOverrides || (config.buildingGenderOverrides as Record<string, Gender> | null) || {};
      for (const [buildingId, gender] of Object.entries(buildingGenderOverrides)) {
        if (gender === Gender.MALE || gender === Gender.FEMALE) {
          this.buildingGenderMap.set(buildingId, gender);
        }
      }

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

      const allAttendees = await this.attendeeRepository.findAllByOrganization(organizationId);
      const availableRooms = await this.loadAvailableRooms(enabledBuildings, organizationId);

      // WHY: availableRooms' currentOccupancy/currentAssignments get mutated in
      // place as THIS run makes new assignments (needed for correct in-run
      // scoring/capacity checks) — snapshot the real pre-run occupancy now so
      // the preview can later report "already occupied" separately from "newly
      // assigned here", instead of the preview silently only reflecting new
      // assignments and making manually/previously-assigned rooms look emptier
      // than they really are.
      const initialRoomOccupancy = new Map(availableRooms.map(r => [r.id, r.currentOccupancy]));

      // Filter out deleted attendees
      let unassignedAttendees = allAttendees.filter(a => !a.deletedAt);
      
      // WHY: Default to true unless a caller EXPLICITLY opts out — the
      // frontend's preview call never sends `options` at all, so
      // `params.options?.onlyUnassigned` was always undefined/falsy and this
      // filter silently never ran, leaving already-assigned attendees
      // eligible to be algorithmically re-placed into a different room.
      // Nothing could commit that safely (a second RoomAssignment for the
      // same attendee hits the attendeeId @unique constraint).
      const onlyUnassigned = params.options?.onlyUnassigned !== false;
      if (onlyUnassigned) {
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

      // Classify rooming notes for AI enhancement — cache-first.
      // WHY: Attendees imported/created/edited already had their notes classified
      // and persisted in the background (see RoomingNotesCacheService) — reusing
      // that avoids re-paying AI latency/cost for the same note on every run.
      // Only attendees with a missing/stale cache (edge case: background job
      // hasn't caught up yet) get classified live here, with bounded concurrency
      // so it doesn't serialize network latency the way a plain loop would.
      const classifications = new Map<string, ClassifiedNotes>();
      const staleAttendees: Attendee[] = [];

      for (const attendee of unassignedAttendees) {
        const cached = attendee.roomingNotesClassification as unknown as ClassifiedNotes | null;
        if (cached && RoomingNotesCacheService.isFresh(attendee)) {
          classifications.set(attendee.id, cached);
        } else if (attendee.roomingNotes?.trim()) {
          staleAttendees.push(attendee);
        }
        // else: no rooming notes — nothing to classify, leave unset (every
        // consumer of `classifications` already guards with optional chaining)
      }

      if (staleAttendees.length > 0) {
        const classificationResults = await mapWithConcurrency(
          staleAttendees,
          8,
          async (attendee) => ({
            attendeeId: attendee.id,
            classified: await this.classifier.classify(attendee.roomingNotes),
          })
        );
        for (const { attendeeId, classified } of classificationResults) {
          classifications.set(attendeeId, classified);
        }

        // Persist the results we JUST computed so future runs hit the cache
        // (persistResultsInBackground writes them directly — it does not
        // re-invoke the classifier the way classifyAndPersist() would).
        this.roomingNotesCacheService.persistResultsInBackground(classificationResults);
      }

      stages.push({
        stage: 3,
        name: 'Classify Notes',
        status: 'completed',
        durationMs: Date.now() - stage3Start,
        details: `${classifications.size} attendee(s) classified (${classifications.size - staleAttendees.length} cached, ${staleAttendees.length} classified live)`
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 3, name: 'Classify Notes', status: 'completed' }
      });

      // Stage 4: Create hierarchical groups with sub-grouping
      const stage4Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 4, name: 'Hierarchical Grouping', status: 'started' }
      });

      const { groups, warnings: groupingWarnings } = await this.createHierarchicalGroupsWithSubgrouping(
        unassignedAttendees,
        classifications,
        availableRooms
      );
      warnings.push(...groupingWarnings);

      stages.push({
        stage: 4,
        name: 'Hierarchical Grouping',
        status: 'completed',
        durationMs: Date.now() - stage4Start,
        details: `Created ${groups.length} groups via 3-level hierarchy (rooming notes → church → governorate)`,
        itemsProcessed: groups.length
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 4, name: 'Hierarchical Grouping', status: 'completed' }
      });

      // Stage 4b: AI Group Enhancement (optional layer)
      // WHY: Rule-based hierarchical grouping (rooming notes → church → governorate)
      // can miss implicit compatibility buried in free-text notes — this layer asks
      // an LLM to suggest additional groups among still-ungrouped attendees, which
      // get merged in alongside (never replacing) the rule-based groups.
      const stage4bStart = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 4.5, name: 'AI Group Enhancement', status: 'started' }
      });

      const aiAvailable = this.aiEnhancer.isAIAvailable();
      const enhancedGroups = aiAvailable
        ? await this.aiEnhancer.enhanceGroups(unassignedAttendees, classifications, groups)
        : groups;

      stages.push({
        stage: 4.5,
        name: 'AI Group Enhancement',
        status: aiAvailable ? 'completed' : 'skipped',
        durationMs: Date.now() - stage4bStart,
        details: aiAvailable
          ? `AI added ${enhancedGroups.length - groups.length} suggested group(s) on top of ${groups.length} rule-based group(s)`
          : 'AI enhancement skipped (AI unavailable or disabled)',
        itemsProcessed: enhancedGroups.length
      });

      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 4.5, name: 'AI Group Enhancement', status: 'completed' }
      });

      // Stage 5: Sort groups by priority
      const stage5Start = Date.now();
      this.emitProgress(onProgress, {
        type: 'stage',
        stage: { number: 5, name: 'Prioritize Groups', status: 'started' }
      });

      const sortedGroups = this.sortGroupsByPriority(enhancedGroups);

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
        organizationId,
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

      // Enrich assignments with attendee and room details for preview
      const enrichedAssignments = await this.enrichAssignmentDetails(
        assignments,
        unassignedAttendees,
        availableRooms,
        initialRoomOccupancy
      );

      // WHY: `unassignedAttendees` (the variable) is the processing POOL, not
      // "people who remain unassigned" — build the actual leftover list by
      // excluding whoever made it into `assignments`, and attach the reason
      // from `errors` when one was recorded for them.
      const assignedIdsThisRun = new Set(assignments.map(a => a.attendeeId));
      const errorReasonByAttendeeId = new Map(errors.map(e => [e.attendeeId, e.reason]));
      const stillUnassigned = unassignedAttendees
        .filter(a => !assignedIdsThisRun.has(a.id))
        .map(a => ({
          id: a.id,
          name: a.fullName,
          reason: errorReasonByAttendeeId.get(a.id) || 'No suitable room found',
          roomingNotes: a.roomingNotes,
          area: a.area,
          governorate: a.governorate,
          church: a.church,
          age: a.age,
          gender: a.gender,
        }));

      // Build result
      // Success = workflow completed all stages (even if no assignments made)
      // Failure = only if system crash/exception occurred
      const result: AutoAssignmentExecutionResult = {
        success: true,  // Workflow completed successfully
        assignmentsCreated: assignments.length,
        attendeesProcessed: unassignedAttendees.length,
        errors,
        warnings,
        assignments: enrichedAssignments,  // Use enriched assignments with full details
        unassignedAttendees: stillUnassigned,
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
        unassignedAttendees: [],
        executionTimeMs: Date.now() - startTime,
        stages
      };
    }
  }

  /**
   * Load available rooms from enabled buildings
   */
  private async loadAvailableRooms(enabledBuildingIds: string[], organizationId: string): Promise<RoomWithDetails[]> {
    const rooms = await this.roomRepository.findForAutoAssignment(organizationId, enabledBuildingIds);
    
    // Transform to RoomWithDetails format and calculate current occupancy
    return rooms.map(room => ({
      id: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType as 'GENERAL' | 'VIP' | 'FAMILY',
      capacity: room.capacity,
      individualBeds: room.individualBeds,
      bunkBeds: room.bunkBeds,
      kingBeds: room.kingBeds,
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
   * Create hierarchical groups with intelligent sub-grouping
   * 
   * Workflow:
   * 1. Create 3-level hierarchy (rooming notes → church → governorate)
   * 2. For each group:
   *    a. Split by gender (strict)
   *    b. Extract medical/VIP cases
   *    c. Sub-group regular attendees by age
   * 3. Convert to old AttendeeGroup format for compatibility
   */
  private async createHierarchicalGroupsWithSubgrouping(
    attendees: Attendee[],
    classifications: Map<string, any>,
    availableRooms: RoomWithDetails[] = []
  ): Promise<{ groups: AttendeeGroup[]; warnings: ValidationError[] }> {
    logger.info('Creating hierarchical groups with sub-grouping');

    // WHY: Room capacities vary (especially now that king beds exist alongside
    // individual/bunk beds), so group-splitting thresholds are derived from the
    // actual available rooms instead of a hardcoded "8 per room" assumption.
    const roomCapacities = availableRooms.map(r => r.capacity).filter(c => c > 0);
    const maxRoomCapacity = roomCapacities.length > 0 ? Math.max(...roomCapacities) : 8;

    // Step 1: Create 3-level hierarchical groups
    const result = this.hierarchicalGrouping.createHierarchicalGroups(
      attendees,
      classifications
    );

    // WHY: Keep the resolved requested-roommate map for RequestedRoommateProximityRule
    // to consult during per-attendee scoring, as a fallback safety net for anyone
    // who couldn't be placed together with their requested group (see below).
    this.requestedRoommateMap = result.requestedRoommateMap;

    const allGroups: AttendeeGroup[] = [];
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));

    // Step 2: Process each hierarchical group
    for (const hierGroup of result.groups) {
      // Step 2a: Split by gender (STRICT constraint — the only split a
      // rooming-request group cannot avoid)
      const genderGroups = this.hierarchicalGrouping.splitByGender(hierGroup, attendees);

      for (const [gender, genderGroup] of genderGroups.entries()) {
        // WHY: Explicit mutual rooming requests ("A wants B,C,D") must take
        // priority over the medical/VIP/age heuristics below — those exist to
        // substitute for missing explicit preference, not to override it.
        // Splitting an already-correct connected component by age bucket or
        // medical/VIP status was the root cause of requested friend groups
        // fragmenting into separate rooms. Keep the group intact instead;
        // determineGroupConstraints() below already unions medical/VIP/
        // accessibility requirements across every member, so a room is chosen
        // that satisfies the whole group rather than splitting people out.
        if (genderGroup.type === 'rooming_notes') {
          const roommateSubGroups = this.splitLargeGroup(genderGroup, attendees, 'roommate', maxRoomCapacity, roomCapacities);
          allGroups.push(...roommateSubGroups);
          continue;
        }

        // Step 2b: Extract medical/VIP cases (church/governorate groups only —
        // these are heuristic groupings, so medical/VIP members get dedicated
        // handling rather than diluting an age-bucketed room)
        const { medical, vip, regular } = this.hierarchicalGrouping.extractSpecialCases(
          genderGroup,
          attendees
        );

        // Process medical group
        if (medical && medical.attendeeIds.size > 0) {
          const medicalSubGroups = this.splitLargeGroup(medical, attendees, 'medical', maxRoomCapacity, roomCapacities);
          allGroups.push(...medicalSubGroups);
        }

        // Process VIP group
        if (vip && vip.attendeeIds.size > 0) {
          const vipSubGroups = this.splitLargeGroup(vip, attendees, 'vip', maxRoomCapacity, roomCapacities);
          allGroups.push(...vipSubGroups);
        }

        // Process regular group - sub-group by age
        if (regular.attendeeIds.size > 0) {
          // Try 5-year age buckets first
          let ageSubGroups = this.hierarchicalGrouping.splitByAge(regular, attendees, 5);

          // If any sub-group is too large for a single room, split by 10-year buckets
          const largeSubGroups = ageSubGroups.filter(sg => sg.attendeeIds.size > maxRoomCapacity);
          if (largeSubGroups.length > 0) {
            ageSubGroups = this.hierarchicalGrouping.splitByAge(regular, attendees, 10);
          }

          // Convert each age sub-group to old AttendeeGroup format
          for (const ageGroup of ageSubGroups) {
            const subGroups = this.splitLargeGroup(ageGroup, attendees, 'age', maxRoomCapacity, roomCapacities);
            allGroups.push(...subGroups);
          }
        }
      }
    }

    // Step 3: Handle ungrouped individuals
    for (const attendeeId of result.ungroupedAttendeeIds) {
      const attendee = attendeeMap.get(attendeeId);
      if (!attendee) continue;

      allGroups.push({
        id: `individual-${attendeeId}`,
        type: GroupType.INDIVIDUAL,
        members: [attendee],
        priority: this.calculateGroupPriority(GroupType.INDIVIDUAL, [attendee]),
        constraints: this.determineGroupConstraints([attendee]),
        minRoomCount: 1,
      });
    }

    // WHY: Attendees whose requested-roommate cluster was too large to
    // safely auto-group (see HierarchicalGroupingService's MAX_ROOMMATE_GROUP_SIZE
    // check) still got placed normally via church/governorate grouping above —
    // surface a warning per affected attendee so an admin can review whether
    // the request was actually legitimate (a big family) or a false "hub" merge.
    const warnings: ValidationError[] = [];
    for (const oversized of result.oversizedGroups) {
      for (const attendeeId of oversized.attendeeIds) {
        const attendee = attendeeMap.get(attendeeId);
        warnings.push({
          attendeeId,
          attendeeName: attendee?.fullName || 'Unknown',
          reason: `Requested roommate group has ${oversized.attendeeIds.length} people, exceeding the safe auto-group limit — placed via church/governorate grouping instead. Review and assign manually if this was a real group.`,
          violatedRule: 'roommate_group_size_limit',
          severity: 'warning',
        });
      }
    }

    logger.info(`Hierarchical grouping complete: ${allGroups.length} final groups`);
    return { groups: allGroups, warnings };
  }

  /**
   * Split large hierarchical group into smaller AttendeeGroups based on room capacity
   * Tries to match group size to available room capacities
   */
  private splitLargeGroup(
    hierGroup: HierarchicalGroup,
    attendees: Attendee[],
    groupCategory: 'medical' | 'vip' | 'age' | 'roommate',
    maxRoomCapacity: number = 8,
    roomCapacities: number[] = []
  ): AttendeeGroup[] {
    const attendeeMap = new Map(attendees.map(a => [a.id, a]));
    const members = Array.from(hierGroup.attendeeIds)
      .map(id => attendeeMap.get(id))
      .filter(a => a !== undefined) as Attendee[];

    if (members.length === 0) return [];

    // Determine group type based on priority and category
    let groupType: GroupType;
    if (hierGroup.type === 'rooming_notes') {
      groupType = GroupType.ROOMMATE;
    } else if (hierGroup.metadata.hasFamily) {
      groupType = GroupType.FAMILY;
    } else if (hierGroup.type === 'church') {
      groupType = GroupType.CHURCH;
    } else {
      groupType = GroupType.GOVERNORATE;
    }

    const subGroups: AttendeeGroup[] = [];

    // If the group fits in the largest available room, keep it as one group
    if (members.length <= maxRoomCapacity) {
      subGroups.push({
        id: `${hierGroup.id}-${groupCategory}`,
        type: groupType,
        members,
        priority: this.calculateGroupPriority(groupType, members),
        constraints: this.determineGroupConstraints(members),
        minRoomCount: Math.ceil(members.length / maxRoomCapacity),
      });
      return subGroups;
    }

    // Split large group into sub-groups sized to match real room capacities,
    // largest first, so each chunk actually fits a room that exists.
    // WHY: previously a fixed [8,6,4,3,2] guess — now derived from the rooms
    // actually available, falling back to that guess if no room data was passed.
    const optimalSizes = (roomCapacities.length > 0
      ? Array.from(new Set(roomCapacities)).sort((a, b) => b - a)
      : [8, 6, 4, 3, 2]
    ).filter(size => size <= maxRoomCapacity && size > 0);
    if (optimalSizes.length === 0 || optimalSizes[optimalSizes.length - 1] !== 1) {
      optimalSizes.push(1); // Always allow a final single-person remainder
    }

    let remaining = [...members];
    let subGroupIndex = 0;

    while (remaining.length > 0) {
      // WHY: previously this always grabbed the largest bucket that fit the
      // CURRENT remainder, even when the remainder itself was small enough to
      // fit in one room untouched — e.g. a 6-person group with only 4-bed
      // rooms available would peel off 4, then peel the last 2 off ONE AT A
      // TIME (no bucket size "2" exists), scattering a pair that should have
      // stayed together into two lone individuals. If the whole remainder
      // already fits in the largest available room, keep it as one chunk
      // instead of continuing to bucket it.
      let bestSize = remaining.length <= maxRoomCapacity
        ? remaining.length
        : (optimalSizes.find(size => size <= remaining.length) || maxRoomCapacity);

      // Take members for this sub-group
      const subGroupMembers = remaining.slice(0, bestSize);
      remaining = remaining.slice(bestSize);

      subGroups.push({
        id: `${hierGroup.id}-${groupCategory}-${subGroupIndex++}`,
        type: groupType,
        members: subGroupMembers,
        priority: this.calculateGroupPriority(groupType, subGroupMembers),
        constraints: this.determineGroupConstraints(subGroupMembers),
        minRoomCount: Math.ceil(subGroupMembers.length / maxRoomCapacity),
      });
    }

    return subGroups;
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
    this.engine.registerRule(new LeaderReservedCapacityRule(config.leaderReservedSlots ?? 1));

    // Register soft constraint rules with configured weights
    const weights = config.ruleWeights || {};
    this.engine.registerRule(new SameChurchRule(weights.sameChurch || 0.3));
    this.engine.registerRule(new SameGovernorateRule(weights.sameGovernorate || 0.2));
    this.engine.registerRule(new SimilarAgeRule(weights.similarAge || 0.1));
    this.engine.registerRule(new MinimizeEmptyBedsRule(weights.minimizeEmptyBeds || 0.2));
    this.engine.registerRule(new PreferSameFloorRule(weights.preferSameFloor || 0.1));
    this.engine.registerRule(new LeaderProximityRule(weights.leaderProximity || 0.1));
    this.engine.registerRule(new RequestedRoommateProximityRule(
      this.requestedRoommateMap,
      weights.requestedRoommateProximity || 0.25
    ));
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
    organizationId: string,
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
      const result = await this.assignGroup(group, rooms, allAttendees, organizationId, dryRun, onProgress);
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
      const result = await this.assignGroup(group, rooms, allAttendees, organizationId, dryRun, onProgress);
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
      const result = await this.assignGroup(group, rooms, allAttendees, organizationId, dryRun, onProgress);
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
   * Assign a group of attendees to rooms
   * For ROOMMATE groups, tries to keep them together in one room
   */
  private async assignGroup(
    group: AttendeeGroup,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    organizationId: string,
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

    // Special handling for ROOMMATE groups - try to keep them together in one room
    if (group.type === GroupType.ROOMMATE && group.members.length > 1) {
      const roommateResult = await this.tryAssignRoommatesTogether(
        group,
        rooms,
        allAttendees,
        organizationId,
        dryRun,
        onProgress,
        preferredFloorId,
        leaderPreferredFloorId
      );
      
      // If we successfully assigned all roommates together, return
      if (roommateResult.assignments.length === group.members.length) {
        return roommateResult;
      }
      
      // Otherwise, fall through to individual assignment
      // but keep track of partial assignments
      assignments.push(...roommateResult.assignments);
      errors.push(...roommateResult.errors);
      warnings.push(...roommateResult.warnings);
      
      // Filter out already-assigned members
      const assignedIds = new Set(roommateResult.assignments.map(a => a.attendeeId));
      group.members = group.members.filter(m => !assignedIds.has(m.id));
    }

    // For other multi-member groups (CHURCH, GOVERNORATE, FAMILY), try proximity-based assignment.
    // This also covers any ROOMMATE remainder that didn't fit in a single room above
    // (previously roommate leftovers went straight to fully independent per-attendee
    // scoring with zero pull toward staying near the rest of their requested group —
    // now they get the same adjacent/same-floor/same-building fallback as other groups).
    if ((group.type === GroupType.CHURCH || group.type === GroupType.GOVERNORATE ||
         group.type === GroupType.FAMILY || group.type === GroupType.ROOMMATE)
        && group.members.length > 1) {
      const proximityResult = await this.tryAssignGroupWithProximity(
        group,
        rooms,
        allAttendees,
        organizationId,
        dryRun,
        onProgress,
        preferredFloorId,
        leaderPreferredFloorId
      );
      
      // If we successfully assigned all members, return
      if (proximityResult.assignments.length === group.members.length) {
        return proximityResult;
      }
      
      // Otherwise, fall through to individual assignment
      assignments.push(...proximityResult.assignments);
      errors.push(...proximityResult.errors);
      warnings.push(...proximityResult.warnings);
      
      // Filter out already-assigned members
      const assignedIds = new Set(proximityResult.assignments.map(a => a.attendeeId));
      group.members = group.members.filter(m => !assignedIds.has(m.id));
    }

    // Try to assign each member of the group individually
    for (const attendee of group.members) {
      try {
        // Find candidate rooms that pass hard constraints
        const candidateRooms = this.findCandidateRooms(attendee, rooms, allAttendees);

        if (candidateRooms.length === 0) {
          errors.push({
            attendeeId: attendee.id,
            attendeeName: attendee.fullName,
            reason: 'No available rooms match hard constraints (capacity, gender, building restrictions)',
            violatedRule: 'Hard Constraints',
            severity: 'error'
          });
          continue;
        }

        // Score each candidate room with soft constraints
        const scoringResults = this.scoreRoomsDetailed(
          attendee,
          candidateRooms,
          allAttendees,
          preferredFloorId,
          leaderPreferredFloorId
        );

        if (scoringResults.length === 0) {
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
        const bestMatch = scoringResults[0]; // Already sorted by score (highest first)

        // Build reasoning explanation
        const reason = this.buildAssignmentReason(
          attendee,
          bestMatch.room,
          group,
          bestMatch.score,
          bestMatch.scoreBreakdown
        );

        // Update room occupancy in memory for subsequent assignments (ALWAYS, even in dry run)
        // This ensures gender validation works correctly for subsequent assignments
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
        
        // Update building gender map (only for non-FAMILY rooms)
        if (bestMatch.room.roomType !== 'FAMILY' && attendee.gender) {
          const buildingId = bestMatch.room.floor.building.id;
          if (!this.buildingGenderMap.has(buildingId)) {
            this.buildingGenderMap.set(buildingId, attendee.gender);
          }
        }

        // Create assignment in database (only if not dry run)
        if (!dryRun) {
          await this.createAssignment(attendee.id, bestMatch.room.id, organizationId);
        }

        // Count roommates in the same room (for ROOMMATE groups)
        let roommatesInSameRoom = 0;
        if (group.type === GroupType.ROOMMATE) {
          roommatesInSameRoom = group.members.filter(member =>
            assignments.some(a => a.attendeeId === member.id && a.roomId === bestMatch.room.id)
          ).length + 1; // +1 for current attendee
        }

        // Record successful assignment
        assignments.push({
          attendeeId: attendee.id,
          roomId: bestMatch.room.id,
          score: bestMatch.score,
          appliedRules: bestMatch.appliedRules,
          reason: reason,
          scoreBreakdown: bestMatch.scoreBreakdown,
          groupInfo: group.type !== GroupType.INDIVIDUAL ? {
            groupId: group.id,
            groupType: group.type,
            groupSize: group.members.length,
            roommatesInSameRoom: group.type === GroupType.ROOMMATE ? roommatesInSameRoom : undefined
          } : undefined,
          warnings: bestMatch.score < 0.5 ? ['Low quality score'] : undefined
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
        if (bestMatch.score < 0.5) {
          warnings.push({
            attendeeId: attendee.id,
            attendeeName: attendee.fullName,
            reason: `Low assignment quality score: ${(bestMatch.score * 100).toFixed(0)}%`,
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
   * Try to assign group with proximity-based room splitting
   * 
   * Strategy:
   * 1. Try to fit entire group in one room (best option)
   * 2. If not possible, use RoomProximityMatcher to find nearby rooms
   * 3. Split group optimally across nearby rooms (adjacent → same floor → same building)
   * 
   * Used for CHURCH, GOVERNORATE, FAMILY groups, and ROOMMATE remainders that
   * didn't fit in a single room via tryAssignRoommatesTogether()
   */
  private async tryAssignGroupWithProximity(
    group: AttendeeGroup,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    organizationId: string,
    dryRun: boolean,
    onProgress?: ProgressCallback,
    preferredFloorId?: string,
    leaderPreferredFloorId?: string
  ): Promise<{
    assignments: AssignmentResult[];
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const groupSize = group.members.length;
    
    // Step 1: Try to find a single room that can fit the entire group
    const singleRoomResult = await this.tryAssignToSingleRoom(
      group,
      rooms,
      allAttendees,
      organizationId,
      dryRun,
      onProgress,
      preferredFloorId,
      leaderPreferredFloorId
    );

    if (singleRoomResult.assignments.length === groupSize) {
      // Successfully assigned to single room
      logger.info(`Group ${group.id} (${groupSize} members) assigned to single room`);
      return singleRoomResult;
    }

    // Step 2: Need to split across multiple rooms - use proximity matcher
    logger.info(`Group ${group.id} (${groupSize} members) requires splitting across rooms`);

    // Find all candidate rooms that pass hard constraints for group members
    const candidateRooms: RoomWithDetails[] = [];
    for (const room of rooms) {
      // Check if at least one member can be assigned to this room
      let hasValidMember = false;
      for (const member of group.members) {
        const candidates = this.findCandidateRooms(member, [room], allAttendees);
        if (candidates.length > 0) {
          hasValidMember = true;
          break;
        }
      }
      if (hasValidMember) {
        candidateRooms.push(room);
      }
    }

    if (candidateRooms.length === 0) {
      errors.push({
        attendeeId: group.members[0].id,
        attendeeName: `${group.type} group (${groupSize} people)`,
        reason: 'No rooms available that match hard constraints for group members',
        violatedRule: 'Hard Constraints',
        severity: 'error'
      });
      return { assignments, errors, warnings };
    }

    // Determine how many rooms we need
    const maxRoomCapacity = Math.max(...candidateRooms.map(r => r.capacity - r.currentOccupancy));
    const minRoomsNeeded = Math.ceil(groupSize / maxRoomCapacity);

    // Use proximity matcher to find nearby rooms
    const proximityMatch = this.proximityMatcher.findNearbyRooms(
      groupSize,
      candidateRooms,
      minRoomsNeeded
    );

    if (!proximityMatch || proximityMatch.rooms.length < minRoomsNeeded) {
      // Fallback: use any available rooms (no proximity guarantee)
      logger.warn(`No proximity match found for group ${group.id}, using any available rooms`);
      const fallbackRooms = candidateRooms
        .sort((a, b) => (b.capacity - b.currentOccupancy) - (a.capacity - a.currentOccupancy))
        .slice(0, minRoomsNeeded);

      return await this.assignGroupAcrossRooms(
        group,
        fallbackRooms,
        allAttendees,
        organizationId,
        dryRun,
        onProgress,
        'none',
        preferredFloorId,
        leaderPreferredFloorId
      );
    }

    // Map proximity match rooms back to RoomWithDetails
    const matchedRoomsWithDetails = proximityMatch.rooms
      .map(r => candidateRooms.find(cr => cr.id === r.id))
      .filter(r => r !== undefined) as RoomWithDetails[];

    // Assign group across nearby rooms
    logger.info(`Found ${proximityMatch.proximityLevel} rooms for group ${group.id}`);
    return await this.assignGroupAcrossRooms(
      group,
      matchedRoomsWithDetails,
      allAttendees,
      organizationId,
      dryRun,
      onProgress,
      proximityMatch.proximityLevel,
      preferredFloorId,
      leaderPreferredFloorId
    );
  }

  /**
   * Try to assign entire group to a single room
   */
  private async tryAssignToSingleRoom(
    group: AttendeeGroup,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    organizationId: string,
    dryRun: boolean,
    onProgress?: ProgressCallback,
    preferredFloorId?: string,
    leaderPreferredFloorId?: string
  ): Promise<{
    assignments: AssignmentResult[];
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const groupSize = group.members.length;
    
    // Find rooms that can fit the entire group
    const suitableRooms: RoomWithDetails[] = [];
    
    for (const room of rooms) {
      const availableSpace = room.capacity - room.currentOccupancy;
      if (availableSpace >= groupSize) {
        // Check if all members pass hard constraints for this room
        let allMembersValid = true;
        for (const member of group.members) {
          const candidates = this.findCandidateRooms(member, [room], allAttendees);
          if (candidates.length === 0) {
            allMembersValid = false;
            break;
          }
        }
        
        if (allMembersValid) {
          suitableRooms.push(room);
        }
      }
    }

    if (suitableRooms.length === 0) {
      // No single room can fit all members
      return { assignments, errors, warnings };
    }

    // Use proximity matcher to find best single room (considers capacity match)
    const bestRoomBasic = this.proximityMatcher.findBestSingleRoom(groupSize, suitableRooms);
    
    if (!bestRoomBasic) {
      return { assignments, errors, warnings };
    }

    // Find the RoomWithDetails version
    const bestRoom = suitableRooms.find(r => r.id === bestRoomBasic.id);
    if (!bestRoom) {
      return { assignments, errors, warnings };
    }

    // Score the room for the first member (as representative)
    const firstMember = group.members[0];
    const scoringResults = this.scoreRoomsDetailed(
      firstMember,
      [bestRoom],
      allAttendees,
      preferredFloorId,
      leaderPreferredFloorId
    );

    if (scoringResults.length === 0) {
      return { assignments, errors, warnings };
    }

    // Assign all members to this room
    for (const member of group.members) {
      // Update room occupancy
      bestRoom.currentOccupancy++;
      bestRoom.currentAssignments.push({
        id: `temp-${member.id}`,
        attendeeId: member.id,
        roomId: bestRoom.id,
        assignedAt: new Date(),
        assignedBy: 'auto-assignment',
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Update building gender map
      if (bestRoom.roomType !== 'FAMILY' && member.gender) {
        const buildingId = bestRoom.floor.building.id;
        if (!this.buildingGenderMap.has(buildingId)) {
          this.buildingGenderMap.set(buildingId, member.gender);
        }
      }

      // Create assignment in database (only if not dry run)
      if (!dryRun) {
        await this.createAssignment(member.id, bestRoom.id, organizationId);
      }

      // Build reason
      const reason = `Assigned with ${groupSize - 1} ${group.type} group member(s) to room ${bestRoom.roomNumber} (capacity ${bestRoom.capacity}). Group kept together.`;

      // Record assignment
      assignments.push({
        attendeeId: member.id,
        roomId: bestRoom.id,
        score: scoringResults[0].score,
        appliedRules: scoringResults[0].appliedRules,
        reason: reason,
        scoreBreakdown: scoringResults[0].scoreBreakdown,
        groupInfo: {
          groupId: group.id,
          groupType: group.type,
          groupSize: groupSize,
          roommatesInSameRoom: groupSize
        }
      });

      // Emit progress
      this.emitProgress(onProgress, {
        type: 'assignment',
        assignment: {
          attendeeId: member.id,
          attendeeName: member.fullName,
          roomId: bestRoom.id,
          roomNumber: bestRoom.roomNumber
        }
      });
    }

    return { assignments, errors, warnings };
  }

  /**
   * Assign group members across multiple nearby rooms
   */
  private async assignGroupAcrossRooms(
    group: AttendeeGroup,
    nearbyRooms: RoomWithDetails[],
    allAttendees: Attendee[],
    organizationId: string,
    dryRun: boolean,
    onProgress: ProgressCallback | undefined,
    proximityLevel: 'adjacent' | 'same_floor' | 'same_building' | 'none',
    preferredFloorId?: string,
    leaderPreferredFloorId?: string
  ): Promise<{
    assignments: AssignmentResult[];
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Sort rooms by available capacity (largest first)
    const sortedRooms = [...nearbyRooms].sort(
      (a, b) => (b.capacity - b.currentOccupancy) - (a.capacity - a.currentOccupancy)
    );

    // Split group members across rooms optimally
    let remainingMembers = [...group.members];
    const roomAssignments: Map<string, Attendee[]> = new Map();

    for (const room of sortedRooms) {
      if (remainingMembers.length === 0) break;

      const availableSpace = room.capacity - room.currentOccupancy;
      if (availableSpace <= 0) continue;

      // Assign as many members as possible to this room
      const membersForThisRoom: Attendee[] = [];
      
      for (let i = 0; i < Math.min(availableSpace, remainingMembers.length); i++) {
        const member = remainingMembers[i];
        
        // Check if member passes hard constraints for this room
        const candidates = this.findCandidateRooms(member, [room], allAttendees);
        if (candidates.length > 0) {
          membersForThisRoom.push(member);
        }
      }

      if (membersForThisRoom.length > 0) {
        roomAssignments.set(room.id, membersForThisRoom);
        remainingMembers = remainingMembers.filter(m => !membersForThisRoom.includes(m));
      }
    }

    // Assign each sub-group to its room
    for (const [roomId, members] of roomAssignments.entries()) {
      const room = sortedRooms.find(r => r.id === roomId);
      if (!room) continue;

      // Score the room for the first member
      const scoringResults = this.scoreRoomsDetailed(
        members[0],
        [room],
        allAttendees,
        preferredFloorId,
        leaderPreferredFloorId
      );

      const score = scoringResults.length > 0 ? scoringResults[0].score : 0.5;
      const scoreBreakdown = scoringResults.length > 0 ? scoringResults[0].scoreBreakdown : undefined;

      for (const member of members) {
        // Update room occupancy
        room.currentOccupancy++;
        room.currentAssignments.push({
          id: `temp-${member.id}`,
          attendeeId: member.id,
          roomId: room.id,
          assignedAt: new Date(),
          assignedBy: 'auto-assignment',
          isLocked: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Update building gender map
        if (room.roomType !== 'FAMILY' && member.gender) {
          const buildingId = room.floor.building.id;
          if (!this.buildingGenderMap.has(buildingId)) {
            this.buildingGenderMap.set(buildingId, member.gender);
          }
        }

        // Create assignment in database (only if not dry run)
        if (!dryRun) {
          await this.createAssignment(member.id, room.id, organizationId);
        }

        // Build reason with proximity info
        const proximityDescription = proximityLevel === 'adjacent' ? 'adjacent rooms' :
                                     proximityLevel === 'same_floor' ? 'same floor' :
                                     proximityLevel === 'same_building' ? 'same building' :
                                     'separate locations';

        const reason = `Assigned with ${members.length - 1} ${group.type} group member(s) to room ${room.roomNumber} (${proximityDescription}). Total group size: ${group.members.length}.`;

        // Record assignment
        assignments.push({
          attendeeId: member.id,
          roomId: room.id,
          score: score,
          appliedRules: scoringResults.length > 0 ? scoringResults[0].appliedRules : [],
          reason: reason,
          scoreBreakdown: scoreBreakdown,
          groupInfo: {
            groupId: group.id,
            groupType: group.type,
            groupSize: group.members.length,
            roommatesInSameRoom: members.length
          }
        });

        // Emit progress
        this.emitProgress(onProgress, {
          type: 'assignment',
          assignment: {
            attendeeId: member.id,
            attendeeName: member.fullName,
            roomId: room.id,
            roomNumber: room.roomNumber
          }
        });
      }
    }

    // Track any members that couldn't be assigned
    if (remainingMembers.length > 0) {
      for (const member of remainingMembers) {
        errors.push({
          attendeeId: member.id,
          attendeeName: member.fullName,
          reason: `Could not assign to nearby rooms (proximity: ${proximityLevel})`,
          violatedRule: 'Room Availability',
          severity: 'error'
        });
      }
    }

    // Add warning if group was split
    if (roomAssignments.size > 1) {
      const proximityDescription = proximityLevel === 'adjacent' ? 'adjacent rooms' :
                                   proximityLevel === 'same_floor' ? 'same floor' :
                                   proximityLevel === 'same_building' ? 'same building' :
                                   'separate locations';

      warnings.push({
        attendeeId: group.members[0].id,
        attendeeName: `${group.type} group (${group.members.length} people)`,
        reason: `Group split across ${roomAssignments.size} ${proximityDescription} (${roomAssignments.size} rooms)`,
        violatedRule: 'Group Proximity',
        severity: 'warning'
      });
    }

    return { assignments, errors, warnings };
  }

  /**
   * Try to assign roommates together in the same room
   */
  private async tryAssignRoommatesTogether(
    group: AttendeeGroup,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    organizationId: string,
    dryRun: boolean,
    onProgress?: ProgressCallback,
    preferredFloorId?: string,
    leaderPreferredFloorId?: string
  ): Promise<{
    assignments: AssignmentResult[];
    errors: ValidationError[];
    warnings: ValidationError[];
  }> {
    const assignments: AssignmentResult[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    const groupSize = group.members.length;
    
    // Find rooms that can fit the entire group
    const suitableRooms: RoomWithDetails[] = [];
    
    for (const room of rooms) {
      const availableSpace = room.capacity - room.currentOccupancy;
      if (availableSpace >= groupSize) {
        // Check if all members pass hard constraints for this room
        let allMembersValid = true;
        for (const member of group.members) {
          const candidates = this.findCandidateRooms(member, [room], allAttendees);
          if (candidates.length === 0) {
            allMembersValid = false;
            break;
          }
        }
        
        if (allMembersValid) {
          suitableRooms.push(room);
        }
      }
    }

    if (suitableRooms.length === 0) {
      // No room can fit all roommates together
      warnings.push({
        attendeeId: group.members[0].id,
        attendeeName: `Roommate group (${groupSize} people)`,
        reason: `No single room found with capacity for ${groupSize} roommates. Will assign to separate rooms.`,
        violatedRule: 'Room Capacity',
        severity: 'warning'
      });
      return { assignments, errors, warnings };
    }

    // Score the suitable rooms for the first member (as representative)
    const firstMember = group.members[0];
    const scoringResults = this.scoreRoomsDetailed(
      firstMember,
      suitableRooms,
      allAttendees,
      preferredFloorId,
      leaderPreferredFloorId
    );

    if (scoringResults.length === 0) {
      return { assignments, errors, warnings };
    }

    // Select best room
    const bestRoom = scoringResults[0].room;
    
    // Assign all roommates to this room
    for (const member of group.members) {
      // Update room occupancy
      bestRoom.currentOccupancy++;
      bestRoom.currentAssignments.push({
        id: `temp-${member.id}`,
        attendeeId: member.id,
        roomId: bestRoom.id,
        assignedAt: new Date(),
        assignedBy: 'auto-assignment',
        isLocked: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Update building gender map
      if (bestRoom.roomType !== 'FAMILY' && member.gender) {
        const buildingId = bestRoom.floor.building.id;
        if (!this.buildingGenderMap.has(buildingId)) {
          this.buildingGenderMap.set(buildingId, member.gender);
        }
      }

      // Create assignment in database (only if not dry run)
      if (!dryRun) {
        await this.createAssignment(member.id, bestRoom.id, organizationId);
      }

      // Build reason
      const reason = `Assigned with ${groupSize - 1} roommate(s) to room ${bestRoom.roomNumber} (capacity ${bestRoom.capacity}). Roommates kept together as requested.`;

      // Record assignment
      assignments.push({
        attendeeId: member.id,
        roomId: bestRoom.id,
        score: scoringResults[0].score,
        appliedRules: scoringResults[0].appliedRules,
        reason: reason,
        scoreBreakdown: scoringResults[0].scoreBreakdown,
        groupInfo: {
          groupId: group.id,
          groupType: group.type,
          groupSize: groupSize,
          roommatesInSameRoom: groupSize
        }
      });

      // Emit progress
      this.emitProgress(onProgress, {
        type: 'assignment',
        assignment: {
          attendeeId: member.id,
          attendeeName: member.fullName,
          roomId: bestRoom.id,
          roomNumber: bestRoom.roomNumber
        }
      });
    }

    return { assignments, errors, warnings };
  }

  /**
   * Build human-readable reasoning for an assignment with detailed context
   */
  private buildAssignmentReason(
    attendee: Attendee,
    room: RoomWithDetails,
    group: AttendeeGroup,
    score: number,
    scoreBreakdown: Record<string, number>
  ): string {
    const reasons: string[] = [];

    // Attendee Basic Info
    const attendeeInfo: string[] = [];
    if (attendee.gender) {
      attendeeInfo.push(`${attendee.gender.toLowerCase()}`);
    }
    if (attendee.age) {
      attendeeInfo.push(`age ${attendee.age}`);
    }
    if (attendeeInfo.length > 0) {
      reasons.push(`Attendee: ${attendeeInfo.join(', ')}`);
    }

    // Group Information
    if (group.type !== GroupType.INDIVIDUAL) {
      const groupDesc = `${group.type} group (${group.members.length} members)`;
      reasons.push(`Group: ${groupDesc}`);
    }

    // Room Assignment Details
    const roomDetails: string[] = [];
    roomDetails.push(`Room ${room.roomNumber} in ${room.floor.building.name}`);
    roomDetails.push(`floor ${room.floor.floorNumber}`);
    if (room.roomType !== 'GENERAL') {
      roomDetails.push(`${room.roomType.toLowerCase()} type`);
    }
    const occupancyAfter = room.currentOccupancy + 1;
    roomDetails.push(`occupancy ${occupancyAfter}/${room.capacity}`);
    reasons.push(`Assigned to: ${roomDetails.join(', ')}`);

    // Score Analysis - explain why this score
    const scorePct = (score * 100).toFixed(0);
    const scoreQuality = score >= 0.8 ? 'excellent' : score >= 0.6 ? 'good' : 'acceptable';
    reasons.push(`Quality: ${scorePct}% (${scoreQuality} match)`);

    // Detailed Scoring Factors with context
    const sortedFactors = Object.entries(scoreBreakdown)
      .sort((a, b) => b[1] - a[1])
      .filter(([_, value]) => value >= 0.05); // Show factors contributing 5% or more
    
    if (sortedFactors.length > 0) {
      const factorDetails: string[] = [];
      
      for (const [rule, value] of sortedFactors) {
        const pct = (value * 100).toFixed(0);
        let detail = `${this.humanizeRuleName(rule)} (+${pct}%)`;
        
        // Add context for each rule
        if (rule === 'SameChurchRule' && attendee.church) {
          detail += ` - attendee from ${attendee.church}`;
        } else if (rule === 'SameGovernorateRule' && attendee.governorate) {
          detail += ` - ${attendee.governorate} governorate`;
        } else if (rule === 'SimilarAgeRule' && attendee.age) {
          detail += ` - age ${attendee.age}`;
        } else if (rule === 'MinimizeEmptyBedsRule') {
          const emptyBeds = room.capacity - occupancyAfter;
          detail += ` - ${emptyBeds} empty bed${emptyBeds !== 1 ? 's' : ''} after assignment`;
        } else if (rule === 'PreferSameFloorRule') {
          detail += ` - floor ${room.floor.floorNumber}`;
        }
        
        factorDetails.push(detail);
      }
      
      reasons.push(`Factors: ${factorDetails.join('; ')}`);
    }

    // Special Constraints
    const constraints: string[] = [];
    if (group.constraints.requiresAccessibility) {
      constraints.push('accessibility required');
    }
    if (group.constraints.requiresGroundFloor) {
      constraints.push('ground floor required');
    }
    if (room.roomType === 'VIP' && group.constraints.requiredRoomType === 'VIP') {
      constraints.push('VIP status');
    }
    if (constraints.length > 0) {
      reasons.push(`Special needs: ${constraints.join(', ')}`);
    }

    // Rooming Notes if available
    if (attendee.roomingNotes && attendee.roomingNotes.trim()) {
      const notesPreview = attendee.roomingNotes.length > 50 
        ? attendee.roomingNotes.substring(0, 50) + '...' 
        : attendee.roomingNotes;
      reasons.push(`Notes: "${notesPreview}"`);
    }

    return reasons.join('. ') + '.';
  }

  /**
   * Convert rule names to human-readable format
   */
  private humanizeRuleName(ruleName: string): string {
    const map: Record<string, string> = {
      'SameChurchRule': 'Same church',
      'SameGovernorateRule': 'Same governorate',
      'SimilarAgeRule': 'Similar age',
      'MinimizeEmptyBedsRule': 'Minimize empty beds',
      'PreferSameFloorRule': 'Same floor preference',
      'LeaderProximityRule': 'Near leaders'
    };
    return map[ruleName] || ruleName;
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
      // First check building-level gender compatibility (CRITICAL)
      // FAMILY rooms are exempt from building gender restrictions
      if (room.roomType !== 'FAMILY') {
        const buildingGender = this.buildingGenderMap.get(room.floor.building.id);
        const attendeeGender = attendee.gender;
        
        // If building has a gender assigned and it doesn't match attendee, skip this room
        if (buildingGender && attendeeGender && buildingGender !== attendeeGender) {
          continue; // Skip this room - building gender mismatch
        }
        
        // If attendee has no gender or OTHER gender, can only use empty buildings or FAMILY rooms
        if ((!attendeeGender || attendeeGender === Gender.OTHER) && buildingGender) {
          continue; // Skip this room - attendee can't be in occupied building
        }
      }
      
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
   * Score candidate rooms with detailed breakdown for reasoning
   */
  private scoreRoomsDetailed(
    attendee: Attendee,
    rooms: RoomWithDetails[],
    allAttendees: Attendee[],
    preferredFloorId?: string,
    leaderPreferredFloorId?: string
  ): Array<{ 
    room: RoomWithDetails; 
    score: number; 
    appliedRules: string[];
    scoreBreakdown: Record<string, number>;
  }> {
    const scored: Array<{ 
      room: RoomWithDetails; 
      score: number; 
      appliedRules: string[];
      scoreBreakdown: Record<string, number>;
    }> = [];

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
      
      // Build breakdown from results - normalize scores to 0-1 range
      const breakdown: Record<string, number> = {};
      for (const [ruleName, ruleResult] of result.results.entries()) {
        // Individual rule scores are 0-100, normalize to 0-1 by dividing by 100
        breakdown[ruleName] = ruleResult.score / 100;
      }
      
      scored.push({
        room,
        score: result.score,
        appliedRules: Array.from(result.results.keys()),
        scoreBreakdown: breakdown
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
  private async createAssignment(
    attendeeId: string,
    roomId: string,
    organizationId: string,
    userId?: string
  ): Promise<void> {
    await this.assignmentRepository.create({
      attendeeId,
      roomId,
      assignedBy: userId || 'auto-assignment'
    });

    // Create audit log
    await this.auditLogRepository.createLog({
      action: 'assign',
      entityType: 'room_assignment',
      entityId: attendeeId,
      details: {
        attendeeId,
        roomId,
        assignedBy: userId || 'auto-assignment',
        reason: userId ? 'Committed from collaborative preview' : 'Auto-assignment execution'
      },
      performedBy: userId ? undefined : 'system',
      userId,
      organizationId,
    });
  }

  /**
   * Commit an edited preview draft exactly as shown — used by the
   * collaborative preview session's "Confirm & Execute" instead of
   * re-running the assignment algorithm, so manual edits (unassign/
   * reassign/swap) admins made in the shared draft actually survive.
   *
   * The draft can contain THREE kinds of change now that real,
   * already-assigned attendees are surfaced in the preview alongside new
   * placements:
   * - a brand new placement (`isExisting` false) → insert.
   * - a real attendee left in their original room (`isExisting` true,
   *   `roomId === originalRoomId`) → no DB change needed, already correct.
   * - a real attendee MOVED to a different room in the draft (`isExisting`
   *   true, `roomId !== originalRoomId`) → delete the old RoomAssignment,
   *   then insert at the new room (same delete-then-recreate pattern
   *   SwapValidationService.executeSwap already uses for live swaps).
   * - a real attendee dragged into "Unassigned" in the draft
   *   (`releasedAttendeeIds`) → delete their RoomAssignment.
   */
  async commitPreviewChanges(
    changes: {
      assignments: Array<{ attendeeId: string; roomId: string; isExisting?: boolean; originalRoomId?: string }>;
      releasedAttendeeIds: string[];
    },
    organizationId: string,
    userId: string
  ): Promise<{ assignmentsCreated: number; assignmentsMoved: number; assignmentsReleased: number }> {
    let assignmentsCreated = 0;
    let assignmentsMoved = 0;

    for (const assignment of changes.assignments) {
      if (!assignment.isExisting) {
        await this.createAssignment(assignment.attendeeId, assignment.roomId, organizationId, userId);
        assignmentsCreated++;
        continue;
      }
      if (assignment.originalRoomId && assignment.roomId !== assignment.originalRoomId) {
        await this.assignmentRepository.deleteByAttendeeId(assignment.attendeeId, organizationId);
        await this.createAssignment(assignment.attendeeId, assignment.roomId, organizationId, userId);
        assignmentsMoved++;
      }
      // else: real attendee, unchanged room — already correct in the DB.
    }

    for (const attendeeId of changes.releasedAttendeeIds) {
      await this.assignmentRepository.deleteByAttendeeId(attendeeId, organizationId);
      await this.auditLogRepository.createLog({
        action: 'unassign',
        entityType: 'room_assignment',
        entityId: attendeeId,
        details: { attendeeId, reason: 'Released via collaborative preview draft' },
        userId,
        organizationId,
      });
    }

    return { assignmentsCreated, assignmentsMoved, assignmentsReleased: changes.releasedAttendeeIds.length };
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
   * Enrich assignment details with attendee and room information for preview
   */
  private async enrichAssignmentDetails(
    assignments: AssignmentResult[],
    attendees: Attendee[],
    rooms: RoomWithDetails[],
    initialRoomOccupancy: Map<string, number> = new Map()
  ): Promise<any[]> {
    // Create lookup maps for O(1) access
    const attendeeMap = new Map(
      attendees.map(a => [a.id, a])
    );
    const roomMap = new Map(
      rooms.map(r => [r.id, r])
    );

    // Enrich each assignment with full details
    return assignments.map(assignment => {
      const attendee = attendeeMap.get(assignment.attendeeId);
      const room = roomMap.get(assignment.roomId);

      if (!attendee || !room) {
        logger.warn('Missing attendee or room data for assignment enrichment', {
          attendeeId: assignment.attendeeId,
          roomId: assignment.roomId
        });
        return assignment;  // Return original if data missing
      }

      const cachedClassification = attendee.roomingNotesClassification as unknown as ClassifiedNotes | null;

      return {
        ...assignment,
        attendeeName: attendee.fullName,
        gender: attendee.gender,
        age: attendee.age,
        church: attendee.church,
        area: attendee.area,
        governorate: attendee.governorate,
        roomingNotes: attendee.roomingNotes,
        // WHY: a clean, human-reviewable list of what the classifier understood
        // from the raw note (e.g. "Saher Ezzat - Kero - Rony"), so staff can
        // visually confirm the extraction was correct without reading the
        // free-text note. Only populated when the cache is fresh — a stale/
        // missing cache means classification hasn't caught up with an edit yet.
        parsedRoomingNotes: (cachedClassification && cachedClassification.roommateRequests?.length && cachedClassification.raw === (attendee.roomingNotes || '').trim())
          ? cachedClassification.roommateRequests.join(' - ')
          : null,
        roomNumber: room.roomNumber,
        roomCapacity: room.capacity,
        // WHY: occupants already in this room before this run (manual
        // assignments or attendees excluded via onlyUnassigned) — the
        // frontend needs this to show TRUE total occupancy, since this
        // assignment list only ever contains NEW placements from this run.
        existingOccupancy: initialRoomOccupancy.get(room.id) ?? 0,
        buildingName: room.floor.building.name,
        floorNumber: room.floor.floorNumber
      };
    });
  }

  /**
   * Calculate group priority (higher = assign first)
   * Priority factors: medical needs, VIP, wheelchair, group size
   */
  private calculateGroupPriority(groupType: GroupType, members: Attendee[]): number {
    let priority = 100;

    // Medical needs get highest priority
    const hasMedical = members.some(m => 
      m.roomingNotes?.toLowerCase().includes('medical') ||
      m.roomingNotes?.toLowerCase().includes('health') ||
      m.notes?.toLowerCase().includes('wheelchair')
    );
    if (hasMedical) priority += 50;

    // VIP gets high priority (servants or VIP conference role)
    const hasVIP = members.some(m => m.isServant || m.conferenceRole === 'VIP' || m.conferenceRole === 'LEADER');
    if (hasVIP) priority += 40;

    // Wheelchair accessibility
    const hasWheelchair = members.some(m => m.notes?.toLowerCase().includes('wheelchair'));
    if (hasWheelchair) priority += 30;

    // Group type priority
    switch (groupType) {
      case GroupType.ROOMMATE:
        priority += 25; // Explicit roommate requests are high priority
        break;
      case GroupType.FAMILY:
        priority += 20;
        break;
      case GroupType.CHURCH:
        priority += 10;
        break;
      case GroupType.GOVERNORATE:
        priority += 5;
        break;
      case GroupType.INDIVIDUAL:
        priority += 0;
        break;
    }

    // Larger groups get slightly higher priority (harder to place)
    priority += Math.min(members.length, 10);

    return priority;
  }

  /**
   * Determine group constraints based on members' attributes
   */
  private determineGroupConstraints(members: Attendee[]): {
    requiredRoomType?: 'GENERAL' | 'VIP' | 'FAMILY';
    requiredGender?: Gender;
    mustBeNearby?: boolean;
    requiresAccessibility?: boolean;
    requiresGroundFloor?: boolean;
    requiresElevator?: boolean;
    maxRoomCapacity?: number;
  } {
    const constraints: any = {};

    // Required gender (all members should have same gender)
    const genders = new Set(members.map(m => m.gender).filter(g => g !== null));
    if (genders.size === 1) {
      constraints.requiredGender = Array.from(genders)[0];
    }

    // Required room type
    const hasVIP = members.some(m => m.isServant || m.conferenceRole === 'VIP' || m.conferenceRole === 'LEADER');
    const hasFamily = members.some(m => 
      m.roomingNotes?.toLowerCase().includes('family') ||
      m.notes?.toLowerCase().includes('family')
    );
    if (hasVIP) {
      constraints.requiredRoomType = 'VIP';
    } else if (hasFamily) {
      constraints.requiredRoomType = 'FAMILY';
    }

    // Accessibility needs
    const needsWheelchair = members.some(m => 
      m.notes?.toLowerCase().includes('wheelchair') ||
      m.roomingNotes?.toLowerCase().includes('wheelchair')
    );
    const needsGroundFloor = members.some(m => 
      m.roomingNotes?.toLowerCase().includes('ground floor') ||
      m.roomingNotes?.toLowerCase().includes('first floor') ||
      needsWheelchair
    );
    const needsElevator = members.some(m =>
      m.roomingNotes?.toLowerCase().includes('elevator') ||
      m.roomingNotes?.toLowerCase().includes('lift')
    );

    if (needsWheelchair || needsGroundFloor || needsElevator) {
      constraints.requiresAccessibility = true;
    }
    if (needsGroundFloor) {
      constraints.requiresGroundFloor = true;
    }
    if (needsElevator) {
      constraints.requiresElevator = true;
    }

    // Group size constraints
    if (members.length > 1) {
      constraints.mustBeNearby = true; // Groups should be in nearby rooms
    }

    return constraints;
  }

  /**   * Emit progress event to callback
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
