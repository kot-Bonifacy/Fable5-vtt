# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**21.11.2026 — okno „Pościg” w domyślnym miejscu zasłania panel decyzji (72f3).** Okno staje
przy prawej krawędzi (`x = szerokość − 560`, `y = 120`), a panel decyzji siedzi w prawym górnym
rogu mapy — pytanie planu rund wyskakuje pod oknem (widać z niego lewą połowę). Wiersz „pyta
teraz” w oknie ma te same przyciski, a okno da się przesunąć, więc nic nie blokuje. Do decyzji
MG przy 72g: inne domyślne miejsce okna albo panel nad oknem.

**20.11.2026 — `48-poscig/t65-przeszkody` migocze: pusta mapa MG w pierwszym teście (72e).**
W przebiegu `--grep "T72e|T72b|T72c|T72d|T65e"` zaraz po buildzie test „MG wypuszcza barykadę
z palety…” padł na `clickWorld`: „E2E: the map is not on screen (no __vttE2E camera)” — u MG
sama siatka bez tła „Wiaduktu”, choć scena aktywna i widziana. `T65e` osobno zaraz potem 4/4.
Przy następnym czerwonym przebiegu obejrzeć `MG-ramki.txt` (czy `scene:view` przyszło przed
`scene:activate`) i dodać czekanie na kamerę w `beforeAll`, jeśli to wyścig wczytania tła.

**19.11.2026 — po 72a: Firefox i sceny na usuniętych drogach na VPS.** (1) Kreator pościgu
z jedną wbudowaną drogą obejrzany tylko w czystym Chromium — Firefox z Playwright MCP nie
wystartował; obejrzeć w Firefoksie przy 72b. (2) Po wdrożeniu sprawdzić na VPS sceny z tłem
`/art/roads/{highway,street,viaduct,badlands}.webp` i skasować je (decyzja MG z 19.11; w `dev.db`
była jedna i poszła). Bez tego taka scena zostaje bez tła.

**18.11.2026 — zdania podręcznika poza `roleability.ts` (po 71g2, WSP-19).** Ten sam pomiar co
w 71g2 (wspólny ciąg ≥ 6 słów z `data/private/rulebook/manual/CPRED-podrecznik/`) na reszcie
kodu bez testów: ~535 ciągów. Najwięcej słów: `shared/…/cpred/attacks.ts` 290, `netcombat.ts`
270, `character.ts` 267, `netrunning.ts` 251, `turn.ts` 221, `server/…/realtime/attacks.ts` 203,
`reputation.ts` 185, `netrun.ts` i `attachments.ts` po 153; razem kilkadziesiąt plików, głównie
cytaty reguł w komentarzach, część w tekstach UI. Dolna część to listy nazw (zostają, jak
w 71g2). Sposób pracy i miara — `decyzje-i-uproszczenia.md` („Parafraza zdań podręcznika…”);
po przepisaniu pliku dopisz go do `guarded` w `server/src/licensing.test.ts`. Wycena: L, do
podziału na kilka sesji. **Decyzja MG z 18.11 (start 71h): osobny etap — 73** (wiersz
w `archiwum/tabela-etapow.md`, plik etapu do napisania przy jego starcie). Te same cytaty co
w `roleability.ts` stoją jeszcze w komentarzach `rolls.ts`, `initiative.ts`, `damage.ts`,
`attacks.ts` (obu pakietów), `itemupgrade.ts` i kilku testów.

**18.11.2026 — drugie rozegranie Ról (71h): błąd #88 i drobiazgi czytelności.** Pełna tabela
— „Rozegrania 71h” w `role-macierz.md`. **#88 (B2, decyzja MG 18.11: naprawa w podetapie 71h2):** gracz-Medyk nie uruchomi
Chirurgii ani Leczenia na Ranie Krytycznej postaci innego gracza — tylko MG
(`testy-rejestr.md`). Drobiazgi (żaden nie zmienia liczb): druga karta obrażeń w Rundzie nie
mówi, że Redukcja Solo już poszła; w walce Prowizorki nie ma na belce (karta → Ekwipunek);
„Roboty drużyny” podsuwają do Ulepszania przedmiot fabularny bez ceny; partia farmaceutyków
i targ przy ladzie rzucają bez kubka (bez Szczęścia), choć prace Technika idą kubkiem; ~~„Komu:”
przy dawce ma „sobie” i własną postać~~ (zamknięte 18.11, zaległości); „HR szuka…” ok. 10 s; kwaterunek Korpo nie przestawia
Zakwaterowania (rozliczenie liczy czynsz kontenera); odliczanie Wsparcia „w drodze” gracz widzi
tylko w powiadomieniu; karta prośby Rockera nie niesie „O co prosisz”. Spoza Ról: belka po
przełączeniu konta w tym samym profilu przeglądarki zostaje na figurze poprzedniego gracza
(`vtt.hudFocus`) — przy stole jeden gracz to jedna przeglądarka, więc najpewniej bez znaczenia.

