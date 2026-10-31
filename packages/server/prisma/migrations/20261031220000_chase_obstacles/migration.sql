-- 31.10.2026 (etap 65e): przeszkody i ruch uliczny na scenie pościgu, kolczatka.
ALTER TABLE "SceneVehicle" ADD COLUMN "spikesUsed" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ChaseObstacle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "widthSq" REAL NOT NULL,
    "lengthSq" REAL NOT NULL,
    "hp" INTEGER NOT NULL,
    "hpMax" INTEGER NOT NULL,
    "driftRound" INTEGER NOT NULL DEFAULT 0,
    "blockingId" TEXT,
    "passed" TEXT NOT NULL DEFAULT '[]',
    "droppedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChaseObstacle_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChaseObstacle_blockingId_fkey" FOREIGN KEY ("blockingId") REFERENCES "SceneVehicle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ChaseObstacle_sceneId_idx" ON "ChaseObstacle"("sceneId");
