-- 31.10.2026 (etap 65c): jazda w pościgu — silnik, utrata kontroli, dryf raz na rundę, Nitro.
ALTER TABLE "SceneVehicle" ADD COLUMN "started" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SceneVehicle" ADD COLUMN "lostControl" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SceneVehicle" ADD COLUMN "driftRound" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SceneVehicle" ADD COLUMN "nitroUsed" INTEGER NOT NULL DEFAULT 0;
