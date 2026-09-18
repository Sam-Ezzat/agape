# Quick Start Guide - Communication Feature

## Overview
This guide will help you get started with implementing the communication feature for your conference management system.

---

## Prerequisites

Before you begin, ensure you have:
- ✅ Node.js 18+ installed
- ✅ PostgreSQL database running
- ✅ Redis server installed and running
- ✅ Existing Agape system set up

---

## Step 1: Install Dependencies

### Backend Dependencies
```bash
cd backend
npm install whatsapp-web.js puppeteer bull redis handlebars multer @aws-sdk/client-s3
npm install --save-dev @types/bull
```

### Frontend Dependencies
```bash
cd frontend
npm install react-quill qrcode.react recharts
npm install --save-dev @types/react-quill
```

---

## Step 2: Setup Redis

### Windows (using Chocolatey)
```powershell
choco install redis-64
redis-server
```

### Or use Docker
```bash
docker run -d -p 6379:6379 --name redis redis:alpine
```

### Verify Redis is running
```bash
redis-cli ping
# Should return: PONG
```

---

## Step 3: Update Environment Variables

Add to your `backend/.env`:
```env
# WhatsApp Configuration
WHATSAPP_SESSION_PATH=./whatsapp-session
WHATSAPP_HEADLESS=true

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# File Storage (choose one)
STORAGE_TYPE=local  # or 's3'
UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE=16777216  # 16MB in bytes

# S3 Configuration (if using S3)
S3_BUCKET=agape-attachments
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key

# Rate Limiting
WHATSAPP_DELAY_MIN=3000
WHATSAPP_DELAY_MAX=8000
WHATSAPP_BATCH_SIZE=10
WHATSAPP_BATCH_DELAY=300000
MAX_MESSAGES_PER_HOUR=100
MAX_MESSAGES_PER_DAY=300
```

---

## Step 4: Run Database Migration

The migration file has been created at:
`backend/prisma/migrations/20260717000000_add_communication_system/migration.sql`

### Option 1: Using Prisma (Recommended)
```bash
cd backend
# Update schema.prisma first (see step 5), then:
npx prisma migrate dev --name add_communication_system
```

### Option 2: Manual SQL
```bash
# Run the migration SQL directly in your PostgreSQL database
psql -U your_user -d your_database -f backend/prisma/migrations/20260717000000_add_communication_system/migration.sql
```

---

## Step 5: Update Prisma Schema

Add the following models to `backend/prisma/schema.prisma`:

