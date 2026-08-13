# Etap 27b — Karta postaci: broń, pancerz i ekwipunek w stylu karty

**Faza:** I — Wykończenie · **Wymaga etapów:** 27a, 15 (rany), 16g (amunicja), 23b (ekonomia)

Druga z trzech części podziału opisanego w `etap-27a-karta-jak-oficjalna.md`.

## Cel sesji

Dolny pas strony pierwszej („BROŃ I PANCERZ") i prawa kolumna strony drugiej („Wyposażenie",
„Amunicja", „Gotówka", „Styl", „Zakwaterowanie", „Poziom życia") dostają wygląd z karty —
i wracają tam, gdzie karta je drukuje.

## Zakres

- [x] **BROŃ I PANCERZ** jako pas pod stroną pierwszą (dziś: zakładka „Walka")
  - tabela broni z nagłówkiem `BROŃ · OBR. · AMUNICJA · LA · UWAGI`; przyciski ataku
    (Atak / Seria / Zapora / Obr.) zostają, ale w stylu karty
  - pancerz: `PANCERZ · OB · KARA` w wierszach **Głowa / Ciało / Tarcza** (dziś dowolna lista
    lokacji) + czerwony przypis „Kara dotyczy REF, ZW i RUCHU"
  - ~~decyzja do podjęcia w sesji~~ **rozstrzygnięte:** trzy stałe wiersze wydruku pokazują
    sztukę wybraną przez `effectiveArmor` (tę, która naprawdę zatrzyma strzał), a zdjęte
    i słabsze schodzą do listy „Reszta pancerza" pod spodem
- [x] **Krytyczne Urazy** i **Uzależnienia** w kolumnie tożsamości strony pierwszej
  - `Uzależnienia` to **nowe pole** w `CpredCharacterData` → zmiana w `packages/shared`,
    walidacja długości, migracja zgodna wstecz (brak pola = pusty tekst)
- [x] **Wyposażenie** — tabela `WYPOSAŻENIE · UWAGI` w stylu karty, z wierszami `Amunicja`
      i `Gotówka` na czarnych plakietkach na dole (gotówka = saldo z etapu 23b, tylko do
      odczytu — pisze je wyłącznie serwer)
- [x] **Styl**, **Zakwaterowanie**, **Wynajem**, **Poziom życia** — pola karty spięte
      z Poziomem życia z etapu 23b tam, gdzie już istnieje
- [x] Cyborgizacje w zakładce „Ekwipunek" zostają na miejscu do etapu 27c (tam dostają
      sylwetkę)
- [x] Zakładka „Walka" **usunięta** — po przeprowadzce nie zostało w niej nic, a pusta
      zakładka mówiłaby, że to samo mieszka w dwóch miejscach (decyzja MG)

## Poza zakresem

- Nowa mechanika — to jest wyłącznie przeprowadzka i skóra
- Ścieżka życia i sylwetka cyborgizacji (27c)

## Kryteria ukończenia

- [x] Strona pierwsza karty ma komplet z wydruku: tożsamość, cechy, umiejętności, broń, pancerz
- [x] Atak z karty, przeładowanie, ablacja pancerza i rany krytyczne działają jak przed zmianą
      (rana krytyczna sama — patrz „nieodklikane" w `POSTEP.md`: MG nie ma czym jej nadać)
- [x] Gotówka na karcie zgadza się z „Kasą" z etapu 23b i nie da się jej wpisać ręcznie

## Poza planem, zrobione przy okazji

Trzy nowe pola zamiast jednego: obok wymaganych `Uzależnień` doszły `Styl` i `Amunicja`
(zapas) — obu karta nie miała gdzie zapisać, a bez nich prawa kolumna strony drugiej byłaby
niepełna. Wszystkie trzy to proza z jednym limitem `SHEET_LINE_MAX_LENGTH`.

**Naprawiony błąd z 27a:** reguła `@container (max-width: 700px)` nigdy nie działała, bo
kontenerem była `.sheet-page`, czyli ten sam element, który reguła miała złożyć w jedną
kolumnę — `@container` stylizuje **potomków** kontenera, nigdy jego samego. Kontener
przeniósł się na `.sheet-body`.
