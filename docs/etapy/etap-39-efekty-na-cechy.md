# Etap 39 — Efekty czasowe modyfikujące Cechy

**Faza:** H — Świat CP RED · **Wymaga etapów:** 14e (automaty tury i DoT), 16h (efekty wygasające),
**37 (kalendarz i upływ czasu)**

> **Pochodzenie:** przegląd z 02.09.2026 oraz wpis w `POMYSLY.md` z 15.08.2026 („trwałe
> modyfikatory Cech z zegarem godzinnym"). W Foundry to Active Effects — jeden z filarów całego
> programu; tutaj nie ma żadnego sposobu, żeby coś obniżyło REF na godzinę.

## Cel sesji

VTT umie dziś nakładać **statusy** (`token.statuses`) i **efekty wygasające w rundach**
(`CpredTimedEffect`), ale nie umie jednego: zmienić liczby na karcie na jakiś czas. Podręcznik
tego wymaga w kilkunastu miejscach — Nerwosol i Lisz obniżają INT, REF i ZW o 1k6 na godzinę,
Synteza Bojowa podnosi, rany i narkotyki tną RUCH.

Dlaczego dopiero po etapie 37: `timed.ts` liczy czas **rundami walki** (`cpredExpiryRound`),
a „godzina" poza starciem nie ma dziś na czym wisieć. Zegar świata jest warunkiem, żeby ten etap
w ogóle miał sens.

## Zakres

- [x] Model efektu na karcie: która Cecha, o ile (liczba **zapisana przy nałożeniu**, także gdy
      pochodzi z rzutu 1k6), źródło (nazwa i wpis kompendium), koniec (runda albo czas świata)
- [x] Rozwiązanie modyfikatorów w jednym miejscu: Cecha efektywna = bazowa + suma efektów,
      z podłogą i sufitem wg podręcznika
- [x] Przejście przez wartości pochodne (`systems/cpred/derived.ts`): REF rusza Unik, Inicjatywę
      i PT obrony, ZW rusza Atletykę — **z wyjątkiem PUL: maks. PW, pula SZ i sufit
      Człowieczeństwa zostają przy Cesze bazowej** (decyzja MG z 05.09; „BC rusza PW" z tego
      zdania **nie** zostało zrobione, bo `normalizeCharacterData` przycinałoby PW na stałe —
      pełne uzasadnienie w `decyzje-i-uproszczenia.md`). BC rusza natomiast Rzut na Śmierć
      i obrażenia wręcz.
- [x] Rzut z karty pokazuje efekt w rozbiciu („REF 8 − 3 (Lisz)"), tak jak dziś pokazuje rany
- [x] Nałożenie efektu z wiersza kompendium (narkotyk, chrom bojowy) i ręcznie przez MG
- [x] Chip na karcie i znacznik na figurze z odliczaniem; „zdejmij" u MG
- [x] Wygaszanie: w walce przez istniejące hooki tury, poza walką przy skoku zegara z etapu 37
- [x] Testy: modyfikator wchodzi do rzutu i do wartości pochodnych, wygasa co do rundy i co do
      godziny, dwa efekty na tę samą Cechę sumują się, Cecha nie schodzi poniżej minimum

## Poza zakresem

- **Efekty modyfikujące Umiejętności** (a nie Cechy) — ta sama maszyneria, ale osobna decyzja
  o zakresie; najpierw Cechy, bo to one ciągną wartości pochodne
- **Pełne trucizny i narkotyki z RAW** (testy Odporności, uzależnienie) — wpis w `POMYSLY.md`
  z 31.07 zostaje osobnym kandydatem; ten etap daje im fundament
- **Efekty na figurach bez karty** — statysta ma liczby w `combatProfile`; jeśli okaże się
  potrzebny, dokłada się go jako drugą ścieżkę po sprawdzeniu, że pierwsza działa
- **Aury i efekty obszarowe** („wszyscy w promieniu 5 m") — strefy z 26f robią co innego

## Kryteria ukończenia

- [x] Nerwosol z kompendium nakłada na kartę efekt „−1k6 REF, ZW i INT na godzinę" z liczbą
      wylosowaną raz i zapisaną — **automatycznie**, po trafieniu Czarnym LOD-em
      (`NET_PROGRAM_HOOKS_MANUAL` jest odtąd pustą listą); test w `netcombat.test.ts`
- [x] Rzut Uniku po nałożeniu efektu liczy się z obniżonym REF i pokazuje to w rozbiciu
- [x] Efekt wygasa sam: w walce po właściwej rundzie, poza walką po przesunięciu zegara o godzinę
- [x] Dwa efekty na tę samą Cechę sumują się, a zdjęcie jednego zostawia drugi
- [x] Cecha nie schodzi poniżej minimum z podręcznika, choćby efekty sumowały się głębiej —
      **z jednym wyjątkiem: podłoga nigdy nie stoi wyżej niż wartość bazowa**, żeby Empatia
      zerowa z cyberpsychozy (s. 229) nie została przez nią podniesiona

## Wskazówki techniczne

- **Efekt jest danymi na karcie, nie gałęzią w kodzie** — ta sama lekcja, którą przyniosły
  dodatki do broni w etapie 31: wiersz kompendium niesie skutek, a kod ma jedną ścieżkę.
- **Wartość rzutu zapisuje się przy nałożeniu.** „1k6" w opisie narkotyku jest instrukcją dla
  chwili nałożenia; efekt trzymający formułę przeliczałby się przy każdym odczycie i karta
  zmieniałaby się sama.
- **Jedno miejsce rozwiązywania Cech.** Jeśli modyfikator dodaje się w rzucie, ale nie w wartości
  pochodnej (albo odwrotnie), karta i kości zaczną mówić dwie różne rzeczy — to jest ten rodzaj
  błędu, który przy stole wychodzi po trzech sesjach.

## Co z tego wyszło (05.09.2026)

Etap ukończony w jednej sesji. Rdzeń: `shared/src/systems/cpred/stateffects.ts` (model, jedna
funkcja rozwiązująca Cechy, dwa zegary, etykiety, czytnik), zdarzenie `character:stat-effect`
w `server/src/realtime/stat-effects.ts`, dwa przemiatania (rundowe w `timed-effects.ts`, światowe
wołane z `gametime.ts`), panel na karcie i chipy w pasku figury.

**Trzy rozstrzygnięcia MG przed kodem** — pule z bazowej Cechy, podłoga 1, Czarny LOD nakłada sam;
pierwsze dwa są zapisane w `decyzje-i-uproszczenia.md`, trzecie unieważniło decyzję z 15.08
(„stosuje MG"), która uzasadniała się wprost brakiem modelu zbudowanego w tym etapie.

**Poza zakresem zostało to, co było poza zakresem:** efekty na Umiejętnościach, pełne trucizny
i narkotyki z RAW, efekty na figurach bez karty (statyści) i aury obszarowe.

**Nie oglądane w przeglądarce** — pozycja otwarta w `zaleglosci.md`.
