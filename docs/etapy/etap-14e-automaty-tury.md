# Etap 14e — Automaty tury: rany krytyczne, obrażenia okresowe i monity 🏁 Pełna mechanika tur

**Faza:** D — Walka · **Wymaga etapów:** 14d, 15, 16

## Cel sesji

Tura zaczyna i kończy się sama: rany krytyczne mają skutki maszynowe, ogień i tonięcie
zabierają PW bez klikania, Śmiertelnie Ranny dostaje monit Testu Przeżywalności.
Po tym etapie system tur jest kompletny — etap 20 dostaje bezpieczniki „za darmo".

**Pochodzenie:** wydzielony z etapu 14d 2026-07-31 (14d miał zakres na dwie sesje).

## Zakres

- [ ] **Hooki przejścia tury** (`onTurnStart` / `onTurnEnd`) wpięte w istniejące zdarzenie
      zmiany tury z etapu 14 — jedno miejsce, w którym system CP RED dostaje kontrolę
      (separacja rdzeń/system jak w 14b); rdzeń nie wie, czym jest ogień ani rana
- [ ] **Rany krytyczne egzekwowane w turze** (statusy z etapu 15 dostają efekty maszynowe
      jako dane, wzorzec: schemat publiczny, wartości w `data/private`):
  - Uraz kręgosłupa: następna tura bez Akcji (Akcja Ruchu zostaje)
  - Uraz ucha / Urwane ucho: ruch > 4 m pieszo → następna tura bez Akcji Ruchu
  - Złamane żebra / Ciało obce: ruch > 4 m pieszo → na końcu tury ponowne obrażenia
    dodatkowe rany, bez redukcji pancerzem (licznik `metresUsed` z 14c)
  - Odcięta noga: zakaz Uniku — spięcie z przyciskiem „Unik" z etapu 16
  - modyfikatory RUCH konsumuje już 14c — tu tylko dopięcie brakujących metadanych
- [ ] **Obrażenia okresowe** (DoT) na przejściu tury:
  - Podpalony: obrażenia na koniec tury wg natężenia (2/4/6 wprost w PW, bez pancerza
    i ablacji); ugaszenie = Akcja z katalogu 14b
  - Tonięcie/duszenie się: obrażenia = BC na początku tury, bez pancerza; status nadaje MG
  - Zatruty: generyczny DoT z wartością ustawianą przez MG (ten sam mechanizm co Podpalony;
    pełne trucizny z testem Odporności — POMYSLY)
  - obrażenia okresowe nie wywołują Ran Krytycznych (RAW s. 181)
- [ ] **Monity początku tury**:
  - Śmiertelnie Ranny: automonit Testu Przeżywalności (baner + przycisk; rzut istniejącą
    ścieżką z etapu 15, z narastającym modyfikatorem)
  - Przygwożdżony (ogień zaporowy z etapu 16): status nadawany automatycznie przy oblanym
    teście SW, przypomnienie w turze celu („rusz się do osłony"), wygasa z końcem jego tury;
    egzekwowanie miękkie — osłon nie ma w modelu mapy (domyka wpis POMYSLY z 2026-07-28)
- [ ] Testy: DoT na przejściu tury, flagi krytów („bez Akcji", „ruch > 4 m"), monit Testu
      Przeżywalności odpalający się dokładnie raz na turę

## Poza zakresem

- Pełna mechanika trucizn/narkotyków (test Odporności na tortury/narkotyki, uzależnienia —
  rozdział Trauma Team), porażenie prądem, promieniowanie, czynniki środowiskowe
- Osłony jako model mapy (Przygwożdżony zostaje przypomnieniem, nie wymuszeniem)
- Leczenie ran krytycznych („Łatanie", „Leczenie") — dane są w kompendium od etapu 13,
  ale ścieżka rozgrywania to osobna rzecz

## Kryteria ukończenia

- Złamane żebra: ruch 6 m → na końcu tury automatyczne obrażenia dodatkowe rany z pominięciem
  pancerza, wpis na czacie; ruch 3 m → nic
- Podpalony NPC dostaje obrażenia na końcu swojej tury bez klikania; Akcja „Ugaś się"
  zdejmuje status
- Śmiertelnie Ranny dostaje monit Testu Przeżywalności na początku swojej tury; wynik idzie
  ścieżką z etapu 15 (narastający modyfikator działa)
- Uraz kręgosłupa: w następnej turze przycisk ataku odrzucony, ruch działa
- Odcięta noga: przycisk „Unik" odrzucony z czytelnym powodem

## Wskazówki techniczne

- Efekty ran jako **dane z metadanymi maszynowymi** (`noAction`, `noMove`, `dotDamage`,
  `noDodge`, flagi progowe „ruch > 4 m") dopięte do tabeli efektów statusów z etapu 14d —
  nie łańcuchy ifów po id
- Obrażenia okresowe idą ścieżką „wprost w PW" z etapu 15 (ta sama, co dodatkowe obrażenia
  krytyka i Duszenie z 14d) — nie przez silnik pancerza
- Hook końca tury odpala się także wtedy, gdy MG cofa turę przyciskiem — uważaj na podwójne
  naliczenie DoT (14c pokazał, że „zwróć turę" jest osobną ścieżką)
