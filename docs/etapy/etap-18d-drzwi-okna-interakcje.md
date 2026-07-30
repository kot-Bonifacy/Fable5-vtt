# Etap 18d — Interakcje z drzwiami i oknami

**Faza:** E — Widoczność · **Wymaga etapów:** 18a, 18b

> Wydzielone z etapu 18b (decyzja z 30.07.2026) na wniosek MG. W 18a drzwi
> otwiera się kliknięciem z dowolnej odległości i nie mają zamków, a okno
> przepuszcza wzrok bez ograniczeń — trzy rzeczy, które przy stole czytają się
> jako niedokończone.

## Cel sesji

Drzwi i okna zachowują się jak przedmioty w przestrzeni, a nie jak przełączniki
na planszy: trzeba do nich podejść, mogą być zamknięte na klucz, a przez okno
widać niewiele, dopóki się przy nim nie stanie.

## Zakres

- [x] **Zasięg ręki:** gracz może otworzyć/zamknąć drzwi tylko, gdy jego token
  
      stoi w odległości nie większej niż ustalony próg (**przyjęte: 2 m** — jedna
      kratka — mierzone od środka tokenu do najbliższego punktu segmentu). MG bez
      ograniczenia. Odrzucenie nie może zdradzać, że drzwi tam są
- [x] Drzwi poza zasięgiem widać (jeśli są w polu widzenia), ale klik ich nie
  
      rusza — z czytelnym komunikatem „za daleko"
- [x] **Zamek (MG):** drzwi mogą być zablokowane; zablokowane drzwi nie reagują
  
      na klik gracza. MG blokuje i odblokowuje z paska narzędzi ścian
- [x] Stan zamka widoczny dla MG na warstwie ścian; gracz widzi tylko efekt
  
      („zamknięte na klucz") po próbie otwarcia
- [x] **Okna z firanką** (doprecyzowane przez MG 30.07, zastępuje pierwotny
  
      pomysł „dwustanowego okna z klikaniem"): **na scenie, która NIE jest
      oznaczona jako „Ciemna scena"**, okno z dystansu w ogóle nie pokazuje
      wnętrza — trzeba do niego **podejść bardzo blisko** (ten sam próg co do
      drzwi, 2 m), żeby widok się pojawił. Model fizyczny: firanka,
      brudna szyba, roleta — z ulicy okno to jasny prostokąt i tyle
- [x] Bez klikania: decyduje sama odległość, a wgląd gaśnie po odejściu
- [x] Reguła **symetryczna** — geometria nie wie, co jest „w środku", więc ktoś
  
      w pokoju też musi podejść do okna, żeby obserwować ulicę. To zresztą
      dokładnie to, co robi firanka
- [x] **Świadomie nie dotyczy scen ciemnych:** nocą oświetlone okno jest z
  
      dystansu bardziej widoczne, nie mniej, a tam ograniczeniem jest już
      tłumienie światła przez szybę (`LIGHT_WINDOW_COST`, weszło w 18c)

## Co już weszło w 18c

- **Okno tłumi światło** (`LIGHT_WINDOW_COST` w `shared/lights.ts`): przepuszcza
  je — bo okno nie jest w zbiorze blokerów — ale za szybą lampa zużywa resztę
  zasięgu dwa razy szybciej. Zrobione na wniosek MG w trakcie oględzin 18c.
  **Wzrok** przez okno jest nadal nieograniczony i to jest zakres tego etapu

## Poza zakresem

- Wyważanie drzwi i otwieranie zamków jako testy umiejętności CP RED
  (Podważanie/Siłowanie, Technika bezpieczeństwa) — potrzebuje ekonomii akcji z
  etapu 20; tutaj zamek jest przełącznikiem MG
- Kolizje ruchu (dziś token przechodzi przez ścianę — patrz `POMYSLY.md`)

## Kryteria ukończenia

> Kryteria poprawione 30.07 przy wejściu w etap: pierwotne trzy ostatnie
> opisywały **wersję z klikaniem w okno** („`window:peek`", „pas 2 m"), którą
> ustalenie MG z 30.07 zastąpiło firanką bez klikania. Zdarzenie `window:peek`
> nie istnieje — o wglądzie decyduje sama odległość.

- [x] Gracz stojący przez pół mapy od drzwi nie otwiera ich klikiem; ten sam
  
      gracz po podejściu na kratkę otwiera je normalnie
- [x] Drzwi zablokowane przez MG nie ustępują graczowi, a MG otwiera je nadal
- [x] Token dalej niż 2 m od okna **nie widzi przez nie nic** (okno jest dla
  
      niego ścianą); po podejściu na 2 m widzi całą przestrzeń za nim, a po
      odejściu znów nic. Reguła symetryczna, wyłączona na scenie ciemnej
- [x] Testy dymne: `door:toggle` z odległości → `DOOR_OUT_OF_REACH`; na
  
      zablokowanych drzwiach z zasięgu → `DOOR_LOCKED`; token za oknem nie trafia
      do payloadu z dystansu, a trafia po podejściu

## Wskazówki techniczne

- Próg odległości mierz `distanceToWall` z `shared/walls.ts` (istnieje od 18a) —
  od środka tokenu, jak wszystko inne w tym projekcie
- Okno „z firanką" to **nie nowy raycast, tylko zbiór segmentów liczony per
  źródło wzroku**: dla każdego tokenu dołóż do blokerów te okna, od których
  stoi dalej niż próg. Dziś `SceneVisionContext.segments` jest wspólny dla
  wszystkich widzów, więc trzeba przenieść listę do `SightSource` — skorzysta z
  tego również `visibleDoorsFor`, które dziś patrzy przez odległe okna
- **Nie ruszaj tego dla światła:** okna mają zostać przezroczyste dla lamp (z
  karą `LIGHT_WINDOW_COST`), bo inaczej oświetlone wnętrze przestanie prześwitywać
  na ulicę
- Zaglądanie jest stanem efemerycznym (jak pomiar linijką), a nie kolumną w
  bazie: gaśnie, gdy token odejdzie, i nie musi przeżyć restartu
