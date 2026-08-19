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

**Od etapu 27d skórki są danymi, nie stałą w kodzie animacji.** Katalog leży w
`packages/client/src/dice-skins.ts`: pięć skórek do wyboru (Neon, Krew, Chrom, Kwas, Karta)
plus dwie zarezerwowane dla dorzutu krytyka i fumble'a. Każda niesie `theme_customColorset`
biblioteki — kolor ścianki, kolor oczek, obrys, teksturę i materiał — a `dice3d.ts` przełącza
ją przez `updateConfig` tuż przed rzutem.

Wybór należy do gracza (okno „⚙ Ustawienia") i **jedzie z rzutem**: serwer stempluje skórkę
rzucającego na każdej karcie rzutu, więc przy stole widać jego kości, nie swoje. Dlatego
identyfikator skórki mieszka w bazie (`User.diceSkin`), a nie w `localStorage`.

Trzy rzeczy, o które łatwo się potknąć przy dokładaniu skórki:

1. **Nazwy tekstur pochodzą z listy biblioteki, nie z katalogu plików.** `public/dice/textures/`
   ma m.in. `noise.webp`, którego lista nie zna — taka nazwa daje kość gładką bez ostrzeżenia.
   Działające: cloudy, cloudy_2, fire, marble, water, ice, paper, speckles, glitter, glitter_2,
   stars, stainedglass, wood, metal, skulls, leopard, tiger, cheetah, dragon, lizard, bird,
   astral, bronze01–04, none.
2. **`material` zapisuje się na współdzielonym deskryptorze tekstury.** Dwie skórki o tej samej
   teksturze muszą mieć ten sam materiał, bo inaczej ostatnio wczytana przestawi też poprzednią.
3. **Po każdej zmianie motywu trzeba zawołać `loadSounds()`.** Biblioteka wczytuje jeden zestaw
   próbek uderzeń — ten pasujący do materiału startowego — a jej obsługa kolizji indeksuje go
   bez sprawdzania. Przełączenie metalu na pudełko, które wystartowało na plastiku, wywala
   `Cannot read properties of undefined (reading 'length')` przy każdym stuknięciu kości.

Głośność kości i grzechotu kubka są w tym samym oknie ustawień (prywatne, `localStorage`);
`volume` czyta się w bibliotece w momencie odtwarzania, więc wystarczy je przypisać.

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
