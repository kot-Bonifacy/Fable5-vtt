-- AlterTable
-- Pancerz bariery (etap 42b, zasada domowa MG z 13.09.2026).
--
-- Zero dla każdego istniejącego wiersza: bariery z etapu 42a przepuszczały
-- strzały bez zmian i dalej to robią, dopóki MG nie wpisze im liczby.
ALTER TABLE "Wall" ADD COLUMN "armor" INTEGER NOT NULL DEFAULT 0;
