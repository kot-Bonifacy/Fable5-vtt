# Etap 26 — Kości 3D i szlif UI

**Faza:** I — Wykończenie · **Wymaga etapów:** 06 (kości), sensownie: wszystkie funkcjonalne

## Cel sesji

Warstwa satysfakcji: animowane kości 3D nad stołem oraz przegląd i ujednolicenie całego UI w klimacie cyberpunk/Foundry.

## Zakres

- [ ] Kości 3D: biblioteka `@3d-dice/dice-box` (WebGL + fizyka) — animacja rzutu przy każdym rzucie na czacie; **wynik zawsze z serwera** — animacja jest deterministycznie doprowadzana do wartości serwera, nigdy odwrotnie
- [ ] Skórki kości: d10/d6 w klimacie (neon na czarnym), rozróżnienie wizualne krytyka (dorzut wjeżdża osobną kością)
- [ ] Ustawienia per użytkownik: wyłączenie animacji (dostępność/wydajność), głośność stuknięć kości
- [ ] Przegląd UI całej aplikacji — ujednolicenie do spójnego motywu wzorowanego na Foundry (ciemny interfejs, panele boczne, okna przeciągalne) z akcentem cyberpunk (neonowe podświetlenia, monospace w elementach „terminalowych"):
  - wspólne tokeny designu (kolory, typografia, odstępy) w jednym pliku motywu
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
- Test na drugim komputerze/laptopie z gorszym GPU: stół używalny, animacje nie zabijają płynności

## Wskazówki techniczne

- dice-box montuj w nakładce nad canvasem Pixi (osobny przezroczysty canvas); doprowadzanie do wyniku: biblioteka wspiera zadawanie wartości rzutu — użyj tego zamiast liczyć na fizykę
- Motyw: CSS custom properties + jeden plik `theme.css`; nie wprowadzaj teraz biblioteki UI — za późno, szanuj istniejące komponenty
- To dobra sesja na „pogranie" z drużyną i zebranie listy drażniących drobiazgów przed wdrożeniem
