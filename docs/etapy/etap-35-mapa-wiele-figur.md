# Etap 35 — Ping, zaznaczanie wielu figur, klonowanie

**Faza:** I — Wykończenie · **Wymaga etapów:** 05 (tokeny), 16e (zaznaczenie i ruch klikiem),
27k (edycja sceny)

> **Pochodzenie:** przegląd z 02.09.2026. Trzy mechaniki, które w Foundry i Roll20 są tak
> oczywiste, że nikt ich nie wymienia w opisie programu — i których tu nie ma ani śladu.

## Cel sesji

Trzy braki, które kosztują MG czas przy każdej walce:

1. **Nie ma jak wskazać miejsca na mapie.** `gm:ping` w `realtime/index.ts` to placeholder
   z etapu 03 (`handler: () => undefined`) — nazwa jest, funkcji nie ma. Dziś „patrzcie na te
   drzwi" pisze się na czacie.
2. **Zaznaczyć można dokładnie jedną figurę.** `selectionStore` trzyma jedno `tokenId`,
   `sceneSelectionStore` jeden obiekt scenerii. Ukrycie sześciu gangerów to sześć kliknięć
   w sześciu menu.
3. **Figury nie da się skopiować.** Postawienie sześciu tych samych gangerów to sześć razy
   „nowy żeton", sześć razy wybór obrazka i sześć razy wpisana nazwa — a potem i tak wszyscy
   nazywają się tak samo.

## Rozstrzygnięcia MG (05.09.2026)

1. **`Delete` figur nie dotyka — zostaje jak było.** Powód odstępstwa nie zniknął: id żetonu
   noszą inicjatywa i runy Sieci, a `Ctrl+Z` cofa usunięcia **scenerii**, nie figur. Grupowe
   usuwanie idzie guzikiem w pasku, z pytaniem niosącym liczbę („Usunąć ze sceny 2 figury?").
2. **Ruch grupowy poza walką tak, w walce nie.** Budżet metrów z 14c jest per figura, więc
   grupowy chwyt byłby jedyną drogą, która go nie widzi. Bramka stoi u klienta
   (`setGroupDragAllowed`), bo to jest gest — serwer i tak sądzi każdy `token:move` osobno.
3. **Ramka na `Shift`+przeciągnięciu, nie na gołym lewym przycisku.** Foundry oddaje lewy
   przycisk ramce, a panoramę przenosi na prawy — tutaj panorama zostaje tam, gdzie była, bo
   `Shift` już znaczy „dokładam" (załamanie trasy z 16e), a przeniesienie panoramy dotknęłoby
   każdego przy stole. Ramka **nie startuje**, gdy w ręku jest narzędzie mapy.
4. **Kopia to świeża figura**, nie wierna kopia wiersza: pełne PW, bez naklejek, bez ran i bez
   listy „boi się". Klonuje się po to, żeby postawić kolejnego przeciwnika, a nie kolejnego trupa.

## Zakres

- [x] `map:ping` — efemeryczny broadcast do pokoju sceny, wzorem `ruler.ts`: bez zapisu w bazie,
      bez `seq`, bez powtórki przy resynchronizacji; kółko z imieniem gasnące po ~2 s
- [x] Ping MG w wariancie „przyciągnij widok" — przesuwa kamerę wszystkim oglądającym scenę
- [x] Martwy `gm:ping` usunięty z rejestru zdarzeń wraz z jego testem
- [x] Zaznaczanie wielu figur: ramka na pustym tle przy narzędziu wskaźnika, `Shift`+klik
      dodaje i odejmuje, `Ctrl`+`A` bierze wszystkie **własne** (gracz) albo wszystkie (MG)
- [x] Operacje grupowe: przesuń (poza walką), ukryj/pokaż, nadaj i zdejmij status, usuń
      (MG, z potwierdzeniem), dodaj do walki
- [x] `token:duplicate` — kopia figury obok oryginału wraz z profilem bojowym statysty;
      Alt+przeciągnięcie robi to samo gestem
- [x] Numeracja przy kopiowaniu: „Ganger" → „Ganger 2" → „Ganger 3" (najniższa wolna liczba
      w obrębie sceny), czysta funkcja w `shared/src/tokens.ts` z testami
