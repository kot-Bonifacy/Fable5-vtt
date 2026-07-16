# Etap 24 — Generator postaci (lifepath)

**Faza:** H — Świat CP RED · **Wymaga etapów:** 12, 22

⚠️ **Wymaga materiałów od Ciebie:** rozdziały podręcznika: tworzenie postaci (metody statystyk, pakiety umiejętności ról, wyposażenie startowe) i pełne tabele lifepath — przez pipeline z etapu 12.

## Cel sesji

Kreator postaci krok po kroku: od wyboru roli, przez statystyki i umiejętności, po lifepath z tabel — kończący się kompletną, grywalną kartą.

## Zakres

- [ ] Rozszerzenie pipeline'u o dane tworzenia postaci: tabele lifepath, pakiety startowe ról, metody generowania statystyk
- [ ] Kreator wieloetapowy (wizard z możliwością cofania):
  1. rola (opis + zdolność roli)
  2. statystyki — metody z podręcznika (losowanie przez silnik kości / pakiety punktów) z podglądem pochodnych (HP, humanity)
  3. umiejętności — pakiet roli + punkty do rozdania, walidacja limitów
  4. lifepath — kolejne tabele (pochodzenie, rodzina, motywacje, przyjaciele, wrogowie, romanse…): losowanie `1d10` albo wybór ręczny; wynik jako sekcja biografii na karcie
  5. wyposażenie startowe — pakiet roli + zakupy za startowe eddies (kompendium + ekonomia z etapu 22)
  6. dane opisowe — imię, portret (upload), styl
- [ ] Zapis w dowolnym momencie jako szkic; ukończenie tworzy pełną kartę (etap 07) z tokenem
- [ ] Dostępność: MG zawsze; gracze — jeśli MG włączy (tworzenie własnych postaci)
- [ ] Wrogowie/przyjaciele/romanse z lifepath zapisywani tak, by dało się ich jednym kliknięciem przekształcić w szkic NPC/bota (nazwa + relacja trafiają do profilu z etapu 10)

## Poza zakresem

- Generator kompletnych NPC jedną akcją (statbloki — POMYSLY.md), lifepath rozszerzeń/dodatków, wydruk karty

## Kryteria ukończenia

- Pełne przejście kreatora: od roli do gotowej karty z biografią z lifepath, poprawnymi statystykami (walidacja limitów potwierdzona testem) i startowym ekwipunkiem
- Losowania w kreatorze idą przez serwerowy silnik kości i są logowane (uczciwość na sesji zerowej!)
- Wróg z lifepath przekształcony w szkic bota pojawia się w edytorze botów

## Wskazówki techniczne

- Tabele lifepath to dane (etap 12), kreator tylko je odtwarza — żadnych treści tabel w kodzie
- Stan kreatora trzymaj jako dokument szkicu w DB (odporność na zamknięcie karty przeglądarki w połowie)
- Sesja zerowa z drużyną to najlepszy test tego etapu — zaplanuj ją po jego ukończeniu
