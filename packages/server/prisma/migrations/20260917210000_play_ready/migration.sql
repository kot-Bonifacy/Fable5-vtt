-- Naprawa 3c: znacznik gotowości do gry, nadawany przez MG.
-- Istniejące karty są gotowe — MG nie ma przechodzić całej kampanii od nowa.
ALTER TABLE "Character" ADD COLUMN "playReady" BOOLEAN NOT NULL DEFAULT true;