**15.11.2026 — drobiazgi UI z rozegrań Ról (71b), spoza listy bramki.** ~~(1) „Inicjatywa +0”
na kubku~~ i ~~(3) Ustabilizowanie figury „bez ran”~~ — zamknięte 18.11 (zaległości), czekają
na wdrożenie. (2) Klik w wiersz listy „Ustabilizuj” potrafi przełączyć belkę gracza na cudzą
figurę; odmowa mówi wtedy „Ten uczestnik nie ma karty postaci”, choć ma (zła figura, nie brak
karty) — przyczyny nie ustalono, do złapania w przeglądarce. Oglądane w Firefoksie (gracz)
i Chromium (MG), instancja E2E z `role-start`.

**14.11.2026 — rozegranie „Fabryki dronów” i „Po zamknięciu” po przebudowie Sieci (70f).**
Tymczasowe specy oględzin (MG w Chromium, Ola i Marek w Firefoksie), oba wzorce do końca, konsole
czyste. Dwie rzeczy poprawione od razu (pasek „Oczy i urządzenia” z nazwami w dwóch wierszach,
jeden wiersz „wracają do obrony” po odłączeniu). **Pkt 2, 3 i 5 zamknięte 14.11 (zaległości,
czekają na wdrożenie)** — `archiwum/zamkniete-zaleglosci.md`. **Pkt 1 i 4 zamknięte 14.11
(druga sesja zaległości, czekają na wdrożenie)**: kadr urządzenia wyjeżdża spod okna SIEĆ,
karta wykrycia nazywa się „Wykrycie — Kruk: ucieczka przed darmowym atakiem”. Do oceny MG
przy stole: balans wieżyczki z Kucharzem (karabin, Kevlar — notatka „Skalowanie”), alarm
„Fabryki” z „⏻ Włącz w Sieci”, przeszukiwanie wyłączonych urządzeń (także wieżyczki z bronią).

**12.11.2026 — T5b po przebudowie okna Sieci (70a) niepuszczony do końca.** Spec przepięty na
kartę piętra i wyjścia (`.net-floor-card`, `.net-exit--down`), ale pierwszy krok wymaga
żywego AI Gatewaya — bez niego przeszły tylko asercje startowe (okno Oli na Pliku, położenie
okien). Do sprawdzenia z gatewayem: `E2E_FROM=po-T5a pnpm test:e2e 30-rozgrywka/t5b` — zjazd
do Kruka i na węzeł wyjściem „Niżej”, F5 w Sieci, strzał i „Wyłącz” wieżyczki z listy,
`tuckRunWindow(mg)` przy oknie MG z planem (680 px zwijane uchwytem do 280). `po-T5a` zapisany
na nowo 12.11 przez zielone T5a. **13.11 (70c):** krok 5.5 przepięty z listy urządzeń na pasek
„Oczy i urządzenia” (miniatura wieżyczki → „Wyłącz” na belce, kropka `[data-eye-state="off"]`)
— też niepuszczony, z tego samego powodu. **13.11 (70e):** w 5.4 MG zaznacza „Wstrzymaj obronę”
w oknie runu, zanim kliknie „Demon wykrywa intruza” — T5b gra obroną Sieci ręką MG, a automat
ma własny spec `47-siec/t70e`; też niepuszczone.

**07.11.2026 (szósta) — dokończenie rozegrania „Po zamknięciu”: nowe błędy.** Opis i diagnozy:
`etap-66e-po-zamknieciu.md` („Rozegranie — dokończenie”, pkt 15–29). **Pkt 15, 17 i 21
zamknięte 07.11 (siódma sesja), 16, 20, 22, 26, 27 i 28 — 07.11 (ósma); czekają na
wdrożenie** — `archiwum/zamkniete-zaleglosci.md`.
**Pkt 23 i 24 zamknięte 12.11 etapem 70a, pkt 25 — 14.11 (zaległości)** (`archiwum/zamkniete-zaleglosci.md`). (29) etykiety w biurze i gabinecie nachodzą na siebie, a po śmierci Kucharza licznik rund
skoczył z 7 na 9. Punkty 18 (okno Sieci zasłania kubek) i 19 (atak poza walką bez trybu
turowego) **nie są zaległościami — decyzja MG z 07.11**.
~~Balans wzorca~~ — zamknięte 14.11 w 70f (karabin, Wartość bojowa 14, Kucharz w Kevlarze).

