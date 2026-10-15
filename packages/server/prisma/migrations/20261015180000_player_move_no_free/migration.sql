-- Etap 52: „Ruch graczy: Swobodny” zniknął (decyzja MG z 15.10.2026).
-- Sceny, które w nim były, chodzą odtąd w Eksploracji (pula metrów).
UPDATE "Scene" SET "playerMove" = 'explore' WHERE "playerMove" = 'free';
