# Etap 69 — Lewa belka bez ramek: tusz, trzy rozmiary przycisków, koszt na przycisku

**Faza:** przed betą (zlecenie MG z 10.11 spoza planu) · **Wymaga etapów:** 27h (twarz paska),
63a (kropki ataków), 50c (trwały cel), 10.11 (kubek przestawiany)

## Skąd ten etap

MG (10.11): „zaprojektuj nowy wygląd lewej belki HUD, aby miała bardziej naturalny wygląd (mniej
generycznych prostokątów), przyciski różniły się wielkością i kształtem i były bardziej
funkcjonalne”.

Stan przed etapem: portret 4:3 w ramce z czarnym podpisem, trzy chipy z ikonami (SP, RUCH, EMP),
czarne belki „Broń” i „Akcje”, pod nimi jednakowe wiersze na całą szerokość — broń,
przeładowanie i każda akcja z katalogu ten sam prostokąt z kolorową lewą krawędzią; „Kończę
turę” jako czarno-czerwony blok nad kubkiem.

## Decyzje MG

Pytania na starcie (10.11):

1. **Kierunek:** „bez ramek, tusz i odstępy” — żadnych teł i obwódek, sekcje dzieli światło
   i pociągnięcie pędzla, aktywny element dostaje plamę koloru. (Odrzucone: „przedmioty na
   stole”, „druk z podręcznika” ze ściętymi kształtami.)
2. **Hierarchia:** trzy rozmiary — broń duża, akcje brane co turę średnie (Bieg, Skok,
   Skradanie), rzadkie akcje jako same ikony.
3. **Funkcje:** przeładowanie przy broni, koszt na przycisku, liczby broni na kaflu.
   **Nie:** chowanie akcji bez sensu w danej chwili (zostają wyszarzone z powodem).
4. **Tryb pracy:** makieta z wariantami, potem kod.

Po makiecie (trzy warianty: A „Tusz”, B „Plamy”, C „Czarny tusz”):

5. **Wariant A**, a do niego: portret wyższy o ok. 25 % u dołu, podświetlenie każdego klikalnego
   elementu pod kursorem, opis po chwili trzymania kursora tam, gdzie funkcja nie jest
   oczywista, kubek o ok. 25 % większej średnicy.

W trakcie oględzin (11.11):

6. **Skróty 1–9 znikają** („nikt ich nie używa”) — razem z `Shift + 1…9` (tryb ognia).
7. **Linijka „najedź na ikonę — nazwa i koszt” znika** („nadmiarowa”) — nazwę ikony mówi dymek.

## Co zrobione

- **Portret** bez ramki, kadr 16:15 (`PORTRAIT_BANNER_ASPECT` = 15/16, było 3/4): naddarty brzeg,
  dół gaśnie w papier, imię (Anton) stoi na przejściu. Figura bez portretu nie ma kadru wcale.
  Własne kadry banera trzymają punkt i przybliżenie — ramka tylko sięga niżej.
- **PW** to pociągnięcie pędzla z liczbą za nim; **SP / RUCH / EMP** to liczba ze słowem.
- **Budżet tury** (`TurnBudget`, wariant `rail`) bez belki: kropka to Akcja i jej ataki, skośna
  kreska to ruch, metry to poszarpana belka tuszem.
- **Broń** — duży kafel: sylwetka (czerwona plama pod bronią w ręku), nazwa, obrażenia, SS,
  kropki ataków, tryb, magazynek z łusek, zapas. W prawym dolnym rogu kafla narzędzia tej broni:
  **Przeładuj**, **Usuń usterkę**, szuflada trybów. Odmowa gasi kafel, nie narzędzia.
- **„W ręku”** stoi pod kaflem broni: z trwałym celem (`T`) pisze „Hak · 7 m · PT 15”, bez celu
  „kliknij cel na mapie”.
- **Akcje** — średnie kafle po dwa w rzędzie (Bieg, Skok, Skradanie) z kosztem słowami, pod nimi
  rządek ikon (Ustabilizowanie, Pochwycenie, Wstrzymanie, Wstanie, Skaner, Zmysł Walki,
  Wsparcie).
- **Koszt na przycisku:** kropka = Akcja, skośna kreska = metry ruchu — te same znaki, co
  w budżecie tury (`CpredSlotCost` na slocie, `.hud-cost`).
- **Podświetlenie** pod kursorem na każdym przycisku belki; **dymek z opisem** (`HudTip`) po
  ok. 0,45 s obok belki: nazwa, koszt, zdanie z katalogu, powód odmowy.
- **Koniec tury** w stopce belki, obok kubka (napis tuszem z czerwoną kreską); kubek 65 px
  (było 52).
- **Skróty 1–9 i Shift + 1…9** usunięte: pole `key` zniknęło ze slotów i grup w `shared`,
  obsługa cyfr z `MapArea`, wpisy ze ściągawki skrótów.

## Rozstrzygnięcia bez pytań

- **Podział na średnie i małe** jest sprawą wyglądu i mieszka w `CombatHud.tsx`
  (`MEDIUM_ACTION_IDS`), nie w `shared`. Akcje Ról (Skaner, Zmysł Walki, Wsparcie) są małe.
- **PT przy celu** to sama tabela zasięgu broni (tryb pojedynczy albo ogień ciągły) — bez osłon,
  Celowania i modyfikatorów; te dokłada okno przy celu. Broń biała i śrut pokazują nazwę celu
  i dystans, bez PT.
- **Obrażenia na kaflu** liczone jak w `planAttack`: seria `2k6`, śrut z naboju, gołe ręce
  z tabeli BC „jak teraz”, reszta z wiersza karty; ogień zaporowy bez liczby.
- **Opis przycisku** wyszedł z systemowego `title` do dymka; `title` zostało na strzałce trybów
  i na elementach nieklikalnych (PW, liczby pod portretem, budżet).
- **Chipy stanów i efektów** (pigułki pod portretem), odmowa („Odmowa” na czerwieni), szuflada
  trybów i formularze akcji zostały przy starym wyglądzie — poza zakresem zlecenia.
- **Zwinięta belka** bez zmian układu; portret i „✓” dostały miękki kształt.

## Kryteria ukończenia

- [x] Belka w wariancie A: bez ramek i czarnych belek, trzy rozmiary przycisków.
- [x] Portret wyższy o ok. 25 %, kubek o ok. 25 % większej średnicy.
- [x] Przeładowanie i usuwanie usterki na kaflu broni; koszt na każdym przycisku; obrażenia
      i SS na kaflu; cel, dystans i PT pod bronią w ręku.
- [x] Podświetlenie pod kursorem i dymek z opisem po chwili.
- [x] Skróty 1–9 usunięte; linijka z nazwą pod ikonami usunięta.
- [x] Testy `shared` i klienta, ESLint, Prettier, `tsc --noEmit`.
- [x] Oględziny w Firefoksie (dzień i noc).
- [ ] Oględziny MG przy stole.

## Makieta

Trzy warianty (A, B, C) na płótnie projektowym: https://claude.ai/artifact/4mAApKeWRGt8VffBz8L4hz
(prywatne, konto MG). Portret w makiecie to wycinek plakatu logowania z repo, liczby broni
przykładowe.