- [x] Widoczność: ping nie dociera do nikogo, kto nie ogląda tej sceny; gracz nie pinguje
      w scenie, której nie widzi
- [x] Testy: numeracja przy dziurach w ciągu, uprawnienia grupowych operacji (gracz rusza
      wyłącznie swoimi), ping nie zapisuje się w historii

## Poza zakresem

- **Zapisane grupy figur** („drużyna A") — przy jednej aktywnej sesji ramka wystarcza
- **Sterowanie grupą w walce** — patrz rozstrzygnięcie 2
- **Ping jako trwały znacznik** — od tego są notatki MG (17a) i rysowanie (17b)
- **Kopiowanie między scenami** (kopiuj tu, wklej tam) — osobna robota wokół `sceneId`

## Kryteria ukończenia

- [x] Alt+klik w mapę u gracza rysuje ping u wszystkich oglądających tę scenę, u nikogo innego,
      i nie zostawia po sobie ani wiersza czatu, ani niczego w bazie
- [x] Ramką zaznaczam czterech gangerów i jednym poleceniem ukrywam ich wszystkich
- [x] Alt+przeciągnięcie figury „Ganger" stawia obok „Ganger 2" z tym samym profilem bojowym,
      a trzecie przeciągnięcie — „Ganger 3"
- [x] Zaznaczenie wielu figur i zaznaczenie obiektu scenerii nadal wykluczają się wzajemnie
      (umowa z 27k zostaje w mocy)
- [x] Gracz z ramką na całą mapę dostaje pod kontrolę wyłącznie swoje figury

## Wskazówki techniczne

- **`ruler.ts` jest wzorcem dla pingu co do joty** — łącznie z komentarzem, dlaczego pomiar nie
  ma `seq` i dlaczego prywatny pomiar MG nie leci nigdzie. Ping ma dokładnie te same własności.
- **Zaznaczenie zostaje prywatne.** `selectionStore` nigdy nie jedzie po sieci i to się nie
  zmienia: wiele figur to nadal wskaźnik jednej przeglądarki.
- **Kopia figury kopiuje `combatProfile`**, ale nie kopiuje `characterId` — dwie figury na jednej
  karcie postaci to dwa paski PW nad jednym zestawem punktów.

## Jak to wyszło (05.09.2026)

**Ramka nie zabrała panoramy nikomu.** `Shift`+przeciągnięcie po pustym tle rysuje niebieski
prostokąt i bierze figury, które go **przecięły** (nie te, które się w nim zmieściły — przy
zoomie stołu trafienie w całą figurę bywa trudne). Gest, który nie ruszył się z miejsca, **nie
jest ramką**: to dalej `Shift`+klik dokładający załamanie trasy marszu z 16e.

**Filtr „tylko moje" jest jedną linijką i stoi w rendererze**, bo tylko on ma `movableTokens`.
Tą samą drogą idzie `Ctrl+A` (`selectAllSteerable`), więc dwie listy „co wolno wziąć" nie mają
jak się rozjechać. Sprawdzone z konta gracza: ramka na całą mapę wzięła **jedną** figurę z
siedmiu widocznych.

**Jeden błąd znaleziony przy oględzinach i naprawiony w trakcie:** po ramce lewy panel opisywał
kotwicę, a mapa nie miała pierścienia sterowania i klik w podłogę nikogo nie wysyłał w drogę.
Kotwicę grupy wybiera **store** (tylko on wie, co wyszło z `Shift`+kliknięcia), a renderer jest
jej lustrem — potrzebna była droga wyrównania, która nie odsyła zmiany z powrotem
(`syncSteering`), bo zwykły wybór figury świadomie zeruje grupę.

**Drugi drobiazg z oględzin:** przy trzymanym `Alt` mapa dalej malowała ślady butów, choć klik
miał zrobić ping. Podgląd trasy stoi teraz pod `Alt` (`pingArmed`) — obiecywał marsz, którego
ten gest nie wykona.

**Ping ma trzy fale zamiast jednej.** Jedno kółko na dwusekundowym zaniku ginie w tle mapy;
trzy rozchodzące się czyta się jak puknięcie w stół. Podpis to imię pingującego, w barwie
cyjanowej, której na mapie nie nosi nic innego.
