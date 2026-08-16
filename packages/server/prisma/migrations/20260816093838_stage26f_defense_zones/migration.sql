-- CreateTable
CREATE TABLE "DefenseZone" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sceneId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "width" REAL NOT NULL,
    "height" REAL NOT NULL,
    "armed" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT true,
    "hpMax" INTEGER NOT NULL DEFAULT 0,
    "hpCurrent" INTEGER NOT NULL DEFAULT 0,
    "exempt" TEXT NOT NULL DEFAULT '[]',
    "sightings" TEXT NOT NULL DEFAULT '{}',
    "tokenId" TEXT,
    "architectureId" TEXT,
    "floorId" TEXT,
    "deviceId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DefenseZone_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DefenseZone_architectureId_fkey" FOREIGN KEY ("architectureId") REFERENCES "NetArchitecture" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DefenseZone_sceneId_idx" ON "DefenseZone"("sceneId");
