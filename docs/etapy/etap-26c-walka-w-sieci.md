# Etap 26c — Walka w Sieci: Programy, Paf, Ślizg i Czarny LOD

**Faza:** H — Świat CP RED · **Wymaga etapów:** 26b, 14 (inicjatywa), 15 (obrażenia), 06 (kości)

> Trzecia z czterech części podziału etapu 26 (patrz nagłówek `etap-26a-siec-dane-architektura.md`).
> **Wydzielona 15.08** z pierwotnego 26b, który niósł run i walkę naraz; dawne 26c
> (Demony i Soma) zostało przy tej okazji przenumerowane na **26d**.

## Cel sesji

Netrunner uruchamia Programy z deku, bije się z Czarnym LOD-em i albo go derezuje, albo
ucieka Ślizgiem — a jego tura przeplata się z turami reszty drużyny w jednym trackerze
inicjatywy. Obrażenia idą w obie strony: w REZ Programów i prosto w PW mózgu.

## Zakres

- [ ] **Programy netrunnera** — uruchamianie i zatrzymywanie (Akcja Sieciowa), stan „zrezowany"
      per kopia, „tylko jedna kopia naraz" u Obrońców, „raz na wejście do Architektury",
      derez przy REZ 0 i dwie Akcje Sieciowe na przywrócenie (wyłącz + uruchom)
- [ ] **Efekty trzech klas** — Dopalacze (+2 do Maskowania / Zwiadu / Backdooru, +2 Prędkości)
      wchodzące w rzuty zdolności z 26b; Obrońcy (Pancerz −4 obrażeń w mózg, Powłoka zerująca
      ATK nie-LOD-ów, Tarcza kasująca pierwsze trafienie i derezująca się); Agresorzy z własnymi
      efektami (obrażenia, wyrzucenie z Architektury, kradzież Akcji Sieciowych, Superklej)
- [ ] **Paf** — atak Akcją Sieciową bez Programu: Interfejs + 1k10 przeciw OBR + 1k10 Programu
      albo Interfejsowi + 1k10 netrunnera; 1k6 obrażeń
- [ ] **Walka w Sieci** — `Interfejs + ATK Programu + 1k10` przeciw `Interfejs celu + 1k10`
      albo `OBR + 1k10`; klasa celu (przeciwbiałkowy / przeciwprogramowy) egzekwowana z danych
      26a, nie z nazw
- [ ] **Czarny LOD w akcji** — darmowy atak przy wykryciu (Interfejs + premie do PRĘ + 1k10
      przeciw PRĘ + 1k10), wskoczenie na czoło Kolejki Inicjatywy „o jeden punkt wyżej",
      atak raz na Turę, pościg po całej Architekturze, czyhanie po udanym Ślizgu
- [ ] **Ślizg** — test sporny przeciw PER LOD-u, raz na Turę, ucieczka na sąsiednie piętro
      (hasła nie da się minąć); LOD zostaje jako czyhający
- [ ] **Obrażenia w obie strony** — obrażenia „w mózg" idą w PW karty ścieżką `directDamage`
      z 16h (pancerz ich nie zatrzymuje), obrażenia Programów schodzą z REZ; derez ≠ zniszczenie
- [ ] **Wspólny tracker inicjatywy** — tura netrunnera i tury LOD-ów przeplatają się z turami
      reszty drużyny w jednej kolejce z etapu 14; tracker musi umieć **wstawić** uczestnika
      w trakcie rundy
- [ ] **Awaryjne odłączenie z rachunkiem** — wyjście poza 6 m (26b) zbiera efekty wszystkich
      zrezowanych LOD-ów napotkanych w tym wejściu

## Poza zakresem

- Demony (bronią się Testem Interfejsu, nie mają PRĘ ani PER) — **26d**
- Węzły kontrolne sięgające do Somy i systemy obronne — **26d**
- Wrogi netrunner sterowany przez bota (POMYSLY.md, złożenie z etapem 20)

## Kryteria ukończenia

- [ ] Netrunner wchodzi na piętro z Czarnym LOD-em, dostaje darmowy atak przy wykryciu,
      LOD wskakuje do kolejki inicjatywy i atakuje w swojej Turze
- [ ] Netrunner odpowiada Agresorem z deku i Pafem; LOD schodzi do REZ 0 i zostaje zderezowany
- [ ] Obrażenia w mózg zdejmują PW z karty postaci z pominięciem pancerza; Pancerz (Program)
      obniża je o 4
- [ ] Udany Ślizg przenosi netrunnera piętro wyżej, a LOD zostaje jako czyhający
- [ ] Walka w Sieci przeplata się z walką na mapie w jednym trackerze
- [ ] Testy: każda klasa Programu, pełna wymiana ciosów z LOD-em i Ślizg w `shared`;
      wstawka do kolejki inicjatywy i obrażenia w mózg na żywych gniazdach serwera

## Wskazówki techniczne

- **LOD wchodzi na czoło kolejki „o jeden punkt wyżej"** niż netrunner albo Program, który
  tam stał — to nie jest przerzut inicjatywy, tylko wstawka; tracker z 14 musi umieć
  wstawić uczestnika w trakcie rundy.
- Obrażenia w mózg omijają pancerz i idą prosto w PW — użyj ścieżki `directDamage`, którą
  16h wprowadziło dla gazu, zamiast pisać drugą.
- **Efekt Programu to dane, nie kod.** Wpis kompendium z 26a niesie klasę, cel, ATK/OBR/REZ
  i tekst efektu; mechaniczne haki (ile kości obrażeń, przeciw czemu, jak długo) dołóż jako
  pola wpisu, żeby MG mógł dopisać własny Program bez zmiany kodu.
- **LOD nie jest tokenem na mapie**, a mimo to jest uczestnikiem kolejki. Najtańsza droga to
  `Combatant` bez `tokenId` — sprawdź, czy tracker z 14 to zniesie, zanim zaczniesz go zmieniać.
