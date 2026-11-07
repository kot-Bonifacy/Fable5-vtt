# Etap 66e — Scena przykładowa „Po zamknięciu” (likwidacja na 1 netrunnera)

**Faza:** przed betą (zlecenie MG z 07.11 spoza planu) · **Wymaga etapów:** 66/66b (wzorce
scen, ściany, urządzenia, gniazda, Sieć), 26f (strefy obronne), 46b (pojemniki), 58b–58d
(rozbrajanie, zamki, ukryte figury), 18b (światła) · **Stan:** 🟨 zrobione 07.11 (format,
wzorzec, testy, oględziny w Firefoksie); czeka na stół MG i wdrożenie (bez migracji)

## Skąd ten etap

MG (07.11): „zaprojektuj nową przykładową scenę opartą o mapę ze sceny »Pierwsza scena«
z kampanii »ulice Lublina« na koncie MG »mg_primo«. Zgadzać się mają tylko ściany, drzwi, okna
i mapa, a resztę elementów (ukryte kamery, w tym jedna w gabinecie głównego antagonisty,
pułapka elektryczna w korytarzu przed gabinetem szefa, skrzynka z pistoletem maszynowym,
automatyczna wieżyczka i dwóch ochroniarzy na niskim poziomie) dobierz sam. Możesz zaproponować
inne elementy (przydałby się punkt dostępowy dla netrunnera). Scena ma być dla jednego gracza
na 6 poziomie z bronią automatyczną. Realizację wykonamy w innej sesji”.

## Decyzje MG z 07.11 (pytania na starcie)

1. **Mapa może być publiczna** i trafia do repo jako `data/public/scenes/po-zamknieciu/map.webp`.
2. **Gabinet szefa to pokój z aneksem** (kratki x21–28 / y6–10), tak jak w scenie MG. Pokój
   z biurkiem i monitorami (x15–21 / y6–10) zostaje **biurem ochrony**.
3. **Postać: netrunner, Ranga 6, z bronią automatyczną.** Sieć to główna droga, a nie dodatek.
4. **Cel: likwidacja szefa.**
5. **Noc, lokal zamknięty, półmrok:** scena ciemna (jak Fabryka), kilka świateł.
6. **Szef broni się do końca:** nie wychodzi z gabinetu i nie ucieka.
7. **Kamery i wieżyczka to figury-urządzenia w Sieci** (jak w Fabryce: podgląd, Wyłącz/Włącz,
   „Strzelaj”). Pułapka elektryczna jest strefą obronną podpiętą pod węzeł Sieci.
8. **Sieć krótka: 4 piętra, bez Czarnego LOD-u.** Ma być narzędziem, a nie osobnym wyzwaniem.

## Źródło geometrii

Scena `cmv3ohaa5000388uep6jqf0kw` w **lokalnej `packages/server/dev.db`** (kampania
`cmv3nh1410000jsue11k4o6dk`, właściciel `mg_primo`, stan z 07.11). Tło
`uploads/campaigns/cmv3nh1410000jsue11k4o6dk/maps/6gMIJ0rEv1EBGxfB.png`, 1470×1070 px,
siatka 44,545 px = **33×24 kratki po 2 m** (66×48 m). Zgodność obejmuje **46 odcinków** (32
ściany, 11 drzwi, 1 okno, 2 bramy na ladzie baru) — przenosimy je 1:1 łącznie z drobnymi
dublami (np. ściana 28→32 / y14 zapisana dwa razy). Poprawki tylko za zgodą MG. **Do
sprawdzenia przy realizacji:** czy kopia na VPS nie różni się od `dev.db` (jeśli tak, źródłem
jest VPS).

Wszystkie drzwi w scenie MG mają `playerToggle`; we wzorcu część dostaje zamek (tabela niżej).
Okno x2–4 / y18 zostaje oknem. Zachodnia ściana sali na grafice wygląda na przeszkloną, ale
w scenie MG to zwykła ściana i tak zostaje.

### Plan lokalu (kratki, x / y)

| pomieszczenie                | obszar          | wejścia                                                                        |
| ---------------------------- | --------------- | ------------------------------------------------------------------------------ |
| Sala restauracyjna           | x1–15 / y1–18   | drzwi wsch. na parking x28 / y3–4 (przez salę górą), drzwi na taras x4–6 / y18 |
| Bar (lada = 2 bramy)         | x12–15 / y9–16  | bramy x12 / y9–16 i y9 / x12–15                                                |
| Toalety gości                | x1–5 / y1–3     | otwarte na salę                                                                |
| **Biuro ochrony** (monitory) | x15–21 / y6–10  | drzwi x17–18 / y10 (z korytarza)                                               |
| **Gabinet szefa** (aneks)    | x21–28 / y6–10  | drzwi x24–25 / y10 (z korytarza) — jedyne                                      |
| Korytarz służbowy            | x15–26 / y10–12 | drzwi z sali x15 / y11–12, do kuchni x24–25 / y12, do przedsionka x26 / y10–11 |
| Przedsionek                  | x26–28 / y10–13 | drzwi do toalet x28 / y11–12 i y12–13                                          |
| Kuchnia                      | x14–28 / y12–18 | tylne drzwi x26–27 / y18 (na zaplecze), do spiżarni x28 / y15–16               |
| Toalety personelu            | x28–32 / y10–14 | z przedsionka                                                                  |
| Spiżarnia                    | x28–32 / y14–18 | z kuchni                                                                       |
| Taras (zewn.)                | x1–17 / y18–23  | —                                                                              |
| Zaplecze z kontenerami       | x17–28 / y18–24 | —                                                                              |
| Parking (auto szefa)         | x28–33 / y10–24 | —                                                                              |

