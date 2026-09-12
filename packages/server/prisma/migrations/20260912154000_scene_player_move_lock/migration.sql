-- AlterTable
-- Blokada ruchu graczy po mapie (zlecenie MG, 12.09.2026).
--
-- Kolumna wchodzi z domyślną wartością 1 („zablokowana"), bo nowa scena to
-- zwykle mapa dopiero budowana. Sceny, które już stoją w bazie, dostają
-- 0 („odblokowana") — grupa gra na nich od miesięcy i zmiana zasad ruchu przy
-- stole z dnia na dzień nie jest tym, o co MG prosił.
ALTER TABLE "Scene" ADD COLUMN "playerMoveLocked" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Scene" SET "playerMoveLocked" = false;
