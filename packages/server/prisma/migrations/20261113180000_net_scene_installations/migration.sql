-- Stage 70d: doors run from the scene's Net, and environmental zones kept out of it.
ALTER TABLE "Wall" ADD COLUMN "netControlled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DefenseZone" ADD COLUMN "netExcluded" BOOLEAN NOT NULL DEFAULT false;
