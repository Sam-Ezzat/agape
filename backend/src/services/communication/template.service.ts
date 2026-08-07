/**
 * Template Service
 *
 * Handles message template management and rendering
 */

import { PrismaClient } from '@prisma/client';
import Handlebars from 'handlebars';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

export interface CreateTemplateDto {
  name: string;
  description?: string;
  category: string;
  subject?: string;
  body: string;
  hasAttachment?: boolean;
  attachmentUrl?: string;
  attachmentType?: string;
  language?: string;
}

export interface UpdateTemplateDto extends Partial<CreateTemplateDto> {}

export interface TemplateVariables {
  // Attendee data
  fullName?: string;
  phone?: string;
  email?: string;
  ticketId?: string;
  age?: number;
  gender?: string;
  church?: string;
  area?: string;
  governorate?: string;
  isServant?: string;
  arrivalMethod?: string;
  busPickupPoint?: string;
  mealType?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  transactionNumber?: string;
  conferenceRole?: string;

  // Room assignment data
  roomNumber?: string;
  buildingName?: string;
  floorNumber?: number;
  floorName?: string;
  roomCapacity?: number;
  roomType?: string;
  individualBeds?: number;
  bunkBeds?: number;

  // Conference data
  conferenceName?: string;

  // Custom data
  [key: string]: any;
}

/**
 * Template Service Class
 */
export class TemplateService {
  /**
   * Create a new message template
   */
  async createTemplate(data: CreateTemplateDto, organizationId: string) {
    logger.info('Creating message template:', data.name);

    // Extract variables from template body
    const variables = this.extractVariables(data.body);

    const template = await prisma.messageTemplate.create({
      data: {
        ...data,
        category: data.category as any,
        variables: variables,
        organizationId,
      },
    });

    logger.info('Template created:', template.id);
    return template;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(id: string, data: UpdateTemplateDto, organizationId: string) {
    logger.info('Updating template:', id);

    // Verify ownership before update
    await this.getTemplateById(id, organizationId);

    // If body is being updated, extract variables
    const updateData: any = { ...data };
    if (data.body) {
      updateData.variables = this.extractVariables(data.body);
    }

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: updateData,
    });

