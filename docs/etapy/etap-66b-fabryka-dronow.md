# Etap 66b — Wzorzec zwykłej mapy („Fabryka dronów”)

**Faza:** przed betą (zlecenie MG z 31.10 spoza planu) · **Wymaga etapów:** 66 (sceny
przykładowe), 18a–18d (ściany, ciemność, pamięć mapy, drzwi), 16c (osłony), 26b/26d (gniazda
i węzły kontrolne), 62 (Sieć ze sceny i ikony urządzeń), 61 (skradanie)

## Skąd ten etap

MG (31.10): „zaprojektuj nowy scenariusz przykładowy do tej mapy [hala fabryki dronów]. Ma to
być scenariusz bez dodatkowego oświetlenia wewnątrz tej fabryki dronów, dwóch graczy ma widzieć
tylko to, co sami dostrzegą, mają napotykać za przeciwników drony, mają być tam punkty dostępowe,
za pomocą których netrunner może wyłączać drony, podglądać przez kamery jakieś obszary itp.,
i gdzieś w przeciwległym od miejsca startowego miejscu ma być jakaś drzazga z informacjami
o technologii dronowej, której pozyskanie będzie ich celem w tej scenie”.

Format wzorca z etapu 66 znał tylko tło, auta, NPC-ów i notatki — scena na zwykłej mapie
potrzebuje ścian, ciemności, ikon urządzeń, gniazd i Architektury. MG zgodził się na osobny
etap 66b (rozszerzenie formatu + wzorzec).

## Decyzje MG z 31.10 (pytania na starcie)

1. **Wejście dolną bramą, drzazga w jednym z dronów na górnych lądowiskach** (MG zmienił
   pierwszą propozycję „przekątnej”).
2. **Ciemność + latarki postaci** — lampy hali zgaszone, wzrok w ciemności 2 m (od 31.10 4 m — po zagęszczeniu
   kratki 2 m to jedna kratka pod samą figurą i gracz nie widział nic), latarka to
   światło figury, które gracz włącza i gasi.
3. **Patrol + uśpione drony na lądowiskach** — alarm budzi kolejne.
4. **Netrunner + bojowiec, postacie graczy** — wzorzec nie zakłada kart graczy.
5. **Zleceniodawca wie, w którym dronie jest drzazga** — trudność to dojście, nie szukanie.
6. **Alarm tylko budzi drony** (bez ucieczki prototypu i ryglowania bram).
7. **Jedna Sieć, kilka gniazd.**
8. **Mapa MG, może być publiczna** — `C:\AI\materialy\mapy\fabryka.png` → `map.webp`
   (1448×1086, 367 KB z PNG 2,9 MB).

## Zrobione ✅ (31.10)

- [x] Rdzeń `shared/scene-templates.ts`: scena — `dark`, `darkSightM`, `explore`, `partySight`;
      figura — `key`, `glyph`, `facing`, `visionRange`; nowe listy `walls` (łańcuchy punktów
      w kratkach, rodzaj, drzwi otwarte/zaryglowane/dla gracza, pancerz bariery, zasłanianie
      figur), `covers` (prostokąt w kratkach + PW), `accessPoints` (domyślnie ukryte, klucz
      Architektury) i `system` całego wzorca. Ściany, osłony i gniazda tylko na mapie (pościg
      odmawia). Stare wzorce czytają się bez zmian.
- [x] CP RED `systems/cpred/scene-template.ts`: dodatki karty NPC-a (`gear` — własne wiersze
      plecaka, `statBlock` — Wartość bojowa obok wydrukowanych PW), Architektury z `system.net`
      (piętra trzonu, urządzenie = figura wzorca po kluczu, rodzaj z ikony, `on: false` →
      stan w `runtime`, PT piętra domyślnie z poziomu trudności, Programy LOD-u z alternatywami)
      i `cpredTemplateProblems` do testu każdego wzorca z repo.
- [x] Serwer `realtime/scene-templates.ts`: ta sama transakcja zakłada ściany (łańcuch → odcinki),
      osłony (`generic`), figury z ikoną, kierunkiem i zasięgiem wzroku, Architektury (po
      figurach, bo urządzenie to id figury) z uśpionymi urządzeniami i gniazda podpięte do nich;
      biblioteka Sieci MG dostaje odświeżenie. Figura poza autem staje **środkiem** w punkcie
      wzorca (wcześniej lewym górnym rogiem — dotyczyło tylko figur spoza aut, których wiadukt
      nie miał).
