# Etap 27b — Karta postaci: broń, pancerz i ekwipunek w stylu karty

**Faza:** I — Wykończenie · **Wymaga etapów:** 27a, 15 (rany), 16g (amunicja), 23b (ekonomia)

Druga z trzech części podziału opisanego w `etap-27a-karta-jak-oficjalna.md`.

## Cel sesji

Dolny pas strony pierwszej („BROŃ I PANCERZ") i prawa kolumna strony drugiej („Wyposażenie",
„Amunicja", „Gotówka", „Styl", „Zakwaterowanie", „Poziom życia") dostają wygląd z karty —
i wracają tam, gdzie karta je drukuje.

## Zakres

- [ ] **BROŃ I PANCERZ** jako pas pod stroną pierwszą (dziś: zakładka „Walka")
  - tabela broni z nagłówkiem `BROŃ · OBR. · AMUNICJA · LA · UWAGI`; przyciski ataku
    (Atak / Seria / Zapora / Obr.) zostają, ale w stylu karty
  - pancerz: `PANCERZ · OB · KARA` w wierszach **Głowa / Ciało / Tarcza** (dziś dowolna lista
    lokacji) + czerwony przypis „Kara dotyczy REF, ZW i RUCHU"
  - decyzja do podjęcia w sesji: czy zwijać lokacje pancerza do trzech wierszy karty, czy
    trzymać dzisiejszą listę i dorysować trzy wiersze jako podsumowanie
- [ ] **Krytyczne Urazy** i **Uzależnienia** w kolumnie tożsamości strony pierwszej
  - `Uzależnienia` to **nowe pole** w `CpredCharacterData` → zmiana w `packages/shared`,
    walidacja długości, migracja zgodna wstecz (brak pola = pusty tekst)
- [ ] **Wyposażenie** — tabela `WYPOSAŻENIE · UWAGI` w stylu karty, z wierszami `Amunicja`
      i `Gotówka` na czarnych plakietkach na dole (gotówka = saldo z etapu 23b, tylko do
      odczytu — pisze je wyłącznie serwer)
- [ ] **Styl**, **Zakwaterowanie**, **Wynajem**, **Poziom życia** — pola karty spięte
      z Poziomem życia z etapu 23b tam, gdzie już istnieje
- [ ] Cyborgizacje w zakładce „Ekwipunek" zostają na miejscu do etapu 27c (tam dostają
      sylwetkę)

## Poza zakresem

- Nowa mechanika — to jest wyłącznie przeprowadzka i skóra
- Ścieżka życia i sylwetka cyborgizacji (27c)

## Kryteria ukończenia

- Strona pierwsza karty ma komplet z wydruku: tożsamość, cechy, umiejętności, broń, pancerz
- Atak z karty, przeładowanie, ablacja pancerza i rany krytyczne działają jak przed zmianą
- Gotówka na karcie zgadza się z „Kasą" z etapu 23b i nie da się jej wpisać ręcznie
