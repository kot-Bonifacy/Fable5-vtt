# Etap 06 — Silnik kości CP RED

**Faza:** B — Stół MVP · **Wymaga etapów:** 03

## Cel sesji

Silnik rzutów w `packages/shared` z pełnymi zasadami CP RED (krytyk przy 10, fumble przy 1) + komendy rzutów na czacie z czytelnym wynikiem.

## Zakres

- [ ] Parser notacji: `XdY`, modyfikatory (`1d10+7`, `2d6+3`), suma wielu członów
- [ ] Zasady CP RED w silniku:
  - test umiejętności: `1d10 + STAT + umiejętność + mod`; naturalna 10 → dorzut d10 dodawany (krytyk); naturalna 1 → dorzut d10 odejmowany (fumble)
  - kości obrażeń: `Xd6`, wykrywanie dwóch lub więcej „6" → flaga rany krytycznej (obsługa tabeli w etapie 14)
- [ ] Deterministyczny RNG wstrzykiwany z zewnątrz (serwer podaje crypto-losowy, testy — seedowany)
- [ ] Komendy czatu: `/r 1d10+5` (publiczny), `/gr` (rzut MG — widzi tylko MG), `/br` (rzut ukryty przed graczem? — nie: wystarczą publiczny i MG-only)
- [ ] Rzuty WYŁĄCZNIE na serwerze — klient wysyła intencję, serwer liczy i broadcastuje
- [ ] Karta wyniku na czacie: formuła, rozbicie (wartości kości, dorzuty krytyka/fumble'a wyróżnione), suma; stylizacja odróżniająca rzut od zwykłej wiadomości
- [ ] Testy jednostkowe: parser (przypadki brzegowe), krytyk, fumble, łańcuch dorzutów, wykrycie krytycznych obrażeń

## Poza zakresem

- Rzuty z karty postaci (etap 08), animacje 3D (etap 26), automatyka obrażeń (etap 14)

## Kryteria ukończenia

- `/r 1d10+5` zwraca poprawnie rozbity wynik u wszystkich; `/gr` widzi tylko MG (potwierdzone payloadami)
- Testy silnika przechodzą, w tym wymuszone seedem scenariusze 10→dorzut i 1→dorzut
- Silnik nie ma żadnych importów z serwera/klienta (czysta logika)

## Wskazówki techniczne

- API silnika projektuj pod przyszłych konsumentów: etap 08 (karta), 14–15 (walka), 19 (boty) będą wołać te same funkcje — zwracaj ustrukturyzowany wynik (JSON z rozbiciem), nie string
- Wynik rzutu zapisuj w DB jako wiadomość czatu typu `roll` z payloadem JSON — rendering po stronie klienta
