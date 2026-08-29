# Etap 30a — Szkielet Zdolności Ról i Zmysł Walki Solo

**Faza:** H — Świat CP RED · **Wymaga etapów:** 07 (karta), 14b (ekonomia akcji), 15 (obrażenia),
16 (strzelanie), 25a (Rola na karcie)

> **Podział z 2026-08-29** — etap 30 rozbity na 30a–30d, patrz `etap-30-zdolnosci-rol.md`.

## Cel sesji

Rola przestaje być etykietą — zaczynając od tej, która najbardziej to widzi. Dziś mechanicznie
działa **wyłącznie** Interfejs Netrunnera (`netrun.ts`); `roleAbilityRank` pozostałych dziewięciu
Ról to liczba na karcie bez żadnego skutku. Solo na 6. poziomie Zmysłu Walki nie różni się
niczym od Solo na 1., choć podręcznik daje mu sześć osobnych rachunków.

Ta sesja robi dwie rzeczy naraz: stawia **wzorzec**, którym pójdą 30b–30d (gdzie mieszka
przydział punktów, jak Zdolność wchodzi w rachunek, jak wygląda panel na karcie), i zamyka
**Zmysł Walki** w całości.

## Zakres

Zmysł Walki (s. 146) — **sześć** zdolności bojowych, nie pięć:

- [x] **Redukcja obrażeń** — 2 pkt → −1, 4 → −2, 6 → −3, 8 → −4, 10 → −5 od **pierwszych
      obrażeń otrzymanych w tej Rundzie**
- [x] **Wyjście z opresji** — za 4 pkt ignorujesz Krytyczne porażki (1 na kości) w Testach
      ataku; „wynik nadal liczy się jako 1", więc kość spada, ale dorzut się nie odejmuje
- [x] **Błyskawiczna reakcja** — każdy punkt to +1 do Inicjatywy
- [x] **Precyzyjny atak** — 3 pkt → +1, 6 → +2, 9 → +3 do **każdego** Ataku
- [x] **Wykrycie słabości** — każdy punkt to +1 do obrażeń (**przed pancerzem**) zadanych
      **pierwszym udanym Atakiem w Rundzie**
- [x] **Wyczucie zagrożenia** — każdy punkt to +1 do Testów Percepcji

Reszta zakresu:

- [x] **Przydział punktów na karcie** — sześć wierszy z progami kosztów, „zostało N punktów",
      walidacja w `shared` (suma ≤ poziom Zdolności, progi respektowane)
- [x] **Kiedy wolno przestawiać** — „poza walką, gdy rozpoczyna się walka albo w trakcie walki
      (w ramach Akcji)"; zmiana w środku walki kosztuje Akcję, poza walką jest darmowa
- [x] **Pudełko w pasku akcji** — otwiera ten sam panel i płaci Akcję, gdy trwa walka
- [x] **Wzorzec dla 30b–30d** — jeden moduł `roleability.ts`, jedna umowa kodu, jeden wpis
      w `umowy-kodu.md`
- [x] Testy: każdy z sześciu efektów osobno, progi kosztów, odmowa przekroczenia puli,
      „pierwsze w Rundzie" dla obu zdolności, które to mówią

## Poza zakresem

- Pozostałe osiem Zdolności — 30b, 30c, 30d
- Wieloklasowość (dwie Role naraz) — etap 29, razem z rozwojem za PD
- Techniki Sztuk walki (wpis w `POMYSLY.md` z 30.07) — inna tabela, inny rozdział

## Kryteria ukończenia

- [x] Solo z Zmysłem Walki 6 rozdziela punkty z karty i z paska akcji, a zmiana w środku walki
      kosztuje Akcję
- [x] Każdy z sześciu efektów zmienia wynik w grze: inicjatywę, rzut ataku, obrażenia zadane,
      obrażenia otrzymane, kość krytycznej porażki i Test Percepcji
- [x] „Pierwsze w Rundzie" naprawdę znaczy pierwsze: drugi cios w tej samej Rundzie nie jest
      redukowany, drugi trafiony atak nie dostaje bonusu do obrażeń
- [x] Postać bez Zmysłu Walki (każda Rola poza Solo) nie widzi panelu i niczego nie płaci

## Wskazówki techniczne

- Redukcja obrażeń dotyka `resolveCpredDamage` — tego samego wejścia, co `halvesArmor`
  z 29.08. Dokładaj **flagę na wejściu**, nie gałąź w silniku
- Precyzyjny atak i Wyczucie zagrożenia liczą się **z samej karty**, więc wchodzą wprost
  do `planCpredAttack` i `skillBreakdown` — podgląd u klienta i werdykt serwera zgadzają się
  bez żadnego kontekstu
- „Pierwsze w Rundzie" to stan Rundy, nie karty: mieszka w `CpredTurnLedger`
  (kolumna `Combatant.turnEffects`), która już nosi stemple rund z 14e
