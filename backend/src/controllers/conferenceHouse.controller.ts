/**
 * ConferenceHouse Controller
 * 
 * WHY: HTTP request handlers for conference house endpoints
 * Thin layer that delegates to service layer
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles HTTP request/response
 * - Dependency Injection: Receives service via constructor
 */

import { Request, Response, NextFunction } from 'express';
import { ConferenceHouseService } from '@/services/conferenceHouse.service';
import {
  CreateConferenceHouseDTO,
  UpdateConferenceHouseDTO,
  SearchParams,
} from '@/validators/schemas';

export class ConferenceHouseController {
  constructor(private conferenceHouseService: ConferenceHouseService) {}

  /**
   * Create conference house
   * POST /api/conference-houses
   */
  create = async (
    req: Request<{}, {}, CreateConferenceHouseDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const conferenceHouse = await this.conferenceHouseService.create(req.body);
      res.status(201).json({
        success: true,
        data: conferenceHouse,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get all conference houses
   * GET /api/conference-houses
   */
  getAll = async (
    req: Request<{}, {}, {}, SearchParams>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.conferenceHouseService.list(req.query);
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
   * Get conference house by ID
   * GET /api/conference-houses/:id
   */
  getById = async (
    req: Request<{ id: string }, {}, {}, { includeBuildings?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const includeBuildings = req.query.includeBuildings === 'true';
      const conferenceHouse = await this.conferenceHouseService.getById(
        req.params.id,
        includeBuildings
      );
      res.json({
        success: true,
        data: conferenceHouse,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get conference house with full hierarchy
   * GET /api/conference-houses/:id/hierarchy
   */
  getHierarchy = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const conferenceHouse = await this.conferenceHouseService.getWithFullHierarchy(
        req.params.id
      );
      res.json({
        success: true,
        data: conferenceHouse,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update conference house
   * PATCH /api/conference-houses/:id
   */
  update = async (
    req: Request<{ id: string }, {}, UpdateConferenceHouseDTO>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const conferenceHouse = await this.conferenceHouseService.update(req.params.id, req.body);
      res.json({
        success: true,
        data: conferenceHouse,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Delete conference house
   * DELETE /api/conference-houses/:id
   */
  delete = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.conferenceHouseService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