## Pomysł w jednym akapicie

**Bogdan „Kucharz” Rataj** (wymyślony) prowadzi w Lublinie knajpę „Pod Neonem”, która jest
przykrywką lichwy i ściągania haraczu. Po zamknięciu siedzi w swoim gabinecie i liczy dzienny
utarg. Netrunner dostaje od fixera zlecenie na jego głowę (dopasuj do kampanii). Lokal
pilnują dwaj tani ochroniarze, kamery z monitoringiem w biurze ochrony, wieżyczka w gabinecie
i podłoga elektryczna w korytarzu przed jego drzwiami. Każde z tych zabezpieczeń wisi na
jednej, słabo strzeżonej Sieci. **Haczyk:** wejście do gabinetu na siłę oznacza podłogę
elektryczną pod nogami, a w środku szefa ze strzelbą zza stołu i wieżyczkę z serią. Netrunner,
który najpierw przejmie Sieć, przejdzie korytarzem suchą stopą, a wieżyczkę obróci na Kucharza.

## Skala i trudność

- **1 postać gracza: netrunner, Ranga 6** (Interfejs 6), broń automatyczna (pistolet
  maszynowy albo karabin szturmowy). Bez botów. Wzorzec nie zakłada karty gracza.
- Czas przy stole: **45–75 min** (skradanie + 1–2 krótkie starcia).
- Śmiertelność: **niska na sali, wysoka w gabinecie bez Sieci (celowo).** Notatka MG mówi, co
  zdjąć, gdy gracz gra inną rolą (sekcja „Skalowanie”).
- Sieć: PT 8 (`standard`), więc Interfejs 6 + k10 przechodzi większość prób, a porażka kosztuje
  czas, nie życie (bez LOD-u).

## Ustawienia sceny

| pole              | wartość                       | dlaczego                                                   |
| ----------------- | ----------------------------- | ---------------------------------------------------------- |
| `metersPerSquare` | 2                             | jak w scenie MG                                            |
| `visibility`      | `dynamic`                     | gracz widzi tylko to, co sam dostrzeże                     |
| `dark`            | `true`                        | noc, zgaszone światła (decyzja 5)                          |
| `darkSightM`      | 4                             | jak Fabryka (2 m = tylko własna kratka)                    |
| `explore`         | `true`                        | pamięć odkrytej mapy                                       |
| `partySight`      | `false`                       | jeden gracz, bez znaczenia                                 |
| `playerMove`      | `explore`                     | skradanie od aktywacji                                     |
| `spawn`           | x21,5 / y21                   | zaplecze przy kontenerach, w cieniu (inne wejścia w notce) |
| `gridVisible`     | `true`, `gridPlayers` `false` | jak w scenie MG                                            |

### Światła (nowe pole wzorca `lights`)

| światło                        | kratki        | jasne / przyćmione | kolor / uwagi                                    |
| ------------------------------ | ------------- | ------------------ | ------------------------------------------------ |
| Neon „Pod Neonem” przy wejściu | x28,6 / y7    | 1 / 4 m            | `#ff4fd8`, migocze (`flicker`) — na grafice neon |
| Lampa nad tylnymi drzwiami     | x26,5 / y18,6 | 2 / 5 m            | `#ffd9a0` — oświetla wejście z zaplecza          |
| Lampka nad ladą baru           | x13,5 / y9,5  | 1 / 3 m            | `#ffd9a0` — tu stoi Bury                         |
| Ekrany monitoringu             | x18 / y7      | 1 / 3 m            | `#9fd8ff` — sylwetka Małego widoczna od drzwi    |
| **Lampa w gabinecie**          | x24,5 / y7,5  | 3 / 6 m            | `#ffd9a0` — Kucharz liczy pieniądze przy świetle |

Kuchnia, korytarz i większość sali zostają ciemne. Latarka figury działa jak w Fabryce.

## Drzwi i zamki

| drzwi                           | stan na starcie            | jak otworzyć                                                     |
| ------------------------------- | -------------------------- | ---------------------------------------------------------------- |
| Tylne drzwi kuchni x26–27 / y18 | zamknięte, **zamek PT 13** | Elektronika i zabezpieczenia / wytrych (zasady 58c)              |
| Drzwi wsch. x28 / y3–4          | zamknięte, **zamek PT 15** | jw. — wejście reprezentacyjne, lepszy zamek                      |
| Drzwi na taras x4–6 / y18       | zamknięte, **zamek PT 13** | jw.                                                              |
| **Drzwi gabinetu** x24–25 / y10 | zamknięte, **zamek PT 17** | jw. albo węzeł Sieci (piętro 3) — stoi się wtedy na podłodze el. |
| Pozostałe wewnętrzne            | zamknięte, bez zamka       | klamka gracza (`playerToggle`), jak w scenie MG                  |
| Bramy lady baru                 | jak w scenie MG            | —                                                                |

