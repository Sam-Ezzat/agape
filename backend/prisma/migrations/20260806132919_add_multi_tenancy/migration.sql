-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- DropIndex
DROP INDEX "conference_houses_name_key";

-- DropIndex
DROP INDEX "message_templates_name_key";

-- AlterTable
ALTER TABLE "attendees" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "communication_settings" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "conference_houses" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "message_campaigns" ADD COLUMN     "organization_id" TEXT;

-- AlterTable
ALTER TABLE "message_templates" ADD COLUMN     "organization_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "attendees_organization_id_idx" ON "attendees"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "communication_settings_organization_id_key" ON "communication_settings"("organization_id");

-- CreateIndex
CREATE INDEX "conference_houses_organization_id_idx" ON "conference_houses"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "conference_houses_organization_id_name_key" ON "conference_houses"("organization_id", "name");

-- CreateIndex
CREATE INDEX "message_campaigns_organization_id_idx" ON "message_campaigns"("organization_id");

-- CreateIndex
CREATE INDEX "message_templates_organization_id_idx" ON "message_templates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_organization_id_name_key" ON "message_templates"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_houses" ADD CONSTRAINT "conference_houses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_campaigns" ADD CONSTRAINT "message_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_settings" ADD CONSTRAINT "communication_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: backfill a default organization + admin user, and
-- assign all pre-existing rows to it so current production data isn't orphaned.
INSERT INTO "organizations" ("id", "name", "created_at", "updated_at")
VALUES ('2fe242ac-15fc-4cca-aba7-b7db4d5d331f', 'Agape Conference Center', now(), now());

INSERT INTO "users" ("id", "organization_id", "email", "password_hash", "name", "role", "created_at", "updated_at")
VALUES (
  'b106f5d2-5fa9-4ee9-aec1-ecf123b0d913',
  '2fe242ac-15fc-4cca-aba7-b7db4d5d331f',
  'samezzzat@gmail.com',
  '$2a$10$mZh777pfSGB35rVqlXWMle9wTDd66EOCpX3CtkAv5bd8c/nfiXjJ2',
  'Sam Ezzat',
  'ADMIN',
  now(),
  now()
);

UPDATE "conference_houses" SET "organization_id" = '2fe242ac-15fc-4cca-aba7-b7db4d5d331f' WHERE "organization_id" IS NULL;
UPDATE "attendees" SET "organization_id" = '2fe242ac-15fc-4cca-aba7-b7db4d5d331f' WHERE "organization_id" IS NULL;
UPDATE "audit_logs" SET "organization_id" = '2fe242ac-15fc-4cca-aba7-b7db4d5d331f' WHERE "organization_id" IS NULL;
UPDATE "communication_settings" SET "organization_id" = '2fe242ac-15fc-4cca-aba7-b7db4d5d331f' WHERE "organization_id" IS NULL;
UPDATE "message_templates" SET "organization_id" = '2fe242ac-15fc-4cca-aba7-b7db4d5d331f' WHERE "organization_id" IS NULL;
UPDATE "message_campaigns" SET "organization_id" = '2fe242ac-15fc-4cca-aba7-b7db4d5d331f' WHERE "organization_id" IS NULL;
