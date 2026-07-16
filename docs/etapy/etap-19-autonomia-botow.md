# Etap 19 — Autonomia botów w mechanice 🏁 Pełne boty

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 13, 14, 15, 18

## Cel sesji

Boty działają w mechanice gry zgodnie z ankietą: pełna automatyka (bot sam rzuca i rusza tokenem) z przełącznikiem MG na tryb propozycji zatwierdzanych lub kontroli przez wskazaną osobę.

## Zakres

- [ ] Akcje botów jako structured output: zdefiniowany zestaw akcji (rzut na umiejętność, atak na cel, ruch tokenu, wypowiedź, użycie przedmiotu, pas) w formacie JSON wymuszanym gramatyką llama.cpp (GBNF/json_schema); walidacja zod po stronie serwera
- [ ] Tryby autonomii per bot (przełącznik MG w profilu i szybki w UI sesji):
  - **automat** — akcja wykonywana od razu
  - **propozycja** — bot pisze zamiar („rzucam na Handel"), przy wiadomości przyciski Zatwierdź/Odrzuć (MG lub wskazany gracz)
  - **kontrolowany** — bot tylko mówi; mechanikę wykonuje za niego przypisany gracz/MG
- [ ] Wykonanie akcji przez istniejące systemy: te same ścieżki serwera co dla graczy (rzuty z etapu 06/08, atak+DV z 15, obrażenia z 14, ruch z 05) — bot jest „graczem" z uprawnieniami do swojej postaci
- [ ] Tura bota w walce: gdy tracker wskaże bota-towarzysza/NPC bota, MG klika „graj turę" → bot dostaje stan taktyczny (pozycje widocznych tokenów, dystanse, HP własne, dostępna broń) → decyduje → akcja wg trybu autonomii
- [ ] Bezpieczniki: whitelist akcji, limit akcji na turę, ruch ≤ MOVE postaci, cel musi istnieć i być widoczny — walidacja serwerowa identyczna jak dla ludzi; nieprawidłowa akcja → bot dostaje błąd i jedną szansę poprawki, potem pas
- [ ] Log przejrzystości: każda akcja bota na czacie z oznaczeniem „(bot)" i rozbiciem rzutu jak u graczy

## Poza zakresem

- Zaawansowana taktyka (osłony, skupianie ognia) — dopracowanie promptu taktycznego to POMYSLY.md; netrunning botów (po etapie 25); boty inicjujące akcje poza swoją turą

## Kryteria ukończenia

- Walka testowa: bot-towarzysz w trybie **propozycja** proponuje sensowny atak, po zatwierdzeniu rzut i obrażenia przechodzą pełną ścieżką; przełączenie na **automat** → następna tura wykonuje się sama; tryb **kontrolowany** oddaje mechanikę graczowi
- Bot nie jest w stanie wykonać nielegalnej akcji (ruch ponad MOVE, atak na niewidoczny token) — potwierdzone testem z wymuszoną złą odpowiedzią LLM
- Poza walką: bot poproszony na czacie „rzuć na Percepcję" proponuje/wykonuje rzut zgodnie z trybem

## Wskazówki techniczne

- Gramatyka JSON w llama.cpp bywa kapryśna przy dużych schematach — trzymaj schemat akcji płaski i mały; enum akcji zamiast zagnieżdżonych wariantów
- Stan taktyczny serializuj zwięźle (tabela tekstowa, dystanse policzone z góry) — 9B lepiej wybiera z gotowych opcji („możliwe cele: A 12 m, B 30 m") niż liczy sam
- Decyzję bota loguj w całości (prompt+odpowiedź) do pliku debug — strojenie będzie iteracyjne
