/**
 * Building Controller
 * 
 * WHY: HTTP request handlers for building endpoints
 * Thin layer that delegates to service layer
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles HTTP request/response
 * - Dependency Injection: Receives service via constructor
 */

import { Request, Response, NextFunction } from 'express';
import { BuildingService } from '@/services/building.service';
import { CreateBuildingDTO, UpdateBuildingDTO, SearchParams } from '@/validators/schemas';

export class BuildingController {
  constructor(private buildingService: BuildingService) {}

  /**
   * Create building
   * POST /api/buildings
   */
  create = async (
    req: Request<{}, {}, CreateBuildingDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const building = await this.buildingService.create(req.body);
      res.status(201).json({
        success: true,
        data: building,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get buildings by conference house
   * GET /api/conference-houses/:conferenceHouseId/buildings
   */
  getByConferenceHouse = async (
    req: Request<{ conferenceHouseId: string }, {}, {}, SearchParams>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.query.search) {
        // Search mode
        const result = await this.buildingService.search(
          req.params.conferenceHouseId,
          req.query
        );
        res.json({
          success: true,
          data: result.data,
          pagination: result.pagination,
        });
      } else {
        // List all
        const buildings = await this.buildingService.listByConferenceHouse(
          req.params.conferenceHouseId
        );
        res.json({
          success: true,
          data: buildings,
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get building by ID
   * GET /api/buildings/:id
   */
  getById = async (
    req: Request<{ id: string }, {}, {}, { includeFloors?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const includeFloors = req.query.includeFloors === 'true';
      const building = await this.buildingService.getById(req.params.id, includeFloors);
      res.json({
        success: true,
        data: building,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get building with full details
   * GET /api/buildings/:id/details
   */
  getDetails = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const building = await this.buildingService.getWithFullDetails(req.params.id);
      res.json({
        success: true,
        data: building,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update building
   * PATCH /api/buildings/:id
   */
  update = async (
    req: Request<{ id: string }, {}, UpdateBuildingDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const building = await this.buildingService.update(req.params.id, req.body);
      res.json({
        success: true,
        data: building,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete building
   * DELETE /api/buildings/:id
   */
  delete = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.buildingService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
