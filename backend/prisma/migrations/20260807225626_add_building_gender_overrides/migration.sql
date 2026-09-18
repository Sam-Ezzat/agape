-- AlterTable
ALTER TABLE "auto_assignment_configs" ADD COLUMN     "building_gender_overrides" JSONB NOT NULL DEFAULT '{}';
