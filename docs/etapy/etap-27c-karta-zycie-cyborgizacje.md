# Etap 27c — Karta postaci: Ścieżka Życia i sylwetka cyborgizacji

**Faza:** I — Wykończenie · **Wymaga etapów:** 27a, 27b, 23a (cyborgizacje) · **sensownie po:** 25

Trzecia z trzech części podziału opisanego w `etap-27a-karta-jak-oficjalna.md`.

## Cel sesji

Strony druga i trzecia oficjalnej karty: ustrukturyzowana Ścieżka Życia zamiast jednego pola
„Notatki i biografia" oraz sylwetka z gniazdami cyborgizacji zamiast płaskiej listy wszczepów.

## Zakres

- [x] **Ścieżka Życia** jako pola, nie proza — szesnaście pól z karty (Kultura pochodzenia,
      Twój charakter, Ubiór i styl, Włosy, Co cenisz najbardziej, Relacje z innymi,
      Najważniejsza osoba, Najważniejszy przedmiot, Tło rodzinne, Środowisko rodzinne,
      Kryzys rodzinny, Cele życiowe, Ścieżka Życia Roli) + listy: **Przyjaciele**,
      **Tragiczna historia miłosna**, **Wrogowie** (Kto? · Przyczyna konfliktu? · Czym
      dysponuje? · Co zamierza?)
  - nowe pola w `CpredCharacterData` → `packages/shared` + walidacja na serwerze, zgodność
    wstecz (stare karty mają wyłącznie `notes`)
  - **spina się z etapem 25**: kreator lifepath wypełnia dokładnie te pola, a wróg z listy
    ma jednym kliknięciem stawać się szkicem bota (kryterium etapu 25). Jeśli 25 pójdzie
    pierwszy, ten etap tylko rysuje to, co 25 już zapisuje.
- [x] **Pseudonimy**, **Punkty Doświadczenia**, **Wydarzenia związane z Reputacją** —
      nagłówek strony drugiej; Reputacja już istnieje (23c) i tu tylko dostaje swoje miejsce
- [x] **Sylwetka cyborgizacji** (strona trzecia): własny SVG sylwetki (nie render z PDF-a —
      patrz granica prawna w 27a) z gniazdami Cyberaudio, Prawe/Lewe Cyberoko,
      Prawa/Lewa Cyberręka, Prawa/Lewa Cybernoga, Sprzęg neuralny + cztery listy boczne
      (wewnętrzne, zewnętrzne, cybermoda, borgizacje)
  - wszczep z etapu 23a ma **rodzinę** (`family`) — po niej wpis trafia do właściwego gniazda;
    wszczep bez rodziny ląduje na liście „Cyborgizacje wewnętrzne"
  - klik w gniazdo = ta sama lista wszczepów, co dziś w zakładce „Ekwipunek"
- [x] Człowieczeństwo i EMP w grze widoczne przy sylwetce (dziś w kolumnie tożsamości)

## Poza zakresem

- Nowa mechanika cyborgizacji (23a ją ma); wydruk karty do PDF-a

## Kryteria ukończenia

- Ścieżka Życia wypełniona ręcznie zapisuje się i wraca po przeładowaniu; stara karta z samym
  polem `notes` otwiera się bez błędu
- Wszczep zainstalowany z kompendium pokazuje się we właściwym gnieździe sylwetki
- Strona trzecia czyta się jak karta, a nie jak lista — bez ani jednego pliku z PDF-a w repo

## Jak wyszło (14.08.2026)

**Cztery pozycje zakresu odhaczone.** Odstępstwa i decyzje, które trzeba znać:

- **Ścieżka Życia nie potrzebowała ani jednego nowego pola** — 25b zdefiniował `CpredLifepath`
  dokładnie po to, żeby ten etap tylko go narysował. Doszły natomiast **etykiety w `shared`**
  (`LIFEPATH_SHEET_FIELDS`, `LIFEPATH_ENEMY_COLUMNS`): karta musi umieć podpisać własne rubryki
  **bez wczytanych tabel**, bo stara postać na świeżym klonie ma Ścieżkę i nie ma pliku danych.
- **Doszły dwa pola danych:** `aliases` (Pseudonimy) i `improvementPoints` (PD). PD jest
  **edytowalne przez gracza**, w odróżnieniu od Reputacji i eurodolców — „Gracze mogą wydawać
  Punkty Doświadczenia" (s. 411), więc to nie jest okienko MG.
- **Gniazdo na ciele to trzecie nowe pole:** `CpredCyberwareRow.bodySlot`. Etap 23a świadomie
  liczył gniazda **per rodzina** („podręcznik pyta: które oko?"), ale strona trzecia ma osobne
  okienko na prawe i lewe oko, więc rysunek bez tej odpowiedzi byłby kłamstwem. Rodziny z jednym
  miejscem (Cyberaudio, Sprzęg neuralny) trafiają tam same; oko i kończyna **czekają na wybór
  gracza** zamiast lądować w zgadywanym gnieździe.
- **Sylwetka to gotowy asset z domeny publicznej**, nie rysunek własny: `Human body
silhouette.svg` z Wikimedia Commons. Szczegóły i granica prawna w `docs/assety-karta-postaci.md`.
- **Zakładki poszły za stronami wydruku:** Karta · Ścieżka Życia · Cyborgizacje · Ekwipunek.
  Sekcja cyborgizacji **wyprowadziła się z „Ekwipunku"** na własną stronę.
- **Rysunek jest mapą, nie edytorem.** Gniazdo, uwagi i kosz są w tabeli pod nim; klik w nazwę
  na sylwetce podświetla wiersz. Ta sama zasada, którą 27a zastosowało do portretu i „Notatek":
  jedno pole, jeden edytor. Dlatego Człowieczeństwo i EMP przy sylwetce są **tylko do odczytu**.