**Zamek drzwi gabinetu w Sieci** zależy od tego, czy Sieć umie dziś sterować drzwiami. Jeśli
nie, zamek otwiera tylko Test, a piętro 3 steruje samą wieżyczką i podłogą. **Do sprawdzenia
przy realizacji, bez dokładania mechaniki w tym etapie.**

## Przeciwnicy i urządzenia (figury)

Statystyki wymyślone (nie z podręcznika), broń i pancerz z alternatywami do próbki kompendium,
jak w Fabryce. Kierunek `facing` w stopniach od góry zgodnie z zegarem.

| klucz          | figura                     | kratki        | ikona / postawa               | najważniejsze                                                                                                                                                     |
| -------------- | -------------------------- | ------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `szef`         | **Bogdan „Kucharz” Rataj** | x24,5 / y8,3  | — / Wróg                      | WB 13, PW 40, SP 11 (ciało), Percepcja 6; **strzelba** (5k6) + ciężki pistolet w zapasie. Stoi za stołem (osłona). Nie wychodzi z gabinetu (decyzja 6).           |
| `bury`         | Ochroniarz „Bury”          | x13,5 / y7,5  | — / Wróg                      | WB 10, PW 30, SP 7, Percepcja 4; ciężki pistolet. Patrol: lada baru ↔ drzwi wschodnie ↔ toalety (opis w notatce, ruch ręką MG).                                   |
| `maly`         | Ochroniarz „Mały”          | x18 / y8,6    | — / Wróg                      | WB 10, PW 25, SP 7, Percepcja 5; ciężki pistolet, **klucz do szafki** jako wiersz plecaka. Siedzi przy monitorach: o tym, co widzą kamery, wie MG (pasek alarmu). |
| `wiezyczka`    | Automatyczna wieżyczka     | x27,3 / y6,7  | `turret` / Wróg, `facing` 225 | WB 12, PW 25, SP 10, RUCH 0; **pistolet maszynowy z serią**. Celuje w drzwi gabinetu. Urządzenie Sieci (piętro 3), przejęta strzela w Kucharza.                   |
| `kam-wejscie`  | Kamera — wejście           | x27,3 / y1,6  | `camera` / Neutralna, 225     | ukryta, `spotDv` 15, zasięg 20 m — wejście wsch. i górna część sali                                                                                               |
| `kam-sala`     | Kamera — sala              | x5,6 / y1,6   | `camera` / Neutralna, 135     | ukryta, `spotDv` 15, zasięg 24 m — sala i bar                                                                                                                     |
| `kam-zaplecze` | Kamera — zaplecze          | x25,4 / y18,4 | `camera` / Neutralna, 200     | ukryta, `spotDv` 13, zasięg 16 m — tylne drzwi i kontenery (start!)                                                                                               |
| `kam-korytarz` | Kamera — korytarz          | x15,4 / y10,4 | `camera` / Neutralna, 90      | ukryta, `spotDv` 15, zasięg 20 m — cały korytarz z podłogą elektryczną                                                                                            |
| `kam-gabinet`  | **Kamera — gabinet szefa** | x21,4 / y6,4  | `camera` / Neutralna, 135     | ukryta, `spotDv` 17 (w oprawie lampy), zasięg 12 m — gabinet; podgląd pokazuje netrunnerowi, gdzie stoi Kucharz i wieżyczka                                       |

Kamery są Neutralne jak w Fabryce: zauważenie postaci daje MG pasek (alarm), a nie samą walkę.
Ukryte kamery gracz może zauważyć Percepcją (PT z `spotDv`) albo Skanerem / podglądem w Sieci.

## Strefa obronna (nowe pole wzorca `zones`)

| strefa                                  | prostokąt (kratki)     | wpis kompendium                                      | stan na starcie                                        |
| --------------------------------------- | ---------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| **Podłoga elektryczna przed gabinetem** | x22 / y10, 4×2 (8×4 m) | `defense.podloga-elektryczna` (alternatywa z próbki) | uzbrojona, ukryta, PT zauważenia i rozbrojenia z wpisu |

Strefa obejmuje cały korytarz od x22 do x26, więc kto dochodzi do drzwi gabinetu z sali,
z kuchni (drzwi x24–25 / y12 lądują w strefie) czy z przedsionka, staje na podłodze. Wyłącza
ją węzeł Sieci na piętrze 3, rozbrojenie (Elektronika i zabezpieczenia, jedna próba, porażka
o 5+ odpala na rozbrajającego — zasada domowa 58b) albo MG.

## Pojemnik (nowe pole wzorca `containers`)

| pojemnik           | kratki       | zamek                                              | zawartość                                                                  |
| ------------------ | ------------ | -------------------------------------------------- | -------------------------------------------------------------------------- |
| **Szafka ochrony** | x20,3 / y7,2 | Elektronika i zabezpieczenia PT 13; klucz u Małego | **pistolet maszynowy** (alternatywy jak broń dronów), 2× magazynek, 200 eb |

Na grafice to niebieska szafka przy prawej ścianie biura ochrony. Klucz u Małego jest
wierszem plecaka (opis), a otwarcie kluczem odbywa się przez „Wydaj klucz” MG. **Wzorzec nie
zakłada wiązania kluczy** — to byłaby nowa mechanika.

## Osłony

