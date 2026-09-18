# Communication Feature - Complete Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to implement a professional bulk messaging system with WhatsApp Web integration, custom template variables, and attachment support for the Agape Conference Management System.

---

## 1. System Overview

### 1.1 Core Features
- **Bulk Messaging**: Send messages to multiple attendees simultaneously
- **Template System**: Create reusable message templates with dynamic variables
- **WhatsApp Web Automation**: Browser-based automation for message delivery
- **Attachment Support**: Send files, images, PDFs with messages
- **Rate Limiting**: Intelligent delays to avoid WhatsApp bans
- **Campaign Management**: Track message campaigns and delivery status
- **Message Personalization**: Use attendee and room assignment data in templates

### 1.2 Available Data for Templates
Based on your Prisma schema, we can use:

**Attendee Information:**
- `{{fullName}}` - Full name
- `{{phone}}` - Phone number
- `{{email}}` - Email address
- `{{ticketId}}` - Conference ticket ID
- `{{age}}` - Age
- `{{gender}}` - Gender
- `{{church}}` - Church name
- `{{area}}` - Area/neighborhood
- `{{governorate}}` - Governorate/province
- `{{arrivalMethod}}` - Transportation method
- `{{busPickupPoint}}` - Bus pickup location
- `{{paymentStatus}}` - Payment status
- `{{conferenceRole}}` - Role (LEADER, PASTOR, VIP, etc.)

**Room Assignment Information:**
- `{{roomNumber}}` - Room number
- `{{buildingName}}` - Building name
- `{{floorNumber}}` - Floor number
- `{{floorName}}` - Floor display name
- `{{roomCapacity}}` - Room capacity
- `{{roomType}}` - Room type (GENERAL, VIP, FAMILY)
- `{{individualBeds}}` - Number of individual beds
- `{{bunkBeds}}` - Number of bunk beds

**Conference Information:**
- `{{conferenceName}}` - Conference house name
- `{{checkInDate}}` - Check-in date
- `{{checkOutDate}}` - Check-out date

---

## 2. Database Schema Extensions

### 2.1 New Tables Required

