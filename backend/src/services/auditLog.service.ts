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
  async list(params: AuditLogFilterParams) {
    return this.auditLogRepository.search(params);
  }

  /**
   * Get logs for specific entity
   * WHY: View complete history of a specific item
   */
  async getByEntity(entityType: string, entityId: string) {
    return this.auditLogRepository.findByEntity(entityType, entityId);
  }

  /**
   * Get recent activity
   * WHY: Dashboard "Recent Actions" widget
   */
  async getRecentActivity(limit: number = 20) {
    return this.auditLogRepository.getRecentActivity(limit);
  }

  /**
   * Get statistics
   * WHY: Dashboard metrics
   */
  async getStatistics() {
    return this.auditLogRepository.getStatistics();
  }
}
