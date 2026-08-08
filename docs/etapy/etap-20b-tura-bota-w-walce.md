# Etap 20b — Tura bota w walce 🏁 Pełne boty

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 20a, 14b–14e, 15, 16–16h

> **Pochodzenie:** wydzielony z etapu 20 dnia 08.08.2026 (decyzja MG). Druga część: bot,
> który dostał w 20a prawo do rzucania kośćmi, dostaje tu pole bitwy.

## Cel sesji

Gdy tracker wskaże figurę prowadzoną przez bota, MG klika „Graj turę" — bot dostaje **stan
taktyczny** (kto go widzi, kto jest w zasięgu, ile ma PW, czym może strzelać), wybiera akcję
i wykonuje ją zgodnie ze swoim trybem autonomii. Wszystko przez ścieżki serwera zbudowane
w etapach 14b–16h: bot jest graczem, nie drugą mechaniką.

## Zakres

- [ ] **Stan taktyczny jako tekst** — zwięzła tabela: pozycje i dystanse widocznych figur,
      własne PW i statusy, dostępne bronie z trybami ognia i amunicją. Źródłem jest
      `hotbarSlotsFor` z 16f (to już jest „co ta figura potrafi teraz") plus widoczność z 18a
- [ ] **Rozszerzenie schematu akcji o walkę** — `atak`, `ruch`, `przeładowanie`, `pas`;
      cele jako enum widocznych figur, żeby atak na niewidoczny token był niemożliwy w gramatyce
- [ ] **„Graj turę"** w pasku tury i w zakładce „Walka” — przy figurze prowadzonej przez bota
- [ ] **Wykonanie przez istniejące ścieżki** — `attack:roll` (16b), `token:move` (14c),
      `weapon:reload` (16), `combat:action` (14b); bot nie dostaje ani jednej własnej gałęzi reguł
- [ ] **Obsługa odmowy** — nieprawidłowa akcja albo odmowa serwera → bot dostaje powód i
      **jedną** szansę poprawki, potem pas; wszystko widoczne w śladzie MG
- [ ] **Bezpieczniki celu** — cel musi istnieć, być widoczny dla tokenu bota i nie być samym
      botem; ruch i limit akcji egzekwuje twarda walidacja z 14b/14c, identyczna jak dla ludzi
- [ ] **Widoczność liczona per token, nie per gracz** — dziś ciemność i mgła MG nie wpływają
      na atak NPC-a (wpis w POMYSLY z 31.07); bot strzelający po ciemku wymaga domknięcia

## Poza zakresem

- Zaawansowana taktyka (wybór osłony, skupianie ognia, wycofanie się) — dopracowanie promptu
  taktycznego to POMYSLY
- Netrunning botów — po etapie 26
- Boty inicjujące akcje poza swoją turą (reakcje: Unik, Wyrwanie się)

## Kryteria ukończenia

- Walka testowa: bot-towarzysz w trybie **propozycja** proponuje sensowny atak, po
  zatwierdzeniu rzut i obrażenia przechodzą pełną ścieżką (PT z dystansu, pancerz, rany)
- Przełączenie na **automat** → następna tura wykonuje się sama, z rzutem na czacie
- Tryb **kontrolowany** oddaje mechanikę graczowi — bot tylko mówi
- Bot nie jest w stanie wykonać nielegalnej akcji (ruch ponad MOVE, atak na niewidoczny
  token) — potwierdzone testem z wymuszoną złą odpowiedzią LLM
- Cała tura bota mieści się w limicie czasu odpowiedzi z etapu 11

## Wskazówki techniczne

- Stan taktyczny serializuj zwięźle, z dystansami policzonymi z góry — 9B wybiera z gotowych
  opcji („możliwe cele: A 12 m, B 30 m") znacznie lepiej, niż liczy sam
- Bot działa dziś z uprawnieniami konta MG (tak jak jego wypowiedzi od etapu 11), a MG jest
  zwolniony z blokad (`realtime/movement.ts`) — **bezpieczniki muszą stać przed wywołaniem,
  nie za nim**