```prisma
// Message Templates
model MessageTemplate {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?  @db.Text
  category    TemplateCategory @default(GENERAL)
  
  // Template Content
  subject     String?  // Optional subject line
  body        String   @db.Text // Message body with {{variables}}
  variables   Json     // Array of used variables for validation
  
  // Media
  hasAttachment Boolean @default(false) @map("has_attachment")
  attachmentUrl String?  @map("attachment_url") // S3/storage URL
  attachmentType String? @map("attachment_type") // image, pdf, document
  
  // Metadata
  language    String   @default("ar") // ar, en, both
  isActive    Boolean  @default(true) @map("is_active")
  usageCount  Int      @default(0) @map("usage_count")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdBy   String?  @map("created_by")
  
  // Relations
  campaigns   MessageCampaign[]
  
  @@index([category])
  @@index([isActive])
  @@map("message_templates")
}

enum TemplateCategory {
  ROOM_ASSIGNMENT    // Room assignment notifications
  CHECK_IN           // Check-in reminders
  PAYMENT            // Payment confirmations/reminders
  GENERAL            // General announcements
  EMERGENCY          // Emergency notifications
  WELCOME            // Welcome messages
  SCHEDULE           // Event schedule updates
  TRANSPORTATION     // Bus/transport info
}

// Message Campaigns
model MessageCampaign {
  id          String   @id @default(uuid())
  name        String
  description String?  @db.Text
  templateId  String   @map("template_id")
  
  // Target Audience
  targetFilter Json    @map("target_filter") // Filter criteria for attendees
  recipientCount Int   @default(0) @map("recipient_count")
  
  // Scheduling
  status      CampaignStatus @default(DRAFT)
  scheduledFor DateTime?     @map("scheduled_for")
  startedAt   DateTime?      @map("started_at")
  completedAt DateTime?      @map("completed_at")
  
  // Delivery Settings
  channel     MessageChannel @default(WHATSAPP)
  delayBetweenMessages Int @default(5000) @map("delay_between_messages") // ms
  batchSize   Int      @default(10) @map("batch_size")
  
  // Statistics
  totalSent   Int      @default(0) @map("total_sent")
  totalFailed Int      @default(0) @map("total_failed")
  totalPending Int     @default(0) @map("total_pending")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  createdBy   String?  @map("created_by")
  
  // Relations
  template    MessageTemplate @relation(fields: [templateId], references: [id])
  messages    Message[]
  
  @@index([status])
  @@index([scheduledFor])
  @@map("message_campaigns")
}

enum CampaignStatus {
  DRAFT       // Being created
  SCHEDULED   // Scheduled for later
  IN_PROGRESS // Currently sending
  PAUSED      // Paused by admin
  COMPLETED   // All sent
  FAILED      // Campaign failed
  CANCELLED   // Cancelled by admin
}

enum MessageChannel {
  WHATSAPP
  EMAIL
  SMS
}

// Individual Messages
model Message {
  id          String   @id @default(uuid())
  campaignId  String   @map("campaign_id")
  attendeeId  String   @map("attendee_id")
  
  // Message Content
  recipient   String   // Phone/email
  subject     String?
  body        String   @db.Text // Rendered message with variables filled
  attachmentUrl String? @map("attachment_url")
  
  // Delivery Status
  status      MessageStatus @default(PENDING)
  channel     MessageChannel @default(WHATSAPP)
  sentAt      DateTime?     @map("sent_at")
  deliveredAt DateTime?     @map("delivered_at")
  readAt      DateTime?     @map("read_at")
  failedAt    DateTime?     @map("failed_at")
  errorMessage String?      @db.Text @map("error_message")
  
  // Retry Logic
  retryCount  Int      @default(0) @map("retry_count")
  maxRetries  Int      @default(3) @map("max_retries")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  // Relations
  campaign    MessageCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  attendee    Attendee @relation(fields: [attendeeId], references: [id], onDelete: Cascade)
  
  @@index([campaignId])
  @@index([attendeeId])
  @@index([status])
  @@index([sentAt])
  @@map("messages")
}

enum MessageStatus {
  PENDING     // Waiting to be sent
  QUEUED      // In sending queue
  SENDING     // Currently being sent
  SENT        // Successfully sent
  DELIVERED   // Delivered to recipient
  READ        // Read by recipient
  FAILED      // Failed to send
  CANCELLED   // Cancelled before sending
}

// Communication Settings
model CommunicationSettings {
  id          String   @id @default(uuid())
  
  // WhatsApp Settings
  whatsappEnabled Boolean @default(true) @map("whatsapp_enabled")
  whatsappSessionActive Boolean @default(false) @map("whatsapp_session_active")
  whatsappDelayMin Int @default(3000) @map("whatsapp_delay_min") // ms
  whatsappDelayMax Int @default(8000) @map("whatsapp_delay_max") // ms
  whatsappBatchSize Int @default(10) @map("whatsapp_batch_size")
  whatsappBatchDelay Int @default(60000) @map("whatsapp_batch_delay") // ms between batches
  
  // Email Settings (future)
  emailEnabled Boolean @default(false) @map("email_enabled")
  emailProvider String? @map("email_provider")
  emailFrom   String?  @map("email_from")
  
  // SMS Settings (future)
  smsEnabled  Boolean @default(false) @map("sms_enabled")
  smsProvider String? @map("sms_provider")
  
  // Rate Limiting
  maxMessagesPerHour Int @default(100) @map("max_messages_per_hour")
  maxMessagesPerDay  Int @default(500) @map("max_messages_per_day")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@map("communication_settings")
}
```

### 2.2 Schema Updates

Add to **Attendee** model:
```prisma
// Add to existing Attendee model
messages    Message[]
```

