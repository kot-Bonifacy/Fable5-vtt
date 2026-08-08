-- Wycofanie mowy botów (odwrócenie migracji 20260725214209_bot_speech).
-- Znika sesyjny przełącznik „mowa botów" i sekcja „voice" w profilu bota.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Campaign" ("active", "createdAt", "id", "name") SELECT "active", "createdAt", "id", "name" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Profil bota siedzi w jednej kolumnie JSON, więc sekcję głosu zdejmuje się
-- zapytaniem, nie zmianą schematu. `parseBotData` i tak ignoruje nieznane pola,
-- ale zostawienie ich w bazie zapisywałoby przy każdej edycji martwe dane.
UPDATE "BotProfile"
SET "data" = json_remove("data", '$.voice')
WHERE json_valid("data") AND json_extract("data", '$.voice') IS NOT NULL;