    logger.info('Template updated:', id);
    return template;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string, organizationId: string) {
    logger.info('Deleting template:', id);

    // Verify ownership before delete
    await this.getTemplateById(id, organizationId);

    await prisma.messageTemplate.delete({
      where: { id },
    });

    logger.info('Template deleted:', id);
  }

  /**
   * Get all templates with optional filters
   */
  async getTemplates(
    organizationId: string,
    filters?: {
      category?: string;
      isActive?: boolean;
      language?: string;
    }
  ) {
    const where: any = { organizationId };

    if (filters?.category) where.category = filters.category;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    if (filters?.language) where.language = filters.language;

    return await prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single template by ID
   */
  async getTemplateById(id: string, organizationId: string) {
    const template = await prisma.messageTemplate.findFirst({
      where: { id, organizationId },
    });

    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    return template;
  }

  /**
   * Render a template with provided variables
   */
  renderTemplate(templateBody: string, variables: TemplateVariables): string {
    logger.debug('Rendering template with variables');

    try {
      // Compile template with Handlebars
      const template = Handlebars.compile(templateBody);

      // Render with variables
      const rendered = template(variables);

      return rendered;
    } catch (error) {
      logger.error('Template rendering error:', error);
      throw new Error(`Failed to render template: ${error.message}`);
    }
  }

  /**
   * Preview a template with sample attendee data
   */
  async previewTemplate(templateId: string, attendeeId: string, organizationId: string) {
    logger.info('Previewing template:', templateId, 'for attendee:', attendeeId);

    // Get template
    const template = await this.getTemplateById(templateId, organizationId);

    // Get attendee with room assignment
    const attendee = await prisma.attendee.findFirst({
      where: { id: attendeeId, organizationId },
      include: {
        assignment: {
          include: {
            room: {
              include: {
                floor: {
                  include: {
                    building: {
                      include: {
                        conferenceHouse: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attendee) {
      throw new Error(`Attendee not found: ${attendeeId}`);
    }

    // Build variables object
    const variables = this.buildVariablesFromAttendee(attendee);

    // Render template
    return this.renderTemplate(template.body, variables);
  }

  /**
   * Extract variables from template body
   * Returns array of unique variable names
   */
  extractVariables(templateBody: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const variables = new Set<string>();

    let match;
    while ((match = regex.exec(templateBody)) !== null) {
      // Remove any helpers or modifiers (e.g., #if, /if)
      const varName = match[1].trim().replace(/^[#\/]/, '').split(' ')[0];
      variables.add(varName);
    }

    return Array.from(variables);
  }

  /**
   * Validate that all required variables are present
   */
  validateVariables(templateBody: string, providedVariables: TemplateVariables): {
    isValid: boolean;
    missingVariables: string[];
  } {
    const requiredVariables = this.extractVariables(templateBody);
    const missingVariables: string[] = [];

    for (const varName of requiredVariables) {
      if (!(varName in providedVariables)) {
        missingVariables.push(varName);
      }
    }

    return {
      isValid: missingVariables.length === 0,
      missingVariables,
    };
  }

  /**
   * Build variables object from attendee data
   */
  buildVariablesFromAttendee(attendee: any): TemplateVariables {
    const variables: TemplateVariables = {
      // Attendee info
      fullName: attendee.fullName,
      phone: attendee.phone || '',
      email: attendee.email || '',
      ticketId: attendee.ticketId || '',
      age: attendee.age,
      gender: attendee.gender || '',
      church: attendee.church || '',
      area: attendee.area || '',
      governorate: attendee.governorate || '',
      isServant: attendee.isServant === true ? 'Yes' : attendee.isServant === false ? 'No' : '',
      arrivalMethod: attendee.arrivalMethod || '',
      busPickupPoint: attendee.busPickupPoint || '',
      mealType: attendee.mealType || '',
      paymentMethod: attendee.paymentMethod || '',
      paymentStatus: attendee.paymentStatus || '',
      transactionNumber: attendee.transactionNumber || '',
      conferenceRole: attendee.conferenceRole || '',
    };

    // Add room assignment data if available
    if (attendee.assignment?.room) {
      const room = attendee.assignment.room;
      const floor = room.floor;
      const building = floor?.building;
      const conferenceHouse = building?.conferenceHouse;

      variables.roomNumber = room.roomNumber;
      variables.roomCapacity = room.capacity;
      variables.roomType = room.roomType;
      variables.individualBeds = room.individualBeds;
      variables.bunkBeds = room.bunkBeds;

      if (floor) {
        variables.floorNumber = floor.floorNumber;
        variables.floorName = floor.name;
      }

      if (building) {
        variables.buildingName = building.name;
      }

      if (conferenceHouse) {
        variables.conferenceName = conferenceHouse.name;
      }
    }

    return variables;
  }

  /**
   * Increment usage count for a template
   * WHY: Called internally after ownership has already been verified by the caller
   * (e.g. CampaignService.startCampaign, which loads the template scoped to org first)
   */
  async incrementUsageCount(templateId: string) {
    await prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Get template statistics
   */
  async getTemplateStats(templateId: string, organizationId: string) {
    const template = await this.getTemplateById(templateId, organizationId);

    const campaigns = await prisma.messageCampaign.count({
      where: { templateId, organizationId },
    });

    const messages = await prisma.message.count({
      where: {
        campaign: {
          templateId,
          organizationId,
        },
      },
    });

    const sentMessages = await prisma.message.count({
      where: {
        campaign: {
          templateId,
          organizationId,
        },
        status: 'SENT',
      },
    });

    return {
      template,
      totalCampaigns: campaigns,
      totalMessages: messages,
      successfulMessages: sentMessages,
      successRate: messages > 0 ? (sentMessages / messages) * 100 : 0,
    };
  }
}

// Export singleton instance
export const templateService = new TemplateService();
