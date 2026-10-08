-- Etap 45 „Ruch i widzenie drużyny” (decyzja MG z 08.10.2026).
--
-- Blokada ruchu graczy (`playerMoveLocked`, 12.09) staje się trybem o trzech
-- stanach: zamknięta mapa to "stop", otwarta to "free" — zasady ruchu przy
-- stole nie zmieniają się z dnia na dzień; Eksplorację MG włącza sam.
-- Nowa scena startuje w widoczności "dynamic" (jak Token Vision w Foundry);
-- stare sceny zachowują swój tryb. "Token"."sharedVision" — „oczy drużyny”
-- (wzór: Observer z Foundry), NULL = samo.
-- AlterTable
ALTER TABLE "Token" ADD COLUMN "sharedVision" BOOLEAN;

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
    "visibility" TEXT NOT NULL DEFAULT 'dynamic',
    "playerMove" TEXT NOT NULL DEFAULT 'stop',
    "ambience" TEXT NOT NULL DEFAULT 'none',
    "dark" BOOLEAN NOT NULL DEFAULT false,
    "darkSightM" REAL NOT NULL DEFAULT 2,
    "explore" BOOLEAN NOT NULL DEFAULT true,
    "spawnX" REAL,
    "spawnY" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Scene" ("active", "ambience", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "dark", "darkSightM", "explore", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "spawnX", "spawnY", "updatedAt", "visibility", "width", "playerMove") SELECT "active", "ambience", "backgroundHeight", "backgroundUrl", "backgroundWidth", "campaignId", "createdAt", "dark", "darkSightM", "explore", "gridAlpha", "gridColor", "gridMode", "gridOffsetX", "gridOffsetY", "gridSizePx", "gridVisible", "height", "id", "metersPerSquare", "name", "spawnX", "spawnY", "updatedAt", "visibility", "width", CASE WHEN "playerMoveLocked" THEN 'stop' ELSE 'free' END FROM "Scene";
DROP TABLE "Scene";
ALTER TABLE "new_Scene" RENAME TO "Scene";
CREATE INDEX "Scene_campaignId_active_idx" ON "Scene"("campaignId", "active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

