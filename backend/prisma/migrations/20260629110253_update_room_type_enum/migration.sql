/*
  Warnings:

  - The values [SINGLE,DOUBLE,SUITE,DORMITORY] on the enum `RoomType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RoomType_new" AS ENUM ('GENERAL', 'VIP', 'FAMILY');
ALTER TABLE "rooms" ALTER COLUMN "room_type" DROP DEFAULT;
ALTER TABLE "rooms" ALTER COLUMN "room_type" TYPE "RoomType_new" USING ("room_type"::text::"RoomType_new");
ALTER TYPE "RoomType" RENAME TO "RoomType_old";
ALTER TYPE "RoomType_new" RENAME TO "RoomType";
DROP TYPE "RoomType_old";
ALTER TABLE "rooms" ALTER COLUMN "room_type" SET DEFAULT 'GENERAL';
COMMIT;

-- AlterTable
ALTER TABLE "rooms" ALTER COLUMN "room_type" SET DEFAULT 'GENERAL';
