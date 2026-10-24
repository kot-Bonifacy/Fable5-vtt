-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "userId" TEXT,
    "renewal" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" DATETIME,
    "characterId" TEXT,
    CONSTRAINT "Invitation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Invitation" ("campaignId", "characterId", "createdAt", "expiresAt", "id", "name", "renewal", "revokedAt", "token", "usedAt", "userId") SELECT "campaignId", "characterId", "createdAt", "expiresAt", "id", "name", "renewal", "revokedAt", "token", "usedAt", "userId" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX "Invitation_campaignId_idx" ON "Invitation"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Players' links stop expiring and stop wearing out (24.10.2026): every live
-- named link that was used or is still within its week becomes a permanent key.
UPDATE "Invitation" SET "expiresAt" = NULL
WHERE "revokedAt" IS NULL AND "name" IS NOT NULL AND (
  "usedAt" IS NOT NULL OR
  CASE typeof("expiresAt")
    WHEN 'integer' THEN "expiresAt" > CAST(strftime('%s', 'now') AS INTEGER) * 1000
    ELSE julianday("expiresAt") > julianday('now')
  END
);
