-- CreateTable
CREATE TABLE "NetAccessPoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "architectureId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Punkt dostępu',
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NetAccessPoint_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetAccessPoint_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "NetArchitecture" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NetRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "architectureId" TEXT NOT NULL,
    "accessPointId" INTEGER NOT NULL,
    "tokenId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NetRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetRun_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "NetArchitecture" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NetRun_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NetArchitecture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'standard',
    "data" TEXT NOT NULL,
    "runtime" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NetArchitecture_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NetArchitecture" ("campaignId", "createdAt", "data", "difficulty", "id", "name", "updatedAt") SELECT "campaignId", "createdAt", "data", "difficulty", "id", "name", "updatedAt" FROM "NetArchitecture";
DROP TABLE "NetArchitecture";
ALTER TABLE "new_NetArchitecture" RENAME TO "NetArchitecture";
CREATE INDEX "NetArchitecture_campaignId_idx" ON "NetArchitecture"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NetAccessPoint_sceneId_idx" ON "NetAccessPoint"("sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "NetRun_tokenId_key" ON "NetRun"("tokenId");

-- CreateIndex
CREATE INDEX "NetRun_campaignId_idx" ON "NetRun"("campaignId");
