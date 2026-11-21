-- 21.11.2026 (MG): the CC0 car sprites from stage 65b are gone; vehicle art is
-- the MG's own only. Rows that still point at an old sprite get the closest
-- MG car, so no vehicle, token or chase obstacle is left with a dead image.
UPDATE "Vehicle" SET "imageUrl" = CASE "imageUrl"
  WHEN '/art/vehicles/car-red.webp' THEN '/art/vehicles/furia.webp'
  WHEN '/art/vehicles/car-black-viper.webp' THEN '/art/vehicles/widmo.webp'
  WHEN '/art/vehicles/car-orange.webp' THEN '/art/vehicles/rajdowka-77.webp'
  WHEN '/art/vehicles/car-taxi.webp' THEN '/art/vehicles/taksowka.webp'
  WHEN '/art/vehicles/car-police.webp' THEN '/art/vehicles/radiowoz.webp'
  WHEN '/art/vehicles/pickup-blue.webp' THEN '/art/vehicles/ranczer.webp'
  WHEN '/art/vehicles/van-ambulance.webp' THEN '/art/vehicles/karetka.webp'
  WHEN '/art/vehicles/van-white.webp' THEN '/art/vehicles/graty.webp'
  ELSE "imageUrl" END
WHERE "imageUrl" LIKE '/art/vehicles/%';

UPDATE "Token" SET "imageUrl" = CASE "imageUrl"
  WHEN '/art/vehicles/car-red.webp' THEN '/art/vehicles/furia.webp'
  WHEN '/art/vehicles/car-black-viper.webp' THEN '/art/vehicles/widmo.webp'
  WHEN '/art/vehicles/car-orange.webp' THEN '/art/vehicles/rajdowka-77.webp'
  WHEN '/art/vehicles/car-taxi.webp' THEN '/art/vehicles/taksowka.webp'
  WHEN '/art/vehicles/car-police.webp' THEN '/art/vehicles/radiowoz.webp'
  WHEN '/art/vehicles/pickup-blue.webp' THEN '/art/vehicles/ranczer.webp'
  WHEN '/art/vehicles/van-ambulance.webp' THEN '/art/vehicles/karetka.webp'
  WHEN '/art/vehicles/van-white.webp' THEN '/art/vehicles/graty.webp'
  ELSE "imageUrl" END
WHERE "imageUrl" LIKE '/art/vehicles/%';

-- Obstacles keep the kind's art list: civilian cars and wrecks.
UPDATE "ChaseObstacle" SET "imageUrl" = CASE "imageUrl"
  WHEN '/art/vehicles/car-taxi.webp' THEN '/art/vehicles/taksowka.webp'
  WHEN '/art/vehicles/pickup-blue.webp' THEN '/art/vehicles/ranczer.webp'
  WHEN '/art/vehicles/car-orange.webp' THEN '/art/vehicles/wloczega.webp'
  WHEN '/art/vehicles/van-white.webp' THEN '/art/vehicles/graty.webp'
  WHEN '/art/vehicles/car-black-viper.webp' THEN '/art/vehicles/rdzawiec.webp'
  WHEN '/art/vehicles/car-police.webp' THEN '/art/vehicles/radiowoz.webp'
  WHEN '/art/vehicles/car-red.webp' THEN '/art/vehicles/furia.webp'
  WHEN '/art/vehicles/van-ambulance.webp' THEN '/art/vehicles/karetka.webp'
  ELSE "imageUrl" END
WHERE "imageUrl" LIKE '/art/vehicles/%';
