# Etap 27 — Kości 3D i szlif UI

**Faza:** I — Wykończenie · **Wymaga etapów:** 06 (kości), sensownie: wszystkie funkcjonalne

## Cel sesji

Warstwa satysfakcji: animowane kości 3D nad stołem oraz przegląd i ujednolicenie całego UI w klimacie cyberpunk/Foundry.

> **⛔ Ten etap został rozdzielony do końca (2026-08-19) — nie realizuj go z tego pliku.**
> Cztery kawałki, które zostały po wydzieleniu 27a–27c, mieszkają teraz osobno:
>
> | Plik                                | Zawartość                                                      |
> | ----------------------------------- | -------------------------------------------------------------- |
> | `etap-27d-kosci-kubek.md`           | skórki kości, dorzut krytyka, okno ustawień                    |
> | `etap-27e-motyw-calej-aplikacji.md` | tokeny motywu, dzień/noc dla wszystkich widoków, audyt ekranów |
> | `etap-27f-szlif-ux.md`              | okno pomocy `?`, tooltipy, stany puste, pozycje okien          |
> | ~~`etap-27g-wydajnosc.md`~~         | ⛔ wycofany 01.09 — wydajność sprawdzona przez MG poza sesją   |
>
> **Sprzeczność rozstrzygnięta 2026-08-19:** sekcja „Poza zakresem" niżej mówi „tryb jasny
> (ciemny wystarczy)", a sekcja „Zakres" — „tryb dzień/noc dla całej aplikacji". Zdanie
> z „Poza zakresem" pochodzi sprzed etapu 27a, w którym dzień powstał dla karty. **Decyzja
> MG: tryb dzienny obejmuje całą aplikację** (szczegóły w 27e).

> **Podział (2026-08-13):** przegląd wyglądu **karty postaci** wyszedł z tego etapu do trzech
> osobnych sesji — `etap-27a-karta-jak-oficjalna.md` (rama, motyw dzień/noc, strona 1),
> `etap-27b-karta-walka-ekwipunek.md`, `etap-27c-karta-zycie-cyborgizacje.md`. Powód: MG chce
> kartę wyglądającą jak oficjalny arkusz CP RED, a to jest osobny kawałek roboty, nie punkt
> listy. Motyw dzień/noc powstaje w 27a **tylko dla karty** — rozciągnięcie go na resztę
> aplikacji zostaje tutaj.

> **Uwaga (2026-07-18):** podstawowe kości 3D zostały zrealizowane już w etapie 06 na życzenie
> użytkownika — biblioteka `@3d-dice/dice-box-threejs` (wybrana zamiast `@3d-dice/dice-box`,
> bo natywnie wspiera wymuszanie wyników serwera), integracja w `packages/client/src/dice3d.ts`,
> assety w `packages/client/public/dice/` (patrz `docs/assety-kosci.md`). Dorzut krytyka już
> wjeżdża osobną kością. W tym etapie zostaje: skórki/klimat, ustawienia per użytkownik i szlif.

## Zakres

- [x] Kości 3D: biblioteka `@3d-dice/dice-box-threejs` (WebGL + fizyka) — animacja rzutu przy każdym rzucie na czacie; **wynik zawsze z serwera** — animacja jest deterministycznie doprowadzana do wartości serwera, nigdy odwrotnie _(zrobione w etapie 06)_
- [ ] Wybór różnych skórek kości: d10/d6 w tym w klimacie (neon na czarnym), rozróżnienie wizualne krytyka (dorzut wjeżdża osobną kością — _dorzut już działa, zostają skórki_)

- [ ] Przegląd UI całej aplikacji — ujednolicenie do spójnego motywu wzorowanego na Foundry (ciemny interfejs, panele boczne, okna przeciągalne) z akcentem cyberpunk (neonowe podświetlenia, monospace w elementach „terminalowych"):
  - wspólne tokeny designu (kolory, typografia, odstępy) w jednym pliku motywu
  - **tryb dzień/noc dla całej aplikacji** — tokeny i przełącznik powstały w etapie 27a, ale ubierają wyłącznie kartę postaci; tutaj dochodzi reszta widoków
  - audyt każdego widoku: logowanie, stół, karta, kompendium, edytor botów, tracker, netrunning
  - okna (karta, kompendium, handouty) przeciągalne i zapamiętujące pozycję
- [ ] UX: skróty klawiszowe zebrane i opisane (okno pomocy `?`), tooltips na ikonach, stany ładowania i puste stany z sensownymi komunikatami po polsku
- [ ] Wydajność: przegląd re-renderów Reacta przy ruchu tokenów, rozmiar bundle'a, lazy-loading ciężkich modułów (dice-box, netrunning)
- [ ] Przejrzyj `POMYSLY.md` — drobne szlify UX z backlogu wciągnij tutaj, jeśli tanie

## Poza zakresem

- Nowe funkcje mechaniczne; tryb jasny (ciemny wystarczy); pełna dostępność WCAG (zdrowy rozsądek tak, audyt nie)

## Kryteria ukończenia

- Rzut `/r 2d6+3` toczy kości 3D, które zatrzymują się na wartościach zgodnych z wynikiem serwera; dorzut krytyka ma swoją animację; wyłączenie animacji w ustawieniach działa
- Wszystkie widoki trzymają jeden motyw (bez „gołych" niestylowanych ekranów); okna przeciągalne

## Wskazówki techniczne

- dice-box montuj w nakładce nad canvasem Pixi (osobny przezroczysty canvas); doprowadzanie do wyniku: biblioteka wspiera zadawanie wartości rzutu — użyj tego zamiast liczyć na fizykę
- Motyw: CSS custom properties + jeden plik `theme.css`; nie wprowadzaj teraz biblioteki UI — za późno, szanuj istniejące komponenty
- To dobra sesja na „pogranie" z drużyną i zebranie listy drażniących drobiazgów przed wdrożeniem
