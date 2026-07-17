/*
  Warnings:

  - Added the required column `updatedAt` to the `Scene` table without a default value. This is not possible if the table is not empty.

*/
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("campaignId", "createdAt", "id", "name") SELECT "campaignId", "createdAt", "id", "name" FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_campaignId_active_idx" ON "Scene"("campaignId", "active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
