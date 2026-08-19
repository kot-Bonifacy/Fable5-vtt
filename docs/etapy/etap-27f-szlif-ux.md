# Etap 27f — Szlif UX: pomoc, tooltipy, stany, okna

**Faza:** I — Wykończenie · **Wymaga etapów:** 27e (motyw)

> **Podział z 2026-08-19** — patrz `etap-27d-kosci-kubek.md`.

## Cel sesji

Aplikacja przestaje wymagać wiedzy tajemnej. Skróty klawiszowe są wypisane w jednym miejscu,
ikony mówią, co robią, puste listy tłumaczą, dlaczego są puste, a okna pamiętają, gdzie je
postawiono.

## Zakres

- [ ] **Okno pomocy `?`** — pełna lista skrótów: narzędzia mapy, HUD walki, kubek, panele.
      Dziś skróty siedzą w `title` przycisków i w stopce paska, pełnej listy nie ma nigdzie
      (wpis w `POMYSLY.md` z 01.08)
- [ ] **Tooltipy na ikonach** — przegląd wszystkich przycisków ikonowych; każdy ma `title`
      i `aria-label` po polsku, spójnym językiem
- [ ] **Stany puste i ładowania** — każda lista, która bywa pusta (kompendium po filtrze,
      dziennik, handouty, boty, kolejka inicjatywy, wiedza kampanii), dostaje zdanie
      tłumaczące pustkę i, gdy to sensowne, przycisk pierwszego kroku
- [ ] **Okna pamiętają pozycję i rozmiar** — karta, kompendium, handout, okno Sieci,
      ustawienia. Zapis lokalny per użytkownik; okno, które wyjechało poza ekran, wraca
- [ ] **Liczba mnoga** — „1 wpisów · 1 fragmentów" w panelu „Wiedza"; helper `plural`
      istnieje w dzienniku, wystarczy go przenieść (wpis w `POMYSLY.md` z 08.08)
- [ ] Przegląd `POMYSLY.md` — drobne szlify UX z backlogu wciągnąć tutaj, jeśli tanie

## Poza zakresem

- Nowe funkcje mechaniczne; przeprojektowanie układu paneli

## Kryteria ukończenia

- `?` otwiera listę skrótów zgodną z tym, co naprawdę działa
- Każda lista w aplikacji ma sensowny stan pusty
- Zamknięcie i ponowne otwarcie okna stawia je tam, gdzie było — także po przeładowaniu
