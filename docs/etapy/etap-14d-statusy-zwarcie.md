# Etap 14d — Statusy w mechanice: zwarcie, kryty i automaty tury 🏁 Pełna mechanika tur

**Faza:** D — Walka · **Wymaga etapów:** 14c, 15

## Cel sesji

Statusy przestają być naklejkami: Pochwycenie/Duszenie/Rzut/Ludzka tarcza wg RAW, rany
krytyczne egzekwowane w turze, obrażenia okresowe (ogień, tonięcie) i monity początku tury.
Po tym etapie system tur jest kompletny — etap 20 dostaje bezpieczniki „za darmo".

## Zakres

- [ ] **Zwarcie RAW** (s. 176–177) — relacja Trzymania w stanie walki na serwerze (kto kogo;
      status tokenu to tylko wizualizacja, czyszczona z końcem walki):
  - Pochwycenie: Akcja, test sporny ZW + Bijatyka vs ZW + Bijatyka; wygrana = Trzymanie
    **albo** zabranie przedmiotu z ręki celu. W Trzymaniu obie strony −2 do wszystkich Akcji
    (spięte z rozbiciem rzutów jak kary ran z etapu 15), Trzymany bez Akcji Ruchu, zakaz broni
    dwuręcznych (walidacja przy ataku z 14b); Atakujący uwalnia za darmo, ucieczka = Akcja +
    wygrany test sporny (kończy Trzymanie dla wszystkich)
  - Ciągnięcie: Akcja Ruchu Atakującego przesuwa też Trzymanego (spięcie z budżetem z 14c)
  - Duszenie: Akcja, obrażenia = BC Atakującego, ignorują pancerz i go nie uszkadzają;
    cel z > 1 PW nie spada poniżej 1 PW — zamiast tego Nieprzytomny; licznik 3 rund duszenia
    z rzędu → Nieprzytomny niezależnie od PW (reset licznika, gdy runda bez Duszenia)
  - Rzut (osobą): Akcja, obrażenia = BC ignorujące pancerz, kończy Trzymanie, cel Przewrócony
  - Ludzka tarcza: Akcja, Atakujący „za osłoną" przed widzianymi atakami dystansowymi
    (nie działa wręcz ani przy celowaniu w głowę); tarcza nie może Unikać ataków dystansowych;
    po śmierci staje się tarczą z PW = BC; koniec Trzymania kończy efekt za darmo
- [ ] **Obrażenia Bijatyki i Sztuk walki wg progów BC** (1k6/2k6/3k6/4k6; cyberręka min 2k6)
      w silniku ataków — domyka wpis POMYSLY z 2026-07-27 (dziś typ broni ma stałe 2k6)
- [ ] **Rany krytyczne egzekwowane w turze** (statusy z etapu 15 dostają efekty maszynowe
      jako dane, wzorzec: schemat publiczny, wartości w `data/private`):
  - Uraz kręgosłupa: następna tura bez Akcji (Akcja Ruchu zostaje)
  - Uraz ucha / Urwane ucho: ruch > 4 m pieszo → następna tura bez Akcji Ruchu
  - Złamane żebra / Ciało obce: ruch > 4 m pieszo → na końcu tury ponowne obrażenia dodatkowe
    rany, bez redukcji pancerzem (licznik metrów z 14c)
  - Odcięta noga: zakaz Uniku — spięcie z przyciskiem „Unik" z etapu 16
  - modyfikatory RUCH już konsumuje 14c — tu tylko dopięcie brakujących metadanych
