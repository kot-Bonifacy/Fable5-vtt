# Etap 14b — Ekonomia akcji: budżet tury i katalog akcji

**Faza:** D — Walka · **Wymaga etapów:** 14, 15, 16

_Dopisany 2026-07-30 wraz z 14c i 14d — pełny podręcznik (dostarczony po utworzeniu planu)
opisuje kompletny system tur, którego pierwotny plan nie projektował: etap 14 dał tracker
kolejności, ale tura była tylko wskaźnikiem „kto teraz". Etap 20 (autonomia botów) zakłada
w bezpiecznikach „limit akcji na turę" — te trzy etapy budują fundament, na którym stanie._

## Cel sesji

Tura wg RAW: **1 Akcja Ruchu + 1 Akcja** (s. 168–169 podręcznika). Serwer zna budżet tury
każdego uczestnika walki, kataloguje akcje z kosztami i twardo pilnuje graczy; MG ma wolną rękę.

## Decyzje projektowe (ustalone z użytkownikiem 2026-07-30)

- **Egzekwowanie twarde z wolną ręką MG:** serwer odrzuca akcję gracza poza budżetem lub poza
  jego turą (spójne z zasadą „serwer autorytatywny" i wprost potrzebne etapowi 20). Akcje MG
  liczą się do budżetu jego NPC (widzi zużycie), ale **nigdy nie są blokowane**. Odrzucona
  akcja gracza pojawia się u MG z przyciskiem „przepuść" (jednorazowe zezwolenie).
- **Reakcje nie kosztują Akcji:** rzuty spoza własnej tury (obrona/Unik, test sporny
  Pochwycenia, Test Przeżywalności, wymuszony test SW z ognia zaporowego) nie dotykają budżetu.
  Zwykły rzut umiejętności z karty także **nie** zużywa Akcji automatycznie — zużycie następuje
  wyłącznie przez jawne intencje (atak, przeładowanie, przyciski akcji).

## Zakres

- [ ] Silnik budżetu tury w `shared/systems/cpred` (czyste funkcje + testy vitest): stan tury
      uczestnika (Akcja Ruchu, Akcja, licznik ataków w ramach Akcji Ataku, bronie użyte w tej
      Akcji), przejścia (wydaj Ruch/Akcję/atak, Bieg = Akcja dająca drugą Akcję Ruchu) i reguły
      legalności:
  - LA 2 → maks. 2 ataki w ramach jednej Akcji Ataku (można rozdzielić między dwie bronie LA 2)
  - dwie bronie LA 1 **nie** mogą obie zaatakować w jednej Akcji; łącznie nigdy więcej niż 2 ataki
  - Bardzo duża broń biała nie atakuje dwukrotnie
  - Celowanie (−8, już w silniku z etapu 16) = pojedynczy atak i **cała** Akcja
- [ ] Katalog akcji CP RED (id, nazwa PL, koszt, warunki) w `shared/systems/cpred`: Atak,
      Celowany atak, Przeładowanie, Bieg, Wstanie, Pochwycenie, Duszenie, Rzut, Ludzka tarcza,
      Ustabilizowanie, Wstrzymanie Akcji, Użycie Umiejętności, Użycie przedmiotu,
      Przygotuj/upuść tarczę, akcje pojazdów i Akcje Sieciowe jako pozycje generyczne
      (zużywają Akcję, automatyka przyjdzie z etapami pojazdów/26). Mechanika zwarcia
      (Pochwycenie/Duszenie/Rzut/Ludzka tarcza) dopiero w 14d — tu tylko koszt Akcji.
- [ ] Akcje darmowe wg RAW zapisane w katalogu (bez egzekwowania rąk): dobycie łatwo dostępnej
      broni, upuszczenie broni, uwolnienie Trzymanego; schowanie broni do kabury = Akcja.
      Nie śledzimy, co postać trzyma w dłoniach — poza zakresem (wpis w POMYSLY).
- [ ] Serwerowy stan tury per uczestnik: reset na początku jego tury, trwały przez całą turę
      (rozdzielanie ruchu wokół ataków!), pełny resync po reconnect; filtrowanie jak reszta
      danych walki (budżet ukrytego wroga nie wycieka graczom).
- [ ] Spięcie istniejących ścieżek: atak z mapy (etap 16) zużywa atak/Akcję, przeładowanie
      (etap 16) zużywa Akcję, Ustabilizowanie woła ścieżkę stabilizacji z etapu 15.
- [ ] Zdarzenia wg konwencji `combat:action` (intencja gracza → walidacja → broadcast);
      czytelna odmowa z powodem (`NO_ACTION_LEFT`, `NOT_YOUR_TURN`, `ROF_EXCEEDED`…).
- [ ] Wstrzymanie Akcji: deklaracja (opis wyzwalacza **lub** wartość w Kolejce Inicjatywy +
      cel akcji), znacznik w trackerze widoczny wg reguł widoczności; „odpal wstrzymaną"
      przestawia uczestnika na zadeklarowaną wartość kolejki (tracker z etapu 14 już umie
      przestawiać — tu automatyzacja + zapis deklaracji). Niewykorzystana deklaracja wygasa
      z końcem rundy.
- [ ] UI: pasek walki (etap 14) pokazuje budżet aktywnego uczestnika (piktogramy: Ruch, Akcja,
      ataki 0/2); zakładka „Walka" dostaje przyciski akcji generycznych (Wstanie, Przeładuj,
      Bieg, Ustabilizuj, Wstrzymaj Akcję, Użycie Umiejętności/przedmiotu). „Kończę turę" bez zmian.
