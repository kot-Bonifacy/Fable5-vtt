# Etap 29a — Punkty Doświadczenia: drabinki, przyznawanie, wydawanie

**Faza:** H — Świat CP RED · **Wymaga etapów:** 07 (karta postaci), 25a (Rola i Umiejętności),
27c (druga strona karty), 30a–30d (Zdolności, które mają co robić z rangą)

> **Podział z 2026-08-30** — patrz `etap-29-rozwoj-postaci-pd.md`.

## Cel sesji

Kampania zyskuje awans. Dziś `improvementPoints` to goły licznik, który właściciel karty
przepisuje ręcznie, a `multiplier` przy umiejętnościach nosi komentarz „unused until stage 24" —
postać po dziesięciu sesjach jest dokładnie tą samą postacią, którą wyszła z kreatora.

## Zakres

- [x] **Trzy drabinki kosztów** (s. 411) — Umiejętność zwykła 20/40/…/200, Umiejętność ×2
      40/80/…/400 (to jest właśnie `multiplier` czekający od 25a), Zdolność Specjalna
      60/120/…/600. Koszt płaci się za poziom **docelowy**
- [x] **Zakaz przeskakiwania poziomów** — z 3 na 4, nigdy z 3 na 5; wydatek walidowany
      w `shared`, nie w formularzu
- [x] **Wykupienie nowej Umiejętności** — „lub wykupywać nowe Umiejętności" (s. 408): poziom 1
      umiejętności, której na karcie nie ma, kosztuje pierwszy szczebel drabinki
- [x] **Wydawanie PD z karty** — jeden ekran: co mogę podnieść, ile to kosztuje, ile mi zostanie
- [x] **Przyznawanie PD po sesji** (s. 410) — MG wpisuje pulę, wg stylu gry; VTT nie zgaduje
- [x] **Rejestr awansów przy karcie** — bliźniak `LedgerEntry` z 23b: przyznanie, wydatek,
      korekta MG; wiersz mówi co, za ile i ile zostało
- [x] **Zamknięcie tylnych drzwi** — `improvementPoints`, poziomy Umiejętności i
      `roleAbilityRank` wypadają z gracza; MG edytuje dalej, a jego zmiana PD zostawia wiersz
- [x] Testy: trzy drabinki, odmowa przeskoku, pula po wydatku, koszt ×2, nowa Umiejętność od
      zera, odmowa przy pustej sakiewce, rejestr

## Poza zakresem

- **Wieloklasowość** — cały etap 29b
- Podnoszenie Cech za PD — RAW tego nie przewiduje poza wyjątkami, których podręcznik nie
  tabelaryzuje
- Automatyczne przyznawanie PD za czyny w grze — MG wpisuje pulę sam (ta sama decyzja co
  przy Reputacji w 23c)
- **„Należy spędzić nieco czasu na obecnym poziomie"** (s. 411) — zdanie o czasie fabularnym,
  którego VTT nie ma czym zmierzyć; idzie do `decyzje-i-uproszczenia.md`, nie do kodu

## Kryteria ukończenia

- [x] Postać po sesji dostaje PD od MG i wydaje je na karcie bez ręcznej edycji liczb
- [x] Próba przeskoczenia poziomu jest odmawiana zdaniem, nie milczeniem
- [x] Podniesienie Ognia ciągłego kosztuje dwa razy tyle, co podniesienie Percepcji na ten
      sam poziom
- [x] Podniesiony Interfejs Netrunnera działa w `netrun.ts` od razu, bez przeładowania
- [x] Gracz nie ma jak podnieść poziomu inaczej niż płacąc

## Wskazówki techniczne

- `multiplier` przy umiejętności **już istnieje** w danych z 25a (siedem umiejętności ×2
  w prywatnym `skills.json`, trzy w publicznej próbce) — to on decyduje o drabince, więc nie
  dokładaj drugiego pola
- Drabinka Zdolności Specjalnej jest jedna dla wszystkich dziesięciu Ról — poziom kupuje się
  tak samo Solo i Nomadzie, różnią się tylko skutki
- Zdolność Specjalna Netrunnera jest jedyną z mechaniką sprzed etapu 30 (`netrun.ts`) —
  podniesienie jej poziomu musi tam natychmiast działać, i to jest test tego etapu
- Sakiewki Specjalizacji z 30b i Tabor z 30d rosną razem z rangą: awans przez PD musi
  przechodzić przez `cpredSpecialtiesProblem`/`cpredFleetSheetProblem` tak samo jak łata karty
