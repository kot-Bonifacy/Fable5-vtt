-- 30.10.2026 (etap 65a): pojazd jako własność postaci albo pojazd MG/NPC-a.

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "ownerCharacterId" TEXT,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "widthSq" INTEGER NOT NULL DEFAULT 3,
    "lengthSq" INTEGER NOT NULL DEFAULT 5,
    "layout" TEXT NOT NULL DEFAULT 'car-4',
    "system" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vehicle_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vehicle_ownerCharacterId_fkey" FOREIGN KEY ("ownerCharacterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Vehicle_campaignId_idx" ON "Vehicle"("campaignId");

-- CreateIndex
CREATE INDEX "Vehicle_ownerCharacterId_idx" ON "Vehicle"("ownerCharacterId");
