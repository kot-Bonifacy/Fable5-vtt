# Etap 26a — Sieć: dane, architektura i cyberdek

**Faza:** H — Świat CP RED · **Wymaga etapów:** 13 (kompendium), 07 (karta postaci), 23b (ceny)

> Pierwsza z czterech części podziału etapu 26, uzgodnionego z MG 14.08 i pogłębionego 15.08.

## Dlaczego etap 26 został podzielony na cztery

Rozdział 11 podręcznika (s. 195–218) to w praktyce cztery niezależne kawałki roboty:

1. **Katalog i architektura** — ~40 wpisów danych (4 Dopalacze, 3 Obrońcy, 8 Agresorów,
   12 Programów typu Czarny LOD, 3 Demony, 3 cyberdeki, 6 Ulepszeń Sprzętowych), model
   danych architektury sieciowej i narzędzie MG do jej budowania.
2. **Run** — punkty dostępu na mapie, pionowa wizualizacja, budżet Akcji Sieciowych wpięty
   w tracker tury i siedem niebojowych zdolności Interfejsu, każda z własnym PT.
3. **Walka w Sieci** — Programy z trzema klasami efektów, Paf, Ślizg, Czarny LOD z darmowym
   atakiem, pościgiem i wstawką do kolejki inicjatywy, obrażenia w mózg i w REZ.
4. **Demony i Soma** — osobny bestiariusz (Wartość bojowa zamiast ATK/OBR), węzły kontrolne
   sterujące rzeczami na mapie i trzy tabele systemów obronnych.

Każdy z nich jest wielkości normalnego etapu tego projektu. Opis etapu 26 sugerował podział
na dwa, ale wtedy druga sesja niosłaby run **i** bestiariusz Demonów naraz. Podział na trzy
(14.08) zostawiał z kolei w 26b run i całą walkę w Sieci naraz — stąd czwarta część,
uzgodniona z MG 15.08 przed rozpoczęciem sesji 26b.

**Decyzja MG z 14.08:** ekran Sieci dla netrunnera to **pływające okno** (jak karta postaci),
nie zakładka panelu — run dzieje się w trakcie walki fizycznej, więc mapa musi zostać widoczna.
Ta decyzja dotyczy 26b; 26a robi tylko edytor MG, który jest narzędziem poza sesją.

## Cel sesji

MG ma czym zbudować Architekturę Sieciową i gdzie ją trzymać, a netrunner ma cyberdek
z Programami na karcie. Po tym etapie nic jeszcze nie „biega" po Sieci — ale wszystko,
co 26b będzie poruszać, już istnieje jako dane.

## Zakres

- [x] **Import rozdziału 11** przez pipeline z etapu 13 (`tools/import/parse-netrunning.py`):
      Programy (Dopalacz / Obrońca / Agresor z ATK, OBR, REZ, efektem i ceną), Programy typu
      Czarny LOD (PER, PRĘ, ATK, OBR, REZ), Demony (REZ, Interfejs, Akcje Sieciowe, Wartość
      bojowa), cyberdeki (gniazda) i Ulepszenia Sprzętowe. Treść do `data/private/`, w repo
      wyłącznie parser i próbka wymyślona.
- [x] **Nowe kategorie kompendium**: `program` (razem z Czarnym LOD-em — to też Program,
      tylko groźniejszy) i `netDefense` (na razie same Demony; systemy obronne z s. 212–216
      dochodzą w 26c, razem ze swoimi polami). Cyberdeki i Ulepszenia Sprzętowe idą jako `gear`.
- [x] **Model architektury sieciowej** w `packages/shared/src/systems/cpred/netrunning.ts`:
      piętra w pionie, odgałęzienia (RAW: dopiero poniżej drugiego piętra głównej gałęzi,
      jedna gałąź zawsze najdłuższa = „dno"), zawartość piętra (hasło, Plik, węzeł kontrolny,
      Czarny LOD, Demon, puste), PT per piętro, poziom trudności całości. Czyste funkcje + testy: walidacja kształtu, wyliczanie dna, ścieżka do piętra.
- [x] **Generator RAW** (s. 210, krok 1 i 2): 3k6 pięter, 1k10 ≥ 7 na odgałęzienie, tabela
      Lobby (pierwsze dwa piętra) i tabela Zawartości dla czterech poziomów trudności,
      z przerzucaniem powtórzonych haseł i Programów. Rzut **na serwerze**, jak każdy inny.