| osłona                | prostokąt (kratki)     | PW  |
| --------------------- | ---------------------- | --- |
| Stół w gabinecie      | x21,6 / y7,3, 2×1,4    | 20  |
| Lada baru (pion)      | x11,6 / y8,4, 0,8×7,6  | 30  |
| Wyspa kuchenna        | x17,8 / y14,4, 5×1,1   | 30  |
| Biurko ochrony        | x16,8 / y7,4, 2,4×1    | 20  |
| Kontenery na zapleczu | x17,2 / y18,3, 2,2×1,4 | 40  |

Prostokąty są przybliżone. Przy realizacji dopasować je nakładką na mapę, jak w Fabryce.

## Gniazda Sieci (punkty dostępowe)

| gniazdo                 | kratki       | ukryte | uwagi                                                                                                 |
| ----------------------- | ------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| **Terminal recepcji**   | x22,5 / y2,2 | tak    | Stanowisko przy wejściu wschodnim. Blisko, ale w polu `kam-wejscie` i na trasie Burego.               |
| **Konsola monitoringu** | x18,2 / y7,1 | tak    | Biuro ochrony, przy Małym. Trzeba go najpierw uciszyć albo przeczekać, ale za to ciche i blisko celu. |

Oba gniazda prowadzą do jednej Sieci.

## Sieć „Pod Neonem” (4 piętra, `standard`, bez LOD-u)

| piętro | co                              | urządzenia / zawartość                                                                                |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1      | Hasło                           | —                                                                                                     |
| 2      | Węzeł kontrolny: monitoring     | 5 kamer (`kam-*`) — podgląd, obrót, wyłączenie (wyłączone = MG nie dostaje alarmu z tej kamery)       |
| 3      | Węzeł kontrolny: zabezpieczenia | `wiezyczka` (Włącz/Wyłącz/Strzelaj), podłoga elektryczna (strefa), [zamek gabinetu — jeśli Sieć umie] |
| 4      | Plik „Zeszyt Kucharza”          | lista dłużników i haraczy (hak fabularny), dostęp do konta: 500 eb (MG decyduje, czy wypłacić)        |

Format Architektury z 66b zna urządzenia-figury. **Strefa obronna jako urządzenie węzła**
wymaga rozszerzenia (niżej).

## Notatki MG (warstwa MG)

1. **„PO ZAMKNIĘCIU — zlecenie”** (przy starcie): kto zleca, co wiadomo (gabinet, dwaj
   ochroniarze, „Kucharz ma coś w gabinecie, co strzela samo”), nagroda (np. 2000–3000 eb wg
   kampanii), warunek wygranej: Kucharz martwy. Wejścia: zaplecze (start, zamek PT 13, kamera
   nad drzwiami), drzwi wschodnie (PT 15, terminal recepcji obok), taras (PT 13, najdalej od
   gabinetu, przez całą salę).
2. **„Zanim zaczniecie”**: figura gracza z „Postaci” przeciągnięta na start, latarka
   z ekwipunku, scena ciemna, gniazda ukryte (Skaner), PT Sieci 8.
3. **„Alarm i ochrona”** (przy barze): co robi zauważenie przez kamerę (pasek MG → Mały mówi
   przez radio → Bury idzie sprawdzić miejsce w 2 rundy, Kucharz odkłada pieniądze i bierze
   strzelbę; wieżyczka działa zawsze). Trasa patrolu Burego. Mały nie wychodzi z biura, dopóki
   kamery działają. Gdy przestają (wyłączone w Sieci), wychodzi sprawdzić korytarz.
4. **„Gabinet”** (przy drzwiach gabinetu): Kucharz broni się do końca i nie wychodzi. Po
   alarmie stoi za stołem ze strzelbą wycelowaną w drzwi. Wieżyczka strzela serią w każdego,
   kto stanie w drzwiach. Przejęta wieżyczka „Strzelaj” w Kucharza: ma osłonę stołu z boku
   drzwi, ale nie od strony wieżyczki (MG decyduje, czy stół zasłania). Kamera w lampie.
5. **„Zakończenia i łup”**: Kucharz martwy → zlecenie wykonane; łup z ciała (strzelba,
   pistolet, utarg 300 eb, karta-klucz do auta na parkingu jako hak), szafka ochrony
   (pistolet maszynowy), Plik z Sieci. Porażka: netrunner pada albo ucieka — Kucharz zmienia
   lokal (hak na kolejną sesję).
6. **„Skalowanie”**: gracz bez netrunnera → wieżyczka startuje wyłączona albo z PW 15 i bez
   serii, podłoga elektryczna widoczna (PT zauważenia 13); dwóch graczy → trzeci ochroniarz
   w kuchni (kucharz-ochroniarz z nożem i pistoletem), Kucharz PW 50.

## Balans — przegląd (netrunner R6 solo)

- **Sala:** jeden ochroniarz na patrolu i jeden przy monitorach. Każdy z nich (WB 10, PW 25–30,
  SP 7) pada od 1–2 serii broni automatycznej. Starcie na sali jest do wygrania nawet bez Sieci.
- **Korytarz:** podłoga elektryczna to jedyna przeszkoda, której nie da się zastrzelić. Gracz
  ją zauważy, rozbroi albo wyłączy w Sieci, a jeśli nie, zapłaci PW.