```prisma
// Add to existing Attendee model (add this relation)
model Attendee {
  // ... existing fields ...
  
  messages    Message[]  // ADD THIS LINE
}

// Add these new models at the end of the file:

model MessageTemplate {
  id            String   @id @default(uuid())
  name          String   @unique
  description   String?  @db.Text
  category      TemplateCategory @default(GENERAL)
  
  subject       String?
  body          String   @db.Text
  variables     Json     @default("[]")
  
  hasAttachment Boolean  @default(false) @map("has_attachment")
  attachmentUrl String?  @map("attachment_url")
  attachmentType String? @map("attachment_type")
  
  language      String   @default("ar")
  isActive      Boolean  @default(true) @map("is_active")
  usageCount    Int      @default(0) @map("usage_count")
  
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  createdBy     String?  @map("created_by")
  
  campaigns     MessageCampaign[]
  
  @@index([category])
  @@index([isActive])
  @@map("message_templates")
}

enum TemplateCategory {
  ROOM_ASSIGNMENT
  CHECK_IN
  PAYMENT
  GENERAL
  EMERGENCY
  WELCOME
  SCHEDULE
  TRANSPORTATION
}

model MessageCampaign {
  id                    String         @id @default(uuid())
  name                  String
  description           String?        @db.Text
  templateId            String         @map("template_id")
  
  targetFilter          Json           @map("target_filter")
  recipientCount        Int            @default(0) @map("recipient_count")
  
  status                CampaignStatus @default(DRAFT)
  scheduledFor          DateTime?      @map("scheduled_for")
  startedAt             DateTime?      @map("started_at")
  completedAt           DateTime?      @map("completed_at")
  
  channel               MessageChannel @default(WHATSAPP)
  delayBetweenMessages  Int            @default(5000) @map("delay_between_messages")
  batchSize             Int            @default(10) @map("batch_size")
  
  totalSent             Int            @default(0) @map("total_sent")
  totalFailed           Int            @default(0) @map("total_failed")
  totalPending          Int            @default(0) @map("total_pending")
  
  createdAt             DateTime       @default(now()) @map("created_at")
  updatedAt             DateTime       @updatedAt @map("updated_at")
  createdBy             String?        @map("created_by")
  
  template              MessageTemplate @relation(fields: [templateId], references: [id])
  messages              Message[]
  
  @@index([status])
  @@index([scheduledFor])
  @@map("message_campaigns")
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  IN_PROGRESS
  PAUSED
  COMPLETED
  FAILED
  CANCELLED
}

enum MessageChannel {
  WHATSAPP
  EMAIL
  SMS
}

model Message {
  id            String        @id @default(uuid())
  campaignId    String        @map("campaign_id")
  attendeeId    String        @map("attendee_id")
  
  recipient     String
  subject       String?
  body          String        @db.Text
  attachmentUrl String?       @map("attachment_url")
  
  status        MessageStatus @default(PENDING)
  channel       MessageChannel @default(WHATSAPP)
  sentAt        DateTime?     @map("sent_at")
  deliveredAt   DateTime?     @map("delivered_at")
  readAt        DateTime?     @map("read_at")
  failedAt      DateTime?     @map("failed_at")
  errorMessage  String?       @db.Text @map("error_message")
  
  retryCount    Int           @default(0) @map("retry_count")
  maxRetries    Int           @default(3) @map("max_retries")
  
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")
  
  campaign      MessageCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  attendee      Attendee      @relation(fields: [attendeeId], references: [id], onDelete: Cascade)
  
  @@index([campaignId])
  @@index([attendeeId])
  @@index([status])
  @@index([sentAt])
  @@map("messages")
}

enum MessageStatus {
  PENDING
  QUEUED
  SENDING
  SENT
  DELIVERED
  READ
  FAILED
  CANCELLED
}

model CommunicationSettings {
  id                    String   @id @default(uuid())
  
  whatsappEnabled       Boolean  @default(true) @map("whatsapp_enabled")
  whatsappSessionActive Boolean  @default(false) @map("whatsapp_session_active")
  whatsappDelayMin      Int      @default(3000) @map("whatsapp_delay_min")
  whatsappDelayMax      Int      @default(8000) @map("whatsapp_delay_max")
  whatsappBatchSize     Int      @default(10) @map("whatsapp_batch_size")
  whatsappBatchDelay    Int      @default(60000) @map("whatsapp_batch_delay")
  
  emailEnabled          Boolean  @default(false) @map("email_enabled")
  emailProvider         String?  @map("email_provider")
  emailFrom             String?  @map("email_from")
  
  smsEnabled            Boolean  @default(false) @map("sms_enabled")
  smsProvider           String?  @map("sms_provider")
  
  maxMessagesPerHour    Int      @default(100) @map("max_messages_per_hour")
  maxMessagesPerDay     Int      @default(500) @map("max_messages_per_day")
  
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")
  
  @@map("communication_settings")
}
```

Then generate the Prisma client:
```bash
npx prisma generate
```

---

## Step 6: Project Structure

Create the following directory structure:

```
backend/src/
├── services/
│   └── communication/
│       ├── template.service.ts          ✅ (already created)
│       ├── whatsapp.service.ts          ✅ (already created)
│       ├── campaign.service.ts          (to create)
│       ├── messageQueue.service.ts      (to create)
│       └── messageProcessing.service.ts (to create)
├── controllers/
│   └── communication/
│       ├── template.controller.ts       (to create)
│       ├── campaign.controller.ts       (to create)
│       ├── message.controller.ts        (to create)
│       └── whatsapp.controller.ts       (to create)
├── routes/
│   └── communication/
│       ├── template.routes.ts           (to create)
│       ├── campaign.routes.ts           (to create)
│       ├── message.routes.ts            (to create)
│       └── whatsapp.routes.ts           (to create)
└── types/
    └── communication.types.ts           (to create)

frontend/src/
├── pages/
│   └── communication/
│       ├── CommunicationsPage.tsx       (to create)
│       ├── TemplatesPage.tsx            (to create)
│       ├── TemplateBuilderPage.tsx      (to create)
│       ├── CampaignsPage.tsx            (to create)
│       ├── CampaignBuilderPage.tsx      (to create)
│       ├── CampaignDetailsPage.tsx      (to create)
│       └── WhatsAppSetupPage.tsx        (to create)
├── components/
│   └── communication/
│       ├── TemplateCard.tsx             (to create)
│       ├── TemplateEditor.tsx           (to create)
│       ├── CampaignCard.tsx             (to create)
│       ├── MessageList.tsx              (to create)
│       └── QRCodeDisplay.tsx            (to create)
└── services/
    └── communication.service.ts         (to create)
```

---

## Step 7: Test the Setup

### 1. Start Redis
```bash
redis-server
```

### 2. Start Backend
```bash
cd backend
npm run dev
```

### 3. Test Database Connection
```bash
npx prisma studio
# Check if new tables exist: message_templates, message_campaigns, messages, communication_settings
```

### 4. Check Default Templates
Query your database to see if the default templates were seeded:
```sql
SELECT * FROM message_templates;
```

You should see 4 default templates:
- Room Assignment Notification (Arabic)
- Check-in Reminder (Arabic)
- Payment Confirmation (Arabic)
- Welcome Message (Arabic)

---

## Step 8: Initialize WhatsApp (Backend)

