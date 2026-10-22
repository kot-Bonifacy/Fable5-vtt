-- Etap 57a: karta z pliku czekająca na gracza i link, który ją przypisuje.
ALTER TABLE "Character" ADD COLUMN "pendingOwnerName" TEXT;
ALTER TABLE "Character" ADD COLUMN "pendingOwnerId" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "characterId" TEXT;
