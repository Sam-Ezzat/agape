/**
 * Floor Controller
 *
 * WHY: HTTP request handlers for floor endpoints
 * Thin layer that delegates to service layer
 *
 * SOLID Principles:
 * - Single Responsibility: Only handles HTTP request/response
 * - Dependency Injection: Receives service via constructor
 */

import { Request, Response, NextFunction } from 'express';
import { FloorService } from '@/services/floor.service';
import { CreateFloorDTO, UpdateFloorDTO } from '@/validators/schemas';

export class FloorController {
  constructor(private floorService: FloorService) {}

  /**
   * List all floors
   * GET /api/floors
   */
  list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const floors = await this.floorService.listAll(organizationId);
      res.json({
        success: true,
        data: floors,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Create floor
   * POST /api/floors
   */
  create = async (
    req: Request<{}, {}, CreateFloorDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const floor = await this.floorService.create(req.body, organizationId);
      res.status(201).json({
        success: true,
        data: floor,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get floors by building
   * GET /api/buildings/:buildingId/floors
   */
  getByBuilding = async (
    req: Request<{ buildingId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const floors = await this.floorService.listByBuilding(req.params.buildingId, organizationId);
      res.json({
        success: true,
        data: floors,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get floor by ID
   * GET /api/floors/:id
   */
  getById = async (
    req: Request<{ id: string }, {}, {}, { includeRooms?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const includeRooms = req.query.includeRooms === 'true';
      const floor = await this.floorService.getById(req.params.id, organizationId, includeRooms);
      res.json({
        success: true,
        data: floor,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get floor with full details
   * GET /api/floors/:id/details
   */
  getDetails = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const floor = await this.floorService.getWithFullDetails(req.params.id, organizationId);
      res.json({
        success: true,
        data: floor,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update floor
   * PATCH /api/floors/:id
   */
  update = async (
    req: Request<{ id: string }, {}, UpdateFloorDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      const floor = await this.floorService.update(req.params.id, req.body, organizationId);
      res.json({
        success: true,
        data: floor,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete floor
   * DELETE /api/floors/:id
   */
  delete = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = req.user!.organizationId;
      await this.floorService.delete(req.params.id, organizationId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
