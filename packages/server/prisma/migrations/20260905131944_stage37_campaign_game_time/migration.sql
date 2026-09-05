-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN "worldDate" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopTier" INTEGER NOT NULL DEFAULT 1,
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "gameTime" INTEGER NOT NULL DEFAULT 39447840,
    "settledMonth" TEXT
);
INSERT INTO "new_Campaign" ("active", "createdAt", "id", "name", "sandbox", "shopTier") SELECT "active", "createdAt", "id", "name", "sandbox", "shopTier" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
