# Etap 19c — Streszczenia sesji, dziennik kampanii i relacje NPC↔postacie

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 19b (baza wiedzy i kontekst botów)

> **Pochodzenie:** wydzielony z etapu 19 dnia 08.08.2026 (decyzja MG). Trzecia i ostatnia
> część: pamięć, która narasta sama z rozegranych sesji.

## Cel sesji

Po sesji zostaje ślad. MG klika „zakończ sesję", model streszcza czat, streszczenie ląduje
w dzienniku kampanii (edytowalne) i w indeksie RAG — a NPC pamięta, kto mu wtedy pomógł, i
mówi do niego inaczej niż do tego, kto go wtedy okradł.

## Zakres

- [ ] **Streszczenie sesji** — przycisk MG „zakończ sesję": czat sesji → LLM (mapowanie-redukcja
      przy długich logach) → wpis dziennika; MG poprawia tekst przed zatwierdzeniem
- [ ] **Dziennik kampanii** — lista wpisów z datą i tytułem, edycja, indeksowanie w RAG jako
      trzecia kolekcja
- [ ] **Relacje NPC↔postacie** — struktura w DB (wartość sympatia/wrogość, notatka „skąd"),
      edycja ręczna przez MG
- [ ] **Propozycja aktualizacji relacji po streszczeniu** — model proponuje zmiany, MG
      zatwierdza pojedynczo; **nigdy automatycznie**
- [ ] **Relacja w prompcie bota** — gdy bot rozmawia z daną postacią, jego stosunek do niej
      wchodzi do promptu jako osobna linia
- [ ] Testy: mapowanie-redukcja na logu dłuższym niż kontekst, relacja wstrzykiwana tylko
      dla rozmówcy, którego dotyczy

## Poza zakresem

- Akcje mechaniczne botów → etap 20
- Automatyczna aktualizacja relacji bez zatwierdzenia MG
- Pamięć epizodyczna per bot ponad streszczenia → POMYSLY.md

## Kryteria ukończenia

- [ ] NPC zapytany o wydarzenie z poprzedniej (streszczonej) sesji odwołuje się do niego sensownie
- [ ] NPC „wrogi" postaci mówi do niej wyraźnie inaczej niż „przyjazny" — przy tym samym pytaniu
- [ ] Streszczenie logu dłuższego niż kontekst modelu powstaje bez obcięcia (mapowanie-redukcja)
- [ ] Żadna relacja nie zmienia się bez kliknięcia MG

## Wskazówki techniczne

- Streszczanie jest długie — musi iść w tle z widocznym postępem, nie blokować czatu
- Relacja to liczba **i** zdanie „skąd": sama liczba nie da się wstrzyknąć do promptu w
  sposób, który model zrozumie
- **Licencja:** treść dziennika i relacji to dane kampanii → `data/private/`
