/**
 * Floor Service
 * 
 * WHY: Business logic layer for floor operations
 * Handles validation, business rules, and coordinates repository operations
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles floor business logic
 * - Dependency Injection: Receives repositories via constructor
 */

import { Floor } from '@prisma/client';
import { FloorRepository } from '@/repositories/FloorRepository';
import { BuildingRepository } from '@/repositories/BuildingRepository';
import { CreateFloorDTO, UpdateFloorDTO } from '@/validators/schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class FloorService {
  constructor(
    private floorRepository: FloorRepository,
    private buildingRepository: BuildingRepository
  ) {}

  /**
   * Create new floor
   * WHY: Validates building exists and creates floor
   */
  async create(data: CreateFloorDTO): Promise<Floor> {
    // Business rule: Building must exist
    const building = await this.buildingRepository.findById(data.buildingId);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    // Business rule: Check for duplicate floor number in building
    const existing = await this.floorRepository.findByBuildingAndFloorNumber(
      data.buildingId,
      data.floorNumber
    );
    if (existing) {
      throw new AppError(
        `Floor ${data.floorNumber} already exists in ${building.name}`,
        409
      );
    }

    const floor = await this.floorRepository.create(data);

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ROOM_CREATED,
        NotificationType.SUCCESS,
        `Floor ${floor.floorNumber} created in ${building.name}`,
        'Floor Created'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return floor;
  }

  /**
   * Get floor by ID
   */
  async getById(id: string, includeRooms: boolean = false): Promise<Floor> {
    const floor = includeRooms
      ? await this.floorRepository.findByIdWithRooms(id)
      : await this.floorRepository.findById(id);

    if (!floor) {
      throw new AppError('Floor not found', 404);
    }

    return floor;
  }

  /**
   * Get floor with full details
   */
  async getWithFullDetails(id: string): Promise<Floor> {
    const floor = await this.floorRepository.findByIdWithFullDetails(id);

    if (!floor) {
      throw new AppError('Floor not found', 404);
    }

    return floor;
  }

  /**
   * List floors by building
   */
  async listByBuilding(buildingId: string): Promise<Floor[]> {
    // Verify building exists
    const building = await this.buildingRepository.findById(buildingId);
    if (!building) {
      throw new AppError('Building not found', 404);
    }

    return this.floorRepository.findByBuildingId(buildingId);
  }

  /**
   * List all floors
   * WHY: Get all floors for admin dashboard
   */
  async listAll(): Promise<Floor[]> {
    return this.floorRepository.findAll();
  }

  /**
   * Update floor
   */
  async update(id: string, data: UpdateFloorDTO): Promise<Floor> {
    const existing = await this.getById(id);

    // Business rule: If updating floor number, check for duplicates
    if (data.floorNumber !== undefined && data.floorNumber !== existing.floorNumber) {
      const duplicate = await this.floorRepository.findByBuildingAndFloorNumber(
        existing.buildingId,
        data.floorNumber
      );
      if (duplicate) {
        throw new AppError('Floor number already exists in this building', 409);
      }
    }

    const updated = await this.floorRepository.update(id, data);

    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ROOM_UPDATED,
        NotificationType.INFO,
        `Floor ${updated.floorNumber} updated`,
        'Floor Updated'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * Delete floor
   */
  async delete(id: string): Promise<void> {
    const floor = await this.getById(id);

    // Business rule: Could check if has rooms (optional)
    // const roomsCount = await this.roomRepository.countByFloor(id);
    // if (roomsCount > 0) {
    //   throw new AppError('Cannot delete floor with rooms', 400);
    // }

    await this.floorRepository.delete(id);

    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ROOM_DELETED,
        NotificationType.WARNING,
        `Floor ${floor.floorNumber} deleted`,
        'Floor Deleted'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}