---

## 3. Backend Architecture

### 3.1 New Services

#### 3.1.1 Template Service (`templateService.ts`)
```typescript
class TemplateService {
  // CRUD operations for templates
  createTemplate(data: CreateTemplateDto): Promise<MessageTemplate>
  updateTemplate(id: string, data: UpdateTemplateDto): Promise<MessageTemplate>
  deleteTemplate(id: string): Promise<void>
  getTemplates(filters?: TemplateFilter): Promise<MessageTemplate[]>
  getTemplateById(id: string): Promise<MessageTemplate>
  
  // Template rendering
  renderTemplate(templateId: string, variables: Record<string, any>): Promise<string>
  validateTemplateVariables(template: string): string[]
  previewTemplate(templateId: string, attendeeId: string): Promise<string>
  
  // Attachment handling
  uploadAttachment(file: Express.Multer.File): Promise<string>
  deleteAttachment(url: string): Promise<void>
}
```

#### 3.1.2 Campaign Service (`campaignService.ts`)
```typescript
class CampaignService {
  // Campaign management
  createCampaign(data: CreateCampaignDto): Promise<MessageCampaign>
  updateCampaign(id: string, data: UpdateCampaignDto): Promise<MessageCampaign>
  deleteCampaign(id: string): Promise<void>
  getCampaigns(filters?: CampaignFilter): Promise<MessageCampaign[]>
  getCampaignById(id: string): Promise<MessageCampaign>
  
  // Campaign execution
  startCampaign(campaignId: string): Promise<void>
  pauseCampaign(campaignId: string): Promise<void>
  resumeCampaign(campaignId: string): Promise<void>
  cancelCampaign(campaignId: string): Promise<void>
  
  // Recipient management
  getRecipients(campaignId: string): Promise<Attendee[]>
  previewRecipients(filter: Json): Promise<Attendee[]>
  
  // Statistics
  getCampaignStats(campaignId: string): Promise<CampaignStats>
}
```

#### 3.1.3 Message Queue Service (`messageQueueService.ts`)
```typescript
class MessageQueueService {
  // Queue management
  addToQueue(messages: Message[]): Promise<void>
  getNextBatch(batchSize: number): Promise<Message[]>
  markAsProcessing(messageIds: string[]): Promise<void>
  markAsSent(messageId: string): Promise<void>
  markAsFailed(messageId: string, error: string): Promise<void>
  
  // Queue monitoring
  getQueueStatus(): Promise<QueueStatus>
  getQueueLength(): Promise<number>
  clearQueue(): Promise<void>
}
```

#### 3.1.4 WhatsApp Automation Service (`whatsappService.ts`)
```typescript
class WhatsAppService {
  // Browser automation
  initializeBrowser(): Promise<void>
  closeBrowser(): Promise<void>
  isSessionActive(): Promise<boolean>
  waitForQRCode(): Promise<string> // Returns QR code data URL
  
  // Message sending
  sendMessage(phone: string, message: string): Promise<boolean>
  sendMessageWithAttachment(phone: string, message: string, attachmentPath: string): Promise<boolean>
  
  // Rate limiting
  applyDelay(): Promise<void>
  checkRateLimit(): Promise<boolean>
  
  // Error handling
  handleWhatsAppError(error: Error): Promise<void>
  reconnect(): Promise<void>
}
```

#### 3.1.5 Message Processing Service (`messageProcessingService.ts`)
```typescript
class MessageProcessingService {
  // Message processing
  processMessage(messageId: string): Promise<void>
  processBatch(campaignId: string): Promise<void>
  
  // Variable substitution
  substituteVariables(template: string, attendee: Attendee, assignment?: RoomAssignment): string
  
  // Validation
  validateRecipient(attendee: Attendee, channel: MessageChannel): boolean
  validateMessage(message: Message): boolean
}
```