- [x] **Edytor architektury dla MG** — pływające okno: lista pięter w pionie, dodawanie
      i usuwanie, wybór zawartości, PT, notatka MG, odgałęzienia; przycisk „Wylosuj" wołający
      generator. **Bez podglądu „co zobaczy netrunner"** — filtr pięter pisze 26b, więc podgląd
      pokazywałby dziś wszystko i kłamał.
- [x] **Biblioteka architektur kampanii** — zapis w bazie (`NetArchitecture`), lista
      w zakładce „Sieć" u MG, edycja w miejscu i kasowanie dwustopniowe. **Powielanie
      przeszło do POMYSŁÓW**: ta sama architektura w dwóch miejscach kampanii to jeden wiersz
      wskazywany przez dwa punkty dostępu, czyli decyzja 26b, a nie kopia w bibliotece.
      Przypięcie do sceny jako punkt dostępu zostaje na 26b.
- [x] **Cyberdek na karcie postaci** — wiersz sprzętu oznaczony jako dek daje gniazda
      (5 / 7 / 9), a w gniazdach siedzą Programy i Ulepszenia Sprzętowe z kompendium;
      Czarny LOD zajmuje **2 gniazda**, część Ulepszeń też. Licznik zajętości, odmowa
      przepełnienia, wszystko w `data.cyberdeck` karty.

## Poza zakresem

- Cały run: podłączanie, ruch po piętrach, zdolności Interfejsu, walka — **26b**
- Demony w akcji, węzły kontrolne sterujące czymś w Somie, systemy obronne — **26c**
- Kupno architektury za eurodolce (s. 217, „Bezpieczny dom 2045") — to ekonomia dla postaci
  graczy stawiających własny serwer; wpis do `POMYSLY.md`
- Netrunning botów-NPC (POMYSLY.md), architektury generowane proceduralnie z opisu tekstowego

## Kryteria ukończenia

- [x] MG buduje w edytorze architekturę z hasłem, Plikiem i Czarnym LOD-em, zapisuje ją
      w bibliotece kampanii i otwiera ponownie bez utraty danych — sprawdzone 14.08 na
      ośmiopiętrowej „Sieci magazynu Petrochem"
- [x] „Wylosuj" zwraca architekturę zgodną z RAW: liczba pięter z 3k6, lobby z własnej tabeli,
      reszta z kolumny wybranego poziomu trudności, bez powtórzonego wiersza haseł i Programów
- [x] Netrunner ma na karcie cyberdek z gniazdami; włożenie Czarnego LOD-u zabiera dwa,
      a przy braku miejsca wpis jest wyszarzony, a lista mówi „Brak wolnych gniazd"
- [x] Kompendium pokazuje nowe kategorie z licznikami (Programy 32, Obrona Sieci 4), a karta
      wpisu Programu pokazuje klasę, ATK/OBR/REZ, PER/PRĘ, gniazda, ikonę i efekt
- [x] Testy: 27 nowych w `netrunning.test.ts`, 8 w `compendium.test.ts`, 7 w `character.test.ts`
      (`shared`) oraz 13 na żywych gniazdach serwera (`netrunning.test.ts`)

## Wskazówki techniczne

- **Architektura to dane kampanii, nie sceny.** Ta sama architektura („sieć klubu Afterlife")
  może wisieć przy kilku scenach, a run przeżywa zmianę sceny. Stan runa dojdzie w 26b jako
  osobny byt wskazujący na architekturę.
- **Zawartość piętra nie opuszcza serwera, dopóki netrunner jej nie odkryje** — to ta sama
  zasada co ściany z 18a i mgła z 17a. Filtr napisze 26b, ale **model musi go umożliwiać
  już teraz**: piętro ma mieć osobno „co tam jest" i „czy odkryte".
- **Klasa Programu jest daną, nie gałęzią kodu** — „przeciwbiałkowy" i „przeciwprogramowy"
  to pola, po których 26b wybierze cel, tak jak `rof` w broni rozstrzyga liczbę ataków.
- Tabele z PDF-a są posklejane bez separatorów (`NazwaKlasaATKDEFREZEfektCena`, a w wierszu
  „Gumka Dopalacz 007 +2 do…" trójka `007` to ATK 0, OBR 0, REZ 7). Parser musi rozbijać
  te ciągi wzorcem, a nie kolumnami — jak `parse-gear.py`.
