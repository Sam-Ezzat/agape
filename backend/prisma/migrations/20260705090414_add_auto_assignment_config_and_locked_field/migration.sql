-- AlterTable
ALTER TABLE "room_assignments" ADD COLUMN     "is_locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auto_assignment_configs" (
    "id" TEXT NOT NULL,
    "conference_house_id" TEXT NOT NULL,
    "enabled_buildings" TEXT[],
    "staff_reserved_capacity" INTEGER NOT NULL DEFAULT 0,
    "vip_reserved_capacity" INTEGER NOT NULL DEFAULT 0,
    "emergency_reserved_capacity" INTEGER NOT NULL DEFAULT 0,
    "enabled_rules" TEXT[],
    "rule_weights" JSONB NOT NULL DEFAULT '{}',
    "optimization_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_assignment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_assignment_configs_conference_house_id_key" ON "auto_assignment_configs"("conference_house_id");

-- CreateIndex
CREATE INDEX "auto_assignment_configs_conference_house_id_idx" ON "auto_assignment_configs"("conference_house_id");

-- CreateIndex
CREATE INDEX "attendees_gender_idx" ON "attendees"("gender");

-- CreateIndex
CREATE INDEX "room_assignments_is_locked_idx" ON "room_assignments"("is_locked");

-- CreateIndex
CREATE INDEX "rooms_room_type_idx" ON "rooms"("room_type");

-- AddForeignKey
ALTER TABLE "auto_assignment_configs" ADD CONSTRAINT "auto_assignment_configs_conference_house_id_fkey" FOREIGN KEY ("conference_house_id") REFERENCES "conference_houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
