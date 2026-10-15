# Etap 51 — Przegląd stref bronionych

**Faza:** I — Wykończenie · **Wymaga etapów:** 26f (strefy bronione), 27l (karty obiektów)

> Zlecenie MG z 15.10.2026: „przeanalizuj wszystkie strefy bronione, czy są prawidłowo
> przemyślane (np. ślizgawka — dlaczego ma PW?) i czy można w jednej scenie ustawić część
> jako widoczne, a część jako niewidoczne”. Analiza 18 systemów z s. 213–216 dała dwie paczki
> poprawek: **A** (to, co widzi MG i gracz) i **B** (mechanika). MG wybrał obie naraz.

## Co wyszło z analizy

- **Widoczność pojedynczej strefy już działała** (flaga `hidden` na strefie, karta po dwukliku,
  przycisk „Ukryj / Odsłoń graczom”), ale **na mapie MG nie było widać, która jest ukryta** —
  renderer rozróżniał tylko uzbrojoną i rozbrojoną.
- **PW ślizgawki są z podręcznika** (PW 10 — spryskiwacze), ale gracz widział je w podpisie
  strefy („Ślizgawka · 10/10 PW · uzbrojona”) razem ze stanem uzbrojenia.
- Krwawy rój, panele ogłuszające i dziurkacze biły **tylko wchodzącego**, choć podręcznik mówi
  o wszystkich na obszarze.
- Pułapka, która kogoś trafiła, **zostawała przed nim ukryta**.
- Zniszczony dywan podłogi obalającej **nie zdejmował** spowolnienia.
- Wieżyczka w strefie miała **podwójne PW** — strefy i żetonu stanowiska.

## Zakres

### A — co widać

- [x] Ukryta strefa u MG ma przerywany obrys i dopisek „ukryta” w podpisie
- [x] Gracz nie dostaje PW ani stanu uzbrojenia strefy (filtr na serwerze, nie w CSS) — podpis
      strefy u gracza to sama nazwa
- [x] Karta strefy: „PW urządzenia” z podpowiedzią, czym są (spryskiwacze, dywan, panele…)

### B — mechanika

- [x] Flaga efektu `area` — system bije **wszystkich** na obszarze, nie tylko tego, kto go
      uruchomił (krwawy rój, panele ogłuszające, dziurkacze); parser ją ustawia, formularz
      kompendium ma pole
- [x] Strefa, która kogoś złapała, **odsłania się** temu graczowi (dopisuje go do `sightings`)
- [x] Flaga `drainEndsWithSystem` — zniszczony system zdejmuje karę do RUCH-u (podłoga obalająca:
      „lub ktoś nie zniszczy dywanu”); maź jej nie ma, bo zniszczenie spryskiwaczy nie zmywa mazi
- [x] Stanowisko z przypiętym żetonem liczy PW **na żetonie**: przypięcie zeruje PW strefy,
      odpięcie przywraca je z wpisu, a zniszczona figura stanowiska nie strzela

## Poza zakresem (do `POMYSLY.md`)

- Kamera i drony jako strefa: szept do MG „X wszedł w obszar” (pakiet C z analizy)
- Stan „uruchomiona” dla ślizgawki i mazi — płyn zostaje po zniszczeniu spryskiwaczy (pakiet D)
- Test „co Akcję Ruchu” zamiast „co upuszczenie figury” (ślizgawka, siatka laserowa)
- Atak gracza na strefę (dziś PW strefy zmienia tylko suwak MG)

## Kryteria ukończenia

- [x] MG na mapie odróżnia ukrytą strefę od widocznej bez otwierania karty
- [x] Payload gracza nie niesie PW ani `armed` strefy (test serwera)
- [x] Wejście w krwawy rój bije też figurę, która już stała na obszarze (test serwera)
- [x] Ukryta podłoga elektryczna, która trafiła figurę gracza, trafia do jego payloadu (test serwera)
- [x] Zniszczenie podłogi obalającej zdejmuje „Spowolniony” z figury na niej (test serwera)
- [x] Przypięcie żetonu do strefy wieżyczki zeruje jej PW, a zniszczona wieżyczka nie strzela
      (test serwera)
- [x] Testy `shared` na nowe flagi; oględziny w Firefoksie (Playwright)
