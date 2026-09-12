-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PortraitAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "cropX" REAL NOT NULL DEFAULT 0.5,
    "cropY" REAL NOT NULL DEFAULT 0.5,
    "cropZoom" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortraitAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PortraitAsset" ("campaignId", "createdAt", "height", "id", "name", "url", "width") SELECT "campaignId", "createdAt", "height", "id", "name", "url", "width" FROM "PortraitAsset";
DROP TABLE "PortraitAsset";
ALTER TABLE "new_PortraitAsset" RENAME TO "PortraitAsset";
CREATE INDEX "PortraitAsset_campaignId_idx" ON "PortraitAsset"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
