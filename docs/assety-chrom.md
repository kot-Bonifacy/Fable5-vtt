# Assety — skóra chromu „stara kartka” (18.09.2026)

Cały chrom aplikacji (górny pasek, panel boczny, HUD walki, okna pływające, dialogi, menu
kontekstowe, Panel MG) jest od 18.09.2026 wydrukiem na starej, zużytej kartce: w dzień pożółkły
papier, w nocy czarny karton — ta sama para, co karta postaci z naprawy 2c
(`docs/assety-karta-postaci.md`). Zlecenie MG: „styl dzienny i nocny jest zbyt excelowy,
brakuje tekstur i artystycznego charakteru”; doprecyzowania z tej samej sesji: **„stary papier,
nie krem”** i **„plam nie chcę — mogą być pęknięcia, załamania, przetarcia, ale żadnego brudu”**.

Poza skórą zostają (decyzja MG z 18.09): karta postaci i kreator (własna skóra z 2c), okno Sieci
(ekran cyberdeka), pasek narzędzi nad mapą (zawsze nocny), screamsheet (własny papier) i ekran
wejścia (plakat).

## Pliki i źródła

| Plik (`packages/client/public/art/chrome/`) | Rozmiar | Co niesie                                                          |
| ------------------------------------------- | ------: | ------------------------------------------------------------------ |
| `paper-day.webp`                            |  342 kB | szary kafel 1400 × 1400: wytarcia, rysy, załamania, włókno (dzień) |
| `paper-night.webp`                          |  314 kB | to samo z siłami dobranymi pod czarny karton (noc)                 |

Oba pliki buduje `tools/art/chrome-paper.py` z trzech darmowych źródeł, pobieranych przy
pierwszym uruchomieniu do `tools/art/.cache/` (w `.gitignore`):

| Źródło                                                                                                               | Rola                                 | Licencja                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------- |
| [„Old paper6.jpg”](https://commons.wikimedia.org/wiki/File:Old_paper6.jpg), Wikimedia Commons, The Digital Yard Sale | wytarcia (jasne plamy) i jasne rysy  | **domena publiczna** (PD-author) |
| [ambientCG „Paper 004”](https://ambientcg.com/view?id=Paper004), mapa wysokości 1K                                   | drobne włókno papieru czerpanego     | **CC0 1.0**                      |
| [ambientCG „Paper 005”](https://ambientcg.com/view?id=Paper005), mapa wysokości 1K                                   | grzbiety załamań pogniecionej kartki | **CC0 1.0**                      |

Odtworzenie:

```
uv run --with pillow --with numpy python tools/art/chrome-paper.py
```

Przejrzane i odrzucone: ambientCG `Paper003` (folia, nie papier), `Cardboard001/002/004`
(tektura falista — prążki), Wikimedia „Old Paper texture.jpg” (CC0, generowany — winieta
na brzegach, płaski środek), „Free dark vintage paper page texture” (CC BY, plamy).

## Jak kafel jest zbudowany

Kafel jest **szary i wyśrodkowany na 128**: 128 znaczy „zostaw kolor”, wyżej — rozjaśnij.
Wszystko, co pochodzi ze skanu, **wyłącznie rozjaśnia** (wytarcia σ = 40 px, rysy poniżej
45 px, po zdjęciu spadku światła skanera σ = 400 px i składowej okresowej Moisana — kafel bez
szwu). Ciemne punkty skanu są podnoszone do jasności otoczenia, **zanim** cokolwiek się policzy,
więc plamy i drobinki nie mają jak wejść. Załamania to jasne grzbiety mapy wysokości `Paper005`
(σ = 6 px, próg 0,35 σ). Jedyna rzecz schodząca poniżej 128 to włókno z `Paper004` — symetryczny
szum drobniejszy od kreski litery, bez którego płaski kolor nie czyta się jak kartka.
Siły warstw stoją w słownikach `DAY` i `NIGHT` na górze skryptu.

## Jak to leży w CSS

- **Tokeny w `theme.css`** — `--paper-tile` (para dzień/noc), `--paper-size` (kafel rysowany
  w 1000 px, żeby włókno było drobniejsze niż w pliku), `--shadow-window`, `--notch`,
  `--notch-sm`, `--font-ui`, `--font-ui-head`. Kolory powierzchni chromu (`--bg-*`, `--border*`,
  `--text*`) są od 18.09 ciepłe: noc bierze wartości kartonu karty (`--cp-*`), dzień — trzy
  stopnie pożółkłego papieru (tło ciemniejsze, panel, okno najjaśniejsze).
- **`chrome.css`** (ładowany po `styles.css`, przed `sheet.css`) kładzie kafel jako **warstwę
  tła** dużych powierzchni z `background-blend-mode: soft-light` — jeden szary plik służy
  każdemu odcieniowi, kolor nadal pochodzi z tokenu. Tekstura leży pod treścią, więc nic nie
  przygasza napisów i nie ma kompozycji przy przewijaniu (przewija się treść, nie tło).
- **Belki** (górny pasek, belki okien, nagłówek karty obiektu sceny) są czarne z czerwoną kreską
  **w obu motywach** — belka kategorii arkusza i ramka plakatu. W dzień belka przestawia tokeny
  chromu na nocne (blok „Belka” w `theme.css`) i deklaruje własny `color`, bo odziedziczony po
  oknie jest już policzony.
- **Ścięte rogi** (lewy górny i prawy dolny) mają okna, dialogi, menu kontekstowe i przycisk
  główny. `clip-path` obcina `border` i `box-shadow`, więc ramka w narożnikach wraca gradientem
  o długości `notch · 0,707`, a cień idzie przez `filter: drop-shadow(var(--shadow-window))`.
  Obwódka ogniska przycisku głównego idzie do środka (`outline-offset: -4px`).
- **Pęknięcia tuszu** z karty (`--cp-cracks`) leżą na przycisku głównym i banerze „Tura tej
  figury”. Plik niesie kolor papieru karty, nie chromu — różnica jest poniżej progu widoczności
  na tak małych plamach czerwieni.
- **Kroje:** Jost na treść (`body`), Oswald w wersalikach na belki, tytuły okien, zakładki
  panelu i etykiety sekcji. Ekran wejścia i screamsheet mają własne kroje; pola i przyciski
  na plakacie dziedziczą teraz Jost zamiast Segoe UI — jedyna zmiana poza zakresem, przyjęta
  jako spójniejsza.

## Kontrasty (dzień)

Policzone (WCAG) dla najczęstszych par: tusz `#100e0d` na panelu `#efe4c9` 15,2:1, przygaszony
`#5a5045` na panelu 6,2:1, na tle `#e2d3b2` 5,3:1, na oknie `#f5ecd8` 6,7:1; krem `#f1ece4` na
belce `#0c0a09` 16,8:1, przygaszony krem `#b3aa9d` na belce 8,6:1. Noc: `#f1ece4` na `#171514`
15,5:1, przygaszony `#9a9187` 5,9:1. Kafel rozjaśnia w najbardziej wytartym miejscu o ok. 50
punktów z 255 (p99 = 178), co dla tekstu przygaszonego na panelu daje nadal ponad 5:1.