**07.11.2026 (piąta) — błędy z rozegrania „Po zamknięciu” w przeglądarce (przebieg przerwany,
do wznowienia).** Pełny opis i stan: `etap-66e-po-zamknieciu.md` („Rozegranie w przeglądarce”).
**Pkt 1, 2 i 4 zamknięte 07.11 (siódma sesja), 5 — 07.11 (ósma); czekają na wdrożenie** —
`archiwum/zamkniete-zaleglosci.md`. ~~(3) 🔴 klik gracza w zauważoną strefę to marsz na nią bez
pytania~~ — zamknięte 13.11 w 70d (okienko strefy), czeka na wdrożenie; (6) 🟠 gniazdo znalezione Skanerem poza wzrokiem nie ma znacznika u gracza; ~~(7) tekst
przycisków karty w kolorze tła~~ i ~~(8) „Dodaj za darmo” w pierwszą postać~~ — zamknięte 14.11
(zaległości), czekają na wdrożenie;
~~(9) brak zamiany Roli głównej z poprzednią na karcie~~ — zamknięte 17.11 w 71g1 („Zrób główną”, u MG bez PD), czeka na wdrożenie; (10) kubek zasłania ostatnie akcje
panelu (do sprawdzenia, czy jeszcze aktualne po lewej belce z etapu 69); ~~(11) zauważenie
przez kamerę tylko poufnym wierszem~~, ~~(12) marsz w ciemności bez komunikatu~~, ~~(13) pola
statysty przy pełnej karcie~~ i ~~(14) dwa paski po ✕ walki~~ — zamknięte 14.11 (druga sesja
zaległości), czekają na wdrożenie.

**07.11.2026 — „Po zamknięciu” (66e): wdrożenie (bez migracji), porównanie z VPS i pytanie do
MG.** (1) Geometria wzorca pochodzi z lokalnej `dev.db`; automat odmówił odczytu bazy VPS
(„Production Reads”), więc nie sprawdzono, czy „Pierwsza scena” na VPS ma te same ściany — MG
porównuje ręką albo daje zgodę na odczyt. (2) **Pytanie do MG:** marsz ręką MG (`token:move`
prostą przez korytarz) odpalił ukrytą podłogę elektryczną na figurze gracza (Iskra 24 obrażeń
w specu oględzin). Czy przestawienie figury przez MG ma uruchamiać strefy, czy tylko marsz
gracza? Dziś uruchamia (zachowanie sprzed 66e). **Odpowiedź MG z 07.11 (piąta sesja): tylko
figury graczy** — wdrożone 07.11 (siódma sesja). ~~(3) strzał przejętej wieżyczki tylko
pojedynczy~~ — zamknięte etapem 70 (szuflada trybów ognia na belce urządzenia, 70b; 70f).

**07.11.2026 — oględziny netrunnera w „Fabryce dronów”: wdrożenie (bez migracji) i resztki.**
Poprawki (broń drona przy strzale z Sieci, zwrot Akcji Sieciowej, kamera widzi w ciemności, polskie
odmowy w oknie Sieci i przy drzwiach, notatka wzorca) czekają na wdrożenie. **Otwarte:** (1) klik
w środek ikony gniazda „Konsola sterowni zachodniej” dwa razy nie otworzył karty (Firefox, Iskra
na sąsiednim polu, grot jej kierunku przy ikonie; figura raz zaznaczona, raz odznaczona), klik
6 px wyżej — tak. Przyczyny nie ustalono (grot ma `eventMode = 'none'`, obszar trafienia figury
to jej kwadrat) — obejrzeć ręką przy stole. (2) W przeglądarce nie złapano dymka odmowy „Cel za
przeszkodą…” w oknie Sieci (zwrot Akcji Sieciowej widać w bazie, tekst wynika z mapy kodów).
~~(3) wyłączony w Sieci dron bez znacznika~~ — zamknięte etapem 70 (naklejka „Wyłączony” 70c,
od założenia sceny i z przeszukaniem 70f).

