/**
 * Building Service
 *
 * WHY: Business logic layer for building operations
 * Handles validation, business rules, and coordinates repository operations
 *
 * SOLID Principles:
 * - Single Responsibility: Only handles building business logic
 * - Dependency Injection: Receives repositories via constructor
 */

import { Building } from '@prisma/client';
import { BuildingRepository } from '@/repositories/BuildingRepository';
import { ConferenceHouseRepository } from '@/repositories/ConferenceHouseRepository';
import { CreateBuildingDTO, UpdateBuildingDTO, SearchParams } from '@/validators/schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class BuildingService {
  constructor(
    private buildingRepository: BuildingRepository,
    private conferenceHouseRepository: ConferenceHouseRepository
  ) {}

  /**
   * Create new building
   * WHY: Validates conference house exists and creates building
   */
  async create(data: CreateBuildingDTO, organizationId: string): Promise<Building> {
    // Business rule: Conference house must exist and belong to org
    const conferenceHouse = await this.conferenceHouseRepository.findByIdScoped(data.conferenceHouseId, organizationId);
    if (!conferenceHouse) {
      throw new AppError(404, 'Conference house not found');
    }

    const building = await this.buildingRepository.create(data);

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_CREATED,
        NotificationType.SUCCESS,
        `Building "${building.name}" created in ${conferenceHouse.name}`,
        'Building Created'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return building;
  }

  /**
   * Get building by ID
   */
  async getById(id: string, organizationId: string, includeFloors: boolean = false): Promise<Building> {
    const building = includeFloors
      ? await this.buildingRepository.findByIdWithFloors(id, organizationId)
      : await this.buildingRepository.findByIdScoped(id, organizationId);

    if (!building) {
      throw new AppError(404, 'Building not found');
    }

    return building;
  }

  /**
   * Get building with full details
   */
  async getWithFullDetails(id: string, organizationId: string): Promise<Building> {
    const building = await this.buildingRepository.findByIdWithFullDetails(id, organizationId);

    if (!building) {
      throw new AppError(404, 'Building not found');
    }

    return building;
  }

  /**
   * List buildings by conference house
   */
  async listByConferenceHouse(conferenceHouseId: string, organizationId: string): Promise<Building[]> {
    // Verify conference house exists and belongs to org
    const conferenceHouse = await this.conferenceHouseRepository.findByIdScoped(conferenceHouseId, organizationId);
    if (!conferenceHouse) {
      throw new AppError(404, 'Conference house not found');
    }

    return this.buildingRepository.findByConferenceHouseId(conferenceHouseId);
  }

  /**
   * List all buildings
   * WHY: Get all buildings for admin dashboard
   */
  async listAll(organizationId: string): Promise<Building[]> {
    return this.buildingRepository.findAllByOrganization(organizationId);
  }

  /**
   * Search buildings
   */
  async search(
    conferenceHouseId: string,
    params: SearchParams,
    organizationId: string
  ): Promise<{
    data: Building[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    // Verify conference house exists and belongs to org
    const conferenceHouse = await this.conferenceHouseRepository.findByIdScoped(conferenceHouseId, organizationId);
    if (!conferenceHouse) {
      throw new AppError(404, 'Conference house not found');
    }

    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const data = search
      ? await this.buildingRepository.search(conferenceHouseId, search, skip, limit)
      : await this.buildingRepository.findByConferenceHouseId(conferenceHouseId);

    const total = await this.buildingRepository.countByConferenceHouse(conferenceHouseId);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update building
   */
  async update(id: string, data: UpdateBuildingDTO, organizationId: string): Promise<Building> {
    await this.getById(id, organizationId);
    const updated = await this.buildingRepository.updateScoped(id, organizationId, data);

    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_UPDATED,
        NotificationType.INFO,
        `Building "${updated.name}" updated`,
        'Building Updated'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * Delete building
   */
  async delete(id: string, organizationId: string): Promise<void> {
    const building = await this.getById(id, organizationId);

    // Business rule: Could check if has floors (optional)
    // const floorsCount = await this.floorRepository.countByBuilding(id);
    // if (floorsCount > 0) {
    //   throw new AppError(400, 'Cannot delete building with floors');
    // }

    await this.buildingRepository.deleteScoped(id, organizationId);

    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        organizationId,
        NotificationEvent.ROOM_DELETED,
        NotificationType.WARNING,
        `Building "${building.name}" deleted`,
        'Building Deleted'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}
