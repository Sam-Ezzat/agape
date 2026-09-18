/**
 * Auto-Assignment Controller
 * 
 * WHY: HTTP layer for auto-assignment operations
 * Handles API requests for executing auto-assignment and managing configuration
 */

import { Request, Response } from 'express';
import { AutoAssignmentService } from '@/services/auto-assignment/AutoAssignmentService';
import { PreviewSessionService, PreviewSessionConflictError } from '@/services/auto-assignment/PreviewSessionService';
import { NotificationEvent, NotificationType } from '@/types/notifications';
import {
  RunAutoAssignmentDTO,
  AutoAssignmentProgressEvent,
  AutoAssignmentExecutionResult,
} from '@/types/auto-assignment';
import { AutoAssignmentConfigRepository } from '@/repositories/AutoAssignmentConfigRepository';
import { AttendeeRepository } from '@/repositories/AttendeeRepository';
import { RoomRepository } from '@/repositories/RoomRepository';
import { getNotificationService } from '@/utils/notification-singleton';
import logger from '@/utils/logger';

export class AutoAssignmentController {
  constructor(
    private autoAssignmentService: AutoAssignmentService,
    private configRepository: AutoAssignmentConfigRepository,
    private attendeeRepository: AttendeeRepository,
    private roomRepository: RoomRepository,
    private previewSessionService: PreviewSessionService
  ) {}

  /**
   * POST /api/auto-assignment/execute
   * Execute auto-assignment with options
   */
  async execute(req: Request, res: Response) {
    const params: RunAutoAssignmentDTO = req.body;
    const organizationId = req.user!.organizationId;
    const roomName = `org:${organizationId}:conference:${params.conferenceHouseId}`;

    logger.info('Auto-assignment execution started', {
      conferenceHouseId: params.conferenceHouseId,
      dryRun: params.dryRun,
      buildingIds: params.buildingIds,
    });

    // Progress callback to emit WebSocket events
    const onProgress = (event: AutoAssignmentProgressEvent) => {
      // Emit to conference-specific room
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        roomName,
        NotificationEvent.AUTO_ASSIGNMENT_PROGRESS,
        NotificationType.INFO,
        this.formatProgressMessage(event),
        'Auto-Assignment Progress',
        { event }
      );
    };

    try {
      const result = await this.autoAssignmentService.execute(params, organizationId, onProgress);

      logger.info('Auto-assignment execution completed', {
        success: result.success,
        assignmentsCreated: result.assignmentsCreated,
        attendeesProcessed: result.attendeesProcessed,
        executionTimeMs: result.executionTimeMs,
      });

      // Send completion notification
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        roomName,
        NotificationEvent.AUTO_ASSIGNMENT_COMPLETE,
        result.success ? NotificationType.SUCCESS : NotificationType.ERROR,
        result.success
          ? `Auto-assignment completed: ${result.assignmentsCreated} assignments created`
          : 'Auto-assignment completed with errors',
        'Auto-Assignment Complete',
        { result }
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Auto-assignment execution failed', error);

      // Send error notification
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        roomName,
        NotificationEvent.AUTO_ASSIGNMENT_ERROR,
        NotificationType.ERROR,
        error instanceof Error ? error.message : 'Auto-assignment failed',
        'Auto-Assignment Error'
      );

