# Etap 25a — Kreator postaci: rola, cechy, umiejętności

**Faza:** H — Świat CP RED · **Wymaga etapów:** 06 (kości), 07 (karta), 13 (dane podręcznika)

> **Podział z 2026-08-14.** Etap 25 („Generator postaci — lifepath") niósł w jednym worku
> pipeline danych tworzenia postaci, sześciokrokowy kreator, szkic w bazie, zakupy startowe
> i przekształcanie wroga ze Ścieżki Życia w szkic bota. To zakres dwóch sesji, tak jak przy
> 14→14e i 16→16h, więc etap został podzielony:
>
> - **25a** — mechaniczna połowa: dane ról, cechy, umiejętności, szkielet kreatora ze szkicem
>   w bazie i serwerowymi losowaniami.
> - **25b** — narracyjna połowa: tabele Ścieżek Życia (ogólna i rolowe), ekwipunek startowy,
>   imię i portret, wróg → szkic bota.

## Cel sesji

Kreator, który z pustego miejsca robi postać z Rolą, dziesięcioma Cechami i Umiejętnościami
policzonymi wg zasad podręcznika — zapisywaną jako pełna karta z etapu 07.

## Decyzje MG przed kodem (14.08)

1. **Dwie metody, nie trzy.** Kreator zna **Krawędziarza** („Na skróty" — 1k10 na Cechę
   z szablonu Roli, 86 punktów na 20 umiejętności Roli) i **Kompletny Pakiet** („Wyliczanie" —
   pula 62 punktów na Cechy, 86 punktów na dowolne umiejętności). **Ulicznik (Szablony)**
   wypada z zakresu: to 10 gotowych postaci przepisanych z podręcznika, a nie procedura —
   sensowniej dołożyć je kiedyś jako gotowe karty niż jako trzecią ścieżkę kreatora.
2. **Kreator mieszka w pływającym oknie** (`sheet-window`, idiom karty postaci i edytora
   botów), nie w panelu bocznym ani na pełnym ekranie. Mapa zostaje widoczna, motyw
   dzień/noc z 27a działa od razu.

## Zakres

- [x] **Dane tworzenia postaci przez pipeline z etapu 13** — `tools/import/parse-creation.py`
      czyta rozdziały „Dusza i nowa maszyna" (s. 27–42) i „Wyposażony na Przyszłość"
      (s. 71–90) i zapisuje `data/private/cpred/creation.json`:
  - **szablony Cech** — 10 ról × 10 rzutów × 10 Cech (s. 74–77)
  - **listy umiejętności Ról** — 20 pozycji na Rolę (13 podstawowych + 7 zawodowych, s. 88–89)
  - **umiejętności podstawowe** (13, minimum 2) i pule punktów (Cechy 50/62/70/75/80,
    umiejętności 86) oraz limity (Cecha 2–8, umiejętność 2–6)
  - próbka własnego autorstwa w `data/public/cpred/creation.json`, żeby świeży klon miał
    działający kreator bez podręcznika
- [x] **Silnik w `packages/shared`** (`systems/cpred/creation.ts`) — czyste funkcje z testami:
      koszt punktów (umiejętności ×2 kosztują podwójnie), walidacja limitów i minimów,
      złożenie szkicu w `CpredCharacterData`
- [x] **Szkic w bazie** — model `CharacterDraft`; kreator przeżywa zamknięcie karty
      przeglądarki i wraca w tym samym kroku
- [x] **Kreator w pływającym oknie**, kroki z możliwością cofania:
  1. **Rola** — opis + Zdolność Specjalna na 4
  2. **Cechy** — Krawędziarz (1k10 na Cechę z szablonu Roli) albo Kompletny Pakiet
     (rozdział puli) z żywym podglądem pochodnych (PW, Poważna Rana, Przeżywalność,
     Człowieczeństwo)
  3. **Umiejętności** — lista Roli (Krawędziarz) albo pełna lista (Kompletny Pakiet),
     licznik puli, walidacja limitów
  4. **Podsumowanie** — nazwa postaci i „Utwórz postać"
- [x] **Losowania idą przez serwerowy silnik kości** (etap 06) i zostawiają ślad w dzienniku
      rzutów — uczciwość na sesji zerowej
- [x] Dostępność: MG zawsze, gracz dla siebie (tak jak `character:create` z etapu 07)

## Poza zakresem

- Ścieżki Życia, ekwipunek startowy, portret, wróg → bot (**25b**)
- Ulicznik (Szablony), lifepath dodatków, generator NPC jedną akcją, wydruk karty

## Kryteria ukończenia

- Pełne przejście kreatora obiema metodami kończy się kartą, która otwiera się w etapie 07
  bez błędu i ma poprawne Cechy, pochodne i Umiejętności
- Walidacja limitów potwierdzona testem (Cecha > 8, umiejętność > 6, podstawowa < 2,
  przekroczona pula — każde odmawia z polskim komunikatem)
- Rzut w kreatorze wychodzi z serwera i widać go w dzienniku rzutów
- Szkic przeżywa przeładowanie strony

## Wskazówki techniczne

- Tabele i szablony to **dane**, nie kod — parser anchorem po znanych nazwach umiejętności
  (`terms.py`), tak jak `parse-manual.py`. Szablony Cech czyta się ze **strumienia cyfr**:
  tekst z PDF-a skleja wiersze (`…5 6675767684 677657667757 7765677666 8 …`), ale numer rzutu
  1–10 i dokładnie dziesięć cyfr Cech po nim czytają się deterministycznie.
- Listy umiejętności Ról w tekście są **posortowane alfabetycznie w kolumnie** — to darmowa
  walidacja parsera (i to ona rozstrzyga, gdzie zrzut PDF-a zgubił komórkę).
- Szkic trzymaj jako JSON w jednej kolumnie (jak `BotProfile`) — kształt kreatora będzie się
  jeszcze ruszał w 25b, a migracja na każdą zmianę pola to strata.
