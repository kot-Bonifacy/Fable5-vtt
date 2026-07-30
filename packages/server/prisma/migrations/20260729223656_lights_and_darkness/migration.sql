-- CreateTable
CREATE TABLE "MapLight" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "brightM" REAL NOT NULL DEFAULT 4,
    "dimM" REAL NOT NULL DEFAULT 10,
    "color" TEXT NOT NULL DEFAULT '#ffd9a0',
    "flicker" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapLight_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Scene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "backgroundUrl" TEXT,
    "backgroundWidth" INTEGER,
    "backgroundHeight" INTEGER,
    "width" INTEGER NOT NULL DEFAULT 4000,
    "height" INTEGER NOT NULL DEFAULT 3000,
    "gridMode" TEXT NOT NULL DEFAULT 'grid',
    "gridSizePx" REAL NOT NULL DEFAULT 100,
    "gridOffsetX" REAL NOT NULL DEFAULT 0,
    "gridOffsetY" REAL NOT NULL DEFAULT 0,
    "gridColor" TEXT NOT NULL DEFAULT '#000000',
    "gridAlpha" REAL NOT NULL DEFAULT 0.35,
    "gridVisible" BOOLEAN NOT NULL DEFAULT true,
    "metersPerSquare" REAL NOT NULL DEFAULT 2,
    "visibility" TEXT NOT NULL DEFAULT 'fog',
    "dark" BOOLEAN NOT NULL DEFAULT false,
    "darkSightM" REAL NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("active", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "updatedAt", "visibility", "width") SELECT "active", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "updatedAt", "visibility", "width" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_campaignId_active_idx" ON "Scene"("campaignId", "active");
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
    "visionRange" REAL,
    "lightBrightM" REAL NOT NULL DEFAULT 0,
    "lightDimM" REAL NOT NULL DEFAULT 0,
    "lightColor" TEXT NOT NULL DEFAULT '#ffd9a0',
    "lightFlicker" BOOLEAN NOT NULL DEFAULT false,
    "lightOn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Token_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Token_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Token_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Token" ("characterId", "createdAt", "hidden", "hpCurrent", "hpMax", "id", "imageUrl", "name", "ownerId", "sceneId", "size", "statuses", "updatedAt", "visionRange", "x", "y") SELECT "characterId", "createdAt", "hidden", "hpCurrent", "hpMax", "id", "imageUrl", "name", "ownerId", "sceneId", "size", "statuses", "updatedAt", "visionRange", "x", "y" FROM "Token";
DROP TABLE "Token";
ALTER TABLE "new_Token" RENAME TO "Token";
CREATE INDEX "Token_sceneId_idx" ON "Token"("sceneId");
CREATE INDEX "Token_characterId_idx" ON "Token"("characterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MapLight_sceneId_idx" ON "MapLight"("sceneId");
