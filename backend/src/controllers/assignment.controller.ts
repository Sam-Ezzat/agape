/**
 * Room Assignment Controller
 * 
 * WHY: HTTP layer for room assignment operations
 * Thin controller that delegates to AssignmentService
 */

import { Request, Response } from 'express';
import { AssignmentService } from '@/services/assignment.service';
import { SwapValidationService } from '@/services/assignment/SwapValidationService';
import {
  CreateAssignmentDTO,
  UpdateAssignmentDTO,
  BatchAssignmentDTO,
  AssignmentFilterParams,
} from '@/validators/assignment.schemas';

export class AssignmentController {
  constructor(
    private assignmentService: AssignmentService,
    private swapValidationService?: SwapValidationService
  ) {}

  /**
   * POST /api/assignments
   * Create room assignment
   */
  async create(req: Request, res: Response) {
    const data: CreateAssignmentDTO = req.body;
    const assignment = await this.assignmentService.create(data);
    res.status(201).json({
      success: true,
      data: assignment,
    });
  }

  /**
   * GET /api/assignments/:id
   * Get single assignment
   */
  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const assignment = await this.assignmentService.getById(id);
    res.json({
      success: true,
      data: assignment,
    });
  }

  /**
   * GET /api/assignments
   * List assignments with filters
   */
  async getAll(req: Request, res: Response) {
    const params: AssignmentFilterParams = req.query as any;
    const result = await this.assignmentService.list(params);
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
   * GET /api/assignments/availability
   * Get room availability
   */
  async getAvailability(req: Request, res: Response) {
    const availability = await this.assignmentService.getAvailability();
    res.json({
      success: true,
      data: availability,
    });
  }

  /**
   * GET /api/assignments/room/:roomId
   * Get assignments for a room
   */
  async getByRoom(req: Request, res: Response) {
    const { roomId } = req.params;
    const assignments = await this.assignmentService.getByRoomId(roomId);
    res.json({
      success: true,
      data: assignments,
    });
  }

  /**
   * PATCH /api/assignments/:id
   * Update assignment (move to different room)
   */
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const data: UpdateAssignmentDTO = req.body;
    const assignment = await this.assignmentService.update(id, data);
    res.json({
      success: true,
      data: assignment,
    });
  }

  /**
   * DELETE /api/assignments/:id
   * Delete assignment (unassign attendee)
   */
  async delete(req: Request, res: Response) {
    const { id } = req.params;
    await this.assignmentService.delete(id);
    res.json({
      success: true,
      message: 'Assignment deleted successfully',
    });
  }

  /**
   * POST /api/assignments/batch
   * Batch assign multiple attendees
   */
  async batchAssign(req: Request, res: Response) {
    const data: BatchAssignmentDTO = req.body;
    const result = await this.assignmentService.batchAssign(data);
    res.json({
      success: true,
      data: result,
      message: `Batch assignment complete: ${result.successful.length} successful, ${result.failed.length} failed`,
    });
  }

  /**
   * POST /api/assignments/swap/validate
   * Validate room assignment swap between attendees
   */
  async validateSwap(req: Request, res: Response) {
    if (!this.swapValidationService) {
      return res.status(501).json({
        success: false,
        error: 'Swap validation service not available',
      });
    }

    const { groupA, groupB } = req.body;

    if (!Array.isArray(groupA) || !Array.isArray(groupB)) {
      return res.status(400).json({
        success: false,
        error: 'groupA and groupB must be arrays of attendee IDs',
      });
    }

    if (groupA.length === 0 || groupB.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Both groups must have at least one attendee',
      });
    }

    const validation = await this.swapValidationService.validateSwap({
      groupA,
      groupB,
    });

    res.json({
      success: true,
      data: validation,
    });
  }

  /**
   * POST /api/assignments/swap
   * Execute room assignment swap between attendees
   */
  async executeSwap(req: Request, res: Response) {
    if (!this.swapValidationService) {
      return res.status(501).json({
        success: false,
        error: 'Swap validation service not available',
      });
    }

    const { groupA, groupB } = req.body;

    if (!Array.isArray(groupA) || !Array.isArray(groupB)) {
      return res.status(400).json({
        success: false,
        error: 'groupA and groupB must be arrays of attendee IDs',
      });
    }

    // Validate first
    const validation = await this.swapValidationService.validateSwap({
      groupA,
      groupB,
    });

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Swap validation failed',
        validation,
      });
    }

    // Execute swap
    await this.swapValidationService.executeSwap({
      groupA,
      groupB,
    });

    res.json({
      success: true,
      message: `Successfully swapped ${groupA.length + groupB.length} attendees`,
      validation,
    });
  }
}
