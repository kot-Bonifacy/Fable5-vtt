-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 1,
    "ownerId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "characterId" TEXT,
    "hpCurrent" INTEGER,
    "hpMax" INTEGER,
    "statuses" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Token_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Token_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Token_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Token" ("createdAt", "hidden", "hpCurrent", "hpMax", "id", "imageUrl", "name", "ownerId", "sceneId", "size", "statuses", "updatedAt", "x", "y") SELECT "createdAt", "hidden", "hpCurrent", "hpMax", "id", "imageUrl", "name", "ownerId", "sceneId", "size", "statuses", "updatedAt", "x", "y" FROM "Token";
DROP TABLE "Token";
ALTER TABLE "new_Token" RENAME TO "Token";
CREATE INDEX "Token_sceneId_idx" ON "Token"("sceneId");
CREATE INDEX "Token_characterId_idx" ON "Token"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
