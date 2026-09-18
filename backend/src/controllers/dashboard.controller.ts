/**
 * Dashboard Controller
 *
 * WHY: HTTP layer for dashboard operations
 * Provides aggregated statistics and metrics for overview displays
 */

import { Request, Response } from 'express';
import { DashboardService } from '@/services/dashboard.service';

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * GET /api/dashboard/stats
   * Get overall system statistics
   */
  async getStats(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const stats = await this.dashboardService.getOverallStats(organizationId);
    res.json({
      success: true,
      data: stats,
    });
  }

  /**
   * GET /api/dashboard/occupancy
   * Get room occupancy breakdown by building/floor
   */
  async getOccupancy(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const occupancy = await this.dashboardService.getOccupancyBreakdown(organizationId);
    res.json({
      success: true,
      data: occupancy,
    });
  }

  /**
   * GET /api/dashboard/recent-activity
   * Get recent system activity
   */
  async getRecentActivity(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const activity = await this.dashboardService.getRecentActivity(organizationId, limit);
    res.json({
      success: true,
      data: activity,
    });
  }

  /**
   * GET /api/dashboard/check-ins
   * Get check-in/check-out report
   */
  async getCheckInReport(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const report = await this.dashboardService.getCheckInReport(organizationId);
    res.json({
      success: true,
      data: report,
    });
  }
}