**05.11.2026 — rama pościgu i auto bez kierowcy: wdrożenie (migracja
`20261105180000_chase_vehicle_momentum`) i oględziny przy stole.** Oglądane w Firefoksie i Chromium
na `dev.db`: bez kierowcy Wozu droga stoi u MG i graczy, rusza po siadaniu za kierownicę, menu
auta „bez dryfu · bez kierowcy — stoi”; w dogrywce furgon bez Wolta miał pęd 20 → 10 (dryf −7,5)
i wjechał w barykadę jako wrak. Luka ze stanem kierowcy zamknięta 05.11
(trzecia sesja, `archiwum/zamkniete-zaleglosci.md`). E2E `48-poscig` puszczone 06.11 (szósta
sesja): `t65-przeszkody` dostosowany (kolczatkę bierze auto z kurierem, bo puste stoi), 8/8.

**05.11.2026 (czwarta sesja) — zaległości 66c zamknięte w kodzie: wdrożenie i oglądanie przy stole.**
Bez migracji. Oglądane w **Firefoksie** tymczasowym specem E2E (MG, wzorzec „Ostatni zjazd”,
`po-T6`, skasowany): furgon wypełnia bryłę, podpisy górnego rzędu Eskorty nad figurami, „Ucieka”
w menu auta MG (auto `escaped`, przygasa u MG), rezerwa lewego panelu przy liczniku Szczęścia
(73,6 → 115,2 px). **Nie widziane w przeglądarce:** „Zamiana broni” na czacie, strzelba Szew przy
tarczy na pasku HUD (tylko testy), darmowa ręka MG w turze figury (test serwera), otarcie aut
o włos i wrak za autem z autem z tyłu (testy `shared`). Przy stole: wysiadka NPC-a ręką MG w jego
turze nie zjada metrów, a marsz klikiem dalej płaci.

**06.11.2026 — „Zastaw” (66d): stół MG i wdrożenie.** Rozegrany 06.11 (piąta sesja): pościg
skończył się w rundzie 3 przez trzy tarany w jednej turze — od 06.11 (szósta sesja, decyzja MG)
jeden taran na turę, wpis w archiwum. Zostaje do oceny przy stole propozycja 2 z „Wniosków
z balansu” w `etap-66d-zastaw.md`: Śrubka dostaje Ranę ze skryptowego auta cywilnego w R2, zanim
gracze coś wybiorą (auto cywilne na pasie kombi zamiast furgonu?). Bez migracji.

**04.11.2026 — „Ostatni zjazd” (66c): przebieg przy stole i wdrożenie.** Technicznie przejechany
specem oględzin (MG w Chromium, Marek i Ola w Firefoksie, `data/private`), a 04.11 (czwarta
sesja) rozegrany w przeglądarce 7 rund na `dev.db` — wynik balansu w pliku etapu
(„Rozegranie w przeglądarce”). Decyzje balansu MG wprowadzone we wzorcu tego samego dnia (Rydwan
bez karabinu, pistolet w schowku Wozu, NPC-e celniejsi). Zostaje dla MG: balans przy
prawdziwym stole, wygląd podpisów i portrety. Na VPS
wzorzec jedzie z repo (bez migracji); kopie skasowanego „Pościgu na wiadukcie” w kampaniach na
VPS — nie sprawdzone (zostaną bez tła). Reguła „załoga auta poza pościgiem” (umowa na górze
`mapa`) dotyczy też aut, które odpadły w zwykłym pościgu — warto rzucić okiem przy stole, czy
nikogo nie dziwi, że załoga znika razem z autem.

**03.11.2026 — kreator pościgu: oględziny przy stole, wdrożenie.** Od 06.11 stały E2E
`48-poscig/t65-kreator` (MG w Firefoksie, gracz w Chromium; wpis w archiwum). Przy stole: „Utwórz → Pościg” — kreator, każda z czterech dróg
w kafelku i na mapie (czy przewija się bez szwu na żywo i czy wygląd pasuje do stołu), „Wgraj
własną mapę”, przeciągnięcie obu krawędzi pasa w kroku „Droga”, „Na drogę” dla trzech aut
(nie lądują na sobie), „Pełna edycja sceny…” otwiera zakładkę „Pościg”. Na VPS pliki
`/art/roads/*.webp` jadą w obrazie klienta (bez migracji).

