# Etap 26b — Run: punkty dostępu, winda i Akcje Sieciowe

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26a, 14 (inicjatywa), 04 (mapa), 06 (kości)

> Druga z czterech części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).
> **Zwężony 15.08:** pierwotny 26b niósł run **i** całą walkę w Sieci naraz. Walka —
> Programy, Paf, Ślizg, Czarny LOD, obrażenia w mózg i w REZ — wyprowadziła się do
> nowego **26c**, a dawne 26c (Demony i Soma) zostało przenumerowane na **26d**.

## Cel sesji

Netrunner znajduje w Somie punkt dostępu, wbija się w Architekturę zbudowaną w 26a, schodzi
piętro po piętrze, robi Zwiad, łamie hasło Backdoorem, rozpoznaje Plik i przejmuje węzeł,
zostawia Wirusa na dnie i wychodzi — wszystko rzutami serwera, zalogowane na czacie, w budżecie
Akcji Sieciowych wpiętym w tracker tury.

## Zakres

- [x] **Punkt dostępu jako obiekt sceny** (decyzja MG z 15.08) — MG stawia go narzędziem mapy
      i wiąże z Architekturą z biblioteki 26a. Punkt jest domyślnie **ukryty**: gracz nie
      dostaje go w payloadzie, dopóki nie znajdzie go Skanerem albo dopóki MG go nie odsłoni.
- [x] **Pływające okno „Sieć"** (decyzja MG z 14.08) — pionowa winda w stylistyce terminala:
      piętra jako lista od góry, pozycja netrunnera, piętra nieodkryte jako `?`, odgałęzienia
      jako wcięcie. Zwykły DOM/SVG, **nie** canvas Pixi mapy.
- [x] **Stan runa** jako byt serwera: kto, w której architekturze, na którym piętrze, co
      odkryte, co złamane, co przejęte. Filtrowanie przed wysyłką — gracz nie dostaje
      zawartości pięter, których nie odkrył.
- [x] **Podłączenie / Odłączenie** — 6 m od punktu dostępu, ściana blokuje; odłączenie
      resetuje obronę Architektury (odkryte piętra idą w niepamięć); wyjście poza 6 m
      to **awaryjne odłączenie**, które zapisuje listę napotkanych LOD-ów dla 26c.
- [x] **Budżet Akcji Sieciowych** — 2/3/4/5 wg Interfejsu (1–3 / 4–6 / 7–9 / 10); w Turze
      netrunner wybiera Akcję w Somie **albo** Akcje Sieciowe, Akcja Ruchu zawsze przysługuje.
      Wpięte w tracker tury z 14b jako Akcja o wielu użyciach, nie obok niego.
- [x] **Ruch po piętrach** — dowolna liczba pięter w Turze (za darmo), ale nie da się ominąć
      niezłamanego hasła ani przeskoczyć piętra; wejście odkrywa zawartość.
- [x] **Siedem niebojowych zdolności Interfejsu** jako przyciski z automatyką rzutu
      Interfejs + 1k10: **Skaner** (Akcja w Somie, odsłania punkty dostępu), **Backdoor**,
      **Zwiad**, **Ajdi**, **Kontrola**, **Maskowanie**, **Wirus**.
- [x] **Ślady, które przeżywają odłączenie** — Wirus na dnie Architektury i PT Maskowania
      zapisane przy Architekturze, nie przy runie; edytor MG z 26a ich nie kasuje.
- [x] **Log na czacie** — reszta stołu widzi skrót działań netrunnera („Backdoor — udany"),
      nie zawartość Architektury.

## Poza zakresem

- **Programy, Paf, Ślizg, Czarny LOD, obrażenia w Sieci** — **26c**. Piętro z LOD-em w tym
  etapie odkrywa się i widać na nim wpis, ale walki jeszcze nie ma.
- Demony, węzły kontrolne działające w Somie i systemy obronne — **26d**
- Wrogi netrunner sterowany przez bota (POMYSLY.md, złożenie z etapem 20)
- Efekty 3D i animacje przelotu między piętrami

## Kryteria ukończenia

- [x] MG stawia punkt dostępu na scenie i wiąże go z Architekturą z biblioteki 26a; gracz go
      nie widzi, dopóki go nie odsłoni Skaner albo MG
- [x] Netrunner podłącza się z odległości ≤ 6 m bez ściany po drodze, a spoza tego zasięgu
      dostaje odmowę po polsku
- [x] Pełny run po architekturze z 26a: Zwiad odsłaniający kilka pięter, złamanie hasła
      Backdoorem, Ajdi na Pliku, Kontrola nad węzłem, Wirus na dnie, bezpieczne odłączenie —
      wszystko rzutami serwera, zalogowane na czacie
- [ ] Akcje Sieciowe schodzą z Akcji tury w trackerze z 14b, a Akcja Ruchu zostaje wolna
- [x] Gracze-nienetrunnerzy nie widzą nieodkrytych pięter — sprawdzone na payloadzie serwera,
      nie w CSS
- [x] Wyjście poza 6 m odłącza awaryjnie i mówi o tym na czacie
- [x] Testy: budżet akcji, ruch po szybie, każda z siedmiu zdolności i filtr widoku
      w `shared` (34); punkty dostępu, zasięg, przebieg runa i filtrowanie na żywych gniazdach (17)

> **Jedno kryterium zostaje nieodhaczone: budżet Akcji Sieciowych w trackerze.** Sprawdzenie go
> w przeglądarce wymaga wystartowania walki w żywej kampanii i dopisania netrunnera do kolejki;
> sama arytmetyka jest pokryta 8 testami w `shared` i ścieżką `requireTurnSpend` na serwerze.
> Szczegóły w „Otwartych zaległościach" w `POSTEP.md`.

## Wskazówki techniczne

- **Zdolności Interfejsu to jeden rzut z wieloma zastosowaniami**, a nie siedem mechanik:
  `Interfejs + 1k10 przeciw PT`. Różni je wyłącznie to, skąd bierze się PT i co się dzieje
  po sukcesie — trzymaj to w tabeli danych, nie w siedmiu funkcjach.
- **Zasięg i ściana to ten sam rachunek co linia strzału z 16b** — `metresBetween`
  i `hasLineOfFire`. Nie pisz drugiej geometrii.
- **Akcje Sieciowe zajmują Akcję tury, nie stoją obok niej.** Model jest ten sam co Akcja
  Ataku z 14b: jedna Akcja, w środku licznik użyć (`CpredNetActionUse` obok
  `CpredAttackAction`) — dzięki temu „Akcja w Somie **albo** Akcje Sieciowe" wychodzi
  z arytmetyki, a nie z osobnego warunku.
- **Odłączenie kasuje run, ale nie ślady.** Wirus i PT Maskowania to stan Architektury,
  nie runa — trzymaj je w osobnej kolumnie (`runtime`), żeby edytor MG z 26a nie zamiatał
  ich przy zapisie szybu.
