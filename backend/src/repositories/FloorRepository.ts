/**
 * Floor Repository
 * 
 * WHY: Data access layer for floor entity
 * Handles all database operations for floors within buildings
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles floor data access
 * - Dependency Injection: Receives Prisma client via constructor
 */

import { PrismaClient, Floor, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export class FloorRepository extends BaseRepository<Floor, Prisma.FloorDelegate> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.floor);
  }

  /**
   * Find floors by building
   * WHY: Most common query - get all floors for a building
   */
  async findByBuildingId(buildingId: string): Promise<Floor[]> {
    return this.model.findMany({
      where: { buildingId },
      orderBy: { floorNumber: 'asc' },
    });
  }

  /**
   * Find all floors
   * WHY: List all floors across all buildings
   */
  async findAll(): Promise<Floor[]> {
    return this.model.findMany({
      orderBy: { floorNumber: 'asc' },
    });
  }

  /**
   * Find floor with rooms
   * WHY: Often need floor with its rooms
   */
  async findByIdWithRooms(id: string): Promise<Floor | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        rooms: {
          orderBy: { roomNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Find floor with full details (building + rooms)
   * WHY: For detailed floor view
   */
  async findByIdWithFullDetails(id: string): Promise<Floor | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        building: {
          include: {
            conferenceHouse: true,
          },
        },
        rooms: {
          orderBy: { roomNumber: 'asc' },
          include: {
            assignments: {
              include: {
                attendee: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find floor by building and floor number
   * WHY: Useful for checking if floor exists before creation
   */
  async findByBuildingAndFloorNumber(
    buildingId: string,
    floorNumber: number
  ): Promise<Floor | null> {
    return this.model.findUnique({
      where: {
        buildingId_floorNumber: {
          buildingId,
          floorNumber,
        },
      },
    });
  }

  /**
   * Count floors in building
   */
  async countByBuilding(buildingId: string): Promise<number> {
    return this.model.count({
      where: { buildingId },
    });
  }
}
