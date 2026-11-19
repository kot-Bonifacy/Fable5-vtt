# Atrybucja wbudowanej drogi (kreator pościgu)

Tło sceny pościgu widziane z góry, poziome (domyślnie jazda w lewo), 1 m na kratkę po 100 px.
Układ jezdni (pas, liczba pasów, kierunek, rozmiar) powtarza `CHASE_ROADS`
w `packages/shared/src/chase-roads.ts`.

Do 19.11.2026 leżały tu też cztery drogi rysowane skryptem `tools/art/chase-roads.py` z asfaltu
ambientCG (CC0): Autostrada, Ulica 2+2, Estakada i Badlands. MG usunął je razem ze skryptem
(etap 72a) — zostaje wyłącznie Neonowa ulica.

## Neonowa ulica (05.11.2026)

`neon-street.webp` (tło, 35 × 24 kratki, pas jezdni w wierszach 6–18) i `neon-street-strip.webp`
(cała pętla, ok. 238 kratek, przewijana pod sceną zamiast tła) skleja `tools/art/chase-neon-street.py`
z trzech map ulic własnego autorstwa MG (grafiki wygenerowane przez MG, przekazane do repozytorium
przez MG 05.11.2026; źródła poza repozytorium). Skrypt wyrównuje jezdnie, łączy odcinki
i rysuje od nowa linie przerywane.
