-- AlterTable
ALTER TABLE "attendees" ADD COLUMN     "whatsapp_opt_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_opt_out_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "communication_settings" ADD COLUMN     "whatsapp_session_active_since" TIMESTAMP(3);