#### 3.1.6 Communication Settings Service (`communicationSettingsService.ts`)
```typescript
class CommunicationSettingsService {
  getSettings(): Promise<CommunicationSettings>
  updateSettings(data: UpdateSettingsDto): Promise<CommunicationSettings>
  resetSettings(): Promise<CommunicationSettings>
}
```

### 3.2 New Controllers

#### 3.2.1 Template Controller
```
POST   /api/templates              - Create template
GET    /api/templates              - List templates
GET    /api/templates/:id          - Get template
PUT    /api/templates/:id          - Update template
DELETE /api/templates/:id          - Delete template
POST   /api/templates/:id/preview  - Preview with sample data
POST   /api/templates/upload       - Upload attachment
```

#### 3.2.2 Campaign Controller
```
POST   /api/campaigns              - Create campaign
GET    /api/campaigns              - List campaigns
GET    /api/campaigns/:id          - Get campaign details
PUT    /api/campaigns/:id          - Update campaign
DELETE /api/campaigns/:id          - Delete campaign
POST   /api/campaigns/:id/start    - Start campaign
POST   /api/campaigns/:id/pause    - Pause campaign
POST   /api/campaigns/:id/resume   - Resume campaign
POST   /api/campaigns/:id/cancel   - Cancel campaign
GET    /api/campaigns/:id/stats    - Get campaign statistics
GET    /api/campaigns/:id/messages - Get campaign messages
POST   /api/campaigns/preview      - Preview recipients based on filter
```

#### 3.2.3 Message Controller
```
GET    /api/messages               - List messages
GET    /api/messages/:id           - Get message details
POST   /api/messages/:id/retry     - Retry failed message
GET    /api/messages/stats         - Overall message statistics
```

#### 3.2.4 WhatsApp Controller
```
POST   /api/whatsapp/initialize    - Initialize WhatsApp session
GET    /api/whatsapp/qr            - Get QR code for authentication
GET    /api/whatsapp/status        - Check session status
POST   /api/whatsapp/disconnect    - Disconnect session
POST   /api/whatsapp/test          - Send test message
```

#### 3.2.5 Communication Settings Controller
```
GET    /api/communication/settings - Get settings
PUT    /api/communication/settings - Update settings
POST   /api/communication/settings/reset - Reset to defaults
```

### 3.3 New Routes Structure
```
backend/src/routes/
  ├── template.routes.ts
  ├── campaign.routes.ts
  ├── message.routes.ts
  ├── whatsapp.routes.ts
  └── communicationSettings.routes.ts
```

---

## 4. WhatsApp Web Automation

### 4.1 Technology Stack
- **Puppeteer**: Headless Chrome automation
- **whatsapp-web.js**: WhatsApp Web API wrapper (recommended)
- **Bull**: Job queue for message scheduling
- **Redis**: Queue storage and rate limiting

### 4.2 Implementation Approach

#### Option 1: whatsapp-web.js (Recommended)
```typescript
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';

class WhatsAppClient {
  private client: Client;
  
  async initialize() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    this.client.on('qr', (qr) => {
      // Emit QR code to frontend via Socket.io
      io.emit('whatsapp:qr', qr);
    });
    
    this.client.on('ready', () => {
      io.emit('whatsapp:ready');
    });
    
    this.client.on('authenticated', () => {
      io.emit('whatsapp:authenticated');
    });
    
    await this.client.initialize();
  }
  
  async sendMessage(phone: string, message: string, attachment?: string) {
    const chatId = `${phone}@c.us`;
    
    if (attachment) {
      const media = await MessageMedia.fromUrl(attachment);
      await this.client.sendMessage(chatId, media, { caption: message });
    } else {
      await this.client.sendMessage(chatId, message);
    }
    
    // Apply rate limiting delay
    await this.delay();
  }
  
  private async delay() {
    const min = 3000; // 3 seconds
    const max = 8000; // 8 seconds
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
```

