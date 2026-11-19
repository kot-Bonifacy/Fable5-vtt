-- Stage 72b: chase speed and lanes. Scene gets lanes, anchor, role, autopilot,
-- round plan, race state, pursuit speed and the summed frame shift; the vehicle's
-- `momentum` becomes a persistent `speed`, `driftRound` becomes `movedRound`.
ALTER TABLE "Scene" ADD COLUMN "chaseLanes" INTEGER;
ALTER TABLE "Scene" ADD COLUMN "chaseAnchorId" TEXT;
ALTER TABLE "Scene" ADD COLUMN "chaseRole" TEXT NOT NULL DEFAULT 'pursue';
ALTER TABLE "Scene" ADD COLUMN "chaseAutopilot" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Scene" ADD COLUMN "chasePlan" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Scene" ADD COLUMN "chaseRace" TEXT;
ALTER TABLE "Scene" ADD COLUMN "chasePursuitSpeed" INTEGER;
ALTER TABLE "Scene" ADD COLUMN "chaseShiftSq" REAL NOT NULL DEFAULT 0;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SceneVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'racing',
    "drivers" TEXT NOT NULL DEFAULT '[]',
    "started" BOOLEAN NOT NULL DEFAULT true,
    "lostControl" BOOLEAN NOT NULL DEFAULT false,
    "movedRound" INTEGER NOT NULL DEFAULT 0,
    "nitroUsed" INTEGER NOT NULL DEFAULT 0,
    "maneuverCall" TEXT,
    "spikesUsed" INTEGER NOT NULL DEFAULT 0,
    "blockingId" TEXT,
    "speed" INTEGER NOT NULL DEFAULT 0,
    "intent" TEXT NOT NULL DEFAULT 'manual',
    "intentTargetId" TEXT,
    "raceBonus" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SceneVehicle_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SceneVehicle" ("blockingId", "createdAt", "drivers", "id", "lostControl", "maneuverCall", "movedRound", "nitroUsed", "sceneId", "speed", "spikesUsed", "started", "status", "vehicleId", "x", "y") SELECT "blockingId", "createdAt", "drivers", "id", "lostControl", "maneuverCall", "driftRound", "nitroUsed", "sceneId", COALESCE("momentum", 0), "spikesUsed", "started", "status", "vehicleId", "x", "y" FROM "SceneVehicle";
DROP TABLE "SceneVehicle";
ALTER TABLE "new_SceneVehicle" RENAME TO "SceneVehicle";
CREATE UNIQUE INDEX "SceneVehicle_vehicleId_key" ON "SceneVehicle"("vehicleId");
CREATE INDEX "SceneVehicle_sceneId_idx" ON "SceneVehicle"("sceneId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
