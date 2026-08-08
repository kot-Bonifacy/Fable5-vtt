-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'gm',
    "throughMessageId" INTEGER,
    "lineCount" INTEGER NOT NULL DEFAULT 0,
    "indexedDigest" TEXT,
    "indexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BotRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BotRelation_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BotRelation_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "JournalEntry_campaignId_idx" ON "JournalEntry"("campaignId");

-- CreateIndex
CREATE INDEX "BotRelation_botId_idx" ON "BotRelation"("botId");

-- CreateIndex
CREATE INDEX "BotRelation_characterId_idx" ON "BotRelation"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "BotRelation_botId_characterId_key" ON "BotRelation"("botId", "characterId");
