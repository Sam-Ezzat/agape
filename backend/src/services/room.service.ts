/**
 * Room Service
 * 
 * WHY: Business logic layer for room operations
 * Handles validation, business rules, and coordinates repository operations
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles room business logic
 * - Dependency Injection: Receives repositories via constructor
 */

import { Room, RoomType } from '@prisma/client';
import { RoomRepository } from '@/repositories/RoomRepository';
import { FloorRepository } from '@/repositories/FloorRepository';
import { CreateRoomDTO, UpdateRoomDTO, RoomFilterParams } from '@/validators/schemas';
import { AppError } from '@/middleware/errorHandler';
import { getNotificationService } from './notification.service';
import { NotificationEvent, NotificationType } from '@/types/notifications';

export class RoomService {
  constructor(
    private roomRepository: RoomRepository,
    private floorRepository: FloorRepository
  ) {}

  /**
   * Create new room
   * WHY: Validates floor exists and creates room
   */
  async create(data: CreateRoomDTO): Promise<Room> {
    // Business rule: Floor must exist
    const floor = await this.floorRepository.findById(data.floorId);
    if (!floor) {
      throw new AppError(404, 'Floor not found');
    }

    // Business rule: Check for duplicate room number on floor
    const existing = await this.roomRepository.findByFloorAndRoomNumber(
      data.floorId,
      data.roomNumber
    );
    if (existing) {
      throw new AppError(
        409,
        `Room ${data.roomNumber} already exists on this floor`
      );
    }

    const room = await this.roomRepository.create(data as any);

    // Notify clients
    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ROOM_CREATED,
        NotificationType.SUCCESS,
        `Room ${room.roomNumber} created`,
        'Room Created'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return room;
  }

  /**
   * Get room by ID
   */
  async getById(id: string, includeAssignment: boolean = false): Promise<Room> {
    const room = includeAssignment
      ? await this.roomRepository.findByIdWithAssignment(id)
      : await this.roomRepository.findById(id);

    if (!room) {
      throw new AppError(404, 'Room not found');
    }

    return room;
  }

  /**
   * List rooms by floor
   */
  async listByFloor(floorId: string): Promise<Room[]> {
    // Verify floor exists
    const floor = await this.floorRepository.findById(floorId);
    if (!floor) {
      throw new AppError(404, 'Floor not found');
    }

    return this.roomRepository.findByFloorId(floorId);
  }

  /**
   * List all rooms
   * WHY: Get all rooms for admin dashboard
   */
  async listAll(): Promise<Room[]> {
    return this.roomRepository.findAll();
  }

  /**
   * List available rooms
   * WHY: For room assignment workflow
   */
  async listAvailable(
    floorId?: string,
    minCapacity?: number,
    type?: RoomType,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    data: Room[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const skip = (page - 1) * limit;
    const data = await this.roomRepository.findAvailable(floorId, minCapacity, type, skip, limit);
    const total = await this.roomRepository.countAvailable(floorId, type);

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
   * Search rooms with filters
   * WHY: Advanced search functionality for room management
   */
  async search(
    params: RoomFilterParams
  ): Promise<{
    data: Room[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const { page = 1, limit = 20, roomType, ...filters } = params;
    const skip = (page - 1) * limit;

    const data = await this.roomRepository.findWithFilters({
      ...filters,
      type: roomType,
      skip,
      take: limit,
    });

    // For total count, we'd need to add a count method with filters
    // For now, return data length as approximation
    const total = data.length;

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
   * Update room
   */
  async update(id: string, data: UpdateRoomDTO): Promise<Room> {
    const existing = await this.getById(id);

    // Business rule: If updating room number, check for duplicates
    if (data.roomNumber && data.roomNumber !== existing.roomNumber) {
      const duplicate = await this.roomRepository.findByFloorAndRoomNumber(
        existing.floorId,
        data.roomNumber
      );
      if (duplicate) {
        throw new AppError(409, 'Room number already exists on this floor');
      }
    }

    const updated = await this.roomRepository.update(id, data as any);

    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ROOM_UPDATED,
        NotificationType.INFO,
        `Room ${updated.roomNumber} updated`,
        'Room Updated'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }

    return updated;
  }

  /**
   * Delete room
   */
  async delete(id: string): Promise<void> {
    const room = await this.getById(id, true);

    // Business rule: Cannot delete room with active assignment
    if ((room as any).assignments && (room as any).assignments.length > 0) {
      throw new AppError(400, 'Cannot delete room with active assignment');
    }

    await this.roomRepository.delete(id);

    try {
      const notificationService = getNotificationService();
      notificationService.broadcast(
        NotificationEvent.ROOM_DELETED,
        NotificationType.WARNING,
        `Room ${room.roomNumber} deleted`,
        'Room Deleted'
      );
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }
}
