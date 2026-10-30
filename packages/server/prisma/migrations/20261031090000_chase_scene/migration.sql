-- 31.10.2026 (etap 65b): scena pościgu — rodzaj sceny, bieżnia, auta na scenie i fotele figur.
-- CreateTable
CREATE TABLE "SceneVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'racing',
    "drivers" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneVehicle_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "gridPlayers" BOOLEAN NOT NULL DEFAULT false,
    "metersPerSquare" REAL NOT NULL DEFAULT 2,
    "visibility" TEXT NOT NULL DEFAULT 'dynamic',
    "playerMove" TEXT NOT NULL DEFAULT 'stop',
    "ambience" TEXT NOT NULL DEFAULT 'none',
    "dark" BOOLEAN NOT NULL DEFAULT false,
    "darkSightM" REAL NOT NULL DEFAULT 2,
    "explore" BOOLEAN NOT NULL DEFAULT true,
    "partySight" BOOLEAN NOT NULL DEFAULT false,
    "spawnX" REAL,
    "spawnY" REAL,
    "kind" TEXT NOT NULL DEFAULT 'map',
    "chaseDirection" TEXT NOT NULL DEFAULT 'right',
    "chaseTempo" INTEGER NOT NULL DEFAULT 40,
    "chaseRunning" BOOLEAN NOT NULL DEFAULT true,
    "chaseRoadFrom" INTEGER,
    "chaseRoadTo" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("active", "ambience", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "dark", "darkSightM", "explore", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridPlayers", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "partySight", "playerMove", "spawnX", "spawnY", "updatedAt", "visibility", "width") SELECT "active", "ambience", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "dark", "darkSightM", "explore", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridPlayers", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "partySight", "playerMove", "spawnX", "spawnY", "updatedAt", "visibility", "width" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_campaignId_active_idx" ON "Scene"("campaignId", "active");
CREATE TABLE "new_Token" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicName" TEXT,
    "imageUrl" TEXT,
    "glyph" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 1,
    "ownerId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "characterId" TEXT,
    "hpCurrent" INTEGER,
    "hpMax" INTEGER,
    "statuses" TEXT NOT NULL DEFAULT '[]',
    "statusData" TEXT NOT NULL DEFAULT '{}',
    "facing" REAL,
    "visionRange" REAL,
    "lightBrightM" REAL NOT NULL DEFAULT 0,
    "lightDimM" REAL NOT NULL DEFAULT 0,
    "lightColor" TEXT NOT NULL DEFAULT '#ffd9a0',
    "lightFlicker" BOOLEAN NOT NULL DEFAULT false,
    "lightOn" BOOLEAN NOT NULL DEFAULT true,
    "sharedVision" BOOLEAN,
    "disposition" TEXT,
    "sightings" TEXT NOT NULL DEFAULT '{}',
    "spotDv" INTEGER,
    "sneak" TEXT,
    "sceneVehicleId" TEXT,
    "vehicleSeat" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Token_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Token_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Token_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Token_sceneVehicleId_fkey" FOREIGN KEY ("sceneVehicleId") REFERENCES "SceneVehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Token" ("characterId", "createdAt", "disposition", "facing", "glyph", "hidden", "hpCurrent", "hpMax", "id", "imageUrl", "lightBrightM", "lightColor", "lightDimM", "lightFlicker", "lightOn", "name", "ownerId", "publicName", "sceneId", "sharedVision", "sightings", "size", "sneak", "spotDv", "statusData", "statuses", "updatedAt", "visionRange", "x", "y") SELECT "characterId", "createdAt", "disposition", "facing", "glyph", "hidden", "hpCurrent", "hpMax", "id", "imageUrl", "lightBrightM", "lightColor", "lightDimM", "lightFlicker", "lightOn", "name", "ownerId", "publicName", "sceneId", "sharedVision", "sightings", "size", "sneak", "spotDv", "statusData", "statuses", "updatedAt", "visionRange", "x", "y" FROM "Token";
DROP TABLE "Token";
ALTER TABLE "new_Token" RENAME TO "Token";
CREATE INDEX "Token_sceneId_idx" ON "Token"("sceneId");
CREATE INDEX "Token_characterId_idx" ON "Token"("characterId");
CREATE INDEX "Token_sceneVehicleId_idx" ON "Token"("sceneVehicleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SceneVehicle_vehicleId_key" ON "SceneVehicle"("vehicleId");

-- CreateIndex
CREATE INDEX "SceneVehicle_sceneId_idx" ON "SceneVehicle"("sceneId");

