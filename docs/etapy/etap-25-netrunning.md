# Etap 25 — Netrunning

**Faza:** H — Świat CP RED · **Wymaga etapów:** 13, 14, 12

⚠️ **Wymaga materiałów od Ciebie:** rozdział netrunningu (akcje interfejsu, programy, ICE, zasady budowy architektur) przez pipeline z etapu 12.
⚠️ Duży etap — jeśli się nie mieści w sesji, podziel: **25a** architektury + wizualizacja + poruszanie się, **25b** programy, ICE i walka w sieci.

## Cel sesji

Pełny interfejs netrunningu zgodnie z ankietą: budowa architektur NET przez MG, pionowa wizualizacja, akcje netrunnera i programy — zsynchronizowane z walką w świecie rzeczywistym.

## Zakres

- [ ] Dane: programy (atak/obrona/booster), czarny lód (statbloki ICE), akcje interfejsu — import przez pipeline
- [ ] Edytor architektury (MG): piętra w pionie, na każdym zawartość (hasło, plik, kontrola, lód wg tabel), trudności DV per piętro, rozgałęzienia; zapis architektur w bibliotece kampanii (wielokrotny użytek)
- [ ] Wizualizacja dla netrunnera: pionowy diagram pięter w stylistyce cyberpunk (neon/terminal), pozycja netrunnera, odsłanianie pięter w miarę schodzenia (niezbadane ukryte), stan lodu
- [ ] Akcje netrunnera: pełen zestaw akcji interfejsu wg podręcznika jako przyciski z automatyką rzutów (testy vs DV, walka programów z lodem przez silnik z etapów 06/14); licznik akcji NET na turę wg zasad (speed interfejsu)
- [ ] Programy netrunnera: slot deck/programy na karcie (z kompendium), uruchamianie, efekty (bonusy, obrażenia, derezz), śledzenie zużycia
- [ ] Czarny lód: statbloki, inicjatywa lodu, ataki na netrunnera (obrażenia „meat" i NET wg zasad — spięte z HP karty przez etap 14)
- [ ] Synchronizacja z walką fizyczną: netrunning w ramach wspólnego trackera inicjatywy z etapu 13 (tura netrunnera = jego akcje NET), reszta drużyny widzi skrót działań na czacie
- [ ] Tryb podglądu MG: pełna architektura + pozycja netrunnera, możliwość ręcznego sterowania lodem

## Poza zakresem

- Netrunning botów-NPC przeciw graczom (bot jako wrogi netrunner — POMYSLY.md, złożenie z etapem 19), efekty wizualne 3D, architektury generowane proceduralnie (POMYSLY.md)

## Kryteria ukończenia

- MG buduje 4-piętrową architekturę z hasłem, plikiem i czarnym lodem; netrunner wykonuje pełny run: wbicie, łamanie hasła, walka z lodem (obrażenia w obie strony na kartach), kradzież pliku, wyjście — wszystko rzutami przez silnik, zalogowane na czacie
- Run odbywa się w trakcie walki fizycznej — tury netrunnera przeplatają się z turami reszty w jednym trackerze
- Gracze-nienetrunnerzy nie widzą nieodkrytych pięter (filtrowanie serwerowe)

## Wskazówki techniczne

- Wizualizacja pionowa: zwykły DOM/SVG wystarczy (lista pięter z animacjami CSS) — nie wciągaj tego w canvas Pixi mapy
- Stan runa (pozycja, odkryte piętra, HP lodu) jako część stanu combat/sceny — te same wzorce sync co wszędzie
- Zaprojektuj najpierw model danych architektury (JSON) i przetestuj na papierze z podręcznikiem — UI dopiero po tym
