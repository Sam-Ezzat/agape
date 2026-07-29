/**
 * Communication System Types
 * 
 * Types for message templates, campaigns, and WhatsApp integration
 */

export type TemplateCategory = 
  | 'ROOM_ASSIGNMENT'
  | 'CHECK_IN'
  | 'PAYMENT'
  | 'WELCOME'
  | 'REMINDER'
  | 'ANNOUNCEMENT'
  | 'FOLLOW_UP'
  | 'OTHER';

export type CampaignStatus = 
  | 'DRAFT'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type MessageStatus = 
  | 'PENDING'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED';

export type MessageChannel = 'WHATSAPP';

export interface MessageTemplate {
  id: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  subject?: string;
  body: string;
  variables: string[];
  language: string;
  hasAttachment: boolean;
  attachmentUrl?: string;
  attachmentType?: string;
  isActive: boolean;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageCampaign {
  id: string;
  name: string;
  description?: string;
  templateId: string;
  template?: MessageTemplate;
  targetFilter: CampaignTargetFilter;
  recipientCount: number;
  status: CampaignStatus;
  scheduledFor?: string;
  startedAt?: string;
  completedAt?: string;
  channel: MessageChannel;
  delayBetweenMessages: number;
  batchSize: number;
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  campaignId: string;
  campaign?: MessageCampaign;
  attendeeId: string;
  attendee?: {
    id: string;
    fullName: string;
    phone: string;
  };
  recipient: string;
  subject?: string;
  body: string;
  attachmentUrl?: string;
  status: MessageStatus;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  errorMessage?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignTargetFilter {
  conferenceRole?: string | string[];
  paymentStatus?: string;
  gender?: string;
  church?: string;
  area?: string;
  governorate?: string;
  hasRoomAssignment?: boolean;
  checkedIn?: boolean;
  attendeeIds?: string[];
}

export interface CommunicationSettings {
  id: string;
  whatsappDelayMin: number;
  whatsappDelayMax: number;
  whatsappBatchSize: number;
  whatsappBatchDelay: number;
  maxMessagesPerHour: number;
  maxMessagesPerDay: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppStatus {
  isConnected: boolean;
  isReady: boolean;
  sessionActive: boolean;
  qrCode?: string;
  lastActivity?: string;
  loadingPercent?: number;
  loadingMessage?: string;
  rateLimit?: {
    hourlyCount: number;
    dailyCount: number;
    hourlyLimit: number;
    dailyLimit: number;
    hourlyRemaining: number;
    dailyRemaining: number;
  };
}

export interface CampaignStats {
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  totalPending: number;
  successRate: number;
}

export interface MessageStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
}

// DTOs
export interface CreateTemplateDTO {
  name: string;
  description?: string;
  category: string;
  subject?: string;
  body: string;
  language?: string;
  hasAttachment?: boolean;
  attachmentUrl?: string;
  attachmentType?: string;
}

export interface UpdateTemplateDTO extends Partial<CreateTemplateDTO> {
  isActive?: boolean;
}

export interface CreateCampaignDTO {
  name: string;
  description?: string;
  templateId: string;
  targetFilter: CampaignTargetFilter;
  scheduledFor?: string;
  channel?: MessageChannel;
  delayBetweenMessages?: number;
  batchSize?: number;
}

export interface UpdateCampaignDTO extends Partial<CreateCampaignDTO> {}

export interface PreviewTemplateDTO {
  attendeeId: string;
}

export interface PreviewRecipientsDTO {
  targetFilter: CampaignTargetFilter;
}

export interface SendTestMessageDTO {
  phone: string;
}

export interface CheckNumberDTO {
  phone: string;
}

export interface TemplatePreview {
  preview: string;
}

export interface TemplateStats {
  usageCount: number;
  successRate: number;
  totalMessages: number;
  lastUsedAt?: string;
}
