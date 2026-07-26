-- CreateTable
CREATE TABLE "CompendiumEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompendiumEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CompendiumEntry_campaignId_idx" ON "CompendiumEntry"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CompendiumEntry_campaignId_slug_key" ON "CompendiumEntry"("campaignId", "slug");
