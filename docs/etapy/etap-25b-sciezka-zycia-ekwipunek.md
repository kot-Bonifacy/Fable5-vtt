# Etap 25b — Kreator postaci: Ścieżka Życia i wyposażenie startowe

**Faza:** H — Świat CP RED · **Wymaga etapów:** 25a, 23b (ekonomia), 10 (edytor botów)

> Druga z dwóch części podziału opisanego w `etap-25a-kreator-cechy-umiejetnosci.md`.

## Cel sesji

Narracyjna połowa kreatora: wędrówka Ścieżkami Życia z tabel podręcznika, ekwipunek startowy
za startowe eurodolce i wróg z lifepath, który jednym kliknięciem staje się szkicem bota.

## Zakres

- [ ] **Tabele Ścieżek Życia w pipelinie** (rozdział „Uliczne opowieści", s. 43–70):
  - **ogólna** — kultura pochodzenia i język, osobowość, ubiór, włosy, znaki szczególne,
    co cenisz najbardziej, relacje z innymi, najważniejsza osoba, najważniejszy przedmiot,
    tło i środowisko rodzinne, kryzys rodzinny, przyjaciele, wrogowie, romanse, cele życiowe
  - **rolowe** — po jednej Ścieżce dla każdej z 10 Ról
- [ ] **Krok „Ścieżka Życia" w kreatorze** — kolejne tabele z wyborem „rzuć 1k10" albo „wybierz
      ręcznie"; wynik ląduje w polach karty (te same, które rysuje etap 27c), a nie w prozie
- [ ] **Krok „Wyposażenie startowe"** — zakupy z kompendium za startowe eurodolce
      (Krawędziarz: pakiet Roli + 500 ed; Kompletny Pakiet: 2550 ed + 800 ed na modę),
      przez ten sam mechanizm co „Kup" z etapu 23b
- [ ] **Krok „Dane opisowe"** — imię, ksywa, portret (upload jak w etapie 07)
- [ ] **Ukończenie tworzy postać z tokenem** (dziś kreator z 25a tworzy samą kartę)
- [ ] **Wróg / przyjaciel / romans z lifepath → szkic bota** — nazwa i relacja trafiają do
      profilu z etapu 10 jednym kliknięciem

## Poza zakresem

- Generator kompletnych NPC jedną akcją (POMYSLY.md), lifepath rozszerzeń, wydruk karty

## Kryteria ukończenia

- Pełne przejście kreatora od Roli do gotowej karty z biografią ze Ścieżki Życia i startowym
  ekwipunkiem
- Losowania w kreatorze idą przez serwerowy silnik kości i są logowane
- Wróg z lifepath przekształcony w szkic bota pojawia się w edytorze botów

## Wskazówki techniczne

- Pola Ścieżki Życia w `CpredCharacterData` **dzieli z etapem 27c** — kto pierwszy, ten je
  definiuje; drugi tylko dokłada widok albo zapis.
- Sesja zerowa z drużyną to najlepszy test tego etapu — zaplanuj ją po jego ukończeniu.