### 4.3 Rate Limiting Strategy

To avoid WhatsApp bans:
1. **Random delays**: 3-8 seconds between messages
2. **Batch processing**: Send 10-20 messages, then pause for 2-5 minutes
3. **Daily limits**: Max 200-300 messages per day per account
4. **Human-like behavior**: Random typing delays, occasional pauses
5. **Session persistence**: Keep authentication between restarts

### 4.4 Error Handling

```typescript
// Retry logic for failed messages
async function sendWithRetry(messageId: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await whatsappService.sendMessage(/* ... */);
      await messageQueueService.markAsSent(messageId);
      return;
    } catch (error) {
      if (i === maxRetries - 1) {
        await messageQueueService.markAsFailed(messageId, error.message);
        throw error;
      }
      // Exponential backoff
      await delay(Math.pow(2, i) * 1000);
    }
  }
}
```

---

## 5. Frontend Implementation

### 5.1 New Pages

#### 5.1.1 Communications Dashboard (`CommunicationsPage.tsx`)
- Overview of all campaigns
- Recent messages
- Statistics (sent, failed, pending)
- Quick actions (new campaign, new template)

#### 5.1.2 Template Management (`TemplatesPage.tsx`)
- List all templates
- Create/edit templates
- Template categories
- Variable picker
- Attachment upload
- Preview functionality

#### 5.1.3 Template Builder (`TemplateBuilderPage.tsx`)
- Rich text editor with variable insertion
- Live preview
- Attachment uploader
- Variable validation
- Save as draft/publish

#### 5.1.4 Campaign Management (`CampaignsPage.tsx`)
- List all campaigns
- Filter by status
- Campaign statistics
- Quick actions (start, pause, cancel)

#### 5.1.5 Campaign Builder (`CampaignBuilderPage.tsx`)
**Step 1: Template Selection**
- Choose existing template or create new
- Preview template

**Step 2: Recipient Selection**
- Filter builder (by role, payment status, room assignment, etc.)
- Preview recipients
- Manual additions/exclusions
- Recipient count

**Step 3: Delivery Settings**
- Channel selection (WhatsApp, email, SMS)
- Schedule now or later
- Rate limiting settings
- Batch size

**Step 4: Review & Confirm**
- Summary
- Preview messages
- Start campaign

#### 5.1.6 Campaign Details (`CampaignDetailsPage.tsx`)
- Campaign information
- Real-time progress
- Message list with status
- Statistics
- Retry failed messages
- Pause/resume/cancel controls

#### 5.1.7 WhatsApp Setup (`WhatsAppSetupPage.tsx`)
- QR code display for authentication
- Connection status
- Session management
- Test message functionality
- Settings (delays, batch size)

#### 5.1.8 Communication Settings (`CommunicationSettingsPage.tsx`)
- WhatsApp settings
- Email settings (future)
- SMS settings (future)
- Rate limiting configuration
- Default templates

### 5.2 New Components

```
frontend/src/components/
  ├── communication/
  │   ├── TemplateCard.tsx
  │   ├── TemplateEditor.tsx
  │   ├── VariablePicker.tsx
  │   ├── TemplatePreview.tsx
  │   ├── CampaignCard.tsx
  │   ├── CampaignProgress.tsx
  │   ├── CampaignStats.tsx
  │   ├── MessageList.tsx
  │   ├── MessageStatusBadge.tsx
  │   ├── RecipientFilter.tsx
  │   ├── RecipientList.tsx
  │   ├── AttachmentUploader.tsx
  │   ├── QRCodeDisplay.tsx
  │   ├── WhatsAppStatus.tsx
  │   └── MessageComposer.tsx
```

### 5.3 Navigation Update

