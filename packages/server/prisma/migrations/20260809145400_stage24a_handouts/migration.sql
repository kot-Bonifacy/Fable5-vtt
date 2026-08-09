-- CreateTable
CREATE TABLE "Handout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Handout_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HandoutShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "handoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoutShare_handoutId_fkey" FOREIGN KEY ("handoutId") REFERENCES "Handout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HandoutShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Handout_campaignId_idx" ON "Handout"("campaignId");

-- CreateIndex
CREATE INDEX "HandoutShare_userId_idx" ON "HandoutShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HandoutShare_handoutId_userId_key" ON "HandoutShare"("handoutId", "userId");
