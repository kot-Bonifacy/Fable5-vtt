-- CreateTable
CREATE TABLE "Smoke" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Dym',
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "sideM" REAL NOT NULL,
    "penalty" INTEGER NOT NULL DEFAULT -4,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Smoke_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Smoke_sceneId_idx" ON "Smoke"("sceneId");