Add to sidebar menu:
```typescript
{
  title: 'Communications',
  icon: MessageSquare,
  children: [
    { title: 'Dashboard', path: '/communications' },
    { title: 'Campaigns', path: '/communications/campaigns' },
    { title: 'Templates', path: '/communications/templates' },
    { title: 'Messages', path: '/communications/messages' },
    { title: 'WhatsApp Setup', path: '/communications/whatsapp' },
    { title: 'Settings', path: '/communications/settings' },
  ]
}
```

---

## 6. Integration with Existing System

### 6.1 Integration Points

#### 6.1.1 Room Assignment Integration
When a room is assigned:
```typescript
// In assignment.service.ts
async assignRoom(attendeeId: string, roomId: string) {
  // ... existing assignment logic ...
  
  // Trigger room assignment notification
  await campaignService.sendAutoMessage(attendeeId, 'ROOM_ASSIGNMENT');
}
```

#### 6.1.2 Check-in Integration
```typescript
// In attendee.service.ts
async checkInAttendee(attendeeId: string) {
  // ... existing check-in logic ...
  
  // Send check-in confirmation
  await campaignService.sendAutoMessage(attendeeId, 'CHECK_IN_CONFIRMATION');
}
```

#### 6.1.3 Payment Integration
```typescript
async updatePaymentStatus(attendeeId: string, status: PaymentStatus) {
  // ... existing payment logic ...
  
  if (status === PaymentStatus.CONFIRMED) {
    await campaignService.sendAutoMessage(attendeeId, 'PAYMENT_CONFIRMED');
  }
}
```

### 6.2 Audit Log Integration
```typescript
// Log all communication activities
await auditLogService.log({
  action: 'message_sent',
  entityType: 'message',
  entityId: messageId,
  details: {
    campaignId,
    attendeeId,
    channel: 'whatsapp',
    status: 'sent'
  }
});
```

---

## 7. Message Template Examples

### 7.1 Room Assignment Notification
```
مرحباً {{fullName}}! 🏠

تم تخصيص غرفتك بنجاح:
📍 المبنى: {{buildingName}}
🔢 الطابق: {{floorName}}
🚪 رقم الغرفة: {{roomNumber}}
🛏️ نوع الغرفة: {{roomType}}

تفاصيل إضافية:
- سعة الغرفة: {{roomCapacity}} أشخاص
- أسرة فردية: {{individualBeds}}
- أسرة بطابقين: {{bunkBeds}}

نتمنى لك إقامة سعيدة! 🌟
```

### 7.2 Check-in Reminder
```
عزيزي {{fullName}},

نذكرك بموعد تسجيل الوصول غداً! ✅

معلومات هامة:
📅 التاريخ: [تاريخ الوصول]
⏰ الوقت: [وقت تسجيل الوصول]
🚌 وسيلة المواصلات: {{arrivalMethod}}
{{#if busPickupPoint}}📍 نقطة التجمع: {{busPickupPoint}}{{/if}}

غرفتك:
🏠 المبنى {{buildingName}} - الطابق {{floorNumber}} - غرفة {{roomNumber}}

نراك قريباً! 🙏
```

### 7.3 Payment Confirmation
```
تم استلام دفعتك بنجاح! ✅

مرحباً {{fullName}},

تفاصيل الدفع:
💰 الحالة: مؤكد ✓
🔢 رقم المعاملة: {{transactionNumber}}
💳 طريقة الدفع: {{paymentMethod}}

معلومات التذكرة:
🎫 رقم التذكرة: {{ticketId}}
👤 الاسم: {{fullName}}
📱 الهاتف: {{phone}}

شكراً لك! 🙏
```

### 7.4 Emergency Notification
```
⚠️ إشعار هام ⚠️

{{subject}}

{{body}}

للاستفسار:
📱 [رقم الطوارئ]

مع تحيات إدارة المؤتمر
```

---

## 8. Implementation Phases

### Phase 1: Database & Backend Core (Week 1-2)
- [ ] Create database migrations for new tables
- [ ] Implement repository layer
- [ ] Create Template Service
- [ ] Create Campaign Service
- [ ] Create Message Queue Service
- [ ] Set up Bull + Redis for job queue
- [ ] Create basic API endpoints
- [ ] Write unit tests

