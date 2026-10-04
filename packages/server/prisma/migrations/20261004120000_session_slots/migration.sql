-- Stage 44c: the global `Campaign.active` gives way to a running session per
-- campaign (`sessionStartedAt`), the GM's open campaign (`User.openCampaignId`)
-- and preparation chat lines hidden from players (`ChatMessage.prep`).
--
-- Carried over: the one campaign that was active keeps its table — it becomes a
-- running session (players stay seated after the upgrade, and so do the E2E
-- checkpoints), and every GM opens the campaign they had active, or else their
-- newest one.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "music" TEXT NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gmId" TEXT,
    "sessionStartedAt" DATETIME,
    "lastSessionEndedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopTier" INTEGER NOT NULL DEFAULT 1,
    "shopTierOverrides" TEXT NOT NULL DEFAULT '{}',
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "gameTime" INTEGER NOT NULL DEFAULT 39447840,
    "settledMonth" TEXT,
    CONSTRAINT "Campaign_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("createdAt", "gameTime", "gmId", "id", "music", "name", "sandbox", "settledMonth", "shopTier", "shopTierOverrides", "sessionStartedAt")
SELECT "createdAt", "gameTime", "gmId", "id", "music", "name", "sandbox", "settledMonth", "shopTier", "shopTierOverrides",
    CASE WHEN "id" = (SELECT "id" FROM "Campaign" WHERE "active" = 1 ORDER BY "createdAt" DESC LIMIT 1)
         THEN strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') ELSE NULL END
FROM "Campaign";

CREATE TABLE "new_ChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "recipientId" TEXT,
    "payload" TEXT,
    "botId" TEXT,
    "recipientBotId" TEXT,
    "speakerName" TEXT,
    "sceneId" TEXT,
    "prep" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_recipientBotId_fkey" FOREIGN KEY ("recipientBotId") REFERENCES "BotProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChatMessage_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChatMessage" ("authorId", "botId", "campaignId", "createdAt", "id", "kind", "payload", "recipientBotId", "recipientId", "sceneId", "speakerName", "text") SELECT "authorId", "botId", "campaignId", "createdAt", "id", "kind", "payload", "recipientBotId", "recipientId", "sceneId", "speakerName", "text" FROM "ChatMessage";
DROP TABLE "ChatMessage";
ALTER TABLE "new_ChatMessage" RENAME TO "ChatMessage";
CREATE INDEX "ChatMessage_campaignId_id_idx" ON "ChatMessage"("campaignId", "id");
CREATE INDEX "ChatMessage_sceneId_id_idx" ON "ChatMessage"("sceneId", "id");

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "login" TEXT,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "blockedAt" DATETIME,
    "lastSeenAt" DATETIME,
    "openCampaignId" TEXT,
    "diceSkin" TEXT NOT NULL DEFAULT 'neon',
    CONSTRAINT "User_openCampaignId_fkey" FOREIGN KEY ("openCampaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("blockedAt", "createdAt", "diceSkin", "id", "lastSeenAt", "login", "name", "owner", "passwordHash", "role", "openCampaignId")
SELECT "blockedAt", "createdAt", "diceSkin", "id", "lastSeenAt", "login", "name", "owner", "passwordHash", "role",
    CASE WHEN "role" = 'GM' THEN (
        SELECT c."id" FROM "Campaign" c WHERE c."gmId" = "User"."id"
        ORDER BY c."active" DESC, c."createdAt" DESC LIMIT 1
    ) ELSE NULL END
FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
