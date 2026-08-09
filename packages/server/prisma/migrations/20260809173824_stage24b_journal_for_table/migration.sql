-- CreateTable
CREATE TABLE "JournalHandout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "handoutId" TEXT NOT NULL,
    CONSTRAINT "JournalHandout_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalHandout_handoutId_fkey" FOREIGN KEY ("handoutId") REFERENCES "Handout" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'gm',
    "sharedWithPlayers" BOOLEAN NOT NULL DEFAULT false,
    "throughMessageId" INTEGER,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "indexedDigest" TEXT,
    "indexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntry" ("body", "campaignId", "createdAt", "id", "indexedAt", "indexedDigest", "lineCount", "sessionDate", "tags", "throughMessageId", "title", "updatedAt", "visibility") SELECT "body", "campaignId", "createdAt", "id", "indexedAt", "indexedDigest", "lineCount", "sessionDate", "tags", "throughMessageId", "title", "updatedAt", "visibility" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE INDEX "JournalEntry_campaignId_idx" ON "JournalEntry"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "JournalHandout_handoutId_idx" ON "JournalHandout"("handoutId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalHandout_entryId_handoutId_key" ON "JournalHandout"("entryId", "handoutId");
