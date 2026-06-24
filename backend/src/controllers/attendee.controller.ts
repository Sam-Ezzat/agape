/**
 * Attendee Controller
 * 
 * WHY: HTTP layer for attendee operations
 * Thin controller that delegates to AttendeeService
 */

import { Request, Response } from 'express';
import { AttendeeService } from '@/services/attendee.service';
import { CreateAttendeeDTO, UpdateAttendeeDTO, AttendeeFilterParams } from '@/validators/attendee.schemas';

export class AttendeeController {
  constructor(private attendeeService: AttendeeService) {}

  /**
   * POST /api/attendees
   * Create new attendee
   */
  async create(req: Request, res: Response) {
    const data: CreateAttendeeDTO = req.body;
    const attendee = await this.attendeeService.create(data);
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
    const attendee = await this.attendeeService.getById(id);
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
    const attendee = await this.attendeeService.getWithDetails(id);
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
    const result = await this.attendeeService.list(params);
    res.json({
      success: true,
      ...result,
    });
  }

  /**
   * GET /api/attendees/unassigned
   * Get attendees without room assignment
   */
  async getUnassigned(req: Request, res: Response) {
    const attendees = await this.attendeeService.getUnassigned();
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
    const stats = await this.attendeeService.getStatistics();
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
    const attendee = await this.attendeeService.update(id, data);
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
    await this.attendeeService.delete(id);
    res.json({
      success: true,
      message: 'Attendee deleted successfully',
    });
  }

  /**
   * POST /api/attendees/:id/check-in
   * Check in attendee
   */
  async checkIn(req: Request, res: Response) {
    const { id } = req.params;
    const attendee = await this.attendeeService.checkIn(id);
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
    const attendee = await this.attendeeService.checkOut(id);
    res.json({
      success: true,
      data: attendee,
      message: 'Attendee checked out successfully',
    });
  }
}
