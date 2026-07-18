# Assety — kości 3D

## Skąd pochodzą

Animacja 3D rzutów używa biblioteki [@3d-dice/dice-box-threejs](https://github.com/3d-dice/dice-box-threejs)
(licencja **MIT**, © 2022 3D Dice; bazuje na „Teal Dice" Antona Natarova — tych samych modelach,
z których wywodzą się kości Foundry VTT). Wybrana została zamiast popularniejszego
`@3d-dice/dice-box`, ponieważ **wspiera z góry ustalone wyniki** — u nas rzut wykonuje wyłącznie
serwer, a animacja tylko odtwarza jego rezultat (notacja `1d10+2d6@7,3,5`).

## Gdzie leżą assety

- `packages/client/public/dice/` — tekstury i dźwięki skopiowane z `node_modules/@3d-dice/dice-box-threejs/public/`
  (razem z plikiem LICENSE). Vite serwuje je pod `/dice/` (`assetPath` w `dice3d.ts`).
- Po aktualizacji wersji biblioteki skopiuj assety ponownie.

## Jak zmienić wygląd kości

Konfiguracja w `packages/client/src/dice3d.ts` (`theme_customColorset`): kolory tła/pipsów,
tekstura (`metal`, `fire`, `marble`, … — patrz katalog `public/dice/textures/`) i materiał
(`metal`, `plastic`, `glass`, `wood`). Dźwięki: `sounds`, `volume`, `sound_dieMaterial`.

## Kubek do rzucania

Ikona kubka (`DiceCup.tsx`, lewy dolny róg stołu) używa próbek dźwiękowych grzechotu
z tego samego zestawu (`public/dice/sounds/dicehit/dicehit_metal*.mp3`). Potrząsanie
myszą generuje entropię (SHA-256 z próbek ruchu) domieszaną do RNG serwera — patrz
`packages/server/src/realtime/dice-rng.ts`.

## Ograniczenia

- Renderowane są tylko kości d4/d6/d8/d10/d12/d20/d100 — inne (np. d3) pokazują się wyłącznie
  na karcie rzutu na czacie.
- Gdy WebGL jest niedostępny, animacja po cichu się wyłącza — karta rzutu działa zawsze
  (ścieżka degradacji zgodna z zasadami architektury).
