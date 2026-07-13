/**
 * Building Repository
 * 
 * WHY: Data access layer for building entity
 * Handles all database operations for buildings within conference houses
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles building data access
 * - Dependency Injection: Receives Prisma client via constructor
 */

import { PrismaClient, Building, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export class BuildingRepository extends BaseRepository<Building, Prisma.BuildingDelegate> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.building);
  }

  /**
   * Find buildings by conference house
   * WHY: Most common query - get all buildings for a house
   */
  async findByConferenceHouseId(conferenceHouseId: string): Promise<Building[]> {
    return this.model.findMany({
      where: { conferenceHouseId },
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                assignments: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }) as unknown as Building[];
  }

  /**
   * Find all buildings
   * WHY: List all buildings across all conference houses
   */
  async findAll(): Promise<Building[]> {
    return this.model.findMany({
      include: {
        floors: {
          include: {
            rooms: {
              include: {
                assignments: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }) as unknown as Building[];
  }

  /**
   * Find building with floors
   * WHY: Often need building with its floors
   */
  async findByIdWithFloors(id: string): Promise<Building | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        floors: {
          orderBy: { floorNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Find building with full details (floors + rooms)
   * WHY: For detailed building view
   */
  async findByIdWithFullDetails(id: string): Promise<Building | null> {
    return this.model.findUnique({
      where: { id },
      include: {
        conferenceHouse: true,
        floors: {
          orderBy: { floorNumber: 'asc' },
          include: {
            rooms: {
              orderBy: { roomNumber: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * Search buildings by name within conference house
   */
  async search(
    conferenceHouseId: string,
    query: string,
    skip: number = 0,
    take: number = 20
  ): Promise<Building[]> {
    return this.model.findMany({
      where: {
        conferenceHouseId,
        name: { contains: query, mode: 'insensitive' },
      },
      skip,
      take,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Count buildings in conference house
   */
  async countByConferenceHouse(conferenceHouseId: string): Promise<number> {
    return this.model.count({
      where: { conferenceHouseId },
    });
  }
}
