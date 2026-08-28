-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopTier" INTEGER NOT NULL DEFAULT 1,
    "sandbox" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Campaign" ("active", "createdAt", "id", "name", "shopTier") SELECT "active", "createdAt", "id", "name", "shopTier" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
