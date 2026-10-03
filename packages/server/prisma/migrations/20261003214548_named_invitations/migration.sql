-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "userId" TEXT,
    "renewal" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" DATETIME,
    CONSTRAINT "Invitation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Invitation" ("campaignId", "createdAt", "expiresAt", "id", "revokedAt", "token") SELECT "campaignId", "createdAt", "expiresAt", "id", "revokedAt", "token" FROM "Invitation";
DROP TABLE "Invitation";
ALTER TABLE "new_Invitation" RENAME TO "Invitation";
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
CREATE INDEX "Invitation_campaignId_idx" ON "Invitation"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Etap 44b (decyzja MG z 03.10): dotychczasowe linki są anonimowe — wpuszczały
-- pod dowolnym imieniem, także cudzym. Unieważnione; gracze, którzy już weszli,
-- zostają przy swoich kontach. Daty w tym samym kształcie, co zapisuje Prisma.
UPDATE "Invitation" SET "revokedAt" = strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now') WHERE "revokedAt" IS NULL;
