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

- [x] **Stan taktyczny jako tekst** — zwięzła tabela: pozycje i dystanse widocznych figur,
      własne PW i statusy, dostępne bronie z trybami ognia i amunicją. Źródłem jest
      `hotbarSlotsFor` z 16f (to już jest „co ta figura potrafi teraz") plus widoczność z 18a
- [x] **Rozszerzenie schematu akcji o walkę** — `atak`, `ruch`, `przeładowanie`, `pas`;
      cele jako enum widocznych figur, żeby atak na niewidoczny token był niemożliwy w gramatyce
- [x] **„Graj turę"** w pasku tury i w zakładce „Walka” — przy figurze prowadzonej przez bota
- [x] **Wykonanie przez istniejące ścieżki** — `attack:roll` (16b), `token:move` (14c),
      `weapon:reload` (16), `combat:action` (14b); bot nie dostaje ani jednej własnej gałęzi reguł
- [x] **Obsługa odmowy** — nieprawidłowa akcja albo odmowa serwera → bot dostaje powód i
      **jedną** szansę poprawki, potem pas; wszystko widoczne w śladzie MG
- [x] **Bezpieczniki celu** — cel musi istnieć, być widoczny dla tokenu bota i nie być samym
      botem; ruch i limit akcji egzekwuje twarda walidacja z 14b/14c, identyczna jak dla ludzi
- [x] **Widoczność liczona per token, nie per gracz** — dziś ciemność i mgła MG nie wpływają
      na atak NPC-a (wpis w POMYSLY z 31.07); bot strzelający po ciemku wymaga domknięcia

## Odstępstwa od planu (uzgodnione z MG przed kodem)

1. **`ruch` rozbity na `podejście` i `odwrót`.** Piąte pole schematu („kierunek") musiałoby —
   po lekcji z 20a — być wymagane przy KAŻDEJ decyzji, także przy „pas". Dwa słowa akcji
   zamiast pola: mniej szumu dla 9B, ten sam zakres.
2. **Tura zawsze na klik, także w trybie automat.** Opis mówił „bot dostaje pole bitwy, gdy
   tracker wskaże figurę"; MG wybrał, żeby tempo walki należało do stołu. Automat różni się
   od propozycji tym, co dzieje się PO kliknięciu, nie tym, kto klika.
3. **Bot prowadzi wyłącznie figurę ze swoją kartą postaci.** Statysta (token z profilem
   bojowym, bez karty) nie ma jak zostać przypisany — prowadzenie statystów poszło do POMYSLY.
4. **`combat:action` nie jest wołane.** Zakres wymieniał je wśród ścieżek, ale żadna z czterech
   akcji bota nie jest akcją katalogową: atak, ruch i przeładowanie mają własne ścieżki (które
   same księgują budżet), a „pas" jest brakiem akcji. Wołanie `combat:action` byłoby drugim
   zapisem tego samego wydatku.

## Poza zakresem

- Zaawansowana taktyka (wybór osłony, skupianie ognia, wycofanie się) — dopracowanie promptu
  taktycznego to POMYSLY
- Netrunning botów — po etapie 26
- Boty inicjujące akcje poza swoją turą (reakcje: Unik, Wyrwanie się)

## Kryteria ukończenia

- [x] Walka testowa: bot w trybie **propozycja** proponuje sensowny atak, po zatwierdzeniu
      rzut przechodzi pełną ścieżką `attack:roll` (PT z dystansu, amunicja, budżet tury).
      **Rozliczenie obrażeń jest nietknięte i pozostaje ręczne** — karta ataku oferuje MG
      „Zastosuj na celu" z etapu 15 dokładnie tak jak przy strzale człowieka
- [x] Przełączenie na **automat** → tura wykonuje się bez pytania, z rzutem na czacie
      (po kliknięciu „Graj turę" — patrz odstępstwo 2)
- [x] Tryb **kontrolowany** oddaje mechanikę graczowi — bot tylko mówi (przebieg decyzyjny
      w ogóle nie dociera do modelu)
- [x] Bot nie jest w stanie wykonać nielegalnej akcji (ruch ponad MOVE, atak na niewidoczny
      token) — potwierdzone testem z wymuszoną złą odpowiedzią LLM
- [ ] **Niezmierzone na żywym modelu:** cała tura bota mieści się w limicie czasu z etapu 11.
      Architektura mówi „dwa przebiegi decyzyjne pod gramatyką", a 20a zmierzyło jeden na
      0,50–1,10 s, więc szacunek to ~2 s — ale pomiaru na żywym llama-serverze nie było,
      bo cała sesja szła na atrapie gatewaya

## Wskazówki techniczne

- Stan taktyczny serializuj zwięźle, z dystansami policzonymi z góry — 9B wybiera z gotowych
  opcji („możliwe cele: A 12 m, B 30 m") znacznie lepiej, niż liczy sam
- Bot działa dziś z uprawnieniami konta MG (tak jak jego wypowiedzi od etapu 11), a MG jest
  zwolniony z blokad (`realtime/movement.ts`) — **bezpieczniki muszą stać przed wywołaniem,
  nie za nim**