**03.11.2026 — przegląd mechanik pościgu: wdrożenie (migracja
`20261103210000_chase_vehicle_blocking`) i resztka oględzin.** Stojące auto NPC-a przed autem
gracza, „Za kierowcę” w menu MG i słaby kierowca z Nitro obejrzane 07.11 (Ola w Firefoksie,
wpis w archiwum). **Nie widziane w przeglądarce:** wrak (PUK 0) dryfujący przed zderzak — sprawdza
go `chase-review.test.ts`.

**03.11.2026 — przegląd ulepszeń pojazdów: wdrożenie (bez migracji).** Oględziny zamknięte 07.11
(okno pojazdu MG, „Uzupełnij Nitro i kolczatki”, broń pokładowa w katalogu lokalnie i na VPS —
wpis w archiwum).

**31.10.2026 — etap 65e „Przeszkody i ruch uliczny”: oględziny MG i wdrożenie.** Oglądane na
instancji E2E (spec `99-ogledziny/t99-przeszkody`, skasowany): MG w Chromium, Ola w **Firefoksie**
na wiadukcie. Do obejrzenia przy stole: czy barierki Kenney (płaskie, kreskówkowe) pasują obok aut
Unlucky Studio, czy szerokość barykady (3 kratki) zgadza się z pasami prawdziwej mapy i czy
minięta przeszkoda za autem (zasada domowa) nie przeszkadza. Na VPS: migracja
`20261031220000_chase_obstacles` wjedzie z `./deploy.sh`.

**31.10.2026 — etap 65d2 „Manewr, taranowanie, broń pokładowa”: oględziny MG i wdrożenie.**
Oglądane na instancji E2E (spec `99-ogledziny/t99-taranowanie`, skasowany): Ola w **Firefoksie**
prowadzi auto z Pługiem i karabinem pokładowym. Karabin stoi na pasku (30/30, tylko seria),
strzał z kubka („→ Wóz Maelstromu · 2 m · PT 22 · ogień ciągły”) zdjął 10 naboi z auta.
Wezwanie MG daje bursztynowy pasek z „Wykonaj Manewr”. Przeciągnięcie w wóz daje pasek
„Zderzenie” → „Taranuj” → karty 6k6 i „wjeżdża pługiem”, a auto staje przy wozie. MG
w Chromium: menu auta z „Wezwij do Manewru” i „Broń pokładowa”. **Nie widziane na żywo:** Rana
z taranowania (Ganger nie miał karty — sprawdza `chase-ram.test.ts`), Nitro +2k6, Unik pieszego,
przeładowanie na postoju, kierowca-NPC rzucający Manewr z menu MG. Na VPS: migracja
`20261031180000_chase_maneuver` wjedzie z `./deploy.sh`.

**31.10.2026 — etap 65d1 „Ostrzał pojazdów”: oględziny MG i wdrożenie.** Oglądane na instancji
E2E (spec `99-ogledziny/t99-ostrzal`, nie w repo): Ola w **Firefoksie** strzela w kadłub (kubek
„→ Wóz Maelstromu · 5 m · PT 13”, okno Celowania z „Słabym punktem”, karta z wierszem
„Słaby punkt pojazdu −8”), strzał w pasażera wraca kartą „Cel za szybą”, wrak jest
przyciemniony z podpisem „wrak”; MG w Chromium — panel auta (PUK z paskiem i polem, OB, szyby,
ulepszenia). Trafienia w kadłub na żywo nie widziałem (dwa strzały w słaby punkt chybiły),
obrażenia auta i szyby sprawdza `chase-combat.test.ts`. Ulepszone zespolenie — tylko test serwera.

**30.10.2026 — etap 65b „Scena pościgu”: oględziny MG i wdrożenie.** Oglądane na instancji E2E
(spec `99-ogledziny/t99-poscig`, nie w repo): MG w Chromium, gracz w **Firefoksie** na mapie
wiaduktu MG — bieżnia jedzie, auta z grafiką, fotel kierowcy klikiem, menu auta, przeciągnięcie
auta przez MG niesie figurę. Szew bieżni oglądany tylko na zrzutach (nie na żywo). Pas jezdni
ustawiono na oko (wiersze 7–12), prawdziwy pas mapy wiaduktu wyznaczy MG. **Motocykl nie ma
grafiki** — wolnej licencji w stylu paczki Unlucky Studio nie znalazłem (OpenGameArt „Bikes”
to 32-pikselowy pixel-art na czarnym tle), rysuje się bryłą (31.10: Kenney Racing Pack, CC0, ma
`PNG/Motorcycles/motorcycle_*.png` z góry — styl płaski, kreskówkowy, jak barierki przeszkód 65e;
do decyzji MG, czy pasuje obok aut Unlucky Studio). Na VPS: migracja
`20261031090000_chase_scene` wjedzie z `./deploy.sh`; `vehicles.json` z 65a dalej trzeba dograć.

