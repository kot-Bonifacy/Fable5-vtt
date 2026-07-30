# Etap 18d — Interakcje z drzwiami i oknami

**Faza:** E — Widoczność · **Wymaga etapów:** 18a, 18b

> Wydzielone z etapu 18b (decyzja z 30.07.2026) na wniosek MG. W 18a drzwi
> otwiera się kliknięciem z dowolnej odległości i nie mają zamków, a okno
> przepuszcza wzrok bez ograniczeń — trzy rzeczy, które przy stole czytają się
> jako niedokończone.

## Cel sesji

Drzwi i okna zachowują się jak przedmioty w przestrzeni, a nie jak przełączniki
na planszy: trzeba do nich podejść, mogą być zamknięte na klucz, a przez okno
widać niewiele, dopóki się do niego nie stanie.

## Zakres

- [ ] **Zasięg ręki:** gracz może otworzyć/zamknąć drzwi tylko, gdy jego token
      stoi w odległości nie większej niż ustalony próg (propozycja: 2 m — jedna
      kratka — mierzone od środka tokenu do najbliższego punktu segmentu). MG bez
      ograniczenia. Odrzucenie nie może zdradzać, że drzwi tam są
- [ ] Drzwi poza zasięgiem widać (jeśli są w polu widzenia), ale klik ich nie
      rusza — z czytelnym komunikatem „za daleko"
- [ ] **Zamek (MG):** drzwi mogą być zablokowane; zablokowane drzwi nie reagują
      na klik gracza. MG blokuje i odblokowuje z paska narzędzi ścian
- [ ] Stan zamka widoczny dla MG na warstwie ścian; gracz widzi tylko efekt
      („zamknięte na klucz") po próbie otwarcia
- [ ] **Okna z firanką** (doprecyzowane przez MG 30.07, zastępuje pierwotny
      pomysł „dwustanowego okna z klikaniem"): **na scenie, która NIE jest
      oznaczona jako „Ciemna scena"**, okno z dystansu w ogóle nie pokazuje
      wnętrza — trzeba do niego **podejść bardzo blisko** (ten sam próg co do
      drzwi, propozycja 2 m), żeby widok się pojawił. Model fizyczny: firanka,
      brudna szyba, roleta — z ulicy okno to jasny prostokąt i tyle
- [ ] Bez klikania: decyduje sama odległość, a wgląd gaśnie po odejściu
- [ ] Reguła **symetryczna** — geometria nie wie, co jest „w środku", więc ktoś
      w pokoju też musi podejść do okna, żeby obserwować ulicę. To zresztą
      dokładnie to, co robi firanka
- [ ] **Świadomie nie dotyczy scen ciemnych:** nocą oświetlone okno jest z
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

- [ ] Gracz stojący przez pół mapy od drzwi nie otwiera ich klikiem; ten sam
      gracz po podejściu na kratkę otwiera je normalnie
- [ ] Drzwi zablokowane przez MG nie ustępują graczowi, a MG otwiera je nadal
- [ ] Token przy ścianie z oknem widzi przez nie tylko pas 2 m; po kliknięciu w
      okno widzi całą przestrzeń za nim, a po odejściu znów tylko pas
- [ ] Testy dymne: `door:toggle` z odległości → odmowa; z zamkiem → odmowa;
      `window:peek` bez zbliżenia → odmowa

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
