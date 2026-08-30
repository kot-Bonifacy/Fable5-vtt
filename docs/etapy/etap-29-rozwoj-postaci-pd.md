# Etap 29 — Rozwój postaci za Punkty Doświadczenia (rozdzielony)

**Faza:** H — Świat CP RED

> **Rozdzielony 2026-08-30 na 29a i 29b.** Ten plik jest rozdrożem, nie zakresem do zrobienia.
> Zakres mieszka w dwóch plikach niżej.

## Dlaczego rozdzielony

Sześć punktów pierwotnego zakresu to **dwie osobne rzeczy**, które łączy tylko waluta.
Drabinki kosztów, przyznawanie i wydawanie PD zmieniają **kto pisze po karcie** — nie ruszają
jej kształtu. Wieloklasowość zmienia **kształt karty**: `roleId` przestaje być jednym polem,
a `cpredRoleAbilityRank` — punkt, przez który przechodzi wszystkie dziesięć Zdolności z etapu
30 — przestaje pytać o jedną Rolę.

Kolejność jest wymuszona przez podręcznik, a nie przez wygodę: „możesz wydać Punkty Ulepszenia
na wykupienie 1. poziomu Zdolności Specjalnej nowej Roli" (s. 143) — wieloklasowość **płaci
PD**, więc bez 29a nie ma czym kupić drugiej Roli.

| etap                               | zakres                                                           | co go wyznacza        |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------- |
| `etap-29a-punkty-doswiadczenia.md` | trzy drabinki, zakaz przeskoku, przyznawanie, wydawanie, rejestr | kto pisze po karcie   |
| `etap-29b-wieloklasowosc.md`       | druga i trzecia Rola, bramka ≥ 4, panele wielu Zdolności         | jaki kształt ma karta |

## Poprawione przy podziale (30.08.2026)

Pierwotny opis etapu miał dwa błędy, oba sprawdzone na stronach podręcznika:

- **Drabinka kosztów była jedna zamiast trzech.** Opis mówił „60/120/180/…/600 PD za kolejny
  poziom, ×2 dla umiejętności podwójnych". Podręcznik (s. 411) drukuje trzy osobne tabele:
  Umiejętność zwykła 20/40/…/200, Umiejętność ×2 40/80/…/400 i **Zdolność Specjalna**
  60/120/…/600. Ciąg 60/120/…/600 należy więc do Zdolności, a nie do Umiejętności, a `multiplier`
  z 25a mnoży wyłącznie te drugie — Zdolność mnożnika nie ma.
- **Bramka wieloklasowości była opisana niepełnie.** „Zmiana Roli przy Zdolności Specjalnej ≥ 4"
  jest prawdą przy **pierwszej** zmianie. Przy kolejnej podręcznik pyta o Zdolność Roli
  **bieżącej**: „Po zmianie Roli nie możesz wybrać kolejnej Roli, dopóki nie podniesiesz poziomu
  Zdolności Specjalnej swojej nowej Roli do 4" (s. 143). Sufit liczy się od Roli, przez którą
  widzi cię Ulica, a nie od najwyższej, jaką masz.

## Decyzje MG przed podziałem (30.08.2026)

- **Ślad awansu ma własny rejestr przy karcie** (bliźniak `LedgerEntry` z 23b), a nie wpisy
  w dzienniku kampanii z 24b. Dziennik jest prozą indeksowaną do RAG-u — dwadzieścia wierszy
  „Percepcja 4 → 5" na sesję zasypałoby streszczenia z 19c szumem.
- **Gracz wydaje PD sam, MG je przyznaje.** Serwer pilnuje drabinki i zakazu przeskoku, więc
  nielegalnego awansu kupić się nie da; rozmowa o tym, _co_ wypada kupić, zostaje przy stole,
  tak jak chce s. 411.
- **Poziomy Umiejętności i ranga Zdolności stają się polami MG.** U gracza są tylko do odczytu —
  jedyna droga w górę wiedzie przez wydanie PD. To te same drzwi, które `eddies` zamknęły w 23b:
  cena z otwartym wejściem obok nie jest ceną.
