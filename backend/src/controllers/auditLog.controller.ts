/**
 * Audit Log Controller
 * 
 * WHY: HTTP layer for audit log operations
 * Provides visibility into all system actions for accountability
 */

import { Request, Response } from 'express';
import { AuditLogService } from '@/services/auditLog.service';
import { AuditLogFilterParams } from '@/repositories/AuditLogRepository';

export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  /**
   * GET /api/audit-logs
   * List audit logs with filters
   */
  async getAll(req: Request, res: Response) {
    const params: AuditLogFilterParams = {
      action: req.query.action as string,
      entityType: req.query.entityType as string,
      entityId: req.query.entityId as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    };

    const result = await this.auditLogService.list(params);
    res.json({
      success: true,
      ...result,
    });
  }

  /**
   * GET /api/audit-logs/entity/:entityType/:entityId
   * Get audit logs for specific entity
   */
  async getByEntity(req: Request, res: Response) {
    const { entityType, entityId } = req.params;
    const logs = await this.auditLogService.getByEntity(entityType, entityId);
    res.json({
      success: true,
      data: logs,
    });
  }

  /**
   * GET /api/audit-logs/recent
   * Get recent activity
   */
  async getRecent(req: Request, res: Response) {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const logs = await this.auditLogService.getRecentActivity(limit);
    res.json({
      success: true,
      data: logs,
    });
  }

  /**
   * GET /api/audit-logs/stats
   * Get audit log statistics
   */
  async getStats(req: Request, res: Response) {
    const stats = await this.auditLogService.getStatistics();
    res.json({
      success: true,
      data: stats,
    });
  }
}