      throw error;
    }
  }

  /**
   * POST /api/auto-assignment/preview
   * Preview auto-assignment results (dry run)
   */
  async preview(req: Request, res: Response) {
    const params: RunAutoAssignmentDTO = {
      ...req.body,
      dryRun: true, // Force dry run mode
    };
    const organizationId = req.user!.organizationId;
    const roomName = `org:${organizationId}:conference:${params.conferenceHouseId}`;

    logger.info('Auto-assignment preview started', {
      conferenceHouseId: params.conferenceHouseId,
    });

    // Progress callback for preview
    const onProgress = (event: AutoAssignmentProgressEvent) => {
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        roomName,
        NotificationEvent.AUTO_ASSIGNMENT_PREVIEW_PROGRESS,
        NotificationType.INFO,
        this.formatProgressMessage(event),
        'Preview Progress',
        { event }
      );
    };

    try {
      const actor = { id: req.user!.id, name: req.user!.email };
      const { session, resumedExisting } = await this.previewSessionService.getOrCreateSession(
        params,
        organizationId,
        actor,
        onProgress
      );
      const result = session.data as unknown as AutoAssignmentExecutionResult;

      logger.info('Auto-assignment preview completed', {
        assignmentsWouldCreate: result.assignmentsCreated,
        attendeesProcessed: result.attendeesProcessed,
        resumedExisting,
      });

      // Send completion notification
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        roomName,
        NotificationEvent.AUTO_ASSIGNMENT_COMPLETE,
        result.success ? NotificationType.SUCCESS : NotificationType.ERROR,
        resumedExisting
          ? 'Opened an existing shared draft for this house'
          : `Preview completed: ${result.assignmentsCreated} assignments would be created (no changes made to database)`,
        'Preview Complete',
        { result }
      );

      res.status(200).json({
        success: true,
        data: result,
        sessionId: session.id,
        version: session.version,
        resumedExisting,
        message: resumedExisting
          ? 'An active draft for this house already exists — opening it'
          : 'Preview completed (no changes made to database)',
      });
    } catch (error) {
      logger.error('Auto-assignment preview failed', error);

      // Send error notification
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        roomName,
        NotificationEvent.AUTO_ASSIGNMENT_ERROR,
        NotificationType.ERROR,
        error instanceof Error ? error.message : 'Preview failed',
        'Preview Error'
      );

      throw error;
    }
  }

  /**
   * GET /api/auto-assignment/config/:conferenceHouseId
   * Get auto-assignment configuration
   */
  async getConfig(req: Request, res: Response) {
    const { conferenceHouseId } = req.params;
    const organizationId = req.user!.organizationId;

    const config = await this.configRepository.getOrCreateDefault(conferenceHouseId, organizationId);

    res.status(200).json({
      success: true,
      data: config,
    });
  }

  /**
   * PUT /api/auto-assignment/config/:conferenceHouseId
   * Update auto-assignment configuration
   */
  async updateConfig(req: Request, res: Response) {
    const { conferenceHouseId } = req.params;
    const organizationId = req.user!.organizationId;
    const updates = req.body;

    // Validate rule weights sum to approximately 1.0 (allow small floating point errors)
    if (updates.ruleWeights) {
      const totalWeight = Object.values(updates.ruleWeights as Record<string, number>)
        .reduce((sum, weight) => sum + weight, 0);
      
      if (Math.abs(totalWeight - 1.0) > 0.01) {
        res.status(400).json({
          success: false,
          error: `Rule weights must sum to 1.0 (current sum: ${totalWeight})`,
        });
        return;
      }
    }

    const config = await this.configRepository.updateByConferenceHouse(conferenceHouseId, organizationId, updates);

    logger.info('Auto-assignment configuration updated', {
      conferenceHouseId,
      changes: Object.keys(updates),
    });

    // Notify connected clients of config change
    const notificationService = getNotificationService();
    notificationService.notifyRoom(
      `org:${organizationId}:conference:${conferenceHouseId}`,
      NotificationEvent.AUTO_ASSIGNMENT_CONFIG_UPDATED,
      NotificationType.INFO,
      'Auto-assignment configuration has been updated',
      'Configuration Updated',
      { config }
    );

    res.status(200).json({
      success: true,
      data: config,
    });
  }

  /**
   * GET /api/auto-assignment/status/:conferenceHouseId
   * Get current auto-assignment status and statistics
   */
  async getStatus(req: Request, res: Response) {
    const { conferenceHouseId } = req.params;
    const organizationId = req.user!.organizationId;

    // Get attendee statistics
    const attendeeStats = await this.attendeeRepository.getStatistics(organizationId);
    const totalAttendees = attendeeStats.total;
    const assignedAttendees = attendeeStats.withAssignment;
    const unassignedAttendees = totalAttendees - assignedAttendees;

    // Get room statistics for this conference house
    const roomStats = await this.roomRepository.getRoomStatisticsByConferenceHouse(
      conferenceHouseId,
      organizationId
    );

    res.status(200).json({
      success: true,
      data: {
        totalAttendees,
        assignedAttendees,
        unassignedAttendees,
        totalRooms: roomStats.totalRooms,
        availableRooms: roomStats.availableRooms,
        occupancyRate: roomStats.occupancyRate,
      },
    });
  }

  /**
   * GET /api/auto-assignment/preview-session/:conferenceHouseId
   * Fetch the active shared draft for a house (if any) + recent activity,
   * so a second admin can open/resume what another admin is working on.
   */
  async getPreviewSession(req: Request, res: Response) {
    const { conferenceHouseId } = req.params;
    const organizationId = req.user!.organizationId;

    const result = await this.previewSessionService.getSession(conferenceHouseId, organizationId);
    if (!result) {
      res.status(404).json({ success: false, message: 'No active draft for this house' });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.session.data,
      sessionId: result.session.id,
      version: result.session.version,
      buildingIds: result.session.buildingIds,
      activity: result.activity,
    });
  }

  /**
   * PATCH /api/auto-assignment/preview-session/:id
   * Apply an edit (unassign/assign/swap) to the shared draft. The frontend
   * sends the resulting full draft state (computed with the same pure
   * logic it always used locally); this just persists it with an
   * optimistic-concurrency version check so two admins editing at once
   * can't silently clobber each other.
   */
  async applyPreviewEdit(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const { expectedVersion, data, activitySummary } = req.body;
    const actor = { id: req.user!.id, name: req.user!.email };

    try {
      const session = await this.previewSessionService.applyEdit(
        id,
        organizationId,
        expectedVersion,
        data,
        actor,
        activitySummary
      );

      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        `org:${organizationId}:conference:${session.conferenceHouseId}`,
        NotificationEvent.PREVIEW_SESSION_UPDATED,
        NotificationType.INFO,
        `${actor.name} ${activitySummary}`,
        'Preview Updated',
        { sessionId: session.id, version: session.version, activitySummary, actor }
      );

      res.status(200).json({
        success: true,
        data: session.data,
        version: session.version,
      });
    } catch (error) {
      if (error instanceof PreviewSessionConflictError) {
        res.status(409).json({
          success: false,
          message: 'This draft was just changed by another admin — review the latest version and retry.',
          data: error.currentSession.data,
          version: error.currentSession.version,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * POST /api/auto-assignment/preview-session/:id/execute
   * Commits the draft exactly as it stands (edits included) instead of
   * re-running the algorithm, then retires the shared session.
   */
  async executePreviewSession(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const actor = { id: req.user!.id, name: req.user!.email };

    const result = await this.previewSessionService.commitSession(id, organizationId, actor);

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  /**
   * DELETE /api/auto-assignment/preview-session/:id
   * Discards the shared draft without committing anything.
   */
  async discardPreviewSession(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const actor = { id: req.user!.id, name: req.user!.email };

    await this.previewSessionService.discardSession(id, organizationId, actor);

    res.status(200).json({ success: true });
  }

  /**
   * Format progress event into human-readable message
   */
  private formatProgressMessage(event: AutoAssignmentProgressEvent): string {
    switch (event.type) {
      case 'stage':
        return `Stage ${event.stage!.number}: ${event.stage!.name} - ${event.stage!.status}`;
      
      case 'progress':
        return `Progress: ${event.progress!.processed}/${event.progress!.total} (${event.progress!.percentage}%)`;
      
      case 'assignment':
        return `Assigned ${event.assignment!.attendeeName} to room ${event.assignment!.roomNumber}`;
      
      case 'error':
        return `Error: ${event.error!.reason}`;
      
      case 'complete':
        return `Completed: ${event.result!.assignmentsCreated} assignments created in ${event.result!.executionTimeMs}ms`;
      
      default:
        return 'Progress update';
    }
  }
}
