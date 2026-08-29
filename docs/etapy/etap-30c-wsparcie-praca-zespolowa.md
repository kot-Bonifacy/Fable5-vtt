# Etap 30c — Wsparcie Stróża Prawa i Praca Zespołowa Korpo

**Faza:** H — Świat CP RED · **Wymaga etapów:** 05 (tokeny), 14 (inicjatywa), 16b (statyści
z profilem bojowym), 30a (szkielet Zdolności Ról)

> **Podział z 2026-08-29** — patrz `etap-30-zdolnosci-rol.md`.
>
> **Poprawki opisu z 2026-08-29 (piąta sesja), policzone w podręczniku:**
>
> 1. Kategorii Wsparcia jest **sześć**, nie pięć: 1–2, 3–4, 5–7, 8, 9 i 10 mają na s. 158–159
>    własne ramki (trzy najwyższe to pojedyncze poziomy, bo funkcjonariusze przestają być
>    wymienni — Marshal na Supermotocyklu to nie dwóch twardzieli z C-SWAT).
> 2. Członkowie zespołu Korpo **nie mieszczą się w `CpredCombatProfile`**. „Członkowie zespołu
>    zbudowani są tak samo jak Postacie Graczy" (s. 154), a Korporacyjny Netrunner dostaje
>    w pakiecie **Interfejs 2 i cyberdek** — jako statysta nie mógłby zrobić jedynej rzeczy, do
>    której istnieje (`combatProfileSheet` ustawia `cyberdeck: null`). To samo dotyczy Szofera
>    (Prowadzenie pojazdów) i Technika (Cyberinżynieria): cztery z pięciu zawodów żyją głównie
>    **poza** wymianą ognia. Pracownik dostaje więc **pełną kartę postaci** (decyzja MG).
> 3. „Wsparcie nie może Unikać" **nie było martwym zapisem**: `attack:evade` w tym VTT unika
>    pocisków tak samo chętnie jak ostrzy (blokuje to wyłącznie Ludzka tarcza), a Wartość bojowa
>    każdej kategorii wynosi 8 lub więcej — czyli dokładnie tyle, ile RAW wymaga do uników przed
>    pociskami. Potrzebna była prawdziwa flaga.

## Cel sesji

Obie Zdolności robią jedno: **stawiają na mapie NPC-a ze statblokiem**, którego kontroluje MG.
Wsparcie wzywa funkcjonariuszy (s. 158–159), Praca Zespołowa daje Korpo zespół (s. 153–157:
ochroniarz, tajny agent, szofer, netrunner, technik). Maszyneria rozeszła się na dwie połowy:
Wsparcie → `CpredCombatProfile` → żeton → wiersz w Kolejce Inicjatywy; zespół → pełna karta
postaci własności MG, z Lojalnością zapisaną na karcie **pracodawcy**.

## Zakres

- [x] **Wsparcie** — rzut 1k10 ≤ poziom Zdolności w ramach Akcji; 1k6 Rund oczekiwania,
      szóstka podnosi kategorię (a przy poziomie 10 przysyła dwie grupy); **sześć** kategorii
      tabeli (Wartość bojowa, OB, PW, RUCH, BC)
- [x] Funkcjonariusze Wsparcia **nie mogą Unikać pocisków** — `noBulletDodge` w profilu bojowym,
      sprawdzane w `attack:evade` tak samo jak odmowa Ludzkiej tarczy
- [x] **Praca Zespołowa** — pięć typów członków zespołu, każdy z własnym statblokiem 1k6,
      pakietami Umiejętności +2/+4/+6, pancerzem i bronią; cyborgizacje prozą (RAW: „Empatii nie
      obniżamy — wzięto to już pod uwagę")
- [x] Wezwanie stawia żeton na scenie i wpisuje go do inicjatywy jednym ruchem
- [x] Nadużycie Wsparcia — MG dostaje przypomnienie w panelu, VTT nie karze samo
- [x] Testy: rzut wezwania, kategoria po szóstce, statbloki z tabeli

**Doszło poza pierwotnym zakresem** (bo bez tego druga połowa etapu nie działa):

- [x] Lojalność: start 1k6+1, Test 1k6 **mniej niż** Lojalność, tabela zysków i strat z s. 154,
      ścięcie do 10 między sesjami, zwolnienie
- [x] Odliczanie Rund do przybycia w `Combat.systemState` + wiersz „w drodze" w Kolejce
      Inicjatywy (`ReinforcementView`), z guzikami MG: postaw teraz / odwołaj / wskaż drugą grupę

## Poza zakresem

- Automatyczne prowadzenie wezwanych NPC przez bota — kontroluje ich MG (RAW)
- AV-4 i inne pojazdy Wsparcia poziomu 10 — bez etapu pojazdów zostają prozą
- Przywileje Pracy Zespołowej spoza zespołu (konap, Trauma Team, McPosiadłość) — wypisane
  w panelu jako zapis dla stołu; czynsz liczy Poziom życia z 23b, a nie ta Zdolność

## Kryteria ukończenia

- [x] Udane wezwanie stawia figury na mapie z pełnym profilem bojowym i wierszem inicjatywy
- [x] Wsparcie nie Unika, a karta ataku to mówi (odmowa `BACKUP_CANNOT_DODGE`)
