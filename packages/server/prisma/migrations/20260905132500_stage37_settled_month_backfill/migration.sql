-- Kampania sprzed etapu 37 nie ma pojęcia rozliczonego miesiąca, a `NULL`
-- znaczy „nigdy nie rozliczano" — czyli monit „minął pierwszy dzień miesiąca"
-- nie zapaliłby się w niej nigdy. Stemplujemy ją miesiącem, w którym stoi jej
-- zegar (domyślnie styczeń 2045), więc pierwszy skok przez granicę miesiąca
-- działa tak samo w kampanii starej i w świeżo założonej.
UPDATE "Campaign"
SET "settledMonth" = strftime('%Y-%m', datetime("gameTime" * 60, 'unixepoch'))
WHERE "settledMonth" IS NULL;
