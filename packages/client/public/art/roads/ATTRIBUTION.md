# Atrybucja wbudowanych dróg (kreator pościgu, 03.11.2026)

Tła sceny pościgu widziane z góry, poziome (domyślnie jazda w lewo), 35 × 18 kratek po 100 px (1 m na kratkę).
Rysuje je `tools/art/chase-roads.py`; układ jezdni (pas, kierunek, rozmiar) powtarza
`CHASE_ROADS` w `packages/shared/src/chase-roads.ts`. Każda droga ma okres 32 kratek, a ostatnie
3 kratki powtarzają pierwsze — szew bieżni (`CHASE_SEAM_SQUARES`) przenika dwa identyczne pasy
i znika.

Źródła (pobierane przez skrypt do `tools/art/.cache/`, poza repozytorium):

- [Asphalt 031](https://ambientcg.com/view?id=Asphalt031) — ambientCG, licencja
  [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/): jezdnia, chodniki, beton barier.
- [Asphalt 033](https://ambientcg.com/view?id=Asphalt033) — ambientCG, CC0 1.0: żwir poboczy
  autostrady i piach Badlands.

Reszta (linie, bariery, neony, przepaść pod estakadą, krzaki i pęknięcia) to własny rysunek
skryptu.

| Plik            | Droga      | Pas jezdni (wiersze) |
| --------------- | ---------- | -------------------- |
| `highway.webp`  | Autostrada | 2–16                 |
| `street.webp`   | Ulica 2+2  | 2–16                 |
| `viaduct.webp`  | Estakada   | 3–15                 |
| `badlands.webp` | Badlands   | 4–14                 |

`*-thumb.webp` to miniatury do kreatora.

## Neonowa ulica (05.11.2026)

`neon-street.webp` (tło, 35 × 24 kratki, pas jezdni w wierszach 6–18) i `neon-street-strip.webp`
(cała pętla, ok. 238 kratek, przewijana pod sceną zamiast tła) skleja `tools/art/chase-neon-street.py`
z trzech map ulic własnego autorstwa MG (grafiki wygenerowane przez MG, przekazane do repozytorium
przez MG 05.11.2026; źródła poza repozytorium). Skrypt wyrównuje jezdnie, łączy odcinki
i rysuje od nowa linie przerywane.
