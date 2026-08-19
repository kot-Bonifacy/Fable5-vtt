# Etap 27d — Kubek i kości 3D: skórki, dorzut, ustawienia

**Faza:** I — Wykończenie · **Wymaga etapów:** 06 (silnik kości i kubek), 27a (motyw dzień/noc)

> **Podział z 2026-08-19.** Po wydzieleniu 27a–27c (karta postaci) etap 27 nadal niósł cztery
> osobne kawałki roboty: kości, motyw całej aplikacji, szlif UX i wydajność. Zostały rozbite na
> **27d** (ten plik), **27e** (motyw), **27f** (szlif UX), **27g** (wydajność). W etapie 27
> nie zostaje nic — po zamknięciu czwórki idzie do archiwum jako rozdzielony.

## Cel sesji

Kości przestają być jednym czerwonym zestawem dla wszystkich. Każdy gracz wybiera **swoje**
kości, a stół widzi je przy jego rzutach — jak w Foundry. Dorzut krytyka wjeżdża **osobno**,
po osiadnięciu pierwszej fali, w skórce, której nie da się pomylić z resztą. Powstaje też
pierwsze **okno ustawień** — jedno miejsce na wszystko, co dziś rozpycha górny pasek.

## Decyzje MG (2026-08-19)

| Pytanie                       | Decyzja                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Czyją skórkę widzą pozostali? | **rzucającego** — skórka jedzie z rzutem, tak jak siła potrząśnięcia kubkiem        |
| Dorzut krytyka / fumble'a     | **druga fala** — osobny rzut po osiadnięciu pierwszej, w skórce „krytyk" / „fumble" |
| Gdzie mieszkają ustawienia    | **osobne pływające okno „⚙ Ustawienia"**; ☀/☾ i ⌨ wyprowadzone z górnego paska      |
| Ile skórek i która domyślna   | **pięć**, domyślnie **Neon** (etap prosi wprost o „neon na czarnym")                |

## Zakres

- [x] **Pięć skórek kości** zdefiniowanych u nas (`theme_customColorset` + tekstura + materiał + powierzchnia stołu), każda z polską nazwą i jednozdaniowym opisem:
  - **Neon** — czarna kość, cyjanowe oczka, matowy plastik _(domyślna)_
  - **Krew** — dzisiejsza czerwień metalik (`#a11010`), żeby nikt nie stracił znanego wyglądu
  - **Chrom** — polerowany metal, ciemne oczka
  - **Kwas** — jadowita zieleń pod szkłem (tekstura `stainedglass`, materiał `glass`)
  - **Karta** — biały plastik z czarnym nadrukiem; jedyna czytelna w trybie dziennym
- [x] **Skórka jedzie z rzutem**: kosmetyczne pole `skin` na `RollResult` (obok `tossStrength`
      i `toss`), ustawiane przez serwer z preferencji rzucającego. Klient przełącza skórkę
      przez `updateConfig` tuż przed animacją i wraca do własnej po jej końcu.
  - preferencja gracza jedzie na serwer jednym zdarzeniem `dice:skin` (prywatna, per
    użytkownik, trzymana w bazie — inaczej nie da się jej dołożyć do cudzego rzutu)
  - nieznana nazwa skórki u odbiorcy = jego własna, bez błędu (degradacja łagodna)
- [x] **Dorzut krytyka jako druga fala**: pierwsza fala osiada → krótka pauza (550 ms) → jedna
      k10 wjeżdża w skórce **Krytyk** (złoto) albo **Fumble** (niemal czarna z jaskrawymi
      cyframi). Karta czatu odkrywa się dopiero po dorzucie.
  - fumble startował jako ciemna czerwień i **na stole nie dało się go odróżnić od skórki
    „Krew"** — poprawione w oględzinach: kontrast robi jasność, nie odcień
- [x] **Okno „⚙ Ustawienia"** (pływające, w rodzinie okna karty i kompendium):
  - animacja 3D wł./wył. — po wyłączeniu karty czatu pojawiają się natychmiast
  - głośność kości 0–100 i osobno głośność grzechotu kubka
  - wybór skórki z podglądem (kliknięcie skórki toczy próbny rzut „na niby")
  - maszynopis wypowiedzi NPC-ów (przeniesiony z `TypewriterToggle`)
  - motyw dzień/noc (przeniesiony z `ThemeToggle`)
- [x] **Fix z `POMYSLY.md`: kostki kreatora świecą jak krytyki.** Rzut Cech (`10k10`)
      i Ścieżki Życia (`13k10 + 4k6`) malują dziesiątki na zielono, a jedynki na czerwono, bo
      karta czatu robi tak z każdą kością. To numery wierszy tabeli, nie krytyk. Flaga
      `plain` na `RollResult`, którą karta czatu uszanuje.

## Poza zakresem

- Własne modele kości (zostajemy przy geometrii biblioteki); skórki definiowane przez MG w UI
- Skórki per kampania albo narzucane przez MG — wybór należy do gracza
- Fizyka i kamera stołu; dźwięki inne niż te, które biblioteka już niesie

## Kryteria ukończenia

- Gracz wybiera skórkę w oknie ustawień; jego rzut toczy się w tej skórce **u wszystkich**
- Naturalna 10 w teście: pierwsza fala osiada, dorzut wjeżdża osobno i złotem; naturalna 1 —
  krwiście. Karta czatu odkrywa się po dorzucie
- Wyłączenie animacji w ustawieniach działa: rzut nie toczy kości, a karta czatu jest od razu
- Głośność 0 wycisza kości i kubek
- Rzut Cech w kreatorze nie maluje dziesiątek na zielono
- AI Gateway offline / WebGL niedostępny — wszystko powyżej degraduje się jak dotąd

## Wskazówki techniczne

- `@3d-dice/dice-box-threejs` trzyma skórkę **globalnie** (`theme_colorset`,
  `theme_customColorset`, `theme_texture`, `theme_material`) i nie zna koloru per kość
  w notacji — sprawdzone w `dist/dice-box-threejs.es.js` (`parseNotation`, `addSet`).
  Stąd dwie fale zamiast jednej: `await box.updateConfig({ … })` między rzutami.
  `updateConfig` jest asynchroniczne i przeładowuje motyw (`loadTheme`), więc tekstury muszą
  być już w cache — pierwsze przełączenie warto rozgrzać przy inicjalizacji.
- **Nazwy tekstur bierz z listy biblioteki, nie z katalogu plików.** `public/dice/textures/`
  ma m.in. `noise.webp`, którego lista nie zna — taka nazwa daje kość gładką i bez ostrzeżenia.
  Pełna lista działających nazw jest w `docs/assety-kosci.md`.
- **Po każdej zmianie motywu wołaj `loadSounds()`.** Biblioteka wczytuje jeden zestaw próbek
  uderzeń (ten pasujący do materiału startowego), a obsługa kolizji indeksuje go bez
  sprawdzania — przełączenie metalu na pudełko, które wystartowało na plastiku, wywala
  `Cannot read properties of undefined (reading 'length')` przy każdym stuknięciu kości.
- **`material` zapisuje się na współdzielonym deskryptorze tekstury**, więc dwie skórki o tej
  samej teksturze muszą mieć ten sam materiał.
- Notacja wymuszonego wyniku i łatka `startClickThrow` (rzut z kubka w kierunku gestu) są
  w `packages/client/src/dice3d.ts` — druga fala musi je uszanować, ale **bez** gestu:
  dorzut wypada z ręki, która już rzuciła.
- Preferencja skórki jest **prywatna**, ale musi dojechać do cudzych przeglądarek. Serwer
  dokłada ją do `RollResult` w jednym miejscu — tam, gdzie dziś dokłada `tossStrength`.
