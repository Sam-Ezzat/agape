/**
 * Attendee Controller
 *
 * WHY: HTTP layer for attendee operations
 * Thin controller that delegates to AttendeeService
 */

import { Request, Response } from 'express';
import { AttendeeService } from '@/services/attendee.service';
import { CreateAttendeeDTO, UpdateAttendeeDTO, AttendeeFilterParams, UnassignedFilterParams } from '@/validators/attendee.schemas';

export class AttendeeController {
  constructor(private attendeeService: AttendeeService) {}

  /**
   * POST /api/attendees
   * Create new attendee
   */
  async create(req: Request, res: Response) {
    const data: CreateAttendeeDTO = req.body;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.create(data, organizationId, req.user!.id);
    res.status(201).json({
      success: true,
      data: attendee,
    });
  }

  /**
   * GET /api/attendees/:id
   * Get single attendee
   */
  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.getById(id, organizationId);
    res.json({
      success: true,
      data: attendee,
    });
  }

  /**
   * GET /api/attendees/:id/details
   * Get attendee with assignment details
   */
  async getDetails(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.getWithDetails(id, organizationId);
    res.json({
      success: true,
      data: attendee,
    });
  }

  /**
   * GET /api/attendees
   * List attendees with filters
   */
  async getAll(req: Request, res: Response) {
    const params: AttendeeFilterParams = req.query as any;
    const organizationId = req.user!.organizationId;
    const result = await this.attendeeService.list(params, organizationId);
    res.json({
      success: true,
      data: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.totalPages,
      },
    });
  }

  /**
   * GET /api/attendees/unassigned
   * Get attendees without room assignment
   * Supports optional search with dual-language
   */
  async getUnassigned(req: Request, res: Response) {
    const params: UnassignedFilterParams = req.query as any;
    const organizationId = req.user!.organizationId;
    const attendees = await this.attendeeService.getUnassigned(organizationId, params);
    res.json({
      success: true,
      data: attendees,
    });
  }

  /**
   * GET /api/attendees/stats
   * Get attendee statistics
   */
  async getStats(req: Request, res: Response) {
    const organizationId = req.user!.organizationId;
    const stats = await this.attendeeService.getStatistics(organizationId);
    res.json({
      success: true,
      data: stats,
    });
  }

  /**
   * PATCH /api/attendees/:id
   * Update attendee
   */
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data: UpdateAttendeeDTO = req.body;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.update(id, data, organizationId, req.user!.id);
    res.json({
      success: true,
      data: attendee,
    });
  }

  /**
   * DELETE /api/attendees/:id
   * Soft delete attendee
   */
  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const { reason } = req.body;
    const organizationId = req.user!.organizationId;
    await this.attendeeService.delete(id, organizationId, reason, req.user!.id);
    res.json({
      success: true,
      message: 'Attendee deleted successfully',
    });
  }

  /**
   * POST /api/attendees/bulk-delete
   * Soft delete multiple attendees
   */
  async bulkDelete(req: Request, res: Response) {
    const { ids, reason } = req.body;
    const organizationId = req.user!.organizationId;
    const result = await this.attendeeService.bulkDelete(ids, organizationId, reason, req.user!.id);
    res.json({
      success: true,
      data: result,
      message: `${result.deleted.length} attendee(s) deleted successfully${
        result.failed.length > 0 ? `, ${result.failed.length} failed` : ''
      }`,
    });
  }

  /**
   * POST /api/attendees/:id/reactivate
   * Reactivate soft-deleted attendee
   */
  async reactivate(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.reactivate(id, organizationId, req.user!.id);
    res.json({
      success: true,
      data: attendee,
      message: 'Attendee reactivated successfully',
    });
  }

  /**
   * POST /api/attendees/:id/check-in
   * Check in attendee
   */
  async checkIn(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.checkIn(id, organizationId, req.user!.id);
    res.json({
      success: true,
      data: attendee,
      message: 'Attendee checked in successfully',
    });
  }

  /**
   * POST /api/attendees/:id/check-out
   * Check out attendee
   */
  async checkOut(req: Request, res: Response) {
    const { id } = req.params;
    const organizationId = req.user!.organizationId;
    const attendee = await this.attendeeService.checkOut(id, organizationId, req.user!.id);
    res.json({
      success: true,
      data: attendee,
      message: 'Attendee checked out successfully',
    });
  }

  /**
   * GET /api/attendees/search-assigned
   * Search assigned attendees with dual-language support
   * For swap modal usage
   */
  async searchAssigned(req: Request, res: Response) {
    const { query } = req.query;
    const searchQuery = typeof query === 'string' ? query : '';
    const organizationId = req.user!.organizationId;

    const attendees = await this.attendeeService.searchAssigned(searchQuery, organizationId);
    res.json({
      success: true,
      data: attendees,
    });
  }
}
