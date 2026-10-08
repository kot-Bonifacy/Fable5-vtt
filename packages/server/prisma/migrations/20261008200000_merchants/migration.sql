-- Etap 46a „Jedno okno wymiany i handlarze” (decyzje MG z 08.10.2026).
--
-- "Merchant" — ustawienia sklepu; towarem jest ekwipunek karty "characterId".
-- "Campaign"."catalogShopping" — „Zakupy z katalogu: wszędzie / tylko
-- u handlarzy”; stare kampanie dostają „wszędzie” i grają jak dotąd.
-- Nowy rodzaj wpisu historii eurodolców "sale" nie wymaga zmiany kolumny
-- ("LedgerEntry"."kind" jest tekstem).

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sign" TEXT NOT NULL DEFAULT '',
    "open" BOOLEAN NOT NULL DEFAULT false,
    "access" TEXT NOT NULL DEFAULT 'reach',
    "betweenSessions" BOOLEAN NOT NULL DEFAULT false,
    "priceMul" INTEGER NOT NULL DEFAULT 100,
    "buyBackPct" INTEGER NOT NULL DEFAULT 50,
    "cashInfinite" BOOLEAN NOT NULL DEFAULT false,
    "rows" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Merchant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Merchant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "catalogShopping" TEXT NOT NULL DEFAULT 'everywhere';

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_characterId_key" ON "Merchant"("characterId");

-- CreateIndex
CREATE INDEX "Merchant_campaignId_idx" ON "Merchant"("campaignId");
