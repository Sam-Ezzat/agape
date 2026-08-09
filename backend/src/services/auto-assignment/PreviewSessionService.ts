// WHY: Orchestrates the shared, backend-persisted auto-assignment preview
// draft — lets multiple admins view/edit the SAME draft concurrently
// (instead of each admin's private localStorage copy), with an
// optimistic-concurrency conflict check and an activity log reusing the
// existing AuditLog table.

import { AutoAssignmentPreviewSession } from '@prisma/client';
import { AutoAssignmentPreviewSessionRepository } from '@/repositories/AutoAssignmentPreviewSessionRepository';
import { AuditLogRepository } from '@/repositories/AuditLogRepository';
import { AutoAssignmentService } from './AutoAssignmentService';
import { AutoAssignmentExecutionResult, RunAutoAssignmentDTO } from '@/types/auto-assignment';
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
    private autoAssignmentService: AutoAssignmentService
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
  ): Promise<{ assignmentsCreated: number }> {
    const session = await this.sessionRepository.findSessionById(sessionId, organizationId);
    if (!session) {
      throw new Error('Preview session not found');
    }

    const data = session.data as unknown as AutoAssignmentExecutionResult;
    const result = await this.autoAssignmentService.commitPreviewAssignments(
      data.assignments.map((a) => ({ attendeeId: a.attendeeId, roomId: a.roomId })),
      organizationId,
      actor.id
    );

    await this.auditLogRepository.createLog({
      action: 'executed',
      entityType: ENTITY_TYPE,
      entityId: sessionId,
      details: { summary: `${actor.name} confirmed and executed the draft`, assignmentsCreated: result.assignmentsCreated },
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