- **Gabinet bez Sieci:** szef (5k6 zza osłony) + wieżyczka z serią naraz to dla jednej postaci
  bardzo groźne starcie — **celowo**, bo cała scena uczy, że netrunner najpierw idzie do Sieci.
- **Gabinet z Siecią:** wieżyczka wyłączona albo przejęta, podłoga zgaszona, podgląd z kamery
  w gabinecie mówi, gdzie stoi szef. Wtedy to pojedynek 1:1 z przewagą gracza.
- Sieć 4 piętra PT 8 bez LOD-u: przy Interfejsie 6 ok. 75–80% na próbę. Porażki kosztują Akcje
  Sieciowe i czas (Bury na patrolu), nie PW mózgu.

**Do oceny MG przy stole:** PW i WB szefa, seria wieżyczki, PT zamków, czy 5 kamer to nie za
dużo na jednego gracza.

## Co trzeba dołożyć do formatu wzorca (zakres realizacji)

Fabryka (66b) zna ściany, osłony, figury-urządzenia, gniazda i Architekturę. Ta scena
potrzebuje jeszcze (każde pole opcjonalne, stare wzorce czytają się bez zmian):

1. **`lights`** — `MapLight` w kratkach: `x, y, brightM, dimM, color, flicker, enabled`.
2. **`walls[].lockRule`** — zamek drzwi z PT (format `Wall.lockRule` z 58c).
3. **`figures[].spotDv`** — PT Percepcji ukrytej figury bez karty (`Token.spotDv`, 58d).
   Kamery mają karty NPC-ów? Sprawdzić, czy figura z kartą nie rzuca wtedy Skradania zamiast
   PT. Jeśli tak, kamera musi mieć PT albo trzeba to jasno rozstrzygnąć.
4. **`zones`** — strefa obronna (26f): `name`, prostokąt w kratkach, `hidden`, `armed`,
   `entryId` z alternatywami (moduł systemu), opcjonalne nadpisania PT; klucz strefy, żeby
   Architektura mogła ją wskazać jako urządzenie węzła.
5. **`containers`** — pojemnik (46b): nazwa, miejsce, grafika (`/public/tokens/containers/…`),
   zamek (umiejętność + PT), zawartość z alternatywami id kompendium i ilościami, gotówka.
6. **Architektura:** urządzenie węzła może wskazywać strefę (klucz z `zones`), nie tylko
   figurę.
7. Testy jak w 66b: odczyt i odmowy nowych pól, `cpredTemplateProblems` dla wzorca z repo,
   serwer zakłada na próbce kompendium: ściany (46), zamki, światła (5), strefę, pojemnik
   z zawartością, 9 figur, 2 gniazda, Sieć z 6 urządzeniami (5 kamer + wieżyczka) i strefą.
8. Oględziny: MG (Chromium) dodaje z „Przykładowych”, netrunner w **Firefoksie** — ciemność,
   start, zamek tylnych drzwi, Skaner znajduje gniazdo, przejęcie kamery w gabinecie,
   wyłączenie podłogi, przejęta wieżyczka strzela w szefa; kanarki (nazwy ukrytych kamer,
   notatki MG) nie trafiają do gracza.

Mapa: `uploads/…/6gMIJ0rEv1EBGxfB.png` → `data/public/scenes/po-zamknieciu/map.webp` (sharp,
jak fabryka). Ściany przeliczyć z `dev.db` na kratki skryptem w scratchpadzie (dzielenie przez
`gridSizePx` 44,545) i sprawdzić nakładką na mapę.

## Do rozstrzygnięcia przy realizacji (bez pytania MG, chyba że wyjdzie coś dużego)

- Dokładne położenia figur, świateł i osłon dopasować nakładką na grafikę (± 0,5 kratki).
- Czy Sieć steruje zamkiem drzwi (patrz „Drzwi i zamki”).
- Alternatywa z próbki dla `defense.podloga-elektryczna` (próbka ma `grzechot`, `komar`,
  `oko-korytarza` — wybrać po efektach).
- Jeśli któreś rozszerzenie formatu okaże się duże (np. strefa jako urządzenie węzła),
  zaproponować MG podział na 66e1 (format) i 66e2 (wzorzec).

## Realizacja (07.11, sesja czwarta) — rozstrzygnięcia bez pytań MG

1. **Format wzorca (umowa na górze `mapa`):** `lights`, `walls[].key` i `walls[].lockRule`,
   `zones` (wpis z alternatywami w `system.entryIds`), `containers` (zamek, `keyHolder`, rzeczy
   z alternatywami, gotówka), urządzenie węzła `zone` / `wall` obok `figure`, gotówka NPC-a
   `system.eddies`. Stare wzorce czytają się bez zmian (puste listy). Bez migracji bazy.
2. **`figures[].spotDv` nie powstało.** Każda figura wzorca ma kartę NPC-a, a ukryta figura
   z kartą rzuca Skradanie zamiast PT od MG (58d; pole „PT Percepcji, gdy ukryta” MG ma tylko
   przy figurze bez karty). Kamery mają więc ZW 2 i Skradanie 8 (wejście, sala, korytarz —
   średnio PT 15,5), 6 (zaplecze — 13,5) i 10 (gabinet — 17,5). Percepcja 6 zostaje do alarmu.
