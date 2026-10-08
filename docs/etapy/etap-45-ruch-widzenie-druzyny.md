# Etap 45 — Ruch i widzenie drużyny (wzór: Foundry VTT)

**Faza:** przed betą (zlecenie MG z 08.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
14c, 17, 18a, 18c, 42a

## Skąd ten etap

MG (08.10): „nie wiem, co mam zrobić, żeby gracze mogli poruszać swoimi tokenami i widzieć się
nawzajem, a jednocześnie żeby nie mogli przejść w kilka sekund całej mapy”. Diagnoza na `dev.db`:

- Aktywna scena „Ulica1” była w trybie **Ręczna mgła bez jednego pociągnięcia pędzla**: każdy gracz
  widział tylko własną figurę (zwolnioną z mgły), figury kolegi stojącego obok serwer mu nie
  wysyłał, a ruch — choć odblokowany — nie miał gdzie pójść, bo pod ręczną mgłą chodzi się tylko
  po odsłoniętym.
- Aktywna scena „Test_2” kampanii „Test_1” nie miała żadnej figury (figury zostały na „Scena1”).
- O ruchu gracza decydowało pięć bramek w pięciu miejscach (checkbox w edytorze sceny, właściciel
  figury, mgła, tura, statusy), a poza walką nie było żadnego limitu dystansu ani tempa.
- Błąd w kodzie: zmiana właściciela karty nie przepisywała `Token.ownerId` — gracz patrzył oczami
  figury swojej karty, ale nie mógł jej ruszyć (`FORBIDDEN`).

## Decyzje MG z 08.10

1. **Tempo poza walką: pula metrów, która się odnawia.** Pula = ruch figury z jednej tury walki
   (RUCH × 2 m z karty), pełna odnowa w ~10 s (tempo spaceru). Stała, bez ustawień.
2. **Przełącznik „Ruch graczy” w górnym pasku: Stop / Eksploracja / Swobodny**, stan na scenę.
   Stop = nikt z graczy nie rusza, także w walce (jak Pauza w Foundry, gracze widzą baner).
   Eksploracja = pula. Swobodny = bez limitu. W trwającej walce uczestnik chodzi z budżetu tury.
3. **Nowa scena startuje w Stop**, a MG widzi stan w górnym pasku (koniec z ukrytym checkboxem).
4. **Widzenie drużyny i mgła — „zrób jak w Foundry VTT”.** Tłumaczenie na ten VTT:
   - Foundry: gracz z uprawnieniem *Observer* do postaci kolegi patrzy także jej oczami i widzi ją
     zawsze. Grupy zwykle nadają je całej drużynie. Tu: **figura prowadzona przez gracza jest
     domyślnie „oczami drużyny”** (`Token.sharedVision`: `null` = samo, `true`/`false` ręką MG
     w karcie figury). Pozostali gracze widzą ją zawsze (mgła, ściany, ciemność, zasłona), a
     w Dynamicznej dostają jej pole widzenia. MG może to wyłączyć na figurze albo włączyć
     sojuszniczemu NPC-owi. Figura „Ukryta” nie jest niczyimi oczami.
   - Foundry: nowa scena ma wizję figur i pamięć odkrytego (Token Vision + Fog Exploration), a
     ręcznej mgły w rdzeniu nie ma. Tu: **nowa scena startuje w Dynamicznej z pamięcią**. Stare
     sceny zostają, jak są.
5. **Wdrożenie teraz, jako etap 45**, z testami jednostkowymi i E2E.

## Zakres

- [x] **Model:** `Scene.playerMove` (`stop` | `explore` | `free`, domyślnie `stop`) zamiast
      `playerMoveLocked` (migracja: `true` → `stop`, `false` → `free`); `Token.sharedVision Boolean?`;
      nowa scena: `visibility = 'dynamic'`. Import starego archiwum czyta `playerMoveLocked`.
- [x] **Serwer — ruch:** Stop odmawia `MOVE_LOCKED` każdej klatki gracza (także w walce).
      Eksploracja poza walką liczy metry trasy z puli (`MOVE_PACE` przy przekroczeniu), pula
      w pamięci serwera (restart = pełna). MG i boty nie są związani nigdy.
- [x] **Pula w `shared` (rdzeń, czysta logika):** stan puli, dostępne metry w chwili `now`, wydatek;
      testy vitest. Wielkość puli daje system (karta → `metresPerMove`), rdzeń zna tylko liczbę.
- [x] **Klient — przełącznik** w górnym pasku obok „Włącz tryb turowy” (tylko MG), stan sceny,
      którą MG ogląda. Checkbox z edytora sceny znika.
- [x] **Klient — gracz:** baner „Ruch wstrzymany przez MG” przy Stop; w Eksploracji ślady butów
      i przycięcie trasy z puli (ta sama maszyna co budżet tury), kursor-odmowa „Złap oddech” przy
      pustej puli.
- [x] **Widzenie drużyny:** `concealedFrom` zwalnia figury „oczu drużyny”, `viewerSightFor` bierze
      je za źródła wzroku, klatki ruchu idą do drużyny także pod mgłą, okienko w mgle rysuje się też
      wokół nich. Przełącznik w karcie figury u MG.
- [x] **Diagnoza u MG przy przełączniku:** znaczek z listą „czemu drużyna nie chodzi”: karta gracza
      bez figury na tej scenie, figura gracza w czerni ręcznej mgły (z „Odsłoń całą mapę”
      i „Przełącz na Dynamiczną”).
- [x] **Błąd właściciela:** zmiana właściciela karty przepisuje `ownerId` jej figur; podpięcie
      figury bez właściciela do karty gracza bierze właściciela karty.
- [x] **Testy serwera:** tryby ruchu (gracz, MG, walka), pula z zegarem, widzenie drużyny (mgła,
      Dynamiczna, ukryta, wyłączona, NPC włączony), migracja, właściciel karty.
- [x] **E2E** `specs/30-rozgrywka/t45-ruch-druzyny.spec.ts`: MG w Chromium + dwóch graczy (jeden
      w Firefoksie, jeśli suita pozwala) — domyślna nowa scena, Stop z banerem, Eksploracja z pulą
      i odnową, Swobodny, Stop w walce, drużyna widzi się w czerni mgły i za ścianą, diagnoza
      i „Odsłoń całą mapę”, przekazanie karty i ruch.

## Poza zakresem

- Foundry ogranicza wizję do zaznaczonej figury, gdy gracz ją zaznaczy — tu gracz zawsze widzi sumę
  swoich i drużynowych oczu (do `POMYSLY.md`).
- Pula nie zna kar przyklejonych do figury (Maź z 26f) — tylko kartę.
- Figury nie przechodzą same na nową scenę (diagnoza tylko to zgłasza).

## Kryteria ukończenia

- MG jednym kliknięciem w górnym pasku zatrzymuje i puszcza ruch drużyny; gracz widzi, czemu nie
  może iść.
- W Eksploracji gracz nie przejdzie dalej niż pula, a po ~10 s idzie znowu; w Swobodnym bez limitu.
- Dwaj gracze widzą swoje figury na nowej scenie, na scenie z całkiem czarną ręczną mgłą i za
  ścianą w Dynamicznej; figura „Ukryta” i figura z wyłączonym „oczami drużyny” nie jadą.
- Testy jednostkowe, lint, `tsc` czyste; nowy E2E zielony, `00-baseline` + `01-dym` zielone.
- Oględziny w Firefoksie (gracz) i Chromium (MG).

## Wykonanie (08.10.2026)

Wszystkie kryteria spełnione. Odstępstwa od planu:

- **E2E w `specs/45-druzyna/t45-ruch-druzyny.spec.ts`, nie w `30-rozgrywka`** — w tamtym katalogu
  plik sortowałby się między T3b a T4a i grzebał w łańcuchu stanów. Start z `po-T6` (`startFromPoT6`,
  „Nocna zmiana”: Marek–Kowal, Ola–Iskra), MG w Chromium, gracze w Firefoksie, 8 testów
  w domyślnym przebiegu.
- **Właściciel karty także przy `token:create`** — figura stawiana z kartą gracza bez `ownerId`
  miała ten sam błąd co podpinana później.
- **`emitTokenUpsert` też zwalnia „oczy drużyny” z gałęzi mgły** — bez tego zapis karty kolegi stojącego
  w czerni zabierał jego figurę drużynie do najbliższej pełnej listy.
- **T9a 9.2 ustawia „Rezydencji” ręczną mgłę jawnie** — T9b liczy na nią, a nowa scena startuje
  już w Dynamicznej.
- Diagnoza nie zna pojęcia „gracz obecny” — wymienia karty graczy gotowe do gry (`playReady`) bez
  figury na oglądanej scenie i ich figury w czerni ręcznej mgły.

