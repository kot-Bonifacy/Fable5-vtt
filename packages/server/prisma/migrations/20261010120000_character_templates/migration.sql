-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creationDraftId" TEXT,
    "creationUserId" TEXT,
    "creationTokenDone" BOOLEAN NOT NULL DEFAULT false,
    "playReady" BOOLEAN NOT NULL DEFAULT true,
    "template" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ownerId" TEXT,
    "portraitUrl" TEXT,
    "data" TEXT NOT NULL DEFAULT '{}',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Character_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Character_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("campaignId", "createdAt", "creationDraftId", "creationTokenDone", "creationUserId", "data", "id", "name", "ownerId", "playReady", "portraitUrl", "revision", "updatedAt") SELECT "campaignId", "createdAt", "creationDraftId", "creationTokenDone", "creationUserId", "data", "id", "name", "ownerId", "playReady", "portraitUrl", "revision", "updatedAt" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE UNIQUE INDEX "Character_creationDraftId_key" ON "Character"("creationDraftId");
CREATE INDEX "Character_campaignId_idx" ON "Character"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

