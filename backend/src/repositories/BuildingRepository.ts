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
   * NOTE: organizationId ownership of conferenceHouseId must be verified by caller (service layer)
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
   * Find all buildings for an organization
   * WHY: List all buildings across all conference houses, scoped to org
   */
  async findAllByOrganization(organizationId: string): Promise<Building[]> {
    return this.model.findMany({
      where: { conferenceHouse: { organizationId } },
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
   * Find building with floors, scoped to organization
   * WHY: Often need building with its floors
   */
  async findByIdWithFloors(id: string, organizationId: string): Promise<Building | null> {
    return this.model.findFirst({
      where: { id, conferenceHouse: { organizationId } },
      include: {
        floors: {
          orderBy: { floorNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Find building with full details (floors + rooms), scoped to organization
   * WHY: For detailed building view
   */
  async findByIdWithFullDetails(id: string, organizationId: string): Promise<Building | null> {
    return this.model.findFirst({
      where: { id, conferenceHouse: { organizationId } },
      include: {
        conferenceHouse: true,
        floors: {
          orderBy: { floorNumber: 'asc' },
          include: {
            rooms: {
              orderBy: { roomNumber: 'asc' },
              // WHY: Callers (e.g. the auto-assignment preview page) need
              // real current occupancy per room — including rooms with zero
              // assignments — not just the rooms touched by a given run.
              include: {
                assignments: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find building by id scoped to organization (ownership check)
   */
  async findByIdScoped(id: string, organizationId: string): Promise<Building | null> {
    return this.model.findFirst({ where: { id, conferenceHouse: { organizationId } } });
  }

  /**
   * Update building scoped to organization
   */
  async updateScoped(id: string, organizationId: string, data: any): Promise<Building> {
    await this.assertOwnership(id, organizationId);
    return this.model.update({ where: { id }, data });
  }

  /**
   * Delete building scoped to organization
   */
  async deleteScoped(id: string, organizationId: string): Promise<Building> {
    await this.assertOwnership(id, organizationId);
    return this.model.delete({ where: { id } });
  }

  private async assertOwnership(id: string, organizationId: string): Promise<void> {
    const existing = await this.model.findFirst({
      where: { id, conferenceHouse: { organizationId } },
      select: { id: true },
    });
    if (!existing) {
      throw new Error('Building not found in organization');
    }
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
