-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "bunk_beds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "individual_beds" INTEGER NOT NULL DEFAULT 0;
