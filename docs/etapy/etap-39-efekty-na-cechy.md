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

- [ ] Model efektu na karcie: która Cecha, o ile (liczba **zapisana przy nałożeniu**, także gdy
      pochodzi z rzutu 1k6), źródło (nazwa i wpis kompendium), koniec (runda albo czas świata)
- [ ] Rozwiązanie modyfikatorów w jednym miejscu: Cecha efektywna = bazowa + suma efektów,
      z podłogą i sufitem wg podręcznika
- [ ] Przejście przez wartości pochodne (`systems/cpred/derived.ts`): REF rusza Unik, Inicjatywę
      i PT obrony, ZW rusza Atletykę, BC rusza PW — nic z tego nie może zostać z bazową Cechą
- [ ] Rzut z karty pokazuje efekt w rozbiciu („REF 8 − 3 (Lisz)"), tak jak dziś pokazuje rany
- [ ] Nałożenie efektu z wiersza kompendium (narkotyk, chrom bojowy) i ręcznie przez MG
- [ ] Chip na karcie i znacznik na figurze z odliczaniem; „zdejmij" u MG
- [ ] Wygaszanie: w walce przez istniejące hooki tury, poza walką przy skoku zegara z etapu 37
- [ ] Testy: modyfikator wchodzi do rzutu i do wartości pochodnych, wygasa co do rundy i co do
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

- [ ] Nerwosol z kompendium nakłada na kartę efekt „−1k6 REF, ZW i INT na godzinę" z liczbą
      wylosowaną raz i zapisaną
- [ ] Rzut Uniku po nałożeniu efektu liczy się z obniżonym REF i pokazuje to w rozbiciu
- [ ] Efekt wygasa sam: w walce po właściwej rundzie, poza walką po przesunięciu zegara o godzinę
- [ ] Dwa efekty na tę samą Cechę sumują się, a zdjęcie jednego zostawia drugi
- [ ] Cecha nie schodzi poniżej minimum z podręcznika, choćby efekty sumowały się głębiej

## Wskazówki techniczne

- **Efekt jest danymi na karcie, nie gałęzią w kodzie** — ta sama lekcja, którą przyniosły
  dodatki do broni w etapie 31: wiersz kompendium niesie skutek, a kod ma jedną ścieżkę.
- **Wartość rzutu zapisuje się przy nałożeniu.** „1k6" w opisie narkotyku jest instrukcją dla
  chwili nałożenia; efekt trzymający formułę przeliczałby się przy każdym odczycie i karta
  zmieniałaby się sama.
- **Jedno miejsce rozwiązywania Cech.** Jeśli modyfikator dodaje się w rzucie, ale nie w wartości
  pochodnej (albo odwrotnie), karta i kości zaczną mówić dwie różne rzeczy — to jest ten rodzaj
  błędu, który przy stole wychodzi po trzech sesjach.
