/**
 * Campaign Service
 * 
 * Handles message campaign management, recipient filtering, and campaign execution
 */

import { PrismaClient, CampaignStatus, MessageStatus, MessageChannel } from '@prisma/client';
import logger from '@/utils/logger';
import { templateService } from './template.service';
import { normalizePhoneNumber, InvalidPhoneNumberError } from '@/utils/phone';

const prisma = new PrismaClient();

export interface CreateCampaignDto {
  name: string;
  description?: string;
  templateId: string;
  targetFilter: any; // JSON filter for recipient selection
  scheduledFor?: Date;
  channel?: MessageChannel;
  delayBetweenMessages?: number;
  batchSize?: number;
}

export interface UpdateCampaignDto extends Partial<CreateCampaignDto> {
  status?: CampaignStatus;
}

export interface CampaignStats {
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  successRate: number;
  status: CampaignStatus;
}

/**
 * Campaign Service Class
 */
export class CampaignService {
  /**
   * Create a new campaign
   */
  async createCampaign(data: CreateCampaignDto) {
    logger.info('Creating campaign:', data.name);
    
    // Verify template exists
    await templateService.getTemplateById(data.templateId);
    
    // Get recipients based on filter
    const recipients = await this.filterRecipients(data.targetFilter);
    
    const campaign = await prisma.messageCampaign.create({
      data: {
        name: data.name,
        description: data.description,
        templateId: data.templateId,
        targetFilter: data.targetFilter,
        recipientCount: recipients.length,
        scheduledFor: data.scheduledFor,
        channel: data.channel || MessageChannel.WHATSAPP,
        delayBetweenMessages: data.delayBetweenMessages || 5000,
        batchSize: data.batchSize || 10,
        status: data.scheduledFor ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
        totalPending: recipients.length,
      },
      include: {
        template: true,
      },
    });
    
    logger.info('Campaign created:', campaign.id);
    return campaign;
  }
  
  /**
   * Update campaign
   */
  async updateCampaign(id: string, data: UpdateCampaignDto) {
    logger.info('Updating campaign:', id);
    
    // If template is changing, verify it exists
    if (data.templateId) {
      await templateService.getTemplateById(data.templateId);
    }
    
    // If filter is changing, recalculate recipients
    let recipientCount;
    if (data.targetFilter) {
      const recipients = await this.filterRecipients(data.targetFilter);
      recipientCount = recipients.length;
    }
    
    const campaign = await prisma.messageCampaign.update({
      where: { id },
      data: {
        ...data,
        ...(recipientCount !== undefined && { recipientCount, totalPending: recipientCount }),
      },
      include: {
        template: true,
      },
    });
    
    logger.info('Campaign updated:', id);
    return campaign;
  }
  
