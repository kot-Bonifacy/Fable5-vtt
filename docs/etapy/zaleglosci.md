# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**07.11.2026 — oględziny netrunnera w „Fabryce dronów”: wdrożenie (bez migracji) i resztki.**
Poprawki (broń drona przy strzale z Sieci, zwrot Akcji Sieciowej, kamera widzi w ciemności, polskie
odmowy w oknie Sieci i przy drzwiach, notatka wzorca) czekają na wdrożenie. **Otwarte:** (1) klik
w środek ikony gniazda „Konsola sterowni zachodniej” dwa razy nie otworzył karty (Firefox, Iskra
na sąsiednim polu, grot jej kierunku przy ikonie; figura raz zaznaczona, raz odznaczona), klik
6 px wyżej — tak. Przyczyny nie ustalono (grot ma `eventMode = 'none'`, obszar trafienia figury
to jej kwadrat) — obejrzeć ręką przy stole. (2) W przeglądarce nie złapano dymka odmowy „Cel za
przeszkodą…” w oknie Sieci (zwrot Akcji Sieciowej widać w bazie, tekst wynika z mapy kodów).
(3) Wyłączony w Sieci dron (Pająk 2, Sowa) nie ma znacznika na mapie — MG pamięta sam i nakłada
„Unieruchomiony” Sowie (notatka wzorca; automat w `POMYSLY.md`).

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