- [ ] **Automaty przejścia tury** (początek/koniec tury w trackerze):
  - Śmiertelnie Ranny: automonit Testu Przeżywalności na początku tury (baner + przycisk;
    rzut istniejącą ścieżką z etapu 15)
  - Podpalony: obrażenia na koniec tury wg natężenia (2/4/6 wprost w PW, bez pancerza
    i ablacji); ugaszenie = Akcja z katalogu 14b
  - Tonięcie/duszenie się: obrażenia = BC na początku tury, bez pancerza; status nadaje MG
  - Zatruty: generyczny DoT z wartością ustawianą przez MG (ten sam mechanizm co Podpalony;
    pełne trucizny z testem Odporności — POMYSLY)
  - Przygwożdżony (ogień zaporowy z etapu 16): status nadawany automatycznie przy oblanym
    teście SW, przypomnienie w turze celu („rusz się do osłony"), wygasa z końcem jego tury;
    egzekwowanie miękkie — osłon nie ma w modelu mapy (domyka wpis POMYSLY z 2026-07-28)
  - obrażenia okresowe nie wywołują Ran Krytycznych (RAW s. 181)
- [ ] Spójne blokady statusów w walidacji 14b/14c: Nieprzytomny (nic), Przewrócony (bez ruchu
      do Wstania), Unieruchomiony (bez ruchu) — jedna tabela efektów zamiast rozsianych ifów
- [ ] Naprawa migotliwego testu `damage.test.ts > rolls Death Saves that get harder each time`
      (wyścig `waitFor` w teście — notatka POMYSLY z 2026-07-30; ten etap i tak dotyka
      death save'ów)
- [ ] Testy: zwarcie end-to-end (Pochwycenie → Duszenie ×3 → Nieprzytomny na 1 PW;
      Rzut → Przewrócony + koniec Trzymania), DoT na przejściu tury, flagi krytów
      („bez Akcji", „ruch > 4 m"), obrażenia Bijatyki wg progów BC

## Poza zakresem

- Techniki Sztuk walki (Sprężynka, Rozbrojenie, Żelazny Chwyt, Strzaskanie…) i style jako
  osobne umiejętności — POMYSLY (wymagają warunków śledzonych per tura, które ten etap
  nawiasem mówiąc dostarcza)
- Osłony jako model mapy (twarde egzekwowanie „za osłoną" Ludzkiej tarczy zostaje opisowe)
- Pełna mechanika trucizn/narkotyków (test Odporności na tortury/narkotyki, uzależnienia —
  rozdział Trauma Team), porażenie prądem, promieniowanie, czynniki środowiskowe
- Pochwycenie przedmiotu trzymanego przez cel egzekwowane na ekwipunku (efekt opisowy na czacie)

## Kryteria ukończenia

- Scenariusz zwarcia na żywo u dwóch klientów: wygrane Pochwycenie → oba tokeny mają −2
  widoczne w rozbiciu kolejnych rzutów, Trzymany nie ruszy tokenem, Atakujący ciągnie go
  swoim ruchem; Duszenie w 3 kolejnych rundach → cel Nieprzytomny na 1 PW; Rzut → cel
  Przewrócony, Trzymanie i kary −2 znikają
- Bijatyka postaci z BC 8 rzuca 3k6, z BC 4 rzuca 1k6
- Złamane żebra: ruch 6 m → na końcu tury automatyczne obrażenia dodatkowe rany z pominięciem
  pancerza, wpis na czacie; ruch 3 m → nic
- Podpalony NPC dostaje obrażenia na końcu swojej tury bez klikania; Akcja „Ugaś się" zdejmuje status
- Śmiertelnie Ranny dostaje monit Testu Przeżywalności na początku swojej tury; wynik idzie
  ścieżką z etapu 15 (narastający modyfikator działa)
- Uraz kręgosłupa: w następnej turze przycisk ataku odrzucony, ruch działa
- Migotliwy test death save przechodzi w wielokrotnych pełnych przebiegach (co najmniej 8×,
  wcześniej padał ~1/8)

## Wskazówki techniczne

- Efekty statusów i ran jako **dane z metadanymi maszynowymi** (`moveModifier`, `noAction`,
  `noMove`, `dotDamage`, `noDodge`, flagi progowe „ruch > 4 m"), nie łańcuchy ifów po id —
  wzorzec z etapu 15: schemat + zmyślona próbka w `data/public`, wartości z podręcznika
  w `data/private`
- Relacja Trzymania żyje w stanie walki (jak kolejka z etapu 14), nie w tokenie — token
  dostaje tylko status wizualny; zakończenie walki czyści relacje i statusy zwarcia
- Automaty przejścia tury wpinaj w istniejące zdarzenie zmiany tury z etapu 14 — jedno
  miejsce, w którym system CP RED dostaje hook `onTurnStart`/`onTurnEnd` (separacja
  rdzeń/system jak w 14b)
- Duszenie/Rzut używają BC i **nie** przechodzą przez silnik pancerza — osobna ścieżka
  „obrażenia wprost w PW" z etapu 15 (ta sama, co dodatkowe obrażenia krytyka)
