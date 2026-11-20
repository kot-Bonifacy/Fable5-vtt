-- Etap 72d: udany Gwałtowny skręt pozwala zmienić pas o dwa w tej rundzie.
ALTER TABLE "SceneVehicle" ADD COLUMN "swerveRound" INTEGER NOT NULL DEFAULT 0;
