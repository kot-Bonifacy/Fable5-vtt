# Etap 54 — Ruch wzorem BG3: bez podglądu pod kursorem, jeden klik, potwierdzenie tylko przy koszcie

**Faza:** przed betą (zlecenie MG z 17.10 spoza planu) · **Wymaga etapów:** 52 · **Stan:** plan
spisany 17.10, implementacja w osobnej sesji (decyzja MG „tylko zapisz plan”). Kolejność względem
refaktoryzacji ustal z MG na starcie sesji.

## Skąd ten etap

MG (17.10): po zaznaczeniu figury odciski butów cały czas idą za kursorem i pokazują, dokąd figura
miałaby iść — także wtedy, gdy figurę zaznacza się po to, żeby obejrzeć kartę, wycelować albo ją
edytować. Przeszkadza **i MG, i graczowi**. Pytanie MG: czy w Foundry jest tak samo i czy zamiar
ruchu nie powinien być jakoś zaznaczony.

**Dziś (po etapie 52):** `updateWalkHover` liczy trasę pod kursorem przy każdej zaznaczonej figurze
(poza wyjątkami: ping, ładunek, celowanie, narzędzie mapy), `drawWalkPreview` rysuje ją odciskami
w pasach (zielony — Ruch tej tury, bursztynowy — Bieg, szary — poza zasięgiem). Pierwszy klik
zamraża cel (`walkTarget`), drugi w to samo pole rusza (`walkTo` → `startWalk` z `walkHover`),
Shift + klik dokłada punkt pośredni (`addWalkWaypoint`).

## Jak to robią inni (sprawdzone 17.10)

- **Foundry v13:** samo zaznaczenie nie rysuje niczego. Trasa pojawia się tylko w trakcie gestu:
  przeciąganie figury (linijka z kosztem ruchu, ruch po upuszczeniu) albo Ctrl + klik na figurę
  i punkty pośrednie z wciśniętym Ctrl (puszczenie Ctrl rusza, Esc odwołuje). W v12 — linijka
  Ctrl + przeciągnięcie i Spacja rusza figurę zmierzoną trasą. Moduł Drag Ruler barwi trasę wg
  szybkości (nasze pasy).
- **BG3:** poza walką klik w podłoże od razu rusza postać, bez rysowania trasy. W walce trasa jest
  widoczna pod kursorem przed kliknięciem i jeden klik rusza; drugi klik w to samo miejsce gra
  potrzebuje tylko przy groźnym terenie (pierwszy zatrzymuje postać przed nim). Ruch można dzielić
  na kilka kliknięć.

MG wybrał wzór BG3, nie Foundry: gracz dalej nie przeciąga figur (decyzja 52.1 w tej części stoi).

## Decyzje MG z 17.10

1. **Dotyczy MG i gracza tak samo.** MG zachowuje przeciąganie figur (stawianie bez trasy).
2. **Poza walką (Eksploracja): pod kursorem nic, jeden klik w podłoże = figura idzie.** Bez
   podglądu i bez potwierdzenia. Trasę widać w trakcie marszu (ślad za figurą jak dziś), klik albo
   Esc zatrzymuje marsz.
3. **W walce, w turze tej figury: podgląd pod kursorem zostaje** (odciski z pasami), a klik:
   - w **zielony** pas — figura od razu idzie;
   - w **bursztynowy** — pierwszy klik pokazuje cel i zdanie, że ruch zużyje Akcję na Bieg, drugi
     klik w to samo pole **wydaje Akcję na Bieg i figura dochodzi do celu** (jak „Dash” z jednego
     gestu w BG3) — dotąd bursztyn był tylko informacją, a Bieg księgował pasek akcji;
   - w **szary** pas albo trasę obciętą mgłą (`truncated`) — pierwszy klik pokazuje cel, drugi
     rusza figurę do granicy tego, co da się przejść.
4. **W walce poza turą tej figury zaznaczenie nie rysuje niczego.**
5. **Odznaczanie: Esc albo PPM w puste pole** (klik w podłoże już nie może odznaczać, bo rusza
   figurę). Tak samo u MG i gracza.
6. Decyzja 52.1 („drugi klik zawsze potwierdza”) zostaje cofnięta w części o potwierdzaniu;
   „gracz nie przeciąga figur” i zatwierdzanie całej trasy przez serwer (`token:walk`) zostają.

## 54a — klient: gest i rysowanie

- [ ] **Podgląd pod kursorem tylko w walce, w turze tej figury** — warunek w `updateWalkHover`
      (poza walką i w cudzej turze ani trasy, ani odcisków; kursor „pointer” / „not-allowed” może
      zostać jako jedyna podpowiedź — sprawdzić z MG na oględzinach).