Add to your `backend/src/app.ts` or `server.ts`:

```typescript
import { Server } from 'socket.io';
import { createWhatsAppService } from './services/communication/whatsapp.service';

// After creating your HTTP server
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

// Create WhatsApp service
const whatsappService = createWhatsAppService(io);

// Make it available globally or export it
app.set('whatsappService', whatsappService);
app.set('io', io);

// Optional: Auto-initialize on startup
// whatsappService.initialize();
```

---

## Step 9: Create Your First Template (Test)

You can test template creation using the API or Prisma Studio.

### Using curl:
```bash
curl -X POST http://localhost:3000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Template",
    "category": "GENERAL",
    "body": "مرحباً {{fullName}}! هذه رسالة تجريبية من نظام {{conferenceName}}",
    "language": "ar"
  }'
```

---

## Step 10: Test WhatsApp Connection

### 1. Initialize WhatsApp via API (to create):
```bash
POST /api/whatsapp/initialize
```

### 2. Get QR Code:
```bash
GET /api/whatsapp/qr
```

### 3. Scan with WhatsApp Mobile
- Open WhatsApp on your phone
- Go to Settings → Linked Devices
- Scan the QR code

### 4. Check Status:
```bash
GET /api/whatsapp/status
```

---

## Next Steps

Once basic setup is complete, proceed with:

1. **Phase 1**: Complete backend services (Campaign, MessageQueue, MessageProcessing)
2. **Phase 2**: Build API controllers and routes
3. **Phase 3**: Create frontend pages and components
4. **Phase 4**: Integrate with existing system (room assignment, check-in, payment)
5. **Phase 5**: Testing and refinement

---

## Troubleshooting

### Redis Connection Error
```bash
Error: Redis connection refused
```
**Solution**: Make sure Redis is running
```bash
redis-server
```

### WhatsApp Session Error
```bash
Error: Failed to initialize WhatsApp
```
**Solution**: 
- Check if Chrome/Chromium is installed
- Clear session data: `rm -rf whatsapp-session`
- Try headless: false in development

### Database Migration Error
```bash
Error: relation already exists
```
**Solution**: 
- Check if tables already exist
- Drop conflicting tables or use a fresh database
- Verify migration file syntax

### Puppeteer Installation Issues (Windows)
```bash
npm install puppeteer --legacy-peer-deps
```

---

## Useful Commands

```bash
# View Redis queue
redis-cli
KEYS *
LLEN message_queue

# Check Prisma schema
npx prisma validate

# Reset database (CAUTION)
npx prisma migrate reset

# View logs
tail -f logs/app.log

# Monitor WhatsApp session
watch -n 1 'ls -lh whatsapp-session/'
```

---

## Security Checklist

Before deploying to production:

- [ ] Add authentication middleware to all communication endpoints
- [ ] Implement role-based access control (admin only)
- [ ] Encrypt WhatsApp session data
- [ ] Use HTTPS for all API calls
- [ ] Implement rate limiting on API endpoints
- [ ] Add CORS restrictions
- [ ] Sanitize user input in templates
- [ ] Implement audit logging
- [ ] Set up monitoring and alerts
- [ ] Use environment variables for all secrets

---

## Resources

- **Main Plan**: [COMMUNICATION_FEATURE_PLAN.md](./COMMUNICATION_FEATURE_PLAN.md)
- **Architecture**: [COMMUNICATION_ARCHITECTURE.md](./COMMUNICATION_ARCHITECTURE.md)
- **WhatsApp Web.js Docs**: https://wwebjs.dev/
- **Bull Queue Docs**: https://github.com/OptimalBits/bull
- **Handlebars Docs**: https://handlebarsjs.com/

---

## Support

If you encounter issues:

1. Check the [COMMUNICATION_FEATURE_PLAN.md](./COMMUNICATION_FEATURE_PLAN.md) for detailed documentation
2. Review error logs in `logs/` directory
3. Check WhatsApp session status via Socket.io events
4. Verify Redis connection and queue status
5. Test with a simple template before complex campaigns

---

## What's Included in Starter Files

✅ **Complete database migration** with:
- All tables (templates, campaigns, messages, settings)
- Indexes for performance
- Default templates seeded

✅ **Template Service** (`template.service.ts`):
- CRUD operations
- Variable extraction
- Template rendering with Handlebars
- Preview functionality

✅ **WhatsApp Service** (`whatsapp.service.ts`):
- Browser automation setup
- Session management
- Message sending
- Rate limiting
- Event handlers

---

## Estimated Time to Complete Setup

- **Step 1-3**: 15 minutes (install dependencies, setup Redis)
- **Step 4-5**: 10 minutes (environment variables, database)
- **Step 6-7**: 5 minutes (project structure, testing)
- **Step 8-10**: 15 minutes (WhatsApp initialization, first test)

**Total**: ~45 minutes for complete setup

---

Good luck with your implementation! 🚀
