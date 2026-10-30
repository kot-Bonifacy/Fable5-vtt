# Etap 64 — Szybka wymiana wzorem BG3

**Faza:** przed betą (zlecenie MG z 30.10 spoza planu) · **Wymaga etapów:** 38c (handel),
46a–46b (jedno okno „Wymiana”, pojemniki), 55 (komunikaty)

## Skąd ten etap

MG (30.10): „dodaj jakąś mechanikę szybszego przekazywania wielu przedmiotów jednej osobie.
Wzoruj się w handlu, przekazywaniu przedmiotów itp. na rozwiązaniach z klasycznych cRPG typu
Baldur's Gate 3, gdzie postaci w jednym oknie widzę swoje inventory (tu może być uproszczone),
pośrodku jest obszar, w którym umieszcza się przedmioty na wymianę, aby przy uzgodnieniu warunków
zatwierdzić wymianę. Przedmioty się przeciąga.” Dopisek: „a w zasadzie widzą swoje inventory i to,
co przeciwna strona umieści w oknie wymiany”.

Okno „Wymiana” z 38c/46a miało już trzy kolumny (mój ekwipunek, moje pole, pole drugiej strony),
przeciąganie i dwie zgody. Oględziny przed etapem (spec E2E na `po-T6`, Chromium + Firefox):

- oddanie trzech rzeczy to 7 kroków dwóch osób: zaproszenie, trzy „→”, „Przyjmij” w doku i dwie
  zgody, a zgody przed przyjęciem zaproszenia w ogóle nie było;
- u zaproszonego kolumny stały w innej kolejności niż u zapraszającego (jego ekwipunek | pole
  drugiej strony | jego pole) — przeciągał przez cudze pole;
- okno 1100 px szerokości, wiersze w górnej ćwiartce, reszta pusta.

## Decyzje MG z 30.10 (pytania na starcie)

1. **Co boli:** za dużo klikania zgód i trudno trafić do okna (zasięg ręki i jedna rzecz na
   przeciągnięcie — nie).
2. **Zaznaczanie wielu:** Ctrl/Shift + przeciągnięcie grupy, dwuklik kładzie w pole.
3. **Prezent dla kolegi:** dalej zgoda obu stron.
4. **Wygląd:** siatka kafelków jak w BG3.
5. **Zgody:** zapraszający zgadza się z góry, a dok zaproszonego pokazuje, co dostaje, i jedno
   „Przyjmij” przyjmuje zaproszenie razem ze zgodą.
6. **Nowe wejścia do okna:** żadne — wystarczy menu figury, karta i dok.
7. **Układ handlu:** mój ekwipunek po lewej, na środku moje pole nad polem drugiej strony.
8. **Zasięg siatki:** całe okno (łup, pojemnik, handlarz, tryb MG), nie tylko handel.

## 64a — zgoda z góry i „Przyjmij” ze zgodą ✅

- [x] `mayAcceptTrade` (`shared/src/trade.ts`): zapraszający zgadza się w stanie `invited`,
      zaproszony nie; gotowy jest dalej tylko handel `open` z dwiema zgodami.
- [x] `trade:respond` z `agree` i `version` (`TradeRespondPayload`): przyjęcie + zgoda; przy
      zgodzie zapraszającego z góry wymiana dzieje się w tym samym kroku. Zgoda na nieaktualną
      wersję (`TRADE_CHANGED`) zostawia handel przyjęty, bez zgody.
- [x] Wspólne `settleAccept` dla `trade:accept` i `trade:respond`.
- [x] Dok: „daje: Latarka × 3, …” (z „✔ zgoda”), „Przyjmij” (ze zgodą), „Negocjuj” (bez zgody),
      „Odrzuć”. Przy pustym polu zapraszającego — „Przyjmij” jak dawniej.
- [x] Okno: „Zgadzam się” u zapraszającego już w stanie zaproszenia.
- [x] Testy: `shared/src/trade.test.ts`, `server/src/trade.test.ts` (prezent jednym kliknięciem,
      „Przyjmij” przed zgodą zapraszającego, nieaktualna wersja).

## 64b — siatka kafelków i nowy układ handlu ✅

- [x] `components/exchange/ItemGrid.tsx`: `ItemGrid`, `useGridSelection`, `useItemTile`,
      `countLabel`. Kafel: sylwetka (bez sylwetki — torba `hud/swap-bag.svg`), nazwa w dwóch
      liniach, liczba sztuk w rogu, cena na dole; puste kratki dopełniają rzędy (`ResizeObserver`).
      Zaznaczanie: klik, Ctrl+klik, Shift+klik, Ctrl+A, Esc; dwuklik i Enter robią akcję kolumny,
      przeciągnięcie kafla z zaznaczenia niesie całe zaznaczenie. Pasek pod siatką: nazwa
      i szczegóły wybranego, pole ilości stosu, przycisk akcji z liczbą rzeczy.
- [x] `TradePane`: ekwipunek | (Daję nad „X daje”), u obu stron ta sama kolejność; grupa to jedno
      `trade:offer`. Podgląd MG — dwa pola obok siebie.

## 64c — siatka w pozostałych trybach okna ✅

- [x] `OwnInventoryColumn` (pojemnik, łup, okno bez drugiej strony): siatka, grupa na mapę to
      jeden „Stos”, do pojemnika dwuklikiem / „Włóż →” / przeciągnięciem; kolumna jest strefą `own`.
- [x] `TakeGrid` (ciało i otwarty pojemnik): dwuklik, „← Weź”, przeciągnięcie na mój ekwipunek.
- [x] `GmPane`: siatka „Skąd”, „Przekaż →”, przeciągnięcie na „Dokąd”.
- [x] `MerchantPane`: cztery siatki (odkup na kaflu ekwipunku, „Sprzedaję”, „Kupuję”, półka
      z ceną i „∞”); ilość w polach na pasku.
- [x] E2E przepięte na kafle: `t46a`, `t46b`, `t4b`, `t6a`, `t7a`.

## Kryteria ukończenia

- [x] Prezent dla kolegi z drużyny: zapraszający zaznacza kilka rzeczy, jednym ruchem kładzie je
      w pole i się zgadza, zaproszony kończy wymianę jednym „Przyjmij” w doku.
- [x] U obu stron okno ma tę samą kolejność: mój ekwipunek, moje pole, pole drugiej strony.
- [x] Każda kolumna okna „Wymiana” to siatka kafli z zaznaczaniem wielu i przeciąganiem grupy.
- [x] Testy `shared` i serwera przechodzą, E2E wymiany zielone, oględziny w Chromium i Firefoksie.

## Rozstrzygnięcia bez pytań

- **„Negocjuj”** — drugi przycisk w doku, gdy zapraszający już coś położył: przyjmuje zaproszenie
  bez zgody, żeby dołożyć coś od siebie. Bez niego „Przyjmij” byłoby jedyną drogą do okna.
- **Pole ilości tylko na pasku** — kafel go nie mieści; pokazuje się przy jednym zaznaczonym stosie.
  W polu wymiany pole nie ma sufitu (przycina serwer), na półce sufitem jest stan półki.
- **Zwykły klik w kafel z większego zaznaczenia zwija je dopiero po 350 ms** — dwuklik w taki kafel
  działa na całym zaznaczeniu, jak w eksploratorze plików.
- **Kafel nie ma przycisku „→”** — akcja to dwuklik, Enter albo przycisk na pasku; E2E klikają
  `.item-tile[data-item-name="…"]`.