- [ ] **Klik planuje trasę sam**, gdy nie ma podglądu: `walkTo` → `planWalkRoute(goal)` zamiast
      czekać na `walkHover` (dziś `startWalk` bierze trasę z podglądu).
- [ ] **Potwierdzenie tylko przy koszcie** — `walkTo` rozstrzyga pas celu: zielony = od razu
      `startWalk`; bursztyn, szary, `truncated` = `walkTarget` + zdanie, drugi klik w to samo pole
      rusza. Zdania: bursztyn (np. „Kliknij jeszcze raz — Bieg zużyje Akcję. Esc — odwołaj.”),
      reszta jak `WALK_CONFIRM_NOTE`.
- [ ] **Odznaczanie Esc / PPM w puste pole.** Kolejność Esc do ustalenia w kodzie i spisania:
      marsz / postój → cel marszu → broń w kubku (50c) → zaznaczenie. PPM w puste: najpierw zdejmuje
      cel marszu, a gdy go nie ma — zaznaczenie. Podwójny PPM na figurze (cel 50c) i menu figury bez
      zmian.
- [ ] **Shift + klik (punkty pośrednie)** zostaje także poza walką: od pierwszego punktu trasa jest
      narysowana (to jawne planowanie), klik w cel rusza.
- [ ] **Legenda śladów** (`map-placement-hint`, `vtt.walkPreviewLearned`, umowa #69 w `mapa`):
      poza walką podglądu nie ma, więc legenda tylko przy pierwszym podglądzie w walce.
- [ ] **Postój Eksploracji (52, decyzja 6)** działa z jednego kliku: cel dalej niż pula — figura
      idzie, łapie oddech i sama idzie dalej.

## 54b — serwer: Bieg z marszu

- [ ] **`token:walk` z Biegiem** — flaga w ładunku (np. `run: true`), gdy trasa sięga bursztynu.
      Serwer w zatwierdzaniu sprawdza na sucho (`applySpend` z `dryRun`) Ruch **i** Bieg, a przy
      lądowaniu księguje oba. **RAW:** Bieg działa dopiero po wykonaniu Akcji Ruchu w tej Turze
      (`turn.ts`, `hotbar.ts`: „Bieg wymaga wcześniejszego wykonania Akcji Ruchu”) — marsz w bursztyn
      zużywa najpierw cały Ruch, potem Bieg, więc warunek jest spełniony w jednym geście. Akcja już
      wydana ⇒ bursztynu nie ma (`extraMetres` 0), więc ta ścieżka nie powstaje.
- [ ] Odmowa (np. Akcja wydana w międzyczasie, pochwycenie) tymi samymi kodami co dziś, zdanie
      w `moveErrorText`; boty bez zmian (o ile nie chodzą tą ścieżką — sprawdzić `REFUSAL_TEXTS`).
- [ ] **Testy serwera:** marsz w bursztyn księguje Ruch + Bieg, bez flagi staje na granicy zieleni,
      flaga przy wydanej Akcji — odmowa, przerwany marsz w bursztynie (co z Akcją, gdy figura nie
      doszła do bursztynu? — rozstrzygnąć: proponuję Bieg księgowany dopiero po wejściu w bursztyn).

## Poza zakresem

- Przeciąganie przez gracza (wzór Foundry) — MG wybrał BG3.
- Ruch figury strzałkami o pole (Foundry) — ewentualnie do `POMYSLY.md`.
- „Podejdź i zaatakuj” — dalej w `POMYSLY.md` (z etapu 52).

## Kryteria ukończenia

- Poza walką zaznaczenie figury nie rysuje odcisków pod kursorem; jeden klik w podłoże rusza figurę
  (gracz i MG), Esc / PPM w puste odznacza.
- W walce, w turze figury: podgląd z pasami; zielony — jeden klik, bursztyn — dwa kliki i Bieg
  zaksięgowany przez serwer, szary / mgła — dwa kliki. W cudzej turze nic nie rysuje.
- Testy jednostkowe (klient: rozstrzyganie pasa celu; serwer: Bieg z marszu), lint, `tsc` czyste.
- **E2E:** `walkWorld` (`fixtures/canvas.ts`) i `walkOnMap` (`fixtures/scene.ts`) klikają dziś
  dwa razy — po zmianie drugi klik w trakcie marszu go **zatrzyma** (`walkTo` przy `this.march`).
  Fikstury dostają rozróżnienie (jeden klik / z potwierdzeniem), a specy marszu w walce i poza nią
  (t4a, t5b, t6b, t7a, t7c i każdy, który woła te fikstury) zielone; `00-baseline` + `01-dym`
  zielone.
- Oględziny: gracz w **Firefoksie** (Playwright MCP), MG w Chromium — poza walką, w walce w swojej
  i cudzej turze, bursztyn z Biegiem.