- [x] Wzorzec `fabryka-dronow`: 82 odcinki ścian (obrys, 12 rzędów kontenerów, dwie sterownie
      z drzwiami, brama dolna dla graczy, górna zaryglowana, taśmociągi jako bariera z pancerzem
      10), 10 osłon, 19 figur (patrol: 2 Pająki + Szerszeń, 4 kamery Neutralne z kierunkiem,
      11 uśpionych Szerszeni na lądowiskach, Prototyp „Sowa” z drzazgą w plecaku), 5 ukrytych
      gniazd, Sieć 8 pięter (hasło, kamery, Czarny LOD, patrol, Plik, hasło, lądowiska ×2),
      4 notatki MG.
- [x] Klient: podpowiedź „Dodaj do kampanii” wymienia ściany i gniazda (bez innych zmian).
- [x] Testy: `shared` (odczyt nowych pól i odmowy, dodatki karty, Architektura z alternatywami
      i uśpionymi, `cpredTemplateProblems`, każdy wzorzec z repo), serwer (fabryka na próbce
      kompendium: ciemność, 82 ściany, 4 drzwi, 10 osłon, 19 figur, drzazga i Wartość bojowa,
      5 gniazd, 19 urządzeń, 11 uśpionych, LOD z próbki).
- [x] Oględziny: spec `99-ogledziny/t99-fabryka` od `po-T6` (nie w repo) — MG (Chromium) dodaje
      wzorzec z „Przykładowych” i aktywuje, Ola/Iskra w **Firefoksie** w sterowni podłącza się
      do konsoli i widzi 19 urządzeń, Marek/Kowal (Chromium) przy bramie w ciemności widzi tylko
      siebie, z latarką 6/12 m kamerę nad bramą; nazwy wrogów spoza wzroku nie docierają do
      gniazda gracza.

## Rozstrzygnięcia bez pytań (31.10)

1. **Kratka 2 m** (wiadukt ma 1 m) — hala 96×72 m, siatka 48×36 (30,17 px). Pierwotnie 24×18 (hala 48×36 m), ale postać zajmowała za dużo hali; 31.10 MG kazał zagęścić siatkę 2× w każdą stronę — położenia ×2, kamery 30 → 60 m.
2. **Lądowisk jest 12, nie 14** (pomyłka w projekcie pokazanym MG): 6 na górze, po 3 na bokach —
   11 uśpionych Szerszeni i prototyp.
3. **Prototyp czuwa od początku i nie budzi się z alarmem** — strzela do każdego, kto wejdzie na
   jego lądowisko; wyłączony w Sieci dostaje od MG „Unieruchomiony” i da się go przeszukać
   (łup z ciała), zniszczony — łup z wraku.
4. **Kamery są Neutralne** — zauważenie postaci daje MG pasek (alarm), a nie samą walkę, jak
   zrobiłaby figura Wroga.
5. **Uśpiony dron to urządzenie wyłączone w Sieci** — silnik nie gasi przez to figury, MG po
   prostu jej nie rusza (notatka „Alarm i przeciwnicy”). Pomysł na automat w `POMYSLY.md`.
6. **Latarki ustawia MG** w menu figury (notatka „Zanim zaczniecie”) — wzorzec nie zakłada figur
   graczy, a przedmiot „Latarka” nie daje światła. **Domyślne światło figury to od 31.10 6 m
   jasno / 12 m przyćmione** (`TOKEN_LIGHT_DEFAULT_DIM_M`, wcześniej 14 m; zlecenie MG) — MG
   zaznacza „Nosi światło” i nie wpisuje liczb.
7. **Statystyki dronów wymyślone** (Wartość bojowa 10/12/14, PW 15/20/30), broń z alternatywami
   do próbki; Czarny LOD `program.kruk` z alternatywą `program.osa`.
8. **Gracze chodzą w Eksploracji** (`playerMove: explore`) — scena gotowa do skradania od
   aktywacji.
