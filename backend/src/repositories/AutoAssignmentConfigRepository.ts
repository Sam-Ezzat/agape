// WHY: Repository for auto-assignment configuration CRUD operations
// Extends BaseRepository to reuse common database operations

import { PrismaClient, AutoAssignmentConfig } from '@prisma/client';
import { BaseRepository } from './BaseRepository';
import { AutoAssignmentConfigDTO } from '../types/auto-assignment';

/**
 * Repository for managing auto-assignment configurations
 * 
 * Provides:
 * - CRUD operations for configuration
 * - Find by conference house
 * - Default configuration creation
 */
export class AutoAssignmentConfigRepository extends BaseRepository<
  AutoAssignmentConfig,
  PrismaClient['autoAssignmentConfig']
> {
  constructor(prisma: PrismaClient) {
    super(prisma, prisma.autoAssignmentConfig);
  }

  /**
   * Find configuration by conference house ID
   * 
   * @param conferenceHouseId - Conference house ID
   * @returns Configuration or null if not found
   */
  async findByConferenceHouse(conferenceHouseId: string, organizationId: string): Promise<AutoAssignmentConfig | null> {
    return this.prisma.autoAssignmentConfig.findFirst({
      where: { conferenceHouseId, conferenceHouse: { organizationId } }
    });
  }

  /**
   * Get or create default configuration for a conference house
   * 
   * @param conferenceHouseId - Conference house ID
   * @param enabledBuildings - Initial enabled buildings (default: all)
   * @returns Configuration
   */
  async getOrCreateDefault(
    conferenceHouseId: string,
    organizationId: string,
    enabledBuildings: string[] = []
  ): Promise<AutoAssignmentConfig> {
    // Try to find existing config
    let config = await this.findByConferenceHouse(conferenceHouseId, organizationId);
    
    if (!config) {
      // Create default configuration
      config = await this.prisma.autoAssignmentConfig.create({
        data: {
          conferenceHouseId,
          enabledBuildings,
          staffReservedCapacity: 0,
          vipReservedCapacity: 0,
          emergencyReservedCapacity: 0,
          enabledRules: [
            // Default enabled rules (all hard constraints)
            'room_capacity',
            'gender_match',
            'room_type_match',
            'room_availability',
            'building_enabled'
          ],
          ruleWeights: {
            // Default weights for soft constraints
            same_church: 0.3,
            same_governorate: 0.2,
            similar_age: 0.1,
            minimize_empty_beds: 0.2,
            prefer_same_floor: 0.1,
            leader_proximity: 0.1
          },
          optimizationEnabled: true
        }
      });
    }
    
    return config;
  }

  /**
   * Update configuration
   * 
   * @param conferenceHouseId - Conference house ID
   * @param data - Configuration data to update
   * @returns Updated configuration
   */
  async updateByConferenceHouse(
    conferenceHouseId: string,
    organizationId: string,
    data: Partial<AutoAssignmentConfigDTO>
  ): Promise<AutoAssignmentConfig> {
    const existing = await this.findByConferenceHouse(conferenceHouseId, organizationId);
    if (!existing) {
      throw new Error('Auto-assignment config not found in organization');
    }
    return this.prisma.autoAssignmentConfig.update({
      where: { conferenceHouseId },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Create or update configuration (upsert)
   * WHY: organizationId ownership of conferenceHouseId must be verified by caller (service layer)
   * before calling upsert, since create requires conferenceHouseId to already belong to org
   *
   * @param data - Configuration data
   * @returns Configuration
   */
  async upsert(data: AutoAssignmentConfigDTO): Promise<AutoAssignmentConfig> {
    return this.prisma.autoAssignmentConfig.upsert({
      where: { conferenceHouseId: data.conferenceHouseId },
      create: {
        conferenceHouseId: data.conferenceHouseId,
        enabledBuildings: data.enabledBuildings,
        staffReservedCapacity: data.staffReservedCapacity || 0,
        vipReservedCapacity: data.vipReservedCapacity || 0,
        emergencyReservedCapacity: data.emergencyReservedCapacity || 0,
        enabledRules: data.enabledRules || [],
        ruleWeights: (data.ruleWeights || {}) as any,
        optimizationEnabled: data.optimizationEnabled !== false
      },
      update: {
        enabledBuildings: data.enabledBuildings,
        staffReservedCapacity: data.staffReservedCapacity,
        vipReservedCapacity: data.vipReservedCapacity,
        emergencyReservedCapacity: data.emergencyReservedCapacity,
        enabledRules: data.enabledRules,
        ruleWeights: data.ruleWeights as any,
        optimizationEnabled: data.optimizationEnabled,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Delete configuration by conference house
   * 
   * @param conferenceHouseId - Conference house ID
   * @returns Deleted configuration
   */
  async deleteByConferenceHouse(conferenceHouseId: string, organizationId: string): Promise<AutoAssignmentConfig> {
    const existing = await this.findByConferenceHouse(conferenceHouseId, organizationId);
    if (!existing) {
      throw new Error('Auto-assignment config not found in organization');
    }
    return this.prisma.autoAssignmentConfig.delete({
      where: { conferenceHouseId }
    });
  }

  /**
   * Check if configuration exists for a conference house
   *
   * @param conferenceHouseId - Conference house ID
   * @returns True if exists
   */
  async exists(conferenceHouseId: string, organizationId: string): Promise<boolean> {
    const count = await this.prisma.autoAssignmentConfig.count({
      where: { conferenceHouseId, conferenceHouse: { organizationId } }
    });
    return count > 0;
  }
}
