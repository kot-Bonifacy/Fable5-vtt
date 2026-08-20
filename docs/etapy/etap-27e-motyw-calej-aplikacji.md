# Etap 27e — Motyw dzień/noc dla całej aplikacji

**Faza:** I — Wykończenie · **Wymaga etapów:** 27a (tokeny i przełącznik ☀/☾), 27d (okno ustawień)

> **Podział z 2026-08-19** — patrz `etap-27d-kosci-kubek.md`.

## Cel sesji

Przełącznik ☀/☾ przestaje kłamać. Dziś ubiera **wyłącznie kartę postaci**; po tej sesji cała
aplikacja ma jeden motyw z dwiema skórkami, a `styles.css` (7000+ linii z zaszytymi kolorami)
czyta kolory ze zmiennych zamiast wpisywać je w miejscu.

## Decyzja MG (2026-08-19)

**Tryb dzienny obejmuje całą aplikację**, nie tylko kartę. To znosi zdanie „tryb jasny —
ciemny wystarczy" z sekcji „Poza zakresem" pierwotnego etapu 27; zdanie pochodziło sprzed
27a, w którym dzień powstał na potrzeby wydruku karty.

## Zakres

- [x] **Jeden plik motywu** (`packages/client/src/theme.css`) z pełnym zestawem tokenów:
      kolory, typografia, odstępy, promienie, cienie, wysokości warstw. Obie skórki obok
      siebie: `:root` (noc) i `:root[data-theme='day']`
- [x] **Migracja `styles.css` na tokeny** — inwentaryzacja wszystkich literałów kolorów
      (`#rrggbb`, `rgb()`, `rgba()`) i podmiana na zmienne. To jest największy kawałek pracy
      i warto go zrobić skryptem + przeglądem, nie ręcznie
- [x] **Audyt każdego widoku w obu trybach** — logowanie, dołączenie do stołu, stół (mapa,
      panele boczne, HUD walki, pasek akcji), karta postaci, kreator postaci, kompendium,
      edytor botów, tracker inicjatywy, okno Sieci, handouty, screamsheety, dziennik,
      panel MG. Żaden ekran nie może zostać „goły"
- [x] **Warstwa mapy w trybie dziennym** — mgła, ciemność i płachta widoczności są rysowane
      w Pixi, nie w CSS. Rozstrzygnąć, czy dzień je zmienia (ciemność w jasnym motywie czyta
      się inaczej), czy mapa zostaje zawsze nocna
- [x] **Emoji jako ikony** — 📰 z 24c i 🔌 z 26b rysują się na Windowsie jednobarwnie.
      Podmiana na własne SVG (game-icons, CC BY) razem z przeglądem pozostałych emoji w UI

## Poza zakresem

- Nowe funkcje; pełny audyt WCAG (kontrast zdroworozsądkowo tak, certyfikacja nie)
- Wprowadzanie biblioteki komponentów UI — za późno, szanujemy istniejące komponenty

## Kryteria ukończenia

- Przełącznik ☀/☾ zmienia **każdy** widok, a nie samą kartę; przeładowanie pamięta wybór
- W `styles.css` nie ma literału koloru poza plikiem motywu (dopuszczalne wyjątki opisane
  komentarzem w miejscu)
- Przejście przez wszystkie widoki w obu trybach bez ekranu, który świeci czernią na białym
  albo bielą na czarnym
