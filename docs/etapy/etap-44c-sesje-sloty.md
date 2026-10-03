# Etap 44c — Sesje i sloty: przygotowanie, dwie sesje naraz, widok między sesjami

**Faza:** przed betą · **Wymaga etapów:** 44b · Decyzje i kontekst: `etap-44-konta-mg.md`
(decyzje 6–8)

## Zakres

- [ ] **Model:** globalne `Campaign.active` znika. Zamiast niego: kampania otwarta u MG (jego
      bieżąca praca, bez slotu), stan sesji kampanii (`sessionStartedAt` albo `null`) i czas
      ostatniego zdarzenia gry. Kampania gracza to kampania jego konta (44b).
- [ ] **MG przełącza się między swoimi kampaniami bez slotu.** Przenoszą się tylko jego gniazda,
      a gracze nie widzą przygotowań.
- [ ] **„Rozpocznij sesję”** zajmuje slot i przenosi na stół gniazda graczy **tej** kampanii.
      **„Zakończ sesję”** zwalnia slot, a gracze wracają do widoku między sesjami. Gracze drugiej
      grupy nie zauważają niczego.
- [ ] **Limit `VTT_MAX_SESSIONS`** (domyślnie 2), sprawdzany atomowo, żeby dwa kliknięcia naraz
      nie dały trzech sesji. Odmowa dla trzeciego: „Wszystkie miejsca na sesje są zajęte —
      serwer nie obsłuży więcej sesji naraz. Spróbuj, gdy któraś się skończy.”
- [ ] **Bezczynność:** zegar co minutę zwalnia slot, gdy w kampanii nie ma żadnego gniazda przez
      15 min albo zdarzenia gry przez 3 h (`VTT_SESSION_EMPTY_MINUTES`,
      `VTT_SESSION_IDLE_MINUTES`). Zwolnienie działa jak „Zakończ sesję” i zostawia wpis widoczny
      dla MG. Trwająca sesja przeżywa restart serwera, a liczniki ruszają od restartu.
- [ ] **Widok gracza między sesjami:** swoje karty, dziennik, handouty i czat tylko do czytania.
      Bez mapy, ruchu, rzutów i botów. **Serwer odmawia** zdarzeń stołu poza sesją
      (`SESSION_NOT_RUNNING`) według białej listy zdarzeń dozwolonych między sesjami. Karta
      zmienia się tylko tam, gdzie gracz może ją dziś zmieniać bez MG.
- [ ] **Obecność, liczniki i `state:sync` per kampania.** MG widzi w nagłówku stan swojej kampanii:
      przygotowanie albo sesja trwa (od kiedy).
- [ ] **`CLAUDE.md`, akapit „Skala”:** kilku MG i najwyżej dwie sesje naraz zamiast „jednej
      aktywnej sesji”. Zmiana uzgodniona w zaległościach 26.09.
- [ ] **Suita E2E:** start sesji zamiast `campaign:activate` w fixture'ach, nowe testy dymne
      (przygotowanie bez graczy, start, koniec, widok między sesjami).
- [ ] **Testy serwera:** limit i wyścig dwóch startów, bezczynność (oba progi, sztuczny zegar),
      restart, biała lista zdarzeń między sesjami, przeniesienie gniazd tylko własnej kampanii.

## Poza zakresem

AI właściciela i dzierżawa AI (44d).

## Kryteria ukończenia

- Dwie grupy grają naraz: ruch, rzuty i czat jednej nie docierają do drugiej. Start i koniec
  sesji jednej grupy nie ruszają drugiej.
- Trzeci MG przygotowuje kampanię, a przy starcie sesji dostaje komunikat o zajętych miejscach.
  Po końcu jednej sesji startuje.
- Porzucona sesja zwalnia slot po progu (test na sztucznym zegarze).
- Gracz między sesjami widzi swoją kartę i nie wykona żadnego zdarzenia stołu, także z konsoli.
- Testy, lint, `tsc` czyste. Pełny `pnpm test:e2e` zielony.
- Oględziny: MG w Chromium i gracz w **Firefoksie** (start, koniec, widok między sesjami).