### Phase 2: WhatsApp Integration (Week 2-3)
- [ ] Install whatsapp-web.js
- [ ] Implement WhatsApp Service
- [ ] QR code authentication flow
- [ ] Session persistence
- [ ] Message sending with attachments
- [ ] Rate limiting implementation
- [ ] Error handling & retry logic
- [ ] Test with real WhatsApp account

### Phase 3: Message Processing (Week 3)
- [ ] Implement Message Processing Service
- [ ] Variable substitution engine
- [ ] Template rendering
- [ ] Batch processing
- [ ] Queue management
- [ ] Real-time progress tracking via Socket.io
- [ ] Notification integration

### Phase 4: Frontend - Templates (Week 4)
- [ ] Create TemplatesPage
- [ ] Create TemplateBuilderPage
- [ ] Implement TemplateEditor component
- [ ] Variable picker component
- [ ] Template preview
- [ ] Attachment uploader
- [ ] Template API integration

### Phase 5: Frontend - Campaigns (Week 5)
- [ ] Create CampaignsPage
- [ ] Create CampaignBuilderPage
- [ ] Recipient filter builder
- [ ] Campaign creation wizard
- [ ] Campaign management UI
- [ ] Real-time progress tracking
- [ ] Statistics dashboard

### Phase 6: Frontend - WhatsApp Setup (Week 6)
- [ ] Create WhatsAppSetupPage
- [ ] QR code display component
- [ ] Session status monitoring
- [ ] Test message functionality
- [ ] Settings configuration UI

### Phase 7: Integration & Testing (Week 7)
- [ ] Integrate with room assignment
- [ ] Integrate with check-in system
- [ ] Integrate with payment system
- [ ] Create default templates
- [ ] End-to-end testing
- [ ] Load testing
- [ ] Security audit

### Phase 8: Deployment & Documentation (Week 8)
- [ ] Update deployment scripts
- [ ] Environment configuration
- [ ] User documentation
- [ ] Admin guide
- [ ] API documentation
- [ ] Training materials

---

## 9. Technical Requirements

### 9.1 Backend Dependencies
```json
{
  "whatsapp-web.js": "^1.23.0",
  "puppeteer": "^21.0.0",
  "bull": "^4.11.0",
  "redis": "^4.6.0",
  "handlebars": "^4.7.8",
  "multer": "^1.4.5-lts.1",
  "@aws-sdk/client-s3": "^3.400.0"
}
```

### 9.2 Frontend Dependencies
```json
{
  "react-quill": "^2.0.0",
  "qrcode.react": "^3.1.0",
  "recharts": "^2.8.0"
}
```

### 9.3 Infrastructure
- **Redis**: For Bull queue and rate limiting
- **S3 or Local Storage**: For attachment storage
- **Chrome/Chromium**: For Puppeteer (headless browser)

---

## 10. Security Considerations

### 10.1 Authentication & Authorization
- Require admin role for campaign creation
- Require super-admin for settings changes
- Audit all communication activities

### 10.2 Data Privacy
- Encrypt phone numbers at rest
- Mask sensitive data in logs
- GDPR compliance for EU attendees
- Opt-out mechanism

### 10.3 Rate Limiting
- API rate limiting
- WhatsApp ban prevention
- Queue overflow protection

### 10.4 Attachment Security
- File type validation
- File size limits (max 16MB for WhatsApp)
- Virus scanning
- Secure storage with expiration

---

## 11. Monitoring & Analytics

### 11.1 Metrics to Track
- Messages sent per day/hour
- Delivery rate
- Failure rate
- Average delivery time
- Template usage
- Campaign performance
- WhatsApp session uptime

### 11.2 Alerts
- WhatsApp session disconnected
- High failure rate (>10%)
- Queue overflow
- Rate limit exceeded
- Critical errors

