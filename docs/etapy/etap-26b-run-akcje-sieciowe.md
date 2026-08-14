# Etap 26b — Run: winda, akcje sieciowe i walka w Sieci

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26a, 14 (inicjatywa), 15 (obrażenia), 06 (kości)

> Druga z trzech części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).

## Cel sesji

Netrunner wykonuje pełny run: wbija się w Architekturę, schodzi piętro po piętrze, łamie hasła,
bierze Plik, bije się z Czarnym LOD-em i wychodzi — wszystko rzutami przez silnik, zalogowane
na czacie, w trakcie tej samej walki, w której reszta drużyny strzela na mapie.

## Zakres

- [ ] **Pływające okno „Sieć"** (decyzja MG z 14.08) — pionowa winda w stylistyce terminala:
      piętra jako lista od góry, pozycja netrunnera, piętra nieodkryte jako `?`, odgałęzienia
      jako wcięcie. Zwykły DOM/SVG, **nie** canvas Pixi mapy.
- [ ] **Stan runa** jako byt serwera: kto, w której architekturze, na którym piętrze, co
      odkryte, co zderezowane, jakie Programy uruchomione. Filtrowanie przed wysyłką —
      gracz nie dostaje zawartości pięter, których nie odkrył.
- [ ] **Podłączenie / Odłączenie** — 6 m od punktu dostępu, ściana blokuje; awaryjne
      odłączenie z efektami wszystkich napotkanych zrezowanych LOD-ów; odłączenie resetuje
      obronę Architektury.
- [ ] **Budżet Akcji Sieciowych** — 2/3/4/5 wg Interfejsu (1–3 / 4–6 / 7–9 / 10); w Turze
      netrunner wybiera Akcję w Somie **albo** Akcje Sieciowe, Akcja Ruchu zawsze przysługuje.
      Wpięte w tracker tury z 14b, nie obok niego.
- [ ] **Dziewięć zdolności Interfejsu** jako przyciski z automatyką rzutu Interfejs + 1k10:
      Skaner (Akcja w Somie), Backdoor, Maskowanie, Kontrola, Ajdi, Zwiad, Ślizg (test sporny
      przeciw PER LOD-u), Wirus, Paf.
- [ ] **Ruch po piętrach** — dowolna liczba pięter w Turze, ale hasło blokuje i pięter nie
      można omijać; odkrywanie zawartości przy wejściu.
- [ ] **Programy netrunnera** — uruchamianie i zatrzymywanie (Akcja Sieciowa), efekty
      Dopalaczy (+2 do Maskowania / Zwiadu / Backdooru, +2 Prędkości), Obrońców (Pancerz,
      Powłoka, Tarcza) i Agresorów; derez przy REZ 0, „raz na wejście do Architektury".
- [ ] **Czarny LOD w akcji** — darmowy atak przy wykryciu (Interfejs + premie do PRĘ + 1k10
      przeciw PRĘ + 1k10), wskoczenie na czoło Kolejki Inicjatywy, atak raz na Turę,
      pościg po Architekturze, czyhanie po udanym Ślizgu.
- [ ] **Obrażenia w obie strony** — obrażenia „w mózg" idą w PW karty przez silnik z etapu 15
      (pancerz ich nie zatrzymuje), obrażenia Programów schodzą z REZ; derez ≠ zniszczenie.
- [ ] **Wspólny tracker inicjatywy** — tura netrunnera i tury LOD-ów przeplatają się z turami
      reszty drużyny w jednej kolejce z etapu 14; reszta stołu widzi na czacie skrót działań
      netrunnera, nie zawartość Architektury.

## Poza zakresem

- Demony, węzły kontrolne działające w Somie i systemy obronne — **26c**
- Wrogi netrunner sterowany przez bota (POMYSLY.md, złożenie z etapem 20)
- Efekty 3D i animacje przelotu między piętrami

## Kryteria ukończenia

- [ ] Netrunner wykonuje pełny run na architekturze zbudowanej w 26a: wbicie, Zwiad, złamanie
      hasła Backdoorem, walka z Czarnym LOD-em (obrażenia w obie strony na kartach), Ajdi
      i kopia Pliku, bezpieczne odłączenie — wszystko rzutami serwera, zalogowane na czacie
- [ ] Run odbywa się w trakcie walki fizycznej: tury netrunnera i LOD-u przeplatają się
      z turami reszty w jednym trackerze
- [ ] Gracze-nienetrunnerzy nie widzą nieodkrytych pięter — sprawdzone na payloadzie serwera,
      nie w CSS
- [ ] Awaryjne odłączenie (wyjście poza 6 m) zbiera efekty wszystkich zrezowanych LOD-ów
- [ ] Testy: budżet akcji, każda zdolność Interfejsu i pełna wymiana ciosów z LOD-em w `shared`;
      filtrowanie pięter i przebieg runa na żywych gniazdach serwera

## Wskazówki techniczne

- **Zdolności Interfejsu to jeden rzut z dziewięcioma zastosowaniami**, a nie dziewięć
  mechanik: `Interfejs + 1k10 przeciw PT`. Różni je wyłącznie to, skąd bierze się PT
  i co się dzieje po sukcesie — trzymaj to w tabeli danych, nie w dziewięciu funkcjach.
- **LOD wchodzi na czoło kolejki „o jeden punkt wyżej"** niż netrunner albo Program, który
  tam stał — to nie jest przerzut inicjatywy, tylko wstawka; tracker z 14 musi umieć
  wstawić uczestnika w trakcie rundy.
- Obrażenia w mózg omijają pancerz i idą prosto w PW — użyj ścieżki `directDamage`, którą
  16h wprowadziło dla gazu, zamiast pisać drugą.
