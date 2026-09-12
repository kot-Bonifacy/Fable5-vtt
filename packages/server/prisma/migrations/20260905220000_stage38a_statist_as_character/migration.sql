-- Etap 38a: figura ostatystykowana dostaje prawdziwą kartę postaci.
--
-- Do 38a jej liczby siedziały w kolumnie `Token.combatProfile` (etap 16b), a
-- `combatProfileSheet()` przebierał je za `CpredCharacterData` w chwili rzutu.
-- MG rozstrzygnął 05.09, że każda taka figura ma być kartą — bo dopiero wtedy
-- ganger z pistoletem maszynowym i gracz z pistoletem maszynowym trzymają ten
-- sam rodzaj przedmiotu, a etap 38b ma co przenosić z ciała do plecaka.
--
-- Migracja jest w trzech krokach: karta z profilu, podpięcie żetonu, usunięcie
-- kolumny. Kartę składa `json_object`, a nie kod TypeScriptu, świadomie:
-- `parseCharacterData` jest **tolerancyjny** (pola nieznane albo nieobecne
-- wracają domyślne), więc wystarczy zapisać to, co profil naprawdę niósł.
--
-- Trzy rzeczy, których karta sama by nie utrzymała, jadą do `statBlock`
-- (patrz `shared/src/systems/cpred/statblock.ts`):
--   * Wartość bojowa funkcjonariusza Wsparcia — Umiejętność karty ma sufit 10,
--     a ta bywa 16;
--   * zakaz uniku przed pociskami (s. 158);
--   * wydrukowane PW — C-SWAT ma 35 przy BC 4, a z Cech wychodzi 20.
--
-- Poziomy Umiejętności **ścinają się tu do dziesiątki**, bo jeden wiersz spoza
-- zakresu każe `validateSkills` odrzucić całą mapę, i figura straciłaby
-- wszystkie Umiejętności naraz. Prawdziwą liczbę funkcjonariusza podstawia
-- i tak Wartość bojowa przy rzucie.
--
-- Id karty jest wyprowadzone z id żetonu ('c38a' + id), żeby drugi krok miał
-- jak trafić z powrotem — jednorazowy, rozpoznawalny kształt zamiast cuida.

INSERT INTO "Character" ("id", "name", "campaignId", "ownerId", "data", "createdAt", "updatedAt")
SELECT
  'c38a' || t."id",
  t."name",
  s."campaignId",
  -- Figura prowadzona przez MG, jak każdy inny NPC.
  NULL,
  json_object(
    'schemaVersion', 2,
    'stats', json_object(
      'int', 5,
      'ref', COALESCE(json_extract(t."combatProfile", '$.ref'), 5),
      'dex', COALESCE(json_extract(t."combatProfile", '$.dex'), 5),
      'tech', 5,
      'cool', 5,
      'will', COALESCE(json_extract(t."combatProfile", '$.will'), 5),
      -- Bez Szczęścia: figura, która mogłaby wydawać punkty, potrzebowałaby
      -- puli, z której je bierze, a „pula MG" to zasada, której tu nie ma.
      'luck', 0,
      'move', COALESCE(json_extract(t."combatProfile", '$.move'), 5),
      'body', COALESCE(json_extract(t."combatProfile", '$.body'), 5),
      'emp', 5
    ),
    'hpCurrent', COALESCE(t."hpCurrent", 25),
    'luckCurrent', 0,
    'skills', json_patch(
      COALESCE(
        (
          SELECT json_group_object(je."key", MIN(je."value", 10))
          FROM json_each(json_extract(t."combatProfile", '$.skills')) je
        ),
        json_object()
      ),
      json_object('evasion', MIN(COALESCE(json_extract(t."combatProfile", '$.evasion'), 0), 10))
    ),
    'weapons', json_array(
      json_patch(
        json_object(
          'id', 'statist-weapon',
          'name', COALESCE(json_extract(t."combatProfile", '$.weaponName'), 'Pięści'),
          'notes', '',
          'damage', COALESCE(json_extract(t."combatProfile", '$.weaponDamage'), '1k6'),
          'ammoCurrent', COALESCE(json_extract(t."combatProfile", '$.ammoCurrent'), 0),
          'ammoMax', COALESCE(json_extract(t."combatProfile", '$.ammoMax'), 0),
          'ammoType', '',
          'rof', '1'
        ),
        CASE
          WHEN json_extract(t."combatProfile", '$.weaponId') IS NULL THEN json_object()
          ELSE json_object('compendiumId', json_extract(t."combatProfile", '$.weaponId'))
        END
      )
    ),
    -- „OB — Odporność balistyczna pancerza na głowie i ciele" (s. 158): jedna
    -- liczba profilu to dwa rzędy karty, bo trafienie dobiera rząd po miejscu.
    'armor', CASE
      WHEN COALESCE(json_extract(t."combatProfile", '$.armorSp'), 0) > 0 THEN json_array(
        json_object(
          'id', 'statist-armor-head',
          'name', 'Pancerz',
          'notes', '',
          'location', 'head',
          'sp', json_extract(t."combatProfile", '$.armorSp'),
          'spCurrent', json_extract(t."combatProfile", '$.armorSp')
        ),
        json_object(
          'id', 'statist-armor-body',
          'name', 'Pancerz',
          'notes', '',
          'location', 'body',
          'sp', json_extract(t."combatProfile", '$.armorSp'),
          'spCurrent', json_extract(t."combatProfile", '$.armorSp')
        )
      )
      ELSE json_array()
    END,
    'criticalInjuries', COALESCE(json_extract(t."combatProfile", '$.criticalInjuries'), json_array()),
    'statBlock', json_object(
      -- Wartość bojową nosi wyłącznie ten, komu podręcznik ją drukuje razem
      -- z zakazem uniku przed pociskami: funkcjonariusz Wsparcia (s. 158).
      -- Zwykły ganger liczy się Cechą i Umiejętnością, jak każdy.
      'combatValue', CASE
        WHEN json_extract(t."combatProfile", '$.noBulletDodge') IN (1, 'true')
        THEN json_extract(t."combatProfile", '$.skillLevel')
        ELSE NULL
      END,
      'weaponSkill', COALESCE(json_extract(t."combatProfile", '$.skillLevel'), 0),
      'noBulletDodge', CASE
        WHEN json_extract(t."combatProfile", '$.noBulletDodge') IN (1, 'true')
        THEN json('true')
        ELSE json('false')
      END,
      'hpMax', COALESCE(t."hpMax", 25)
    )
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Token" t
JOIN "Scene" s ON s."id" = t."sceneId"
WHERE t."combatProfile" IS NOT NULL
  -- Żeton, który miał i profil, i kartę, ma już gdzie trzymać swoje liczby:
  -- karta wygrywa, profil był w tym układzie martwym polem.
  AND t."characterId" IS NULL;

-- Podpięcie i zabranie żetonowi własnych PW: dwa domy dla jednej liczby to
-- jest to, jak się rozjeżdżają (ta sama umowa, którą trzyma `token:stat`).
UPDATE "Token"
SET "characterId" = 'c38a' || "id",
    "hpCurrent" = NULL,
    "hpMax" = NULL
WHERE "combatProfile" IS NOT NULL
  AND "characterId" IS NULL;

ALTER TABLE "Token" DROP COLUMN "combatProfile";