3. **Sieć steruje drzwiami** — urządzenie „Drzwi lub winda” (26d) otwiera otwór mimo zamka
   (s. 199). Zamek gabinetu jest trzecim urządzeniem węzła zabezpieczeń (`wall: drzwi-gabinetu`).
4. **Podłoga elektryczna:** `defense.podloga-elektryczna`, a na samej próbce wymyślony
   `defense.iskrownik` (dopisany do `sample.json`: System środowiskowy, 4k6 bez ablacji,
   powtarza się, PT zauważenia 15, rozbrojenia 13, 20 PW). Próbka nie miała żadnej podłogi
   z obrażeniami (`grzechot` strzela z figury, `komar` to dron, `oko-korytarza` nic nie robi).
5. **Klucz do szafki jest powiązany** (odstępstwo od projektu, który zakładał „Wydaj klucz”
   MG): `keyHolder: maly` daje Małemu wiersz „Klucz: Szafka ochrony” z uchwytem zamka —
   to istniejący klucz z 46b, bez nowej mechaniki. Łup z ciała Małego otwiera szafkę bez Testu.
6. **W szafce nie ma magazynków** — amunicja bez dna (zasada domowa z 23.10); zostały pistolet
   maszynowy i 200 ed. Waluta we wzorcu i notatkach to „ed”, nie „eb”.
7. **Utarg Kucharza (300 ed) to gotówka jego karty**, karta-klucz do auta — wiersz plecaka.
8. **Położenia z nakładki na grafikę:** Kucharz na krześle w lewym górnym rogu stołu
   (x21,5 / y6,9), kamera gabinetu w lewym dolnym rogu pokoju (x21,5 / y9,5, patrzy na NE),
   lampa nad stołem (x22,3 / y8,1), szafka na niebieskiej szafce (x20,5 / y7,0), konsola
   monitoringu na biurku (x18,8 / y7,8), Mały na krześle przy biurku (x17,8 / y7,3). Stół
   (x21,1–23,7 / y7,5–8,8) leży na linii drzwi–Kucharz, ale nie wieżyczka–Kucharz. Lada baru to
   dwa prostokąty (pion i poziom), razem 6 osłon.
9. **Źródło geometrii to lokalna `dev.db`** (stan z 07.11 10:33). Odczyt bazy na VPS
   automat odmówił w tej sesji („Production Reads”) — **porównanie z VPS do zrobienia ręką MG**,
   jeśli scena „Pierwsza scena” istnieje też tam.

## Oględziny (07.11)

Tymczasowy spec `99-ogledziny/t99-po-zamknieciu` (nie w repo), instancja E2E od `po-T6`, kości
ze skryptu: **MG w Chromium, Iskra (Ola) w Firefoksie, 7/7**. Iskra w `po-T6` ma Interfejs 4
(nie 6), co tu nie przeszkadzało.

1. MG rozwija „Przykładowe” i „Dodaj do kampanii” — scena bez listy braków: 46 ścian, 5 świateł,
   1 strefa, osłony, figury, notatki (zrzut MG: wszystko na miejscu na grafice).
2. Iskra na zapleczu: ciemno, światło lampy nad tylnymi drzwiami, kanarki (nazwy ukrytych kamer,
   notatki MG, notatka strefy, nazwa Architektury, etykieta węzła) nie dochodzą do gracza.
3. Tylne drzwi: klik w drzwi → „Spróbujesz otworzyć zamek?” → Elektronika i zabezpieczenia →
   kubek → zamek puszcza.
4. Skaner w sali znajduje ukryty „Terminal recepcji”.
5. Podłączenie (piętra „Hasło: konto kierownika sali”, „?”, „?”, „?”), Backdoor, Kontrola węzła
   monitoringu: pięć kamer z obrotem i „Wyłącz”, Iskra widzi Kucharza kamerą z gabinetu.
   Lista „Urządzenia w tej Sieci” pokazuje ukryte kamery tylko jako „Kamera”, strefę jako
   „System środowiskowy”, zamek jako „Drzwi lub winda”.
6. Kontrola węzła zabezpieczeń: podłoga „wyłączone” (stan urządzenia w `runtime`), „Otwórz”
   zamek gabinetu otwiera drzwi mimo zamka PT 17, wieżyczka „Strzelaj” w Kucharza trafia
   (20 vs PT 13, obrażenia 2k6 na kubku).

Przy okazji: przestawienie Iskry ręką MG prostą przez korytarz odpaliło podłogę (24 obrażeń) —
pułapka specu (`ogledziny`) i pytanie do MG w `zaleglosci.md`.

## Rozegranie w przeglądarce (07.11, piąta sesja) — przerwane, do wznowienia

**Zlecenie MG:** „rozegraj w przeglądarce scenę po-zamknięciu netrunnerem na 6 poziomie
z pistoletem maszynowym; cel — dopracować scenę i platformę”. W trakcie MG: „niech ma ciężki
pistolet maszynowy”. **Decyzje MG z pytań:** Iskra z `po-T6` podniesiona do Rangi 6, **skrypt
kości** (wyniki dobierane tak, żeby pokryć mechaniki — przebieg nie mówi nic o balansie),
błędy notować i obchodzić ręką MG, naprawa po rozegraniu, **strefa broniona odpala tylko na
figurach graczy** (NPC-e i przestawienie ręką MG nigdy — do wdrożenia, zaległość niżej).

