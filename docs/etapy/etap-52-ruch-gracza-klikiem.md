# Etap 52 — Ruch gracza wyłącznie klikiem, trasa zatwierdzana przez serwer

**Faza:** przed betą (zlecenie MG z 15.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
14c, 16e, 18a, 18c, 45

## Skąd ten etap

MG (15.10): gracz łapie myszą własną figurę i przeciąga ją przez całą mapę, ignorując ściany,
wrogów, szybkość i zasięg — w trybach Eksploracja i Swobodny. Gracze mogą tak obejrzeć mapę
przed czasem.

**Diagnoza (15.10):**

- Upuszczenie jest sprawdzane (`validateTokenMove`: mgła, ściany, pula, Tura) — figura
  przeciągnięta przez mur wraca.
- **Klatki pośrednie (`token:move` z `final: false`) nie są sprawdzane wcale.** Serwer rozsyła je
  stołowi, prowadzącemu liczy pole widzenia z miejsca pod kursorem (`emitDragVision`) i **dopisuje
  je do pamięci odkrytego** (`recordSight`). Mapa zostaje odkryta, choć figura wróciła; reszta
  stołu widzi figurę lecącą przez ściany.
- Marsz klikiem (16e) jedzie tym samym kanałem klatek — samo zabranie przeciągania w kliencie
  niczego nie zamyka (przerobiony klient dalej wyśle dowolne klatki). **Naprawa musi być na
  serwerze.**

**Wzór Foundry VTT:** rdzeń ma tylko Pauzę (gracze nie ruszają figur) — ściany zatrzymują figurę,
mgła odkrywa się wyłącznie z prawdziwej pozycji figury, a podgląd przeciągania nie odsłania nic.
Moduł Monk's TokenBar ma trzy tryby: Free / No Movement / Combat Movement. Puli tempa jak nasza
Eksploracja nie ma nigdzie — to nasz pomysł z 08.10.

## Decyzje MG z 15.10

1. **Gracz nie przeciąga figur — nigdzie i nigdy.** Ruch gracza: zaznacz figurę → klik w cel
   (podgląd trasy i znacznik celu) → **drugi klik w to samo miejsce potwierdza** i figura rusza;
   klik gdzie indziej przestawia cel. Dotyczy także walki. MG zachowuje przeciąganie (stawianie
   figur to połowa jego pracy z mapą).
2. **Tryby „Ruch graczy”: Stop + Eksploracja.** Swobodny znika (sceny w nim przechodzą na
   Eksplorację) — po naprawie różniłby się od Eksploracji tylko pulą metrów.
3. **Domyślnie Stop** — nowa scena już startuje w Stop (45); dochodzi: **„Rozpocznij sesję”
   przestawia aktywną scenę na Stop**, żeby Eksploracja z poprzedniej sesji nie czekała otwarta.
4. **Klik we wrogą figurę przy zaznaczonej własnej — jak dziś** (cel / podgląd, 50b–50c), bez
   marszu. „Podejdź i zaatakuj” → `POMYSLY.md`.
5. **Figury na drodze:** przez **widoczną** figurę spoza drużyny nie da się przejść ani na niej
   stanąć; przez figurę drużyny (`tokenSharesVision`) przejść wolno, stanąć na zajętym polu nie.
   **Figura, której gracz nie widzi, nie blokuje** — odmowa nie może zdradzić, gdzie ktoś stoi.
6. **Marsz Eksploracji dłuższy niż pula staje i sam idzie dalej** (pytanie w trakcie sesji, MG
   wybrał „Postój i sam idzie dalej”): figura łapie oddech na granicy puli, a gdy pula się odnowi —
   rusza dalej do celu. Esc, klik, Stop i walka przerywają postój.

## 52a — serwer zatwierdza trasę, gracz bez przeciągania

- [x] **`token:walk { tokenId, route }`** (gracz): serwer sprawdza **całą** trasę z góry — Stop,
      właściciel, mgła, ściany, figury, statusy, budżet Tury albo pula Eksploracji (bez pobierania)
      — i zapamiętuje ją w pamięci (`realtime/walks.ts`, klucz: figura). Odmowa tymi samymi kodami
      co upuszczenie.
- [x] **`performTokenMove` dla gracza:** klatka bez zatwierdzonej trasy → `MOVE_NOT_PLANNED`;
      klatka pośrednia jest **rzutowana na zatwierdzoną trasę** (pozycja z serwera, nie z klienta),
      więc widzenie i pamięć odkrytego rosną tylko z pozycji na legalnej drodze. Klatka końcowa
      dalej przechodzi pełne `validateTokenMove` po przebytym kawałku trasy (pobiera metry).
- [x] **Figury na drodze** (`refuseWalkThroughFigures`): decyzja 5, w zatwierdzaniu i upuszczeniu.
- [x] **Rachunek Tury „na sucho”** — `applySpend` z `dryRun` (bez zapisu), żeby zatwierdzenie
      mówiło „nie starczy” przed marszem.
- [x] **Klient:** gracz nie przeciąga własnej figury (chwyt = zaznaczenie); marsz najpierw woła
      `token:walk`, odmowa — zdanie, figura zostaje.
- [x] **Testy serwera:** klatka bez trasy, klatka poza trasą rzutowana, ściana / mgła / wróg na
      trasie, sojusznik na trasie, cel na zajętym polu, ukryta figura nie blokuje, pula i Tura na
      sucho, MG i bot bez zmian.

## 52b — dwa kliknięcia, dwa tryby, Stop na start sesji

- [x] **Potwierdzenie drugim klikiem** (gracz i MG, w walce i poza nią): pierwszy klik zamraża
      podgląd trasy ze znacznikiem celu, drugi w pobliżu celu rusza, inny klik przestawia cel, Esc
      / PPM zdejmuje. Podpowiedź „Kliknij jeszcze raz, żeby iść”.
- [x] **Planer omija figury** wg decyzji 5 (te same reguły co serwer).
- [x] **Swobodny znika:** `PlayerMoveMode = 'stop' | 'explore'`, migracja `free` → `explore`,
      import archiwum (`free` → `explore`), przełącznik MG i podpowiedzi.
- [x] **„Rozpocznij sesję” → aktywna scena w Stop.**
- [x] **E2E:** fikstura marszu dwoma kliknięciami; T3b, T5a, t45 bez „Swobodny”; przeciąganie
      gracza w t8c-mapa / T5a zastąpione marszem albo odmową; nowy test „przeciągnięcie gracza nic
      nie odsłania”.

## Poza zakresem

- „Podejdź i zaatakuj” (klik we wroga = marsz na sąsiednie pole + atak wręcz) — `POMYSLY.md`.
- Ograniczenie tempa klatek marszu w czasie (serwer pilnuje kształtu trasy, nie prędkości ręki —
  przerobiony klient może przejść zatwierdzoną trasę szybciej, ale nie dalej ani inną drogą).

## Kryteria ukończenia

- Gracz nie ruszy figury przeciąganiem; żadna klatka gracza nie odsłania niczego poza trasą, którą
  serwer zatwierdził (test serwera z klatką „za ścianą”).
- Gracz idzie dwoma kliknięciami; przez wroga nie przejdzie, przez kompana tak.
- Przełącznik MG ma Stop i Eksplorację; start sesji ustawia Stop.
- Testy jednostkowe, lint, `tsc` czyste; dotknięte E2E zielone, `00-baseline` + `01-dym` zielone.
- Oględziny: gracz w Firefoksie, MG w Chromium.

## Wykonanie (15.10.2026)

52a i 52b zrobione w jednej sesji. Wszystkie kryteria spełnione poza jednym: łańcucha T5b
i długich specyfikacji odporności nie puszczono (szczegóły niżej). Odstępstwa od planu:

- **Lądowanie bez zatwierdzonej trasy zostaje** (`final: true` z gniazda): sprawdza je w całości
  `validateTokenMove`, a widzenie liczy się dopiero z pozycji przyjętej, więc nic nie wycieka —
  wymóg trasy dotyczy wyłącznie klatek pośrednich. Lądowanie dalej niż kratkę od trasy porzuca
  trasę i jest oceniane samo (zamiast `MOVE_NOT_PLANNED`), a płaci do najdalszego punktu, do
  którego doszły klatki (`reached`).
- **Decyzja 6 (w trakcie sesji):** marsz Eksploracji staje na granicy puli i sam idzie dalej.
  Cel potwierdzony w czasie postoju (pusta pula albo resztka mniejsza niż pole) też czeka; planer
  przy puli, która odrasta, szuka trasy bez ograniczenia do bieżącej puli.
- **Dwa kliknięcia także u MG** — jedna mechanika marszu; MG zachowuje przeciąganie.
- **Testy serwera bez puli:** pliki, które stawiały scenę w „Swobodnym”, wyłączają pulę
  `paceTesting.off` (11 plików) zamiast dzielić marsze na odcinki po 12 m.
- **Przy okazji (błąd z 15.10, `62589ee`):** „Aktywuj” w trwającej sesji pyta „Bez startu —
  aktywuj?”, a E2E klikało raz — fikstura `clickActivate` w 9 miejscach (t45, T3b, T5a, T6a,
  T9a, T7b, T7c). Kamera gracza nie mieści „Bramy” ani „Ulicy 45” — `centreCamera` w T5a.
- Znacznik celu to samo wypełnienie pola (bez obrysu): na trasie nie ma kresek (MG, 23.08).
