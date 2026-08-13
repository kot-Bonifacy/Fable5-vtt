-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Handout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "lead" TEXT,
    "outlet" TEXT,
    "dateline" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Handout_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Handout" ("body", "campaignId", "createdAt", "id", "imageHeight", "imageUrl", "imageWidth", "title", "updatedAt") SELECT "body", "campaignId", "createdAt", "id", "imageHeight", "imageUrl", "imageWidth", "title", "updatedAt" FROM "Handout";
DROP TABLE "Handout";
ALTER TABLE "new_Handout" RENAME TO "Handout";
CREATE INDEX "Handout_campaignId_idx" ON "Handout"("campaignId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
