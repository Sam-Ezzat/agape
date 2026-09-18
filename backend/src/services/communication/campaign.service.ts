/**
 * Campaign Service
 *
 * Handles message campaign management, recipient filtering, and campaign execution
 */

import { PrismaClient, CampaignStatus, MessageStatus, MessageChannel } from '@prisma/client';
import logger from '@/utils/logger';
import { templateService } from './template.service';
import { normalizePhoneNumber, InvalidPhoneNumberError } from '@/utils/phone';
import { AppError } from '@/middleware/errorHandler';

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
  async createCampaign(data: CreateCampaignDto, organizationId: string) {
    logger.info('Creating campaign:', data.name);

    // Verify template exists and belongs to org
    await templateService.getTemplateById(data.templateId, organizationId);

    // Get recipients based on filter (scoped to org)
    const recipients = await this.filterRecipients(data.targetFilter, organizationId);

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
        organizationId,
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
  async updateCampaign(id: string, data: UpdateCampaignDto, organizationId: string) {
    logger.info('Updating campaign:', id);

    // Verify ownership
    await this.getCampaignById(id, organizationId);

    // If template is changing, verify it exists and belongs to org
    if (data.templateId) {
      await templateService.getTemplateById(data.templateId, organizationId);
    }

    // If filter is changing, recalculate recipients
    let recipientCount;
    if (data.targetFilter) {
      const recipients = await this.filterRecipients(data.targetFilter, organizationId);
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
  async deleteCampaign(id: string, organizationId: string) {
    logger.info('Deleting campaign:', id);

    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, organizationId },
    });

    if (!campaign) {
      throw new AppError(404, `Campaign not found: ${id}`);
    }

    // Only allow deletion of draft or cancelled campaigns
    if (campaign.status === CampaignStatus.IN_PROGRESS) {
      throw new AppError(400, 'Cannot delete campaign in progress. Pause or cancel it first.');
    }

    await prisma.messageCampaign.delete({
      where: { id },
    });

    logger.info('Campaign deleted:', id);
  }

  /**
   * Get all campaigns with optional filters
   */
  async getCampaigns(
    organizationId: string,
    filters?: {
      status?: CampaignStatus;
      channel?: MessageChannel;
    }
  ) {
    const where: any = { organizationId };

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
  async getCampaignById(id: string, organizationId: string) {
    const campaign = await prisma.messageCampaign.findFirst({
      where: { id, organizationId },
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
      throw new AppError(404, `Campaign not found: ${id}`);
    }

    return campaign;
  }

  /**
   * Get paginated messages for a campaign, optionally filtered by status
   */
  async getCampaignMessages(
    campaignId: string,
    organizationId: string,
    options: { status?: MessageStatus; limit?: number; offset?: number } = {}
  ) {
    const { status, limit = 50, offset = 0 } = options;

    // Verify ownership
    await this.getCampaignById(campaignId, organizationId);

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
  async filterRecipients(filter: any, organizationId: string) {
    const where: any = {
      organizationId,
      deletedAt: null, // Exclude soft-deleted attendees
    };

    // Phone is required for WhatsApp
    where.phone = { not: null };

    // WHY: Never re-message someone who's opted out (via a "STOP" reply —
    // see whatsapp.service.ts's incoming-message handler) — required by
    // WhatsApp Business policy and avoids the ban risk of being reported.
    where.whatsappOptOut = { not: true };

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

    // WHY: Two Attendee records can share a phone number (e.g. a parent
    // registered on behalf of a child) — without de-duping, that number
    // would receive the same campaign twice, which looks like spam and
    // wastes a send slot. Keeps the FIRST match per normalized number;
    // an attendee whose phone fails to normalize is left as-is so it still
    // surfaces as an individually-FAILED message in startCampaign, same as
    // today, rather than being silently dropped here.
    const seenPhones = new Set<string>();
    const deduped = attendees.filter((attendee) => {
      let normalized: string;
      try {
        normalized = normalizePhoneNumber(attendee.phone);
      } catch {
        return true;
      }
      if (seenPhones.has(normalized)) return false;
      seenPhones.add(normalized);
      return true;
    });

    return deduped;
  }

  /**
   * Preview recipients for a filter (without creating campaign)
   */
  async previewRecipients(filter: any, organizationId: string) {
    return await this.filterRecipients(filter, organizationId);
  }

  /**
   * Start campaign execution
   */
  async startCampaign(campaignId: string, organizationId: string) {
    logger.info('Starting campaign:', campaignId);

    const campaign = await this.getCampaignById(campaignId, organizationId);

    if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
      if (campaign.status === CampaignStatus.IN_PROGRESS) {
        throw new AppError(400, 'Campaign is already running. Use Pause to stop it, or wait for it to complete.');
      }
      if (campaign.status === CampaignStatus.PAUSED) {
        throw new AppError(400, 'Campaign is paused. Use Resume to continue, or Cancel to stop it.');
      }
      throw new AppError(400, `Cannot start campaign with status: ${campaign.status}`);
    }

    // Get recipients (scoped to org)
    const recipients = await this.filterRecipients(campaign.targetFilter, organizationId);

    if (recipients.length === 0) {
      throw new AppError(400, 'No recipients found for campaign');
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
            organizationId,
            campaignId: campaign.id,
            templateId: campaign.templateId,
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
    await this.updateCampaignStats(campaignId, organizationId);

    return { campaign, messages };
  }

  /**
   * Pause campaign
   */
  async pauseCampaign(campaignId: string, organizationId: string) {
    logger.info('Pausing campaign:', campaignId);

    await this.getCampaignById(campaignId, organizationId);

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
  async resumeCampaign(campaignId: string, organizationId: string) {
    logger.info('Resuming campaign:', campaignId);

    await this.getCampaignById(campaignId, organizationId);

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
   * Reset a campaign's FAILED messages back to PENDING so they can be
   * re-queued. Excludes permanently-invalid phone numbers — normalization
   * will fail identically on retry, so resetting those would just waste a
   * send slot and immediately re-fail (see startCampaign).
   */
  async retryFailedMessages(campaignId: string, organizationId: string): Promise<number> {
    logger.info('Retrying failed messages for campaign:', campaignId);

    await this.getCampaignById(campaignId, organizationId);

    const result = await prisma.message.updateMany({
      where: {
        campaignId,
        status: MessageStatus.FAILED,
        NOT: { errorMessage: { startsWith: 'Invalid phone number' } },
      },
      data: {
        status: MessageStatus.PENDING,
        errorMessage: null,
        failedAt: null,
      },
    });

    logger.info(`Reset ${result.count} failed message(s) to pending for retry: ${campaignId}`);
    return result.count;
  }

  /**
   * Cancel campaign
   */
  async cancelCampaign(campaignId: string, organizationId: string) {
    logger.info('Cancelling campaign:', campaignId);

    await this.getCampaignById(campaignId, organizationId);

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
  async getCampaignStats(campaignId: string, organizationId: string): Promise<CampaignStats> {
    const campaign = await this.getCampaignById(campaignId, organizationId);

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
  async updateCampaignStats(campaignId: string, organizationId: string) {
    const stats = await this.getCampaignStats(campaignId, organizationId);

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
