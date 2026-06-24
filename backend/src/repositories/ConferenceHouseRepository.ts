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
  async findByIdWithBuildings(id: string): Promise<ConferenceHouse | null> {
    return this.model.findUnique({
      where: { id },
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
  async findByIdWithFullHierarchy(id: string): Promise<ConferenceHouse | null> {
    return this.model.findUnique({
      where: { id },
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
  async search(query: string, skip: number = 0, take: number = 20): Promise<ConferenceHouse[]> {
    return this.model.findMany({
      where: {
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
  async count(query?: string): Promise<number> {
    if (!query) {
      return this.model.count();
    }

    return this.model.count({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
    });
  }
}
