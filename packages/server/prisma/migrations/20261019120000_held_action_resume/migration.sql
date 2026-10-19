-- 19.10.2026: a fired „Wstrzymanie Akcji" hands the queue back to the turn it stepped in front of,
-- and „Działam teraz" queues the held Action right after the running turn.

-- AlterTable
ALTER TABLE "Combat" ADD COLUMN "resumeCombatantId" TEXT;
ALTER TABLE "Combat" ADD COLUMN "resumeRound" INTEGER;

-- AlterTable
ALTER TABLE "Combatant" ADD COLUMN "heldReady" BOOLEAN NOT NULL DEFAULT false;
