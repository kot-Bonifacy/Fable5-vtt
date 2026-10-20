-- 20.10.2026: gracz dostaje komunikat o PD przyznanych przez MG — także po powrocie do stołu.

-- AlterTable
ALTER TABLE "AdvancementEntry" ADD COLUMN "seenAt" DATETIME;

-- Wszystko sprzed tej migracji uchodzi za pokazane: gracz nie dostaje naraz
-- komunikatów o każdej sesji kampanii.
UPDATE "AdvancementEntry" SET "seenAt" = "createdAt";
