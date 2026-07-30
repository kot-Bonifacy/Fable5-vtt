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
- [ ] **Okna dwustanowe:** z dystansu okno daje wgląd tylko o jedną kratkę (2 m)
      w głąb; po podejściu do okna (ten sam próg co drzwi) kliknięcie w nie
      pozwala „zajrzeć" i daje pełny zasięg widzenia przez okno
- [ ] Zaglądanie przez okno gaśnie, gdy token odejdzie od okna — bez ręcznego
      zamykania

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
- Okno „z dystansu" to nie nowy raycast: to segment blokujący z wyjątkiem —
  najprościej policzyć wielokąt widzenia z oknem jako ścianą, a osobno dodać
  wielokąt lokalny o promieniu jednej kratki liczony ze środka okna
- Zaglądanie jest stanem efemerycznym (jak pomiar linijką), a nie kolumną w
  bazie: gaśnie, gdy token odejdzie, i nie musi przeżyć restartu