- [ ] Testy: silnik budżetu (przypadki brzegowe LA — 2×LA 1, LA 1 + LA 2, celowanie po ataku),
      testy dymne serwera (trzeci atak odrzucony; akcja poza turą odrzucona; „przepuść" MG działa;
      resync odtwarza budżet).

## Poza zakresem

- Ruch na mapie i budżet metrów (etap 14c), mechanika zwarcia i efekty statusów (etap 14d)
- Śledzenie broni w dłoniach/kaburach (dobycie za darmo wymaga wolnej ręki — nie egzekwujemy; POMYSLY)
- Techniki Sztuk walki (Sprężynka, Żelazny Chwyt…) — wymagają stylów jako umiejętności (POMYSLY)
- Automatyka akcji pojazdów (brak etapu walki pojazdów) i Akcji Sieciowych (etap 26)

## Kryteria ukończenia

- Walka testowa na dwóch klientach: gracz z bronią LA 2 wykonuje dokładnie 2 ataki, trzeci
  wraca z czytelną odmową; po ataku bronią LA 1 atak drugą bronią LA 1 odrzucony; przeładowanie
  zużywa Akcję i blokuje atak w tej samej turze; celowany strzał zamyka całą Akcję po jednym ataku
- Akcja gracza poza jego turą odrzucona; MG widzi odmowę i „przepuść" pozwala ją wykonać
- MG wykonuje swoim NPC trzy ataki pod rząd — nic go nie blokuje, budżet pokazuje przekroczenie
- Wstrzymanie Akcji: deklaracja na wartość 12 → uczestnik automatycznie działa przy 12 w tej rundzie
- Reconnect w środku tury odtwarza pełny budżet (zużyte akcje się nie „odświeżają")
- Testy jednostkowe silnika budżetu i dymne serwera przechodzą

## Wskazówki techniczne

- **Separacja rdzeń/system jak w etapie 14:** rdzeń walki (tracker) przechowuje stan tury
  uczestnika jako nieprzezroczysty obiekt systemu; całą semantykę (budżet, LA, legalność)
  dostarcza `shared/systems/cpred`. Rdzeń zna tylko „początek tury → poproś system o świeży stan".
- Katalog akcji to mechanika (wzory), nie treść podręcznika — może być kodem w publicznym repo,
  jak silnik obrażeń z etapu 15; opisy fabularne akcji zostają w danych prywatnych, jeśli zechcesz
  je pokazywać w UI.
- LA broni już jest w danych kompendium (etap 13/16) — sprawdź nazwę pola, zanim dodasz nowe.
- Nie podpinaj budżetu pod ogólną ścieżkę rzutów z kart — tylko pod jawne intencje; inaczej
  każdy rzut Percepcji na prośbę MG zje komuś Akcję.
