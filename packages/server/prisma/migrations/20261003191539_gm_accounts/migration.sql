-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "music" TEXT NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gmId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopTier" INTEGER NOT NULL DEFAULT 1,
    "shopTierOverrides" TEXT NOT NULL DEFAULT '{}',
    "sandbox" BOOLEAN NOT NULL DEFAULT false,
    "gameTime" INTEGER NOT NULL DEFAULT 39447840,
    "settledMonth" TEXT,
    CONSTRAINT "Campaign_gmId_fkey" FOREIGN KEY ("gmId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Campaign" ("active", "createdAt", "gameTime", "id", "music", "name", "sandbox", "settledMonth", "shopTier", "shopTierOverrides") SELECT "active", "createdAt", "gameTime", "id", "music", "name", "sandbox", "settledMonth", "shopTier", "shopTierOverrides" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
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
    "diceSkin" TEXT NOT NULL DEFAULT 'neon'
);
INSERT INTO "new_User" ("createdAt", "diceSkin", "id", "name", "passwordHash", "role") SELECT "createdAt", "diceSkin", "id", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- Backfill (stage 44a): the one GM account so far becomes the owner, logs in
-- with its old name (lowercase — the login column is case-folded) and runs
-- every existing campaign. `ensureGmUser` then finds it by `GM_NAME`.
UPDATE "User" SET "login" = lower("name"), "owner" = true WHERE "role" = 'GM';
UPDATE "Campaign" SET "gmId" = (
    SELECT "id" FROM "User" WHERE "role" = 'GM' ORDER BY "createdAt" ASC LIMIT 1
) WHERE "gmId" IS NULL;
