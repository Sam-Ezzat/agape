/**
 * ConferenceHouse Service
 * 
 * WHY: Business logic layer for conference house operations
 * Handles validation, business rules, and coordinates repository operations
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles conference house business logic
 * - Dependency Injection: Receives repositories via constructor
 * - Interface Segregation: Small, focused methods
 */

import { ConferenceHouse } from '@prisma/client';
import { ConferenceHouseRepository } from '@/repositories/ConferenceHouseRepository';
import {
  CreateConferenceHouseDTO,
  UpdateConferenceHouseDTO,
  SearchParams,
} from '@/validators/schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class ConferenceHouseService {
  constructor(private conferenceHouseRepository: ConferenceHouseRepository) {}

  /**
   * Create new conference house
   * WHY: Validates data and creates house
   */
  async create(data: CreateConferenceHouseDTO): Promise<ConferenceHouse> {
    // Business rule: Check for duplicate name (optional, commented out for now)
    // const existing = await this.conferenceHouseRepository.search(data.name, 0, 1);
    // if (existing.length > 0 && existing[0].name === data.name) {
    //   throw new AppError('Conference house with this name already exists', 409);
    // }

    const conferenceHouse = await this.conferenceHouseRepository.create(data);

    // WHY: Notify clients of new conference house
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_CREATED,
        NotificationType.SUCCESS,
        `Conference house "${conferenceHouse.name}" created`,
        'Conference House Created'
      );
    } catch (error) {
      // WHY: Don't fail operation if notification fails
      console.error('Failed to send notification:', error);
    }

    return conferenceHouse;
  }

  /**
   * Get conference house by ID
   * WHY: Fetch single house with option to include relationships
   */
  async getById(id: string, includeBuildings: boolean = false): Promise<ConferenceHouse> {
    const conferenceHouse = includeBuildings
      ? await this.conferenceHouseRepository.findByIdWithBuildings(id)
      : await this.conferenceHouseRepository.findById(id);

    if (!conferenceHouse) {
      throw new AppError('Conference house not found', 404);
    }

    return conferenceHouse;
  }

  /**
   * Get conference house with full hierarchy
   * WHY: For dashboard and detailed views
   */
  async getWithFullHierarchy(id: string): Promise<ConferenceHouse> {
    const conferenceHouse = await this.conferenceHouseRepository.findByIdWithFullHierarchy(id);

    if (!conferenceHouse) {
      throw new AppError('Conference house not found', 404);
    }

    return conferenceHouse;
  }

  /**
   * List all conference houses with pagination
   */
  async list(params: SearchParams): Promise<{
    data: ConferenceHouse[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page = 1, limit = 20, search } = params;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      search
        ? this.conferenceHouseRepository.search(search, skip, limit)
        : this.conferenceHouseRepository.findAll(skip, limit),
      this.conferenceHouseRepository.count(search),
    ]);

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
   * Update conference house
   */
  async update(id: string, data: UpdateConferenceHouseDTO): Promise<ConferenceHouse> {
    // WHY: Check if exists before update
    await this.getById(id);

    const updated = await this.conferenceHouseRepository.update(id, data);

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_UPDATED,
        NotificationType.INFO,
        `Conference house "${updated.name}" updated`,
        'Conference House Updated'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * Delete conference house
   * WHY: Soft delete to maintain audit trail
   */
  async delete(id: string): Promise<void> {
    const conferenceHouse = await this.getById(id);

    // Business rule: Check if has buildings (optional)
    // const buildingsCount = await this.buildingRepository.countByConferenceHouse(id);
    // if (buildingsCount > 0) {
    //   throw new AppError('Cannot delete conference house with buildings', 400);
    // }

    await this.conferenceHouseRepository.delete(id);

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ATTENDEE_DELETED,
        NotificationType.WARNING,
        `Conference house "${conferenceHouse.name}" deleted`,
        'Conference House Deleted'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}