**Stół:** instancja E2E od `po-T6` (kampania „Nocna zmiana”), MG w Chromium, Ola (Iskra)
w **Firefoksie**, oba przez Playwright MCP, kości z `.e2e/dice-script.txt`. Iskra przerobiona
ręką MG w UI: Interfejs 6 (wiersz Roli poprzedniej — główną Rolą został Medyk 1, patrz pkt 1),
ciężki pistolet maszynowy w rękach, lekka kurtka kuloodporna na głowie i korpusie (OB 11),
Broń krótka 6, Ogień ciągły 4, PW 40/40. Ola zna tylko zlecenie (notatka 1, „Co gracz wie”).

| krok        | co się stało                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| start       | Scena z „Przykładowych” bez braków; figura Iskry przeciągnięta z „Postaci” na start; MG wysyła zlecenie na czat.                                                                                                                                                                                                                                                                                                               |
| skradanie   | Prośba o skradanie → zgoda MG ±0 → 16. Marsz pod drzwi: Percepcja w drodze zauważa ukrytą kamerę zaplecza (15 vs 11).                                                                                                                                                                                                                                                                                                          |
| tylne drzwi | Kamera zaplecza widzi Iskrę w świetle lampy (17 vs 16) — MG dostaje tylko poufny wiersz czatu. Zamek PT 13: Elektronika 18 — otwarte.                                                                                                                                                                                                                                                                                          |
| kuchnia     | Skaner 12 m — nic (konsola ok. 22 m dalej). Alarm wg notatki: Bury z latarką idzie od zaplecza (MG omija korytarz, bo podłoga odpaliłaby na NPC-u).                                                                                                                                                                                                                                                                            |
| walka R1–R3 | Silnik sam zatrzymał drużynę („Wróg w zasięgu wzroku”). Inicjatywa Iskra 15, Bury 10. Seria ×2 (−11), Bury trafia (−1 przez OB 11), seria ×3 (−14), Bury trafia (−5), pojedynczy strzał — Bury śmiertelnie ranny, rzut przeciw śmierci 9 > BC 6 — martwy. Iskra 34/40. MG kończy walkę.                                                                                                                                        |
| korytarz    | Skaner 15 m znajduje „Konsolę monitoringu”. Percepcja w drodze zauważa podłogę elektryczną (19 vs 17) **przez ścianę kuchni**. Otwarcie drzwi kuchnia–korytarz; klik Oli w zauważoną podłogę wprowadza Iskrę na płyty: 6k6 = 19 − OB 9 → 24/40. Rozbrojenie z menu prawego kliku: 20 vs PT 13 — podłoga wyłączona, Iskra przechodzi po niej bez obrażeń. Percepcja w drodze zauważa kamerę gabinetu **przez ścianę gabinetu**. |

**Stan w punkcie `po-zamknieciu-przebieg1`:** Iskra 24/40, pancerz korpusu 9/11, ciężki PM
40/40, Szczęście 6, stoi w korytarzu na rozbrojonej podłodze (x 22, y 11); drzwi
kuchnia–korytarz i tylne otwarte; Bury martwy przy tylnych drzwiach (z latarką i podwójnym
pancerzem z pkt 2); Mały przy monitorach, Kucharz w gabinecie (wg notatki po strzałach już ze
strzelbą za stołem), wieżyczka włączona; zamek gabinetu zamknięty; Sieci nie ruszano.

### Znalezione w przebiegu (do naprawy po rozegraniu)

1. **🔴 Zapis okna „Edycja tokenu” zmienia kartę NPC-a** — MG zaznaczył tylko „Nosi światło”
   u Burego, a karta dostała wiersze statysty „Pancerz” OB 7 na głowę i korpus (obok Kevlaru
   z wzorca) i `statBlock.weaponSkill: 0`. Skutek: podwójny pancerz korpusu (dwie pule
   ablacji, przebicie liczone od wyższej) i pancerz głowy, którego NPC nie miał. Mały
   (nieedytowany) ma tylko Kevlar.
2. **🔴 Percepcja w drodze nie zna ścian** — `zonesNoticeDue` / `hiddenFiguresNoticeDue` liczą
   same 4 m (`distanceToRect`). Iskra zauważyła podłogę z kuchni i kamerę gabinetu z korytarza,
   obie za ścianą i zamkniętymi drzwiami.
3. **🔴 Klik gracza w zauważoną strefę = marsz na nią** — bez pytania, choć gracz ją widzi
   (Iskra −10 PW). Rozbrojenie jest tylko w menu prawego kliku na własnej figurze.
   Propozycja: klik w zauważoną strefę pyta „Wejść na …? / Rozbrój” albo planer omija znane
   strefy, a wejście wymaga drugiego kliku.
4. **🟠 Strefa odpala na NPC-ach i przy przestawieniu ręką MG** — decyzja MG z 07.11: tylko
   figury graczy, tylko ich marsz. Dziś jedyne wejście z wnętrza lokalu do kuchni (drzwi
   x 24–25 / y 12) leży w strefie, więc ochrona nie dojdzie do kuchni korytarzem.
5. **🟠 Napis trybu ognia na slocie kłamie** — po wyborze „Ogień ciągły” slot dalej pisze
   „pojedynczy”, a w następnej turze klik w cel ładuje kubek serią (tryb zapamiętany). Gracz
   strzela inaczej, niż widzi.
