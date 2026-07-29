-- Stage 18a: walls, per-token vision range and the three-way visibility mode.

-- AlterTable
ALTER TABLE "Token" ADD COLUMN "visionRange" REAL;

-- CreateTable
CREATE TABLE "Wall" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'wall',
    "open" BOOLEAN NOT NULL DEFAULT false,
    "playerToggle" BOOLEAN NOT NULL DEFAULT false,
    "x1" REAL NOT NULL,
    "y1" REAL NOT NULL,
    "x2" REAL NOT NULL,
    "y2" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wall_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
-- `fogEnabled` becomes one of three visibility modes. The copy below carries the
-- old value across (`true` -> 'fog', `false` -> 'open') instead of letting every
-- scene fall back to the column default — a running campaign must not have its
-- fully lit scenes covered up by an upgrade.
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("active", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "updatedAt", "width", "visibility") SELECT "active", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "updatedAt", "width", CASE WHEN "fogEnabled" THEN 'fog' ELSE 'open' END FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_campaignId_active_idx" ON "Scene"("campaignId", "active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Wall_sceneId_idx" ON "Wall"("sceneId");
