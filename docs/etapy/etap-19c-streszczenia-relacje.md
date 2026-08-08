# Etap 19c — Streszczenia sesji, dziennik kampanii i relacje NPC↔postacie

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 19b (baza wiedzy i kontekst botów)

> **Pochodzenie:** wydzielony z etapu 19 dnia 08.08.2026 (decyzja MG). Trzecia i ostatnia
> część: pamięć, która narasta sama z rozegranych sesji.

## Cel sesji

Po sesji zostaje ślad. MG klika „zakończ sesję", model streszcza czat, streszczenie ląduje
w dzienniku kampanii (edytowalne) i w indeksie RAG — a NPC pamięta, kto mu wtedy pomógł, i
mówi do niego inaczej niż do tego, kto go wtedy okradł.

## Zakres

- [x] **Streszczenie sesji** — przycisk MG „zakończ sesję": czat sesji → LLM (mapowanie-redukcja
      przy długich logach) → wpis dziennika; MG poprawia tekst przed zatwierdzeniem
- [x] **Dziennik kampanii** — lista wpisów z datą i tytułem, edycja, indeksowanie w RAG jako
      trzecia kolekcja
- [x] **Relacje NPC↔postacie** — struktura w DB (wartość sympatia/wrogość, notatka „skąd"),
      edycja ręczna przez MG
- [x] **Propozycja aktualizacji relacji po streszczeniu** — model proponuje zmiany, MG
      zatwierdza pojedynczo; **nigdy automatycznie**
- [x] **Relacja w prompcie bota** — gdy bot rozmawia z daną postacią, jego stosunek do niej
      wchodzi do promptu jako osobna linia
- [x] Testy: mapowanie-redukcja na logu dłuższym niż kontekst, relacja wstrzykiwana tylko
      dla rozmówcy, którego dotyczy

## Poza zakresem

- Akcje mechaniczne botów → etap 20
- Automatyczna aktualizacja relacji bez zatwierdzenia MG
- Pamięć epizodyczna per bot ponad streszczenia → POMYSLY.md

## Kryteria ukończenia

- [x] NPC zapytany o wydarzenie z poprzedniej (streszczonej) sesji odwołuje się do niego sensownie
- [x] NPC „wrogi" postaci mówi do niej wyraźnie inaczej niż „przyjazny" — przy tym samym pytaniu
- [x] Streszczenie logu dłuższego niż kontekst modelu powstaje bez obcięcia (mapowanie-redukcja)
- [x] Żadna relacja nie zmienia się bez kliknięcia MG

## Wskazówki techniczne

- Streszczanie jest długie — musi iść w tle z widocznym postępem, nie blokować czatu
- Relacja to liczba **i** zdanie „skąd": sama liczba nie da się wstrzyknąć do promptu w
  sposób, który model zrozumie
- **Licencja:** treść dziennika i relacji to dane kampanii → `data/private/`

## Jak to wyszło (08.08.2026)

**Cztery rozstrzygnięcia MG przed kodem.** (1) Jedno streszczenie obejmuje **czat od
ostatniego wpisu dziennika do teraz**, niezależnie od scen — sesja to wieczór przy stole, nie
mapa. (2) Do logu wchodzą **wyłącznie wypowiedzi publiczne**: bez rzutów (mechanika, o której
NPC nie ma prawa mówić) i bez szeptów — dziennik jedzie do indeksu, który czytają boty, więc
szept nie ma tędy jak wyciec. (3) Dziennik ma **te same uprawnienia co baza wiedzy z 19b**
(widoczność + tagi), ale wpis rodzi się jako „tylko MG": streszczenie zna całą sesję, także to,
przy czym NPC-a nie było. (4) Relacja wiąże bota z **kartą postaci**, nie z kontem gracza, w skali
−3…+3 — NPC zna Vexa, a nie osobę przy klawiaturze.

**Zweryfikowane na żywym modelu:** streszczenie 4 wypowiedzi (tytuł od modelu, szkic do
poprawy), NPC odwołujący się do streszczonej sesji na czacie, propozycja relacji
„Barman → Kaya: 0 → −2" zatwierdzona jednym kliknięciem oraz A/B nastawienia (ten sam prompt,
trzy wartości relacji — odpowiedzi różnią się tonem w sposób nie do pomylenia). Mapowanie-redukcja
na logu dłuższym niż kontekst jest pokryta testem serwera (ciasny kontekst w atrapie), nie
oderwana na żywym modelu — wymagałoby to kilku tysięcy wypowiedzi na czacie.
