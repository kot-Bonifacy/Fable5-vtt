# Etap 49 — Szybkie tworzenie NPC-ów i wrogów przez MG

**Faza:** przed betą (zlecenie MG z 10.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
25a (kreator), 35 (wiele figur, kopia figury), 38a (statysta jako karta), 43a („Postacie” w dwa
wiersze)

## Skąd ten etap

MG (10.10): „coś jest nie tak z tworzeniem przeciwników przez MG. Jest to dla mnie trochę
nieintuicyjne, i gdy zacząłem tworzyć postać z konta MG (Krawędziarz), to gracze widzieli moje
rzuty”. Wzór: Foundry VTT (katalog „Aktorzy” → „Utwórz” z imieniem i typem → przeciągnij na mapę).

Co MG wskazał jako nieintuicyjne (ankieta z 10.10):

1. **Trzy drogi do NPC-a i nie wiadomo, którą iść** — „🧬 Kreator postaci…”, jednowierszowy
   formularz „Imię + Utwórz” (pusta karta) i szybkie statystyki w menu figury.
2. **Kreator jest za długi na wroga** (Rola, Cechy, Umiejętności, zakupy — dla gangera, który
   pada po trzech strzałach).
3. **Brak gotowych przeciwników.**
4. **Karta → mapa niejasne:** nie wiadomo, jak postawić pięciu takich samych, a przy
   przeciąganiu z listy za kursorem idzie bardzo duży portret zamiast małej figury.
5. **Rzuty kreatora MG widzi cały stół** — `publishRoll` w `realtime/creation.ts` zapisywał
   każdy rzut (Cechy Krawędziarza, Ścieżka Życia) jako jawny `roll`, bez względu na autora.

## Decyzje MG z 10.10

1. **Rzuty kreatora wykonane przez MG widzi zawsze tylko MG** (`gmroll`), bez przełącznika.
2. **Jedno okno „Nowa postać”** z typem: **Statysta** (ganger, ochroniarz), **Nazwany NPC**
   (fikser, boss), **Postać gracza** (prowadzi do kreatora). Statysta i Nazwany NPC mają pola
   **statbloku z podręcznika** — Cechy, PW, pancerz głowa/tułów, broń z Kompendium, kilka
   Umiejętności — i zapisują się do zwykłej karty, którą da się potem rozwinąć.
3. **Statysta → kopie, Nazwany → jedna karta** (Foundry: aktor niepowiązany / powiązany).
   Karta statysty jest **wzorcem**: każde postawienie na mapie robi „Ganger 1”, „Ganger 2”…
   z własną kartą (PW, amunicja, rany), a wzorzec zostaje nietknięty w grupie „Wzorce”.
4. **Losowy NPC jednym klikiem = Krawędziarz automatem:** Rola → serwer losuje wiersz Cech
   z tabeli Roli, Umiejętności i ekwipunek z pakietu Roli. Rzut widzi tylko MG.
5. Bestiariusza gotowych statbloków z DLC **nie** robimy (zostaje w `POMYSLY.md`).
6. **Dwie sesje:** 49a → 49b.

## Zakres

### 49a — ukryte rzuty MG, okno „Nowa postać”, wzorce i kopie, mały portret (✅ 10.10)

- [x] Rzuty kreatora MG jako `gmroll` (Cechy Krawędziarza, Ścieżka Życia, przerzut)
- [x] `Character.template` + `Character.templateId` (migracja); widok karty niesie oba pola;
      eksport i import kampanii je przenoszą
- [x] `token:create` z kartą-wzorcem bez właściciela zakłada **kopię karty** („Ganger 1”…)
      i stawia figurę na kopii; `token:duplicate` kopii zachowuje `templateId`
- [x] Figura kopii ginie razem ze swoją kartą bez pytania (`figure-cards.ts`)
- [x] `cpredNpcSheet` w `shared` (statblok → karta, testy) + `character:create` z polem `npc`
- [x] Okno „Nowa postać” (`NpcCreateWindow`) zamiast formularza „Imię + Utwórz” i osobnego
      przycisku kreatora u MG; typ „Postać gracza” otwiera kreator
- [x] „Postacie” u MG: grupa „Wzorce” (otwarta) i „Statyści z wzorców (N)” (zwinięta);
      przełącznik wzorca w wierszu karty NPC-a
- [x] Mały portret (rozmiar figury) za kursorem przy przeciąganiu z listy
- [x] Testy `shared` i serwera; oględziny w Firefoksie

**Odstępstwa 49a:** stare karty rzutów kreatora MG sprzed poprawki zostają jawne na czacie
(nie przepisujemy historii). Okno nie edytuje istniejącej karty — NPC-a rozwija się na zwykłej
karcie. Formularz „Imię + Utwórz” usunięty; pusta karta to „Nazwany NPC” bez zmian w polach.
Lista broni w oknie pomija „Bijatykę” i „Sztuki walki” (karta dostaje je sama, 47b).

### 49b — losowy NPC z Roli (✅ 10.10)

**Decyzje MG z 10.10 (druga sesja):** Umiejętności = **tabela Ulicznika + rozrzut** (kilka
punktów przesuniętych losowo, suma 86 zostaje); z pakietu Roli **tylko broń i pancerz**
(bez amunicji, sprzętu, mody i cyborgizacji); przycisk **wymaga wybranej Roli**.

- [x] „🎲 Losuj z Roli” w oknie „Nowa postać”: wiersz Cech z tabeli Roli, Umiejętności
      i ekwipunek z pakietu Roli (dane kreatora), rzut jako `gmroll`; wynik wypełnia formularz,
      MG może poprawić i „Utwórz”
- [x] Pakiety Ulicznika w `data/private/cpred/creation.json` (`streetrat`, przepisane z PDF-a:
      Umiejętności s. 86–87, broń i pancerz s. 98), wymyślona próbka w `data/public`
- [x] Pole „Tarcza” i „Ranga” Roli w oknie (`armorShieldId`, `roleRank`)
- [x] Testy `shared` i serwera; oględziny w Firefoksie

**Odstępstwa 49b:** granaty z pakietu (błyskowy, łzawiący, dymny) pominięte — w VTT to amunicja,
a statysta strzela „bez dna”; alternatywa „granat lub X” daje pół na pół X albo nic. Rozrzut
przesuwa poziom tylko między Umiejętnościami tej samej ceny, więc (×2) zostaje z tabeli. U Rockera
i Medyka Broń długa / Broń biała jak na listach Ról wydania polskiego (angielska tabela ma je
odwrotnie). Fixer dostaje dwa pistolety (C. lub B.C.) jak w tabeli angielskiej. Statblok
z losowania nie ma imienia — pole „Nazwa” dostaje nazwę Roli, gdy było puste. Solo z Rangą 4
pokazuje na karcie „Po kreatorze zostało: Zmysł Walki” — MG rozdziela punkty jak u każdej karty.

## Kryteria ukończenia

- MG tworzy gangera w jednym oknie bez kreatora, przeciąga go pięć razy na mapę i ma pięć
  figur z osobnymi kartami i numerami; wzorzec zostaje nietknięty.
- Żaden rzut kreatora MG nie trafia do gracza (sprawdzone drugą sesją gracza).
- Losowy NPC z Roli powstaje bez przechodzenia kreatora.
- Testy przechodzą, oględziny w Firefoksie.
