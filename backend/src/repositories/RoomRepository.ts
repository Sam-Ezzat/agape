/**
 * Room Repository
 * 
 * WHY: Data access layer for room entity
 * Handles all database operations for rooms within floors
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles room data access
 * - Dependency Injection: Receives Prisma client via constructor
 */

import { PrismaClient, Room, Prisma, RoomType } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export class RoomRepository extends BaseRepository<Room, Prisma.RoomDelegate> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.room);
  }

  /**
   * Find rooms by floor
   * WHY: Most common query - get all rooms on a floor
   * NOTE: organizationId ownership of floorId must be verified by caller (service layer)
   */
  async findByFloorId(floorId: string): Promise<Room[]> {
    return this.model.findMany({
      where: { floorId },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /**
   * Find all rooms for an organization
   * WHY: List all rooms across all floors, scoped to org
   */
  async findAllByOrganization(organizationId: string): Promise<Room[]> {
    return this.model.findMany({
      where: { floor: { building: { conferenceHouse: { organizationId } } } },
      orderBy: { roomNumber: 'asc' },
    });
  }

  /**
   * Find room by id scoped to organization (ownership check)
   */
  async findByIdScoped(id: string, organizationId: string): Promise<Room | null> {
    return this.model.findFirst({
      where: { id, floor: { building: { conferenceHouse: { organizationId } } } },
    });
  }

  /**
   * Update room scoped to organization
   */
  async updateScoped(id: string, organizationId: string, data: any): Promise<Room> {
    await this.assertOwnership(id, organizationId);
    return this.model.update({ where: { id }, data });
  }

  /**
   * Delete room scoped to organization
   */
  async deleteScoped(id: string, organizationId: string): Promise<Room> {
    await this.assertOwnership(id, organizationId);
    return this.model.delete({ where: { id } });
  }

  private async assertOwnership(id: string, organizationId: string): Promise<void> {
    const existing = await this.model.findFirst({
      where: { id, floor: { building: { conferenceHouse: { organizationId } } } },
      select: { id: true },
    });
    if (!existing) {
      throw new Error('Room not found in organization');
    }
  }

  /**
   * Find room with assignment
   * WHY: Often need to check if room is occupied
   */
  async findByIdWithAssignment(id: string, organizationId: string): Promise<Room | null> {
    return this.model.findFirst({
      where: { id, floor: { building: { conferenceHouse: { organizationId } } } },
      include: {
        assignments: {
          include: {
            attendee: true,
          },
        },
        floor: {
          include: {
            building: {
              include: {
                conferenceHouse: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find available rooms
   * WHY: For room assignment workflow
   */
  async findAvailable(
    organizationId: string,
    floorId?: string,
    minCapacity?: number,
    type?: RoomType,
    skip: number = 0,
    take: number = 20
  ): Promise<Room[]> {
    return this.model.findMany({
      where: {
        floorId,
        floor: { building: { conferenceHouse: { organizationId } } },
        capacity: minCapacity ? { gte: minCapacity } : undefined,
        roomType: type,
        assignments: { none: {} }, // WHY: No assignments means available
      },
      skip,
      take,
      orderBy: [{ roomNumber: 'asc' }],
    });
  }

  /**
   * Find rooms with filters
   * WHY: Advanced search functionality
   */
  async findWithFilters(filters: {
    organizationId: string;
    buildingId?: string;
    floorId?: string;
    type?: RoomType;
    minCapacity?: number;
    maxCapacity?: number;
    skip?: number;
    take?: number;
  }): Promise<Room[]> {
    const {
      organizationId,
      buildingId,
      floorId,
      type,
      minCapacity,
      maxCapacity,
      skip = 0,
      take = 20,
    } = filters;

    return this.model.findMany({
      where: {
        floorId,
        floor: {
          ...(buildingId ? { buildingId } : {}),
          building: { conferenceHouse: { organizationId } },
        },
        roomType: type,
        capacity: {
          gte: minCapacity,
          lte: maxCapacity,
        },
      },
      include: {
        floor: {
          include: {
            building: true,
          },
        },
        assignments: {
          include: {
            attendee: true,
          },
        },
      },
      skip,
      take,
      orderBy: [{ roomNumber: 'asc' }],
    });
  }

  /**
   * Count available rooms
   */
  async countAvailable(organizationId: string, floorId?: string, type?: RoomType): Promise<number> {
    return this.model.count({
      where: {
        floorId,
        floor: { building: { conferenceHouse: { organizationId } } },
        roomType: type,
        assignments: { none: {} },
      },
    });
  }

  /**
   * Count all rooms for an organization
   * WHY: Dashboard statistics need a total room count scoped to org
   */
  async countByOrganization(organizationId: string): Promise<number> {
    return this.model.count({
      where: { floor: { building: { conferenceHouse: { organizationId } } } },
    });
  }

  /**
   * Count rooms by building
   */
  async countByBuilding(buildingId: string): Promise<number> {
    return this.model.count({
      where: {
        floor: {
          buildingId,
        },
      },
    });
  }

  /**
   * Find room by floor and room number
   * WHY: Useful for checking duplicates
   */
  async findByFloorAndRoomNumber(floorId: string, roomNumber: string): Promise<Room | null> {
    return this.model.findUnique({
      where: {
        floorId_roomNumber: {
          floorId,
          roomNumber,
        },
      },
    });
  }

  /**
   * Find rooms for auto-assignment with full details
   * WHY: Auto-assignment needs rooms with building context and current assignments
   * 
   * @param buildingIds - Filter rooms by building IDs
   * @param conferenceHouseId - Optional filter by conference house
   * @returns Rooms with floor, building, and assignment details
   */
  async findForAutoAssignment(
    organizationId: string,
    buildingIds: string[],
    conferenceHouseId?: string
  ): Promise<Array<Room & {
    floor: {
      floorNumber: number;
      building: {
        id: string;
        name: string;
        conferenceHouseId: string;
      };
    };
    assignments: Array<{
      id: string;
      attendeeId: string;
      roomId: string;
      assignedAt: Date;
      assignedBy: string | null;
      isLocked: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }>> {
    return this.model.findMany({
      where: {
        floor: {
          building: {
            id: { in: buildingIds },
            ...(conferenceHouseId ? { conferenceHouseId } : {}),
            conferenceHouse: { organizationId },
          },
        },
      },
      include: {
        floor: {
          select: {
            floorNumber: true,
            building: {
              select: {
                id: true,
                name: true,
                conferenceHouseId: true,
              },
            },
          },
        },
        assignments: {
          select: {
            id: true,
            attendeeId: true,
            roomId: true,
            assignedAt: true,
            assignedBy: true,
            isLocked: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [
        { floor: { building: { name: 'asc' } } },
        { floor: { floorNumber: 'asc' } },
        { roomNumber: 'asc' },
      ],
    }) as any; // Type assertion needed due to Prisma include complexity
  }

  /**
   * Get room statistics for a conference house
   * WHY: Used for dashboard and status displays
   * 
   * @param conferenceHouseId - Conference house to get stats for
   * @returns Room counts with assignment information
   */
  async getRoomStatisticsByConferenceHouse(conferenceHouseId: string, organizationId: string) {
    const rooms = await this.model.findMany({
      where: {
        floor: {
          building: {
            conferenceHouseId,
            conferenceHouse: { organizationId },
          },
        },
      },
      include: {
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter((r) => r._count.assignments > 0).length;
    const availableRooms = totalRooms - occupiedRooms;
    const occupancyRate = totalRooms > 0 ? occupiedRooms / totalRooms : 0;

    return {
      totalRooms,
      occupiedRooms,
      availableRooms,
      occupancyRate,
    };
  }
}