  /**
   * Delete campaign
   */
  async deleteCampaign(id: string) {
    logger.info('Deleting campaign:', id);
    
    const campaign = await prisma.messageCampaign.findUnique({
      where: { id },
    });
    
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`);
    }
    
    // Only allow deletion of draft or cancelled campaigns
    if (campaign.status === CampaignStatus.IN_PROGRESS) {
      throw new Error('Cannot delete campaign in progress. Pause or cancel it first.');
    }
    
    await prisma.messageCampaign.delete({
      where: { id },
    });
    
    logger.info('Campaign deleted:', id);
  }
  
  /**
   * Get all campaigns with optional filters
   */
  async getCampaigns(filters?: {
    status?: CampaignStatus;
    channel?: MessageChannel;
  }) {
    const where: any = {};
    
    if (filters?.status) where.status = filters.status;
    if (filters?.channel) where.channel = filters.channel;
    
    return await prisma.messageCampaign.findMany({
      where,
      include: {
        template: true,
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  
  /**
   * Get campaign by ID
   */
  async getCampaignById(id: string) {
    const campaign = await prisma.messageCampaign.findUnique({
      where: { id },
      include: {
        template: true,
        messages: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { messages: true },
        },
      },
    });
    
    if (!campaign) {
      throw new Error(`Campaign not found: ${id}`);
    }
    
    return campaign;
  }
  
  /**
   * Get paginated messages for a campaign, optionally filtered by status
   */
  async getCampaignMessages(
    campaignId: string,
    options: { status?: MessageStatus; limit?: number; offset?: number } = {}
  ) {
    const { status, limit = 50, offset = 0 } = options;

    const where: any = { campaignId };
    if (status) {
      where.status = status;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          attendee: {
            select: { id: true, fullName: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.message.count({ where }),
    ]);

    return { messages, total };
  }

  /**
   * Filter recipients based on criteria
   */
  async filterRecipients(filter: any) {
    const where: any = {
      deletedAt: null, // Exclude soft-deleted attendees
    };
    
    // Phone is required for WhatsApp
    where.phone = { not: null };
    
    // Apply filters
    if (filter.conferenceRole) {
      where.conferenceRole = Array.isArray(filter.conferenceRole)
        ? { in: filter.conferenceRole }
        : filter.conferenceRole;
    }
    
    if (filter.paymentStatus) {
      where.paymentStatus = Array.isArray(filter.paymentStatus)
        ? { in: filter.paymentStatus }
        : filter.paymentStatus;
    }
    
    if (filter.gender) {
      where.gender = filter.gender;
    }
    
    if (filter.church) {
      where.church = { contains: filter.church, mode: 'insensitive' };
    }
    
    if (filter.area) {
      where.area = { contains: filter.area, mode: 'insensitive' };
    }
    
    if (filter.governorate) {
      where.governorate = { contains: filter.governorate, mode: 'insensitive' };
    }
    
    if (filter.hasRoomAssignment !== undefined) {
      where.assignment = filter.hasRoomAssignment
        ? { isNot: null }
        : { is: null };
    }
    
    if (filter.checkedIn !== undefined) {
      where.checkedInAt = filter.checkedIn
        ? { not: null }
        : { is: null };
    }
    
    if (filter.attendeeIds && Array.isArray(filter.attendeeIds)) {
      where.id = { in: filter.attendeeIds };
    }
    
    const attendees = await prisma.attendee.findMany({
      where,
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
    
    return attendees;
  }
  
  /**
   * Preview recipients for a filter (without creating campaign)
   */
  async previewRecipients(filter: any) {
    return await this.filterRecipients(filter);
  }
  
  /**
   * Start campaign execution
   */
  async startCampaign(campaignId: string) {
    logger.info('Starting campaign:', campaignId);
    
    const campaign = await this.getCampaignById(campaignId);
    
    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      if (campaign.status === CampaignStatus.IN_PROGRESS) {
        throw new Error('Campaign is already running. Use Pause to stop it, or wait for it to complete.');
      }
      if (campaign.status === CampaignStatus.PAUSED) {
        throw new Error('Campaign is paused. Use Resume to continue, or Cancel to stop it.');
      }
      throw new Error(`Cannot start campaign with status: ${campaign.status}`);
    }
    
    // Get recipients
    const recipients = await this.filterRecipients(campaign.targetFilter);
    
    if (recipients.length === 0) {
      throw new Error('No recipients found for campaign');
    }
    
    // Create messages for all recipients. Numbers that can't be normalized to a
    // valid, country-coded international number are created as FAILED up front
    // instead of being queued — otherwise they burn 3 retries each against
    // whatsapp-web.js, which fails with an opaque puppeteer error for a bad chat ID.
    const messages = await Promise.all(
      recipients.map(async (attendee) => {
        // Build variables for template
        const variables = templateService.buildVariablesFromAttendee(attendee);

        // Render template
        const body = templateService.renderTemplate(campaign.template.body, variables);
        const subject = campaign.template.subject
          ? templateService.renderTemplate(campaign.template.subject, variables)
          : undefined;

        let normalizedPhone: string | null = null;
        let phoneError: string | null = null;
        try {
          normalizedPhone = normalizePhoneNumber(attendee.phone);
        } catch (error) {
          phoneError = error instanceof InvalidPhoneNumberError
            ? error.message
            : `Invalid phone number "${attendee.phone}"`;
        }

        return prisma.message.create({
          data: {
            campaignId: campaign.id,
            attendeeId: attendee.id,
            recipient: normalizedPhone || attendee.phone!,
            subject,
            body,
            attachmentUrl: campaign.template.attachmentUrl,
            channel: campaign.channel,
            status: phoneError ? MessageStatus.FAILED : MessageStatus.PENDING,
            failedAt: phoneError ? new Date() : undefined,
            errorMessage: phoneError || undefined,
          },
        });
      })
    );

    const invalidCount = messages.filter(m => m.status === MessageStatus.FAILED).length;
    if (invalidCount > 0) {
      logger.warn(`Campaign ${campaignId}: ${invalidCount} recipient(s) skipped due to invalid phone numbers (missing/invalid country code)`);
    }

    // Update campaign status
    await prisma.messageCampaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.IN_PROGRESS,
        startedAt: new Date(),
        totalPending: messages.length - invalidCount,
        totalFailed: invalidCount,
      },
    });

    // Increment template usage
    await templateService.incrementUsageCount(campaign.templateId);

    logger.info(`Campaign started: ${campaignId}, ${messages.length} messages created`);

    // Reconcile status immediately in case every recipient had an invalid
    // number — otherwise the campaign would sit at IN_PROGRESS with nothing
    // ever queued and no job event to trigger the completion check.
    await this.updateCampaignStats(campaignId);

    return { campaign, messages };
  }
  
  /**
   * Pause campaign
   */
  async pauseCampaign(campaignId: string) {
    logger.info('Pausing campaign:', campaignId);
    
    const campaign = await prisma.messageCampaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.PAUSED,
      },
    });
    
    logger.info('Campaign paused:', campaignId);
    return campaign;
  }
  
  /**
   * Resume campaign
   */
  async resumeCampaign(campaignId: string) {
    logger.info('Resuming campaign:', campaignId);
    
    const campaign = await prisma.messageCampaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.IN_PROGRESS,
      },
    });
    
    logger.info('Campaign resumed:', campaignId);
    return campaign;
  }
  
  /**
   * Cancel campaign
   */
  async cancelCampaign(campaignId: string) {
    logger.info('Cancelling campaign:', campaignId);
    
    // Cancel all pending messages
    await prisma.message.updateMany({
      where: {
        campaignId,
        status: { in: [MessageStatus.PENDING, MessageStatus.QUEUED] },
      },
      data: {
        status: MessageStatus.CANCELLED,
      },
    });
    
    const campaign = await prisma.messageCampaign.update({
      where: { id: campaignId },
      data: {
        status: CampaignStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
    
    logger.info('Campaign cancelled:', campaignId);
    return campaign;
  }
  
  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const campaign = await this.getCampaignById(campaignId);
    
    const stats = await prisma.message.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: true,
    });
    
    const totalSent = stats
      .filter(s => ['SENT', 'DELIVERED', 'READ'].includes(s.status))
      .reduce((sum, s) => sum + s._count, 0);
    
    const totalFailed = stats
      .filter(s => s.status === 'FAILED')
      .reduce((sum, s) => sum + s._count, 0);
    
    const totalPending = stats
      .filter(s => ['PENDING', 'QUEUED', 'SENDING'].includes(s.status))
      .reduce((sum, s) => sum + s._count, 0);
    
    const totalRecipients = campaign.recipientCount;
    const successRate = totalRecipients > 0 ? (totalSent / totalRecipients) * 100 : 0;
    
    return {
      totalRecipients,
      totalSent,
      totalFailed,
      totalPending,
      successRate,
      status: campaign.status,
    };
  }
  
  /**
   * Update campaign statistics
   */
  async updateCampaignStats(campaignId: string) {
    const stats = await this.getCampaignStats(campaignId);
    
    await prisma.messageCampaign.update({
      where: { id: campaignId },
      data: {
        totalSent: stats.totalSent,
        totalFailed: stats.totalFailed,
        totalPending: stats.totalPending,
      },
    });
    
    // Check if campaign has finished processing (nothing left pending)
    if (stats.totalPending === 0 && stats.status === CampaignStatus.IN_PROGRESS) {
      // Every message permanently failed (e.g. WhatsApp was never connected) —
      // this isn't a successful completion, so don't call it COMPLETED.
      const allFailed = stats.totalSent === 0 && stats.totalFailed > 0;

      await prisma.messageCampaign.update({
        where: { id: campaignId },
        data: {
          status: allFailed ? CampaignStatus.FAILED : CampaignStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }
  }
}

// Export singleton instance
export const campaignService = new CampaignService();
