# Etap 07 — Karta postaci: model i edytor

**Faza:** B — Stół MVP · **Wymaga etapów:** 02

## Cel sesji

Pełny model danych postaci Cyberpunk RED i edytowalny arkusz w UI, z uprawnieniami (gracz — swoja postać, MG — wszystkie).

## Zakres

- [x] Model `Character` (JSON w kolumnie + kluczowe pola relacyjne): statystyki (INT, REF, DEX, TECH, COOL, WILL, LUCK, MOVE, BODY, EMP), HP bieżące/max (wyliczane z BODY+WILL), rola i ranga zdolności roli, humanity, lista umiejętności z poziomami, ekwipunek (prosta lista — kompendium dojdzie w etapie 12), eddies, notatki, portret
- [x] Definicje umiejętności CP RED (polskie nazwy, przypisana statystyka) jako dane w `data/public/` — struktura umożliwiająca podmianę na pełne dane z podręcznika w etapie 12
- [x] Wyliczenia pochodne w `shared/systems/cpred`: HP max, próg poważnej rany (połowa HP), Death Save — z testami
- [x] UI arkusza: okno/panel z zakładkami (Statystyki i umiejętności / Walka / Ekwipunek / Biografia), edycja inline, autozapis (debounce) z sync realtime
- [x] Lista postaci kampanii: MG widzi wszystkie i tworzy nowe (gracze i NPC), gracz widzi swoje; przypisywanie postaci graczowi
- [x] Uprawnienia edycji egzekwowane na serwerze
- [x] Walidacja zakresów (statystyki 1–10 itd.) z komunikatami po polsku

## Poza zakresem

- Klikalne rzuty (etap 08), kompendium i przedmioty z danymi (etap 12), cyberware/humanity mechanika (etap 22), generator postaci (etap 24)

## Kryteria ukończenia

- MG tworzy postać, wypełnia cały arkusz, przypisuje graczowi; gracz edytuje ją u siebie, zmiany widać na żywo u MG
- HP max i próg rany przeliczają się same przy zmianie BODY/WILL (test jednostkowy)
- Gracz nie otworzy do edycji cudzej postaci

## Wskazówki techniczne

- Schemat postaci wersjonuj (`schemaVersion` w JSON) — ułatwi migracje, gdy w etapach 12/22 dojdą pola
- Rozdziel „definicję systemową" (lista umiejętności CP RED) od „danych postaci" (poziomy) — to fundament separacji rdzeń/system
- Arkusz projektuj od razu w układzie zbliżonym do karty CP RED (gracze ją znają), ale bez dopieszczania grafiki — szlif w etapie 26