6. **🟠 Znalezione Skanerem gniazdo nie ma znacznika na mapie gracza**, gdy leży poza wzrokiem
   (karta mówi „znalezione: Konsola monitoringu”, mapa nic). Gracz zna nazwę, nie miejsce.
7. **🟠 Przyciski w karcie po najechaniu: tekst w kolorze tła** („Dobądź (Akcja)”, „+ Broń
   z katalogu” — `color` = `background` = `rgb(204, 35, 22)`). Podobnie nieczytelne „Postać nie
   ma pojazdu” w sekcji „Pojazdy” (czerwone na czerwonym).
8. **🟡 „Dodaj za darmo” w Kompendium domyślnie celuje w pierwszą postać drużyny** (Kowal),
   choć MG ma otwartą kartę Iskry — pancerz poszedł nie tam.
9. **🟡 Zmiana Roli na kartę na Rolę poprzednią odmawia** („Ta Rola już jest na karcie”), bez
   drogi „zamień główną z poprzednią”; powrót przez PD wymaga Rangi 4 bieżącej Roli.
10. **🟡 Kubek zasłania ostatnie akcje panelu** („Skaner”, „Skradanie” — widać „…aner”,
    „…adanie”) w obu przeglądarkach przy 1600 × 900.
11. **🟡 Kamera zauważająca skradającą się postać daje MG tylko poufny wiersz czatu** —
    notatka obiecuje „pasek MG”; przy kilku kamerach łatwo przeoczyć alarm.
12. **🟡 Planer gracza chodzi tylko po tym, co figura widzi w tej chwili** — w ciemności (4 m)
    cel za otwartymi drzwiami pod kątem kończy marsz pod ścianą, bez komunikatu.
13. **🟡 Okno „Edycja tokenu” NPC-a z kartą pokazuje „Umiejętność 0” i „Pancerz OB 7”** —
    pola statysty, które przy pełnej karcie mylą (i zapisują się — pkt 1).
14. **ℹ️ Dwa paski naraz po ✕ walki** („Przeciwnicy pokonani” i „Koniec walki”) — drobiazg.

**Działało dobrze:** dodanie sceny bez braków, ciemność i światła, skradanie z prośbą do MG,
zamek z Testem, wejście w walkę z wykrycia, inicjatywa, seria z mnożnikiem, ablacja pancerza
gracza, PT broni z tabeli PM, rzut przeciw śmierci NPC-a, Skaner z zasięgiem z rzutu,
rozbrojenie strefy (Iskra przeszła potem po płytach), przeładowanie poza budżetem tury
(z oznaczeniem). Konsola: 0 błędów aplikacji u Oli.

**Notatki wzorca do poprawy po przebiegu:** „Alarm i ochrona” — Bury nie dojdzie do kuchni
korytarzem bez podłogi (przy pkt 4 przestaje to grać rolę); notatka „Gabinet” podaje PT
zauważenia/rozbrojenia „z wpisu” — na kompendium z `data/private` podłoga ma PT zauważenia 17,
rozbrojenia 13 i 6k6 (projekt zakładał alternatywę z próbki: 15 / 13 / 4k6).

### Jak wznowić

1. `node instance/cli.ts restore po-zamknieciu-przebieg1` (z `packages/e2e`), potem
   `E2E_GM_PASSWORD=<nowe losowe> node instance/hold.ts` w tle (budowa ok. 1–2 min).
2. MG: Chromium MCP, `localhost:4173`, login `MG` i to samo hasło. Ola: Firefox MCP, link
   odnowienia `POST /api/campaigns/<id>/players/<id Oli>/renewal` z karty MG, potem
   `/join/<token>` → „Wejdź do gry”.
3. Kości: plik `.e2e/dice-script.txt` (ścianki po spacji). Kolejność w Percepcji w drodze:
   najpierw Skradanie ukrytej figury, potem Percepcja gracza. Pusty plik = los serwera.
4. **Dalszy plan gry:** Iskra idzie korytarzem pod biuro ochrony (drzwi x 17–18 / y 10),
   kamera korytarza (x 15 / y 10), Mały przy monitorach → walka albo uciszenie, gniazdo
   „Konsola monitoringu” → Sieć (hasło, węzeł monitoringu: podgląd kamery gabinetu, węzeł
   zabezpieczeń: wieżyczka „Strzelaj” w Kucharza, „Otwórz” zamek gabinetu, plik), szafka
   z kluczem Małego, gabinet i finał z Kucharzem. Po rozegraniu naprawa znalezisk 1–14.

## Kryteria ukończenia

- [x] Rozszerzenia formatu 1–6 z testami w `shared` i serwerze (3 z rozstrzygnięciem pkt 2).
- [x] Wzorzec `data/public/scenes/po-zamknieciu/` (`scene.json` + `map.webp`), ściany 1:1 ze
      sceny MG, czytelny w teście „każdy wzorzec z repo”.
- [x] Dodanie z „Przykładowych” bez braków na kompendium z `data/private` i na samej próbce
      (próbka ma od 66e alternatywę dla podłogi, więc braków nie ma i tu).
- [x] Oględziny netrunnera w Firefoksie (punkt 8) — wyniki niżej.
- [x] `POSTEP.md`, `archiwum/tabela-etapow.md`, umowa w sekcji `mapa`.
