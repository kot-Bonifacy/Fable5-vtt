-- 19.10.2026 (etap 56): postawa figury (Foundry: Disposition) i starcie z zauważenia wroga.

-- AlterTable
ALTER TABLE "Token" ADD COLUMN "disposition" TEXT;

-- AlterTable
ALTER TABLE "Combat" ADD COLUMN "sighting" TEXT;
