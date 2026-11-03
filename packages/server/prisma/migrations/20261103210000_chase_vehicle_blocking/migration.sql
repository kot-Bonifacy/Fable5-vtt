-- 03.11.2026 (przegląd pościgu): auto stojące na drodze (wrak, zgaszony silnik),
-- które dryfem wjechało przed jadące auto, czeka na wybór jego kierowcy —
-- id tego auta (Gwałtowny skręt albo taranowanie, jak przeszkoda z 65e).
ALTER TABLE "SceneVehicle" ADD COLUMN "blockingId" TEXT;
