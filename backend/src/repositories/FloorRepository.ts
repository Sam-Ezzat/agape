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
   * NOTE: organizationId ownership of buildingId must be verified by caller (service layer)
   */
  async findByBuildingId(buildingId: string): Promise<Floor[]> {
    return this.model.findMany({
      where: { buildingId },
      orderBy: { floorNumber: 'asc' },
    });
  }

  /**
   * Find all floors for an organization
   * WHY: List all floors across all buildings, scoped to org
   */
  async findAllByOrganization(organizationId: string): Promise<Floor[]> {
    return this.model.findMany({
      where: { building: { conferenceHouse: { organizationId } } },
      orderBy: { floorNumber: 'asc' },
    });
  }

  /**
   * Find floor with rooms, scoped to organization
   * WHY: Often need floor with its rooms
   */
  async findByIdWithRooms(id: string, organizationId: string): Promise<Floor | null> {
    return this.model.findFirst({
      where: { id, building: { conferenceHouse: { organizationId } } },
      include: {
        rooms: {
          orderBy: { roomNumber: 'asc' },
        },
      },
    });
  }

  /**
   * Find floor with full details (building + rooms), scoped to organization
   * WHY: For detailed floor view
   */
  async findByIdWithFullDetails(id: string, organizationId: string): Promise<Floor | null> {
    return this.model.findFirst({
      where: { id, building: { conferenceHouse: { organizationId } } },
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
   * Find floor by id scoped to organization (ownership check)
   */
  async findByIdScoped(id: string, organizationId: string): Promise<Floor | null> {
    return this.model.findFirst({ where: { id, building: { conferenceHouse: { organizationId } } } });
  }

  /**
   * Update floor scoped to organization
   */
  async updateScoped(id: string, organizationId: string, data: any): Promise<Floor> {
    await this.assertOwnership(id, organizationId);
    return this.model.update({ where: { id }, data });
  }

  /**
   * Delete floor scoped to organization
   */
  async deleteScoped(id: string, organizationId: string): Promise<Floor> {
    await this.assertOwnership(id, organizationId);
    return this.model.delete({ where: { id } });
  }

  private async assertOwnership(id: string, organizationId: string): Promise<void> {
    const existing = await this.model.findFirst({
      where: { id, building: { conferenceHouse: { organizationId } } },
      select: { id: true },
    });
    if (!existing) {
      throw new Error('Floor not found in organization');
    }
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
