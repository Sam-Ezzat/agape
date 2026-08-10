// WHY: Orchestrates the shared, backend-persisted auto-assignment preview
// draft — lets multiple admins view/edit the SAME draft concurrently
// (instead of each admin's private localStorage copy), with an
// optimistic-concurrency conflict check and an activity log reusing the
// existing AuditLog table.

import { AutoAssignmentPreviewSession } from '@prisma/client';
import { AutoAssignmentPreviewSessionRepository } from '@/repositories/AutoAssignmentPreviewSessionRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { RoomAssignmentRepository } from '@/repositories/RoomAssignmentRepository';
import { AutoAssignmentService } from './AutoAssignmentService';
import { AssignmentResult, AutoAssignmentExecutionResult, RunAutoAssignmentDTO } from '@/types/auto-assignment';
import { ProgressCallback } from './AutoAssignmentService';

const ENTITY_TYPE = 'preview_session';

export class PreviewSessionConflictError extends Error {
  constructor(public readonly currentSession: AutoAssignmentPreviewSession) {
    super('Preview session was changed by another admin');
    this.name = 'PreviewSessionConflictError';
  }
}

export interface PreviewSessionActor {
  id: string;
  name: string;
}

export class PreviewSessionService {
  constructor(
    private sessionRepository: AutoAssignmentPreviewSessionRepository,
    private auditLogRepository: AuditLogRepository,
    private autoAssignmentService: AutoAssignmentService,
    private roomAssignmentRepository: RoomAssignmentRepository
  ) {}

  /**
   * Returns the existing shared draft for this house if one exists
   * (so a second admin resumes it instead of clobbering it), otherwise
   * runs a fresh dry-run and persists it as a new draft.
   */
  async getOrCreateSession(
    params: RunAutoAssignmentDTO,
    organizationId: string,
    actor: PreviewSessionActor,
    onProgress?: ProgressCallback
  ): Promise<{ session: AutoAssignmentPreviewSession; resumedExisting: boolean }> {
    const existing = await this.sessionRepository.findByHouse(params.conferenceHouseId, organizationId);
    if (existing) {
      return { session: existing, resumedExisting: true };
    }

    const result = await this.autoAssignmentService.execute(
      { ...params, dryRun: true },
      organizationId,
      onProgress
    );

    // WHY: The dry-run algorithm only ever processes UNASSIGNED attendees —
    // anyone who already has a real RoomAssignment is otherwise invisible to
    // the preview (can't be seen, moved, or swapped). Seed them in here as
    // `isExisting` entries in the SAME assignments array so the rest of the
    // page (Grid/List/Swap modal) handles them for free; commit later knows
    // to insert/move/no-op/delete based on `isExisting`/`originalRoomId`.
    const realAssignments = await this.roomAssignmentRepository.findByBuildingIds(
      params.buildingIds || [],
      organizationId
    );
    const existingEntries: AssignmentResult[] = realAssignments.map((ra) => ({
      attendeeId: ra.attendeeId,
      roomId: ra.roomId,
      score: 1,
      appliedRules: ['already_assigned'],
      reason: 'Already assigned',
      attendeeName: ra.attendee.fullName,
      gender: ra.attendee.gender,
      age: ra.attendee.age ?? undefined,
      church: ra.attendee.church,
      area: ra.attendee.area,
      governorate: ra.attendee.governorate,
      roomingNotes: ra.attendee.roomingNotes,
      roomNumber: ra.room.roomNumber,
      roomCapacity: ra.room.capacity,
      buildingName: ra.room.floor.building.name,
      floorNumber: ra.room.floor.floorNumber,
      isExisting: true,
      originalRoomId: ra.roomId,
    }));
    result.assignments = [...result.assignments, ...existingEntries];

    const session = await this.sessionRepository.createSession({
      organizationId,
      conferenceHouseId: params.conferenceHouseId,
      buildingIds: params.buildingIds || [],
      data: result as any,
      createdById: actor.id,
    });

    await this.auditLogRepository.createLog({
      action: 'created',
      entityType: ENTITY_TYPE,
      entityId: session.id,
      details: { summary: `${actor.name} started a new auto-assignment draft` },
      userId: actor.id,
      organizationId,
    });

    return { session, resumedExisting: false };
  }

