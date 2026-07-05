/**
 * Auto-Assignment Controller
 * 
 * WHY: HTTP layer for auto-assignment operations
 * Handles API requests for executing auto-assignment and managing configuration
 */

import { Request, Response } from 'express';
import { AutoAssignmentService } from '@/services/auto-assignment/AutoAssignmentService';
import { NotificationEvent, NotificationType } from '@/types/notifications';
import {
  RunAutoAssignmentDTO,
  AutoAssignmentProgressEvent,
} from '@/types/auto-assignment';
import { AutoAssignmentConfigRepository } from '@/repositories/AutoAssignmentConfigRepository';
import { getNotificationService } from '@/utils/notification-singleton';
import logger from '@/utils/logger';

export class AutoAssignmentController {
  constructor(
    private autoAssignmentService: AutoAssignmentService,
    private configRepository: AutoAssignmentConfigRepository
  ) {}

  /**
   * POST /api/auto-assignment/execute
   * Execute auto-assignment with options
   */
  async execute(req: Request, res: Response) {
    const params: RunAutoAssignmentDTO = req.body;
    
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
        params.conferenceHouseId,
        NotificationEvent.AUTO_ASSIGNMENT_PROGRESS,
        NotificationType.INFO,
        this.formatProgressMessage(event),
        'Auto-Assignment Progress',
        { event }
      );
    };

    try {
      const result = await this.autoAssignmentService.execute(params, onProgress);

      logger.info('Auto-assignment execution completed', {
        success: result.success,
        assignmentsCreated: result.assignmentsCreated,
        attendeesProcessed: result.attendeesProcessed,
        executionTimeMs: result.executionTimeMs,
      });

      // Send completion notification
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        params.conferenceHouseId,
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
        params.conferenceHouseId,
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

    logger.info('Auto-assignment preview started', {
      conferenceHouseId: params.conferenceHouseId,
    });

    // Progress callback for preview
    const onProgress = (event: AutoAssignmentProgressEvent) => {
      const notificationService = getNotificationService();
      notificationService.notifyRoom(
        params.conferenceHouseId,
        NotificationEvent.AUTO_ASSIGNMENT_PREVIEW_PROGRESS,
        NotificationType.INFO,
        this.formatProgressMessage(event),
        'Preview Progress',
        { event }
      );
    };

    const result = await this.autoAssignmentService.execute(params, onProgress);

    logger.info('Auto-assignment preview completed', {
      assignmentsWouldCreate: result.assignmentsCreated,
      attendeesProcessed: result.attendeesProcessed,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: 'Preview completed (no changes made to database)',
    });
  }

  /**
   * GET /api/auto-assignment/config/:conferenceHouseId
   * Get auto-assignment configuration
   */
  async getConfig(req: Request, res: Response) {
    const { conferenceHouseId } = req.params;

    const config = await this.configRepository.getOrCreateDefault(conferenceHouseId);

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

    const config = await this.configRepository.updateByConferenceHouse(conferenceHouseId, updates);

    logger.info('Auto-assignment configuration updated', {
      conferenceHouseId,
      changes: Object.keys(updates),
    });

    // Notify connected clients of config change
    const notificationService = getNotificationService();
    notificationService.notifyRoom(
      conferenceHouseId,
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

    // For now, return basic status
    // Future: Track running executions, last execution time, etc.
    const config = await this.configRepository.getOrCreateDefault(conferenceHouseId);

    res.status(200).json({
      success: true,
      data: {
        configured: config.enabledBuildings.length > 0,
        enabledBuildings: config.enabledBuildings,
        optimizationEnabled: config.optimizationEnabled,
        lastUpdated: config.updatedAt,
      },
    });
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
