/**
 * Audit Log Repository
 * 
 * WHY: Data access layer for audit trail operations
 * Records all important actions for accountability and compliance
 */

import { AuditLog, Prisma, PrismaClient } from '@prisma/client';
import { BaseRepository } from './BaseRepository';

export interface CreateAuditLogDTO {
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, any>;
  performedBy?: string;
}

export interface AuditLogFilterParams {
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export class AuditLogRepository extends BaseRepository<AuditLog, Prisma.AuditLogDelegate> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.auditLog);
  }

  /**
   * Create audit log entry
   * WHY: Record action for accountability
   */
  async createLog(data: CreateAuditLogDTO): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        details: data.details || {},
        performedBy: data.performedBy,
      },
    });
  }

  /**
   * Find logs by entity
   * WHY: Show action history for specific entity
   */
  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit to last 100 actions
    });
  }

  /**
   * Search logs with filters
   * WHY: Admin audit trail queries
   */
  async search(params: AuditLogFilterParams) {
    const { action, entityType, entityId, startDate, endDate, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entityType = entityType;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get recent activity
   * WHY: Dashboard "Recent Actions" widget
   */
  async getRecentActivity(limit: number = 20) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get statistics
   * WHY: Dashboard metrics
   */
  async getStatistics() {
    const [totalActions, actionsByType] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: true,
      }),
    ]);

    return {
      totalActions,
      byAction: Object.fromEntries(
        actionsByType.map((a) => [a.action, a._count])
      ),
    };
  }
}