  async getSession(
    conferenceHouseId: string,
    organizationId: string
  ): Promise<{ session: AutoAssignmentPreviewSession; activity: Awaited<ReturnType<AuditLogRepository['findByEntity']>> } | null> {
    const session = await this.sessionRepository.findByHouse(conferenceHouseId, organizationId);
    if (!session) return null;

    const activity = await this.auditLogRepository.findByEntity(ENTITY_TYPE, session.id, organizationId);
    return { session, activity };
  }

  /**
   * Applies an admin's edit (unassign/assign/swap — the frontend already
   * computes the resulting full draft state using the same pure logic it
   * always has, so the server just persists it) with an optimistic version
   * check so two admins editing at once can't silently clobber each other.
   */
  async applyEdit(
    sessionId: string,
    organizationId: string,
    expectedVersion: number,
    newData: AutoAssignmentExecutionResult,
    actor: PreviewSessionActor,
    activitySummary: string
  ): Promise<AutoAssignmentPreviewSession> {
    const updated = await this.sessionRepository.updateDataIfVersionMatches(
      sessionId,
      organizationId,
      expectedVersion,
      newData as any
    );

    if (!updated) {
      const current = await this.sessionRepository.findSessionById(sessionId, organizationId);
      if (!current) {
        throw new Error('Preview session not found');
      }
      throw new PreviewSessionConflictError(current);
    }

    await this.auditLogRepository.createLog({
      action: 'edit',
      entityType: ENTITY_TYPE,
      entityId: sessionId,
      details: { summary: `${actor.name} ${activitySummary}` },
      userId: actor.id,
      organizationId,
    });

    return updated;
  }

  /**
   * Commits the draft exactly as it stands (not a fresh algorithm re-run)
   * to real RoomAssignment rows, then retires the session.
   */
  async commitSession(
    sessionId: string,
    organizationId: string,
    actor: PreviewSessionActor
  ): Promise<{ assignmentsCreated: number; assignmentsMoved: number; assignmentsReleased: number }> {
    const session = await this.sessionRepository.findSessionById(sessionId, organizationId);
    if (!session) {
      throw new Error('Preview session not found');
    }

    const data = session.data as unknown as AutoAssignmentExecutionResult;
    // WHY: a real, already-assigned attendee who got dragged into
    // "Unassigned" within the draft needs their actual RoomAssignment
    // released, not just dropped from the draft's in-memory list.
    const releasedAttendeeIds = (data.unassignedAttendees || [])
      .filter((u) => u.originalRoomId)
      .map((u) => u.id);

    const result = await this.autoAssignmentService.commitPreviewChanges(
      {
        assignments: data.assignments.map((a) => ({
          attendeeId: a.attendeeId,
          roomId: a.roomId,
          isExisting: a.isExisting,
          originalRoomId: a.originalRoomId,
        })),
        releasedAttendeeIds,
      },
      organizationId,
      actor.id
    );

    await this.auditLogRepository.createLog({
      action: 'executed',
      entityType: ENTITY_TYPE,
      entityId: sessionId,
      details: {
        summary: `${actor.name} confirmed and executed the draft`,
        assignmentsCreated: result.assignmentsCreated,
        assignmentsMoved: result.assignmentsMoved,
        assignmentsReleased: result.assignmentsReleased,
      },
      userId: actor.id,
      organizationId,
    });

    await this.sessionRepository.deleteSession(sessionId, organizationId);

    return result;
  }

  async discardSession(sessionId: string, organizationId: string, actor: PreviewSessionActor): Promise<void> {
    await this.auditLogRepository.createLog({
      action: 'discarded',
      entityType: ENTITY_TYPE,
      entityId: sessionId,
      details: { summary: `${actor.name} discarded the draft` },
      userId: actor.id,
      organizationId,
    });

    await this.sessionRepository.deleteSession(sessionId, organizationId);
  }
}
