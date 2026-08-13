# Etap 27c — Karta postaci: Ścieżka Życia i sylwetka cyborgizacji

**Faza:** I — Wykończenie · **Wymaga etapów:** 27a, 27b, 23a (cyborgizacje) · **sensownie po:** 25

Trzecia z trzech części podziału opisanego w `etap-27a-karta-jak-oficjalna.md`.

## Cel sesji

Strony druga i trzecia oficjalnej karty: ustrukturyzowana Ścieżka Życia zamiast jednego pola
„Notatki i biografia" oraz sylwetka z gniazdami cyborgizacji zamiast płaskiej listy wszczepów.

## Zakres

- [ ] **Ścieżka Życia** jako pola, nie proza — szesnaście pól z karty (Kultura pochodzenia,
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
- [ ] **Pseudonimy**, **Punkty Doświadczenia**, **Wydarzenia związane z Reputacją** —
      nagłówek strony drugiej; Reputacja już istnieje (23c) i tu tylko dostaje swoje miejsce
- [ ] **Sylwetka cyborgizacji** (strona trzecia): własny SVG sylwetki (nie render z PDF-a —
      patrz granica prawna w 27a) z gniazdami Cyberaudio, Prawe/Lewe Cyberoko,
      Prawa/Lewa Cyberręka, Prawa/Lewa Cybernoga, Sprzęg neuralny + cztery listy boczne
      (wewnętrzne, zewnętrzne, cybermoda, borgizacje)
  - wszczep z etapu 23a ma **rodzinę** (`family`) — po niej wpis trafia do właściwego gniazda;
    wszczep bez rodziny ląduje na liście „Cyborgizacje wewnętrzne"
  - klik w gniazdo = ta sama lista wszczepów, co dziś w zakładce „Ekwipunek"
- [ ] Człowieczeństwo i EMP w grze widoczne przy sylwetce (dziś w kolumnie tożsamości)

## Poza zakresem

- Nowa mechanika cyborgizacji (23a ją ma); wydruk karty do PDF-a

## Kryteria ukończenia

- Ścieżka Życia wypełniona ręcznie zapisuje się i wraca po przeładowaniu; stara karta z samym
  polem `notes` otwiera się bez błędu
- Wszczep zainstalowany z kompendium pokazuje się we właściwym gnieździe sylwetki
- Strona trzecia czyta się jak karta, a nie jak lista — bez ani jednego pliku z PDF-a w repo
