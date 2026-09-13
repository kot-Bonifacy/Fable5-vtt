# Etap 42a — Bariera i brama: ruch, wręcz, planer gracza

**Faza:** E — Widoczność · **Wymaga etapów:** 18a + 18d (ściany, drzwi, okna), 16e + 27j (planer
trasy i kolizje ruchu na serwerze), 14d (Pochwycenie)

> **Pochodzenie:** zlecenie MG z 13.09.2026 — „dodać możliwość tworzenia ścian w scenie, które nie
> będą przesłaniały widoku za nimi, ale gracz nie będzie mógł przez nie przejść (ma to blokować
> przejście za niektóre elementy na mapie, np. ogrodzenie z metalowej siatki)". Rozdzielone na
> trzy etapy (42a–c) decyzją MG z tego samego dnia.

## Cel sesji

Ściana z 18a zasłania wzrok, więc ogrodzenie z siatki narysowane murem robi z placu za nim czarną
plamę. Nowy rodzaj przegrody — **bariera** — zostawia w spokoju wzrok i światło, a zatrzymuje
**ciało**: ruch figury, atak wręcz i Pochwycenie. **Brama** to ten sam mechanizm otworu co drzwi
i okno (klamka, rygiel, zasięg ramienia), tylko przezierny w obu stanach.

## Decyzje MG przed kodem (13.09.2026)

1. **Nazwa rodzaju: „Bariera"** — siatka, krata, barierka, szklana ścianka.
2. Bariera **zawsze** blokuje ruch i atak wręcz. Strzały i wybuchy przez nią — etap **42b** (SP).
3. **Brama** jako osobny rodzaj: nie zasłania w żadnym stanie, zamknięta blokuje jak bariera,
   ma klamkę dla gracza i rygiel jak drzwi.
4. **Planer trasy gracza zna bariery, które gracz widzi** — Dynamiczna: w polu widzenia; ręczna
   mgła: odsłonięte; scena otwarta: wszystkie. Nie są rysowane, służą wyłącznie planerowi.
   Tą samą drogą idzie **zamknięte okno z bliska**: gracz stojący przy szybie widzi przez nią,
   planer prowadził go przez okno, a serwer odmawiał dopiero po kliknięciu.
5. Przyjęte bez osobnego pytania (MG nie zgłosił sprzeciwu): wręcz obejmuje broń białą, Bijatykę,
   Sztuki walki i Pochwycenie; Stabilizacja, podanie dawki i przekazanie przedmiotu działają przez
   siatkę jak dotąd; rzucony nóż to atak dystansowy.

## Zakres

- [x] `WALL_KINDS` + `barrier`, `gate`; `isOpening` obejmuje bramę, `isBarrier` — obie
- [x] `wallBlocksMovement` — jedyna odpowiedź na „co zatrzymuje ciało" (ściana, zamknięte drzwi,
      okno i brama, bariera); `movementSegments` z niej
- [x] `roomSegments` pomija barierę i bramę („Dopasuj światło do pomieszczenia")
- [x] Atak wręcz i Pochwycenie odmawiają przez wszystko, co blokuje ruch (`MELEE_BLOCKED`,
      `GRAPPLE_BLOCKED`) — zdaniem, bez nazwy przeszkody (`isBodyBlocked`)
- [x] `blocker:sync` — przeszkody ruchu, które gracz widzi, a które nie zasłaniają mu wzroku;
      w `state:sync` i po zmianie ścian, mgły, trybu widoczności i pola widzenia
      (`visibleWalkBlockersFor`, `realtime/blockers.ts`)
- [x] Planer gracza (`pushWalkPassable`) omija te odcinki
- [x] Pasek ścian: „Bariera" i „Brama" (brama dzieli z drzwiami oko „gracze mogą otwierać"); karta
      segmentu; tytuł karty obiektu; kolory warstwy MG (fiolet, róż); glif bramy 🚧
- [x] Zdania odmów bramy w `openingErrorText`; etykieta bramy w edytorze architektury Sieci
- [x] Zdanie `MELEE_BLOCKED` dla modelu w turze bota
- [x] Testy: `shared/walls-barrier.test.ts` (14), planer ataku (1), serwer — 9 w `walls.test.ts`
      (ruch przez barierę i bramę, brama z ręki gracza, `blocker:sync` w trzech trybach, okno
      z bliska, lampa), 1 w `attacks.test.ts`, 1 w `grapple.test.ts`

## Poza zakresem

- SP bariery dla strzałów i wybuchów → **42b**
- Bariera zasłaniająca figury, mgła za nią i kara za niewidoczny cel → **42c**
- Zwykłe ściany w planerze gracza na scenach bez widoczności Dynamicznej — planer ich nie zna
  i serwer odmawia dopiero po kliknięciu. Istniało przed tym etapem; zaległość w `zaleglosci.md`

## Kryteria ukończenia

1. MG rysuje barierę; przy widoczności Dynamicznej gracz widzi plac za nią, a figury przez nią nie
   przeprowadzi — trasa omija siatkę, zanim padnie klik. ✅ serwer (strażnik i `blockers`
   w `state:sync`); rysowanie trasy — oględziny w przeglądarce
2. Figura gracza przeciągnięta przez barierę odpada `MOVE_REFUSED`; figura MG przechodzi. ✅
3. Atak wręcz i Pochwycenie przez barierę odpadają zdaniem; strzał przez nią przechodzi jak dotąd. ✅
4. Brama: gracz otwiera ją z odległości ramienia; zamknięta blokuje ruch i wręcz, otwarta nic;
   w żadnym stanie nie zasłania. ✅
5. „Dopasuj światło do pomieszczenia" na placu ogrodzonym barierą mierzy plac, nie siatkę. ✅
6. Gracz nie dostaje odcinka bariery, której nie widzi (za murem, pod mgłą). ✅

## Odstępstwa od planu

**Wręcz i Pochwycenie zatrzymuje wszystko, co zatrzymuje ruch — także zamknięte okno.** Plan mówił
o barierze i bramie; wybrana została jedna lista (`movementSegments`) zamiast osobnej „listy ręki".
Skutek uboczny, świadomy: przez zamknięte okno z odległości ramienia **nie da się już uderzyć**
(do 13.09 dało się, bo wręcz pytało tylko listy strzału, a z bliska szyba jej nie blokuje).

**Pochwycenie w ogóle nie sprawdzało ścian** — dało się pochwycić figurę przez mur, jeśli stała
w zasięgu 2 m. Naprawione tą samą funkcją (`isBodyBlocked`), znalezione przy okazji.

**Brama nie ma własnego przełącznika na pasku** — dzieli oko „gracze mogą otwierać" z drzwiami
(domyślnie tak): jedne i drugie stawia się pojedynczo, w przejściu.

## Co zostało

- **Oględziny w przeglądarce** (`zaleglosci.md`): pasek ścian z pięcioma rodzajami, rysowanie
  bariery i bramy, trasa gracza omijająca siatkę przy Dynamicznej i przy mgle, klamka bramy.
- **Bot nie wie z góry, że przez barierę nie sięgnie wręcz** — dostaje odmowę i zdanie do poprawki
  (`POMYSLY.md`).