### 11.3 Reporting
- Daily delivery report
- Campaign performance report
- Template effectiveness report
- Cost analysis (if using paid services)

---

## 12. Future Enhancements

### 12.1 Additional Channels
- Email integration (SendGrid, AWS SES)
- SMS integration (Twilio, etc.)
- Push notifications

### 12.2 Advanced Features
- A/B testing for templates
- Scheduled recurring campaigns
- Conditional logic in templates
- Multi-language templates
- Message segmentation
- Personalized send times

### 12.3 AI Features
- Smart template suggestions
- Optimal send time prediction
- Automatic response handling
- Sentiment analysis

---

## 13. Cost Estimation

### 13.1 Infrastructure Costs (Monthly)
- **Redis Cloud**: $10-30 (for Bull queue)
- **S3 Storage**: $5-20 (for attachments)
- **Server Resources**: +20% CPU/Memory usage

### 13.2 Development Time
- **Total Estimated Time**: 8 weeks (1 developer)
- **Backend**: 4 weeks
- **Frontend**: 3 weeks
- **Testing & Integration**: 1 week

---

## 14. Success Metrics

### 14.1 Technical KPIs
- ✅ 95%+ message delivery rate
- ✅ <5% failure rate
- ✅ <30s average processing time per message
- ✅ 99%+ WhatsApp session uptime

### 14.2 Business KPIs
- ✅ Reduce manual communication time by 80%
- ✅ Improve attendee engagement
- ✅ Faster room assignment notifications
- ✅ Better payment follow-up

---

## 15. Risk Mitigation

### 15.1 WhatsApp Ban Risk
- **Risk**: High volume may trigger WhatsApp ban
- **Mitigation**: 
  - Conservative rate limiting
  - Human-like delays
  - Batch processing with pauses
  - Multiple backup accounts
  - Clear opt-out mechanism

### 15.2 Technical Failures
- **Risk**: Browser crashes, network issues
- **Mitigation**:
  - Automatic reconnection
  - Message retry logic
  - Queue persistence
  - Error notifications

### 15.3 Data Privacy
- **Risk**: Unauthorized access to attendee data
- **Mitigation**:
  - Role-based access control
  - Audit logging
  - Encryption
  - Regular security audits

---

## 16. Getting Started

### 16.1 Quick Start Checklist
1. ✅ Review and approve this plan
2. ✅ Set up Redis instance
3. ✅ Create feature branch: `feature/communication-system`
4. ✅ Run database migrations
5. ✅ Install dependencies
6. ✅ Configure environment variables
7. ✅ Start with Phase 1 implementation

### 16.2 Environment Variables
```env
# WhatsApp
WHATSAPP_SESSION_PATH=./whatsapp-session
WHATSAPP_HEADLESS=true

# Redis
REDIS_URL=redis://localhost:6379

# File Storage
STORAGE_TYPE=local # or 's3'
UPLOAD_DIR=./uploads
S3_BUCKET=agape-attachments
S3_REGION=us-east-1

# Rate Limiting
WHATSAPP_DELAY_MIN=3000
WHATSAPP_DELAY_MAX=8000
WHATSAPP_BATCH_SIZE=10
WHATSAPP_BATCH_DELAY=300000
MAX_MESSAGES_PER_DAY=300
```

---

## Conclusion

This communication system will transform how you engage with conference attendees, providing professional, automated, and personalized messaging at scale. The phased approach ensures steady progress while maintaining system stability.

**Next Steps:**
1. Review and approve this plan
2. Prioritize features if needed
3. Set up infrastructure (Redis)
4. Begin Phase 1 implementation

**Questions to Address:**
- Do you prefer local file storage or S3 for attachments?
- What is your expected message volume per campaign?
- Do you need email/SMS or just WhatsApp for now?
- Any specific template categories to add?
- Budget for infrastructure costs?
