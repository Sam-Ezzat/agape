/*
  Warnings:

  - You are about to drop the column `church_organization` on the `attendees` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[ticket_id]` on the table `attendees` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "attendees" DROP COLUMN "church_organization",
ADD COLUMN     "area" TEXT,
ADD COLUMN     "arrival_method" TEXT,
ADD COLUMN     "bus_pickup_point" TEXT,
ADD COLUMN     "checked_in_by" TEXT,
ADD COLUMN     "church" TEXT,
ADD COLUMN     "governorate" TEXT,
ADD COLUMN     "internal_notes" TEXT,
ADD COLUMN     "payment_method" TEXT,
ADD COLUMN     "payment_status" "PaymentStatus" DEFAULT 'PENDING',
ADD COLUMN     "rooming_notes" TEXT,
ADD COLUMN     "ticket_id" TEXT,
ADD COLUMN     "transaction_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "attendees_ticket_id_key" ON "attendees"("ticket_id");

-- CreateIndex
CREATE INDEX "attendees_ticket_id_idx" ON "attendees"("ticket_id");

-- CreateIndex
CREATE INDEX "attendees_payment_status_idx" ON "attendees"("payment_status");

-- CreateIndex
CREATE INDEX "attendees_email_idx" ON "attendees"("email");
