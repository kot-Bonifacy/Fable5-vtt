-- 02.11.2026: sceny pościgu dostają odgłos jazdy samochodem zamiast ruchu ulicznego.
-- Przestawia tylko ulicę i ciszę; inny odgłos wybrany przez MG zostaje.
UPDATE "Scene" SET "ambience" = 'car' WHERE "kind" = 'chase' AND "ambience" IN ('none', 'street');
