-- 21.11.2026 (MG): Avatar 34 of the sample portrait set is Piotrówna from the
-- "Reklamacja" example scene — GM-only from now on, with a head-and-shoulders
-- token crop. Pools seeded earlier hold it as a player face centred on the
-- file; the size pins the row to the sample copy (647 × 862). A crop the GM
-- already set by hand stays.
UPDATE "PortraitAsset" SET "gmOnly" = 1
WHERE "name" = 'Avatar 34' AND "width" = 647 AND "height" = 862;

UPDATE "PortraitAsset" SET "cropX" = 0.465, "cropY" = 0.19, "cropZoom" = 1.9
WHERE "name" = 'Avatar 34' AND "width" = 647 AND "height" = 862
  AND "cropX" = 0.5 AND "cropY" = 0.5 AND "cropZoom" = 1;