**30.10.2026 — etap 64 „Szybka wymiana”: oględziny przy stole i wdrożenie.** Siatka kafli
i zgoda z góry oglądane na instancji E2E (Chromium i Firefox), nie na VPS. Do sprawdzenia
przy stole: dwóch graczy, prezent kilku rzeczy (Ctrl+klik, przeciągnięcie, „Zgadzam się”,
„Przyjmij” w doku), sklep z koszykiem, łup z ciała. Punkt `po-T6a` przepisał 30.10 przebieg T6a
**bez kroków `@llm`** (gateway wyłączony).

**30.10.2026 — „Gracze dzielą się widokiem”: T3b i T5b nieuruchomione, oględziny przy stole.**
T3b włącza przełącznik w `createScene`, a T5b (5.4) — gniazdem MG; obie specyfikacje wymagają
gatewaya i nie były puszczone. Punkty kontrolne `po-T3`…`po-T6` sprzed 30.10 mają na „Knajpie”
i „Bramie” `partySight = 0` — przebudują się pełnym przebiegiem. Przy stole: dwóch graczy
rozdzielonych ścianą na scenie Dynamicznej (bez wspólnego widoku nie widzą siebie ani planu
kolegi; po włączeniu — widzą).

**24.10.2026 (etap 59b/59c) — do obejrzenia.** (1) `gear.json` i `ammo.json` wgrane na VPS
24.10 wieczorem (zrobione). (2) W przeglądarce nie
oglądano rzutu na uzależnienie po skoku zegara ani ciosu zatrutym nożem na mapie — oba są
w testach serwera (`chems.test.ts`); oględziny wymagają przestawienia zegara kampanii.

**24.10.2026 — punkty kontrolne E2E z różnych dni; jeden rozjazd pozycji w T7b do obserwacji.** Po
sesji 24.10 (trzecia) `po-T3a`, `po-T4a`, `po-T4`, `po-T5` i `po-T6` są zapisane na nowo, ale każdy
z innego, starszego punktu (`po-T3`, `po-T5a`, `po-T6a` sprzed zasady „kule się nie kończą”), a
`po-T6` bez kroków `@llm` T6b. Przy najbliższym pełnym przebiegu z gatewayem łańcuch przebuduje się
w całości. W pierwszym przebiegu `t7b-obciazenie` w skali 0,1 serwer pokazał Olę z Kowalem w (543,
724), a baza miała (506,8; 724) — „figura w dwóch miejscach u różnych klientów”; powtórka 3/3 bez
rozjazdu. Przy pełnej skali T7b sprawdzić, czy wraca (możliwy wyścig zatrzymania marszu przy ukrytej
Percepcji z 24.10).

**26.09.2026 (pozostałość „Wiele grup i wielu MG”, po T9b 04.10) — paczka AI dla innych MG.**
Pozycje 1, 2 i 4 (konta MG, dwie sesje naraz, AI właściciela) zamknięte odbiorem T9b 04.10 —
pełny wpis w `archiwum/zamkniete-zaleglosci.md`.
**Paczka instalacyjna AI dla innych MG — PO BECIE.** Gateway + llama-server + model na PC MG
z RTX serii 5000 i co najmniej 16 GB VRAM, łatwe uruchomienie; VPS nie ma GPU, więc bez tego
inni MG nie mają botów (VTT degraduje się łagodnie). Ustalone: **RAG podręcznika buduje się
lokalnie z własnego PDF-a MG** — paczka nie zawiera treści podręcznika ani `data/private/`.
Do rozstrzygnięcia przy etapie: jak PC MG łączy się z VPS (VPS ma stały publiczny IPv4; domowe
PC zwykle za NAT-em — kierunek do oceny: gateway sam otwiera połączenie wychodzące do VPS
z kluczem konta MG) i jak VTT kieruje żądania AI kampanii do gatewaya jej MG. Oddzielone od
testów bety decyzją MG z 26.09. Inni MG mają mieć możliwość **pobrania paczki** (np. odnośnik w panelu
MG), która łatwo skonfiguruje ich komputer pod lokalne AI dla własnej sesji VTT.
