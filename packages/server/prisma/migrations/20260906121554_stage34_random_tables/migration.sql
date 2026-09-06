-- CreateTable
CREATE TABLE "RandomTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formula" TEXT NOT NULL DEFAULT '1d10',
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" TEXT NOT NULL DEFAULT 'gm',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RandomTable_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RandomTableRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "min" INTEGER NOT NULL,
    "max" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "subTableId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RandomTableRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RandomTable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RandomTableRow_subTableId_fkey" FOREIGN KEY ("subTableId") REFERENCES "RandomTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RandomTable_campaignId_idx" ON "RandomTable"("campaignId");

-- CreateIndex
CREATE INDEX "RandomTableRow_tableId_idx" ON "RandomTableRow"("tableId");

-- CreateIndex
CREATE INDEX "RandomTableRow_subTableId_idx" ON "RandomTableRow"("subTableId");
