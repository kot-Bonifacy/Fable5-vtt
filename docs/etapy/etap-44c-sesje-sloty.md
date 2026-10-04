# Etap 44c — Sesje i sloty: przygotowanie, dwie sesje naraz, widok między sesjami

**Faza:** przed betą · **Wymaga etapów:** 44b · Decyzje i kontekst: `etap-44-konta-mg.md`
(decyzje 6–8)

## Zakres

- [x] **Model:** globalne `Campaign.active` znika. Zamiast niego: kampania otwarta u MG (jego
      bieżąca praca, bez slotu), stan sesji kampanii (`sessionStartedAt` albo `null`) i czas
      ostatniego zdarzenia gry. Kampania gracza to kampania jego konta (44b).
- [x] **MG przełącza się między swoimi kampaniami bez slotu.** Przenoszą się tylko jego gniazda,
      a gracze nie widzą przygotowań.
- [x] **„Rozpocznij sesję”** zajmuje slot i przenosi na stół gniazda graczy **tej** kampanii.
      **„Zakończ sesję”** zwalnia slot, a gracze wracają do widoku między sesjami. Gracze drugiej
      grupy nie zauważają niczego.
- [x] **Limit `VTT_MAX_SESSIONS`** (domyślnie 2), sprawdzany atomowo, żeby dwa kliknięcia naraz
      nie dały trzech sesji. Odmowa dla trzeciego: „Wszystkie miejsca na sesje są zajęte —
      serwer nie obsłuży więcej sesji naraz. Spróbuj, gdy któraś się skończy.”
- [x] **Bezczynność:** zegar co minutę zwalnia slot, gdy w kampanii nie ma żadnego gniazda przez
      15 min albo zdarzenia gry przez 3 h (`VTT_SESSION_EMPTY_MINUTES`,
      `VTT_SESSION_IDLE_MINUTES`). Zwolnienie działa jak „Zakończ sesję” i zostawia wpis widoczny
      dla MG. Trwająca sesja przeżywa restart serwera, a liczniki ruszają od restartu.
- [x] **Widok gracza między sesjami:** swoje karty, dziennik, handouty i czat tylko do czytania.
      Bez mapy, ruchu, rzutów i botów. **Serwer odmawia** zdarzeń stołu poza sesją
      (`SESSION_NOT_RUNNING`) według białej listy zdarzeń dozwolonych między sesjami. Karta
      zmienia się tylko tam, gdzie gracz może ją dziś zmieniać bez MG.
- [x] **Obecność, liczniki i `state:sync` per kampania.** MG widzi w nagłówku stan swojej kampanii:
      przygotowanie albo sesja trwa (od kiedy).
- [x] **`CLAUDE.md`, akapit „Skala”:** kilku MG i najwyżej dwie sesje naraz zamiast „jednej
      aktywnej sesji”. Zmiana uzgodniona w zaległościach 26.09.
- [x] **Suita E2E:** start sesji zamiast `campaign:activate` w fixture'ach, nowe testy dymne
      (przygotowanie bez graczy, start, koniec, widok między sesjami).
- [x] **Testy serwera:** limit i wyścig dwóch startów, bezczynność (oba progi, sztuczny zegar),
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

## Decyzje MG z 04.10 i odstępstwa od planu

- **MG z trwającą sesją nie przejdzie do innej kampanii** — najpierw „Zakończ sesję” (`SESSION_RUNNING`).
  Jeden MG trzyma więc najwyżej jeden slot. Kampania założona w trakcie sesji czeka na liście.
- **Czat przygotowania jest tylko dla MG, na zawsze** (`ChatMessage.prep`): rzuty próbne, rozmowy
  z botami i inne wiersze napisane bez sesji gracz zobaczy wyłącznie wtedy, gdy są jego albo do
  niego (szept).
- **Gracz między sesjami może** (poza czytaniem i polami karty zmienianymi dziś bez MG): wydawać PD,
  kupować w sklepie i robić przelewy, tworzyć postać w kreatorze (z rzutami kreatora, zgoda MG jak
  dotąd), przekazywać przedmioty i handlować. Lista: `BETWEEN_SESSIONS_EVENTS`.
- **Widok między sesjami to ten sam ekran bez mapy, na plakacie logowania** — gracz nigdy nie
  dostaje pustej planszy (MG: „gracz nigdy i nigdzie nie powinien mieć pustego ekranu”).
- **Odstępstwo:** „czas ostatniego zdarzenia gry” nie jest kolumną w bazie, tylko licznikiem
  w pamięci (`SessionClock`) — rozpiska i tak każe liczyć od restartu, więc kolumna niczego by nie
  wniosła. W bazie są `Campaign.sessionStartedAt`, `Campaign.lastSessionEndedAt` i `User.openCampaignId`.
- **Odstępstwo:** w E2E progi bezczynności są podniesione do 600 min (`instance.ts`) — pełny
  przebieg potrafi zostawić kampanię bez gniazda na kwadrans; progi produkcyjne sprawdza
  `sessions.test.ts` na sztucznym zegarze.
