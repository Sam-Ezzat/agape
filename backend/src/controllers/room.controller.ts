/**
 * Room Controller
 *
 * WHY: HTTP request handlers for room endpoints
 * Thin layer that delegates to service layer
 *
 * SOLID Principles:
 * - Single Responsibility: Only handles HTTP request/response
 * - Dependency Injection: Receives service via constructor
 */

import { Request, Response, NextFunction } from 'express';
import { RoomService } from '@/services/room.service';
import { CreateRoomDTO, UpdateRoomDTO, RoomFilterParams } from '@/validators/schemas';

export class RoomController {
  constructor(private roomService: RoomService) {}

  /**
   * List all rooms
   * GET /api/rooms
   */
  list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const rooms = await this.roomService.listAll(organizationId);
      res.json({
        success: true,
        data: rooms,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Create room
   * POST /api/rooms
   */
  create = async (
    req: Request<{}, {}, CreateRoomDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const room = await this.roomService.create(req.body, organizationId);
      res.status(201).json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get rooms by floor
   * GET /api/floors/:floorId/rooms
   */
  getByFloor = async (
    req: Request<{ floorId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const rooms = await this.roomService.listByFloor(req.params.floorId, organizationId);
      res.json({
        success: true,
        data: rooms,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get available rooms
   * GET /api/rooms/available
   */
  getAvailable = async (
    req: Request<{}, {}, {}, RoomFilterParams>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const { floorId, minCapacity, roomType, page, limit } = req.query;
      const result = await this.roomService.listAvailable(
        organizationId,
        floorId,
        minCapacity,
        roomType,
        page,
        limit
      );
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Search rooms with filters
   * GET /api/rooms/search
   */
  search = async (
    req: Request<{}, {}, {}, RoomFilterParams>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const result = await this.roomService.search(req.query, organizationId);
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get room by ID
   * GET /api/rooms/:id
   */
  getById = async (
    req: Request<{ id: string }, {}, {}, { includeAssignment?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const includeAssignment = req.query.includeAssignment === 'true';
      const room = await this.roomService.getById(req.params.id, organizationId, includeAssignment);
      res.json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update room
   * PATCH /api/rooms/:id
   */
  update = async (
    req: Request<{ id: string }, {}, UpdateRoomDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const room = await this.roomService.update(req.params.id, req.body, organizationId);
      res.json({
        success: true,
        data: room,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete room
   * DELETE /api/rooms/:id
   */
  delete = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      await this.roomService.delete(req.params.id, organizationId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
