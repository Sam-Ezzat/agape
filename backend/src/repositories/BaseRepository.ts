/**
 * Base Repository Pattern
 * 
 * WHY: Abstract common CRUD operations to reduce code duplication
 * Implements Repository pattern for data access abstraction
 * 
 * SOLID Principles:
 * - Single Responsibility: Only handles database operations
 * - Open/Closed: Extend for specific entities, closed for modification
 * - Liskov Substitution: All repositories can be used interchangeably
 * - Dependency Injection: Receives Prisma client via constructor
 */

import { PrismaClient } from '@prisma/client';

/**
 * Generic Repository Interface
 * WHY: Defines contract for all repositories (Interface Segregation Principle)
 */
export interface IRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<T>;
}

/**
 * Abstract Base Repository
 * 
 * WHY: Provides common database operations for all entities
 * Reduces boilerplate code in specific repositories
 * 
 * Type Parameters:
 * - T: Entity type (Attendee, Room, etc.)
 * - TModel: Prisma model delegate type
 */
export abstract class BaseRepository<T, TModel> {
  /**
   * WHY: Protected allows child classes to access Prisma and model
   * Follows Dependency Injection principle
   */
  constructor(
    protected readonly prisma: PrismaClient,
    protected readonly model: TModel
  ) {}

  /**
   * Find entity by ID
   * WHY: Most common database operation, extracted to base class
   */
  async findById(id: string): Promise<T | null> {
    // WHY: Type assertion needed because Prisma delegates don't have shared type
    return (this.model as any).findUnique({
      where: { id },
    }) as Promise<T | null>;
  }

  /**
   * Find all entities
   * WHY: Used for listing pages, extracted to reduce duplication
   */
  async findAll(): Promise<T[]> {
    return (this.model as any).findMany() as Promise<T[]>;
  }

  /**
   * Create new entity
   * WHY: Common create operation with type safety
   */
  async create(data: Partial<T>): Promise<T> {
    return (this.model as any).create({
      data,
    }) as Promise<T>;
  }

  /**
   * Update existing entity
   * WHY: Common update operation with type safety
   */
  async update(id: string, data: Partial<T>): Promise<T> {
    return (this.model as any).update({
      where: { id },
      data,
    }) as Promise<T>;
  }

  /**
   * Delete entity
   * WHY: Hard delete operation (soft delete handled in specific repositories)
   */
  async delete(id: string): Promise<T> {
    return (this.model as any).delete({
      where: { id },
    }) as Promise<T>;
  }

  /**
   * Count entities
   * WHY: Get total count for pagination and statistics
   */
  async count(): Promise<number> {
    return (this.model as any).count() as Promise<number>;
  }

  /**
   * Execute operations in a transaction
   * WHY: Ensures data consistency for multi-step operations
   * Used for operations like assign + audit log in single transaction
   */
  async transaction<R>(
    fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<R>
  ): Promise<R> {
    return this.prisma.$transaction(fn);
  }
}
