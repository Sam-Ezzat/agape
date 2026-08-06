/**
 * Audit Log Service
 *
 * WHY: Business logic layer for audit log operations
 * Provides access to system action history
 */

import { AuditLogRepository, AuditLogFilterParams } from '@/repositories/AuditLogRepository';

export class AuditLogService {
  constructor(private auditLogRepository: AuditLogRepository) {}

  /**
   * List audit logs with filters
   * WHY: Browse system action history
   */
  async list(params: AuditLogFilterParams, organizationId: string) {
    return this.auditLogRepository.search(params, organizationId);
  }

  /**
   * Get logs for specific entity
   * WHY: View complete history of a specific item
   */
  async getByEntity(entityType: string, entityId: string, organizationId: string) {
    return this.auditLogRepository.findByEntity(entityType, entityId, organizationId);
  }

  /**
   * Get recent activity
   * WHY: Dashboard "Recent Actions" widget
   */
  async getRecentActivity(organizationId: string, limit: number = 20) {
    return this.auditLogRepository.getRecentActivity(organizationId, limit);
  }

  /**
   * Get statistics
   * WHY: Dashboard metrics
   */
  async getStatistics(organizationId: string) {
    return this.auditLogRepository.getStatistics(organizationId);
  }
}
