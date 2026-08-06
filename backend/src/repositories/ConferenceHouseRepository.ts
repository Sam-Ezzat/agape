/**
 * ConferenceHouse Repository
 * 
 * WHY: Data access layer for conference house entity
 * Handles all database operations for conference houses
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles conference house data access
 * - Open/Closed: Extends BaseRepository, can be extended further
 * - Liskov Substitution: Can be used wherever IRepository is expected
 * - Dependency Injection: Receives Prisma client via constructor
 */

import { PrismaClient, ConferenceHouse, Prisma } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export class ConferenceHouseRepository extends BaseRepository<
  ConferenceHouse,
  Prisma.ConferenceHouseDelegate
> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.conferenceHouse);
  }

  /**
   * Find conference house with buildings
   * WHY: Often need to fetch house with its buildings for display
   */
  async findByIdWithBuildings(id: string, organizationId: string): Promise<ConferenceHouse | null> {
    return this.model.findFirst({
      where: { id, organizationId },
      include: {
        buildings: {
          orderBy: { name: 'asc' },
        },
      },
    });
  }

  /**
   * Find conference house with full hierarchy
   * WHY: For dashboard and overview pages
   */
  async findByIdWithFullHierarchy(id: string, organizationId: string): Promise<ConferenceHouse | null> {
    return this.model.findFirst({
      where: { id, organizationId },
      include: {
        buildings: {
          orderBy: { name: 'asc' },
          include: {
            floors: {
              orderBy: { floorNumber: 'asc' },
              include: {
                rooms: {
                  orderBy: { roomNumber: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Search conference houses by name
   * WHY: For search functionality
   */
  async search(organizationId: string, query: string, skip: number = 0, take: number = 20): Promise<ConferenceHouse[]> {
    return this.model.findMany({
      where: {
        organizationId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      skip,
      take,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get total count for pagination
   */
  async countByOrganization(organizationId: string, query?: string): Promise<number> {
    if (!query) {
      return this.model.count({ where: { organizationId } });
    }

    return this.model.count({
      where: {
        organizationId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
    });
  }

  /**
   * Find all conference houses with full hierarchy
   * WHY: For dashboard occupancy breakdown
   */
  async findAllWithHierarchy(organizationId: string) {
    return this.model.findMany({
      where: { organizationId },
      include: {
        buildings: {
          orderBy: { name: 'asc' },
          include: {
            floors: {
              orderBy: { floorNumber: 'asc' },
              include: {
                rooms: {
                  orderBy: { roomNumber: 'asc' },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find conference house by ID scoped to organization
   * WHY: Ownership check used by other services before mutating child entities
   */
  async findByIdScoped(id: string, organizationId: string): Promise<ConferenceHouse | null> {
    return this.model.findFirst({ where: { id, organizationId } });
  }

  /**
   * Find all conference houses for organization (paginated)
   */
  async findAllScoped(organizationId: string, skip?: number, take?: number): Promise<ConferenceHouse[]> {
    return this.model.findMany({
      where: { organizationId },
      skip,
      take,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Update conference house scoped to organization
   */
  async updateScoped(id: string, organizationId: string, data: Partial<ConferenceHouse>): Promise<ConferenceHouse> {
    await this.assertOwnership(id, organizationId);
    return this.model.update({ where: { id }, data: data as any });
  }

  /**
   * Delete conference house scoped to organization
   */
  async deleteScoped(id: string, organizationId: string): Promise<ConferenceHouse> {
    await this.assertOwnership(id, organizationId);
    return this.model.delete({ where: { id } });
  }

  private async assertOwnership(id: string, organizationId: string): Promise<void> {
    const existing = await this.model.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!existing) {
      throw new Error('ConferenceHouse not found in organization');
    }
  }
}

