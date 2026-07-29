-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('ROOM_ASSIGNMENT', 'CHECK_IN', 'PAYMENT', 'GENERAL', 'EMERGENCY', 'WELCOME', 'SCHEDULE', 'TRANSPORTATION');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "TemplateCategory" NOT NULL DEFAULT 'GENERAL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "has_attachment" BOOLEAN NOT NULL DEFAULT false,
    "attachment_url" TEXT,
    "attachment_type" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template_id" TEXT NOT NULL,
    "target_filter" JSONB NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_for" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "delay_between_messages" INTEGER NOT NULL DEFAULT 5000,
    "batch_size" INTEGER NOT NULL DEFAULT 10,
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "total_pending" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,

    CONSTRAINT "message_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "attendee_id" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "attachment_url" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_settings" (
    "id" TEXT NOT NULL,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_session_active" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_delay_min" INTEGER NOT NULL DEFAULT 3000,
    "whatsapp_delay_max" INTEGER NOT NULL DEFAULT 8000,
    "whatsapp_batch_size" INTEGER NOT NULL DEFAULT 10,
    "whatsapp_batch_delay" INTEGER NOT NULL DEFAULT 60000,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_provider" TEXT,
    "email_from" TEXT,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_provider" TEXT,
    "max_messages_per_hour" INTEGER NOT NULL DEFAULT 100,
    "max_messages_per_day" INTEGER NOT NULL DEFAULT 300,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_name_key" ON "message_templates"("name");

-- CreateIndex
CREATE INDEX "message_templates_category_idx" ON "message_templates"("category");

-- CreateIndex
CREATE INDEX "message_templates_is_active_idx" ON "message_templates"("is_active");

-- CreateIndex
CREATE INDEX "message_campaigns_status_idx" ON "message_campaigns"("status");

-- CreateIndex
CREATE INDEX "message_campaigns_scheduled_for_idx" ON "message_campaigns"("scheduled_for");

-- CreateIndex
CREATE INDEX "messages_campaign_id_idx" ON "messages"("campaign_id");

-- CreateIndex
CREATE INDEX "messages_attendee_id_idx" ON "messages"("attendee_id");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE INDEX "messages_sent_at_idx" ON "messages"("sent_at");

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "message_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_attendee_id_fkey" FOREIGN KEY ("attendee_id") REFERENCES "attendees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