9. **Generator współrzędnych nie trafił do repo** — `scene.json` przeliczono z pikseli mapy
   skryptem w scratchpadzie i sprawdzono nakładką na mapę; poprawki ręką w kratkach.

## Do oceny MG

- Przebieg przy stole: siła patrolu na dwie postacie, tempo budzenia dronów, czy kamery Neutralne
  (pasek MG) to dobry alarm.
- Czy taśmociągi jako bariera (zamykają drogę przez środek, widać ponad nimi) nie dzielą hali za
  mocno.
- Położenie ścian kontenerów i drzwi sterowni na żywej mapie (nakładka zgadza się z grafiką
  z dokładnością do kilku pikseli).

## Oględziny netrunnera (07.11, zlecenie MG)

MG: „przeprowadź testy przeglądarkowe dla postaci netrunnera — podłączenie do sieci fabryki przez
konsolę sterowni, podgląd z kamer i przejęcie kontroli nad dronami; sprawdź scenę i mechaniki”.
**Decyzje MG z pytań:** instancja E2E od `po-T6`, Iskra z mocniejszym dekiem (Interfejs 6, dek
doskonałej jakości, Szabloząb; w `po-T6` jest Medtechem, na czas testu wróciła na Netrunnera),
całość na skrypcie kości, MG + Iskra z walką przy strzałach, „przejęcie” = Włącz / Wyłącz /
Strzelaj. Spec `99-ogledziny/t99-fabryka-netrunner` (nie w repo): MG w Chromium, Ola w **Firefoksie**,
13/13 kroków.

**Scena:** dodaje się z „Przykładowych” bez braków (82 ściany, 10 osłon, 19 figur, 4 notatki,
5 ukrytych gniazd przy Architekturze, 11 uśpionych, drzazga u Sowy). Gniazdo konsoli leży na
grafice konsoli, drzwi sterowni z klamką gracza, Skaner (14 m) znajduje konsolę ze środka
sterowni, kanarki (nazwa Architektury, etykiety pięter, notatki MG) nie dochodzą do gracza.
**Mechanika:** Backdoor, Kontrola trzech węzłów, Czarny LOD (wykrycie MG, Szabloząb niszczy
Kruka), Wyłącz/Włącz drona, obrót kamery, kadr na kamerę, Plik, drugie hasło, Sowa wyłączona,
G1 obudzony — działa.

**Znalezione i poprawione 07.11:**

1. **Kamery w ciemnej hali były ślepe** — pożyczony wzrok widział tylko światło, a hala nie ma
   lamp. Decyzja MG: przejęta kamera widzi w ciemności na swój zasięg (umowa `siec`, decyzja
   w `decyzje-i-uproszczenia.md`). Po zmianie Iskra widzi przez kamery 14 figur.
2. **Strzał przejętym dronem kończył się `UNKNOWN_WEAPON`** — strzelało się tylko wierszem
   statysty, a drony wzorca mają pełne karty NPC-ów. Teraz bronią w rękach karty.
3. **Odmowa strzału (brak linii strzału) zjadała Akcję Sieciową** — teraz zwrot (bez pytania).
4. **Okno Sieci pokazywało surowe kody ataku** („Nie udało się: NO_LINE_OF_FIRE.”) — teraz
   zdania z `CPRED_ATTACK_PROBLEM_MESSAGES`.
5. **Odmowa przy drzwiach mówiła „na jedną kratkę”**, a na siatce 2 m pole obok drzwi jest już za
   daleko — teraz „ręka sięga 2 m od środka postaci”.
6. **Notatka „Zanim zaczniecie” obiecywała, że figury graczy staną przy bramie** — aktywacja
   stawia tylko figurę świeżo utworzonej postaci; notatka mówi teraz o przeciągnięciu z „Postaci”
   i o latarce z ekwipunku.

**Do oceny MG przy stole (bez zmian):** lista „Urządzenia w tej Sieci” pokazuje od podłączenia
nazwy wszystkich 19 urządzeń, także Sowy i uśpionych dronów (reguła etapu 62); lampa w hali jest
widoczna z bramy wzdłuż środkowej alejki (taśmociąg nie zasłania) i zakłada walkę z zauważenia;
wyłączony dron nie ma znacznika na mapie. Otwarte resztki — `zaleglosci.md` (07.11).
