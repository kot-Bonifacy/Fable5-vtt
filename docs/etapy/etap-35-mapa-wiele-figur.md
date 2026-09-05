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

## Do rozstrzygnięcia z MG przed kodem

1. **Czy `Delete` ma zacząć kasować figury?** Dziś świadomie nie kasuje (`sceneSelectionStore`:
   „świadome odstępstwo od Foundry: id żetonu noszą inicjatywa i runy Sieci"). Zaznaczenie wielu
   figur robi ten klawisz kuszącym — ale powód odstępstwa nie zniknął. Propozycja: zostaje
   jak jest, grupowe usuwanie idzie przez menu z potwierdzeniem.
2. **Czy grupowy ruch działa w trakcie walki?** Budżet metrów z 14c jest per figura.
   Propozycja: poza walką dla MG bez ograniczeń, w walce grupowo **nie** — inaczej ekonomia
   ruchu przestaje cokolwiek znaczyć.

## Zakres

- [ ] `map:ping` — efemeryczny broadcast do pokoju sceny, wzorem `ruler.ts`: bez zapisu w bazie,
      bez `seq`, bez powtórki przy resynchronizacji; kółko z imieniem gasnące po ~2 s
- [ ] Ping MG w wariancie „przyciągnij widok" — przesuwa kamerę wszystkim oglądającym scenę
- [ ] Martwy `gm:ping` usunięty z rejestru zdarzeń wraz z jego testem
- [ ] Zaznaczanie wielu figur: ramka na pustym tle przy narzędziu wskaźnika, `Shift`+klik
      dodaje i odejmuje, `Ctrl`+`A` bierze wszystkie **własne** (gracz) albo wszystkie (MG)
- [ ] Operacje grupowe: przesuń (poza walką), ukryj/pokaż, nadaj i zdejmij status, usuń
      (MG, z potwierdzeniem), dodaj do walki
- [ ] `token:duplicate` — kopia figury obok oryginału wraz z profilem bojowym statysty;
      Alt+przeciągnięcie robi to samo gestem
- [ ] Numeracja przy kopiowaniu: „Ganger" → „Ganger 2" → „Ganger 3" (najniższa wolna liczba
      w obrębie sceny), czysta funkcja w `shared/src/tokens.ts` z testami
- [ ] Widoczność: ping nie dociera do nikogo, kto nie ogląda tej sceny; gracz nie pinguje
      w scenie, której nie widzi
- [ ] Testy: numeracja przy dziurach w ciągu, uprawnienia grupowych operacji (gracz rusza
      wyłącznie swoimi), ping nie zapisuje się w historii

## Poza zakresem

- **Zapisane grupy figur** („drużyna A") — przy jednej aktywnej sesji ramka wystarcza
- **Sterowanie grupą w walce** — patrz rozstrzygnięcie 2
- **Ping jako trwały znacznik** — od tego są notatki MG (17a) i rysowanie (17b)
- **Kopiowanie między scenami** (kopiuj tu, wklej tam) — osobna robota wokół `sceneId`

## Kryteria ukończenia

- [ ] Alt+klik w mapę u gracza rysuje ping u wszystkich oglądających tę scenę, u nikogo innego,
      i nie zostawia po sobie ani wiersza czatu, ani niczego w bazie
- [ ] Ramką zaznaczam czterech gangerów i jednym poleceniem ukrywam ich wszystkich
- [ ] Alt+przeciągnięcie figury „Ganger" stawia obok „Ganger 2" z tym samym profilem bojowym,
      a trzecie przeciągnięcie — „Ganger 3"
- [ ] Zaznaczenie wielu figur i zaznaczenie obiektu scenerii nadal wykluczają się wzajemnie
      (umowa z 27k zostaje w mocy)
- [ ] Gracz z ramką na całą mapę dostaje pod kontrolę wyłącznie swoje figury

## Wskazówki techniczne

- **`ruler.ts` jest wzorcem dla pingu co do joty** — łącznie z komentarzem, dlaczego pomiar nie
  ma `seq` i dlaczego prywatny pomiar MG nie leci nigdzie. Ping ma dokładnie te same własności.
- **Zaznaczenie zostaje prywatne.** `selectionStore` nigdy nie jedzie po sieci i to się nie
  zmienia: wiele figur to nadal wskaźnik jednej przeglądarki.
- **Kopia figury kopiuje `combatProfile`**, ale nie kopiuje `characterId` — dwie figury na jednej
  karcie postaci to dwa paski PW nad jednym zestawem punktów.
