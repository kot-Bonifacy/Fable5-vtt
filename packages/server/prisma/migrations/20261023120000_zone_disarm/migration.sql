-- AlterTable
ALTER TABLE "DefenseZone" ADD COLUMN "disarmDv" INTEGER;
ALTER TABLE "DefenseZone" ADD COLUMN "disarmTried" TEXT NOT NULL DEFAULT '[]';
