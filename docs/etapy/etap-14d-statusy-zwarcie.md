# Etap 14d — Zwarcie: Pochwycenie, Duszenie, Rzut i Ludzka tarcza

**Faza:** D — Walka · **Wymaga etapów:** 14c, 15, 16

## Cel sesji

Zwarcie przestaje być naklejką na tokenie: Trzymanie jest **relacją w stanie walki**
(kto kogo), z egzekwowaną karą −2, zakazem ruchu Trzymanego, ciągnięciem go za sobą,
Duszeniem, Rzutem i Ludzką tarczą. Przy okazji statusy dostają **jedną tabelę efektów**
zamiast rozsianych ifów, z której skorzysta etap 14e.

## Decyzje projektowe (ustalone z użytkownikiem 2026-07-31)

- **Etap 14d podzielony na 14d (zwarcie) i 14e (automaty tury).** Pierwotny zakres 14d był
  na dwie sesje. Podział przebiega wzdłuż naturalnego szwu: 14d to **relacje między
  tokenami**, 14e to **upływ czasu** (hooki początku/końca tury, DoT, monity).
- **Test sporny jak „Unik" z etapu 16:** atakujący rzuca ZW + Bijatyka od razu przeciw
  PT zastępczemu celu (ZW + Bijatyka + 5 za kość), a cel dostaje na karcie czatu przycisk
  „Broń się" — jego aktywny rzut może wynik odwrócić. Nie blokuje tury, gdy broniący jest
  botem albo go nie ma przy stole.
- **Kara −2 dotyka wszystkich rzutów z karty** (ataki, umiejętności, cechy, testy sporne
  zwarcia), zgodnie z RAW „−2 do wszystkich Akcji". **Nie** dotyka Uniku ani Testu
  Przeżywalności — to reakcje, nie Akcje.
- **Obrażenia Bijatyki wg progów BC są już zrobione** (etap 16: `unarmedDamage`,
  `attackDamageNotation`) — wpis w POMYSLY z 27.07 był nieaktualny.

## Zakres

- [x] **Relacja Trzymania w stanie walki** (s. 176–177): kto kogo trzyma, licznik rund
      Duszenia i flaga Ludzkiej tarczy jako kolumny uczestnika walki; status tokenu
      (`grappled`) to tylko wizualizacja, czyszczona z końcem walki i z końcem Trzymania
- [x] **Pochwycenie**: Akcja, test sporny ZW + Bijatyka vs ZW + Bijatyka; wygrana =
      Trzymanie **albo** zabranie przedmiotu z ręki celu (efekt opisowy — ekwipunku ten
      etap nie rusza)
- [x] **Skutki Trzymania**: obie strony −2 do wszystkich Akcji (widoczne w rozbiciu
      rzutów jak kary ran z etapu 15), Trzymany bez Akcji Ruchu, zakaz broni dwuręcznych
      po obu stronach (walidacja przy ataku), Atakujący uwalnia za darmo
- [x] **Wyrwanie się**: Akcja + wygrany test sporny; RAW pozwala próbować także osobie
      trzeciej, a sukces kończy Trzymanie dla wszystkich
- [x] **Ciągnięcie**: Akcja Ruchu Atakującego przesuwa też Trzymanego (spięcie z budżetem
      metrów z 14c — płaci Atakujący)
- [x] **Duszenie**: Akcja, obrażenia = BC Atakującego, ignorują pancerz i go nie uszkadzają;
      cel z > 1 PW nie spada poniżej 0 PW — zamiast tego zostaje na 1 PW i jest Nieprzytomny;
      3 Rundy Duszenia pod rząd → Nieprzytomny niezależnie od PW (licznik zeruje runda bez
      Duszenia)
- [x] **Rzut osobą**: Akcja, obrażenia = BC ignorujące pancerz, kończy Trzymanie,
      cel Przewrócony
- [x] **Ludzka tarcza**: Akcja, Atakujący „za osłoną" przed widzianymi atakami dystansowymi
      (nie działa wręcz ani przy Celowaniu w głowę); tarcza nie może Unikać ataków
      dystansowych; koniec Trzymania kończy efekt za darmo
- [x] **Jedna tabela efektów statusów** zamiast rozsianych ifów: Nieprzytomny/Martwy (nic),
      Przewrócony (bez ruchu do Wstania), Unieruchomiony i Pochwycony (bez ruchu),
      z gotowymi zdaniami odmowy; konsumowana przez walidację 14b (Akcje) i 14c (ruch)
- [x] Naprawa migotliwego testu `damage.test.ts > rolls Death Saves that get harder each time`
      (wyścig `waitFor` w teście — notatka POMYSLY z 2026-07-30)
- [x] Testy: zwarcie end-to-end (Pochwycenie → Duszenie ×3 → Nieprzytomny na 1 PW;
      Rzut → Przewrócony + koniec Trzymania), kara −2 w rozbiciu, ciągnięcie, wyrwanie się,
      zakaz broni dwuręcznych, tabela efektów statusów

## Poza zakresem

- Automaty przejścia tury, obrażenia okresowe i rany krytyczne egzekwowane w turze — **14e**
- Techniki Sztuk walki (Żelazny Chwyt, Rozbrojenie, Kontrrzut…) i style jako osobne
  umiejętności — POMYSLY
- Osłony jako model mapy (twarde egzekwowanie „za osłoną" Ludzkiej tarczy zostaje opisowe)
- Pochwycenie przedmiotu egzekwowane na ekwipunku (efekt opisowy na czacie)
- Rzut **przedmiotem** (ZW + Atletyka, PT z wiersza Granatnika) — osobna ścieżka ataku
  dystansowego, nie zwarcie
- Tarcza z ciała po śmierci Ludzkiej tarczy (PW = BC) — wymaga modelu tarcz w ekwipunku;
  zostaje wpisem na karcie czatu

## Kryteria ukończenia

- Scenariusz zwarcia na żywo u dwóch klientów: wygrane Pochwycenie → oba tokeny mają −2
  widoczne w rozbiciu kolejnych rzutów, Trzymany nie ruszy tokenem, Atakujący ciągnie go
  swoim ruchem
- Duszenie w 3 kolejnych rundach → cel Nieprzytomny; Duszenie celu z 30 PW przez BC 12
  nie schodzi poniżej 1 PW i daje Nieprzytomnego
- Rzut → cel Przewrócony, Trzymanie i kary −2 znikają u obu stron
- Broń dwuręczna w Trzymaniu odrzucona po obu stronach; Ludzka tarcza nie może Unikać
  ataku dystansowego
- Wyrwanie się (Akcja + wygrany test) kończy Trzymanie u obu stron i zdejmuje status
- Migotliwy test death save przechodzi w wielokrotnych pełnych przebiegach (co najmniej 8×,
  wcześniej padał ~1/8)

## Wskazówki techniczne

- Relacja Trzymania żyje w stanie walki (jak kolejka z etapu 14), nie w tokenie — token
  dostaje tylko status wizualny; zakończenie walki czyści relacje i statusy zwarcia
- Efekty statusów jako **dane z metadanymi maszynowymi** (`noMove`, `noAction`, `noDodge`),
  nie łańcuchy ifów po id — wzorzec z etapu 15
- Duszenie/Rzut używają BC i **nie** przechodzą przez silnik pancerza — ta sama ścieżka
  „obrażenia wprost w PW", co dodatkowe obrażenia krytyka z etapu 15
- Kara −2 wchodzi do rozbicia rzutu jako wpis obok kar ran, żeby gracz widział, skąd się
  wzięła — nie jako cichy modyfikator w formule
