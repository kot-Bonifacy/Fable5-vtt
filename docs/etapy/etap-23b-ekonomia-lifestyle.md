# Etap 23b — Ekonomia: eurodolce, zakupy i lifestyle

**Faza:** H — Świat CP RED · **Wymaga etapów:** 13 (kompendium), 23a (cyborgizacje na karcie)

> **Pochodzenie:** wydzielony z etapu 23 dnia 09.08.2026 (decyzja MG). Druga z trzech części:
> portfel edgerunnera. Zakupy dotykają wszystkich kategorii kompendium naraz — także cyborgizacji
> z 23a, których instalacja czeka tu na pobranie ceny.

## Cel sesji

Pieniądze przestają być liczbą, którą gracz sam sobie poprawia. Zakup z kompendium schodzi z
konta, przelew między postaciami zostawia ślad na czacie, a MG jednym kliknięciem rozlicza
miesiąc życia całej drużynie.

## Zakres

- [x] **Eurodolce jako operacja serwera** — każda zmiana stanu konta przechodzi przez serwer
      i zostawia wpis (audyt „gdzie się podziały pieniądze")
- [x] **Zakup z kompendium** — przycisk „Kup" odejmuje cenę i dodaje przedmiot; brak środków
      blokuje z komunikatem; MG może nadpisać cenę
- [x] **Instalacja cyborgizacji pobiera cenę** (domknięcie 23a) — razem z ceną operacji wg
      montażu (Galeria 100 / Klinika 500 / Szpital 1000 ed, s. 226)
- [x] **Przelewy** — MG → gracz i gracz → gracz, z logiem na czacie
- [x] **Lifestyle** — poziom życia na karcie (tabele z rozdz. 17) i przycisk MG „Rozlicz miesiąc":
      koszty wszystkich postaci naraz, jedno podsumowanie na czacie
- [x] Testy: zakup przy niewystarczających środkach, rozliczenie miesiąca, przelew do postaci
      spoza kampanii

## Poza zakresem

- Sklepy i handel z NPC jako scena → POMYSLY.md
- Generator Nocnego Targowiska
- Długi, raty za leczenie szpitalne i windykatorzy (proza MG)

## Kryteria ukończenia

- [x] Zakup broni odejmuje eurodolce i dodaje przedmiot; brak środków blokuje z komunikatem
- [x] „Rozlicz miesiąc" pobiera koszty lifestyle wszystkich postaci naraz i loguje wynik
- [x] Przelew gracz → gracz zmienia oba konta i zostawia jedną linię na czacie

## Wskazówki techniczne

- Wszystkie operacje na eurodolcach przez serwer z logiem — audyt jest bezcenny w środku sesji
- Ceny w podręczniku chodzą **pasmami** (`CostCategory`), a nie tylko liczbami: wpis bez ceny
  liczbowej musi dać się kupić po cenie pasma
