-- CreateTable
CREATE TABLE "SceneExploration" (
    "sceneId" TEXT NOT NULL PRIMARY KEY,
    "cell" INTEGER NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SceneExploration_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FogShape" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "override" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FogShape_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FogShape" ("createdAt", "data", "id", "kind", "mode", "sceneId") SELECT "createdAt", "data", "id", "kind", "mode", "sceneId" FROM "FogShape";
DROP TABLE "FogShape";
ALTER TABLE "new_FogShape" RENAME TO "FogShape";
CREATE INDEX "FogShape_sceneId_id_idx" ON "FogShape"("sceneId", "id");
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
    "explore" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("active", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "dark", "darkSightM", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "updatedAt", "visibility", "width") SELECT "active", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "dark", "darkSightM", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "updatedAt", "visibility", "width" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_campaignId_active_idx" ON "Scene"("campaignId", "active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
