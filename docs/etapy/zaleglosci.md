# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**04.11.2026 (szósta sesja) — oględziny paska „Zderzenie” i `/jako` za NPC-a.** Sprawdzone
testami i buildem, bez przeglądarki. Przy stole (Firefox): przeciągnięcie Wozu z Pługiem
przodem w furgon — pasek mówi „Pług bojowy przodem… Twoje auto nic nie bierze”, bokiem — „Pług
nie zadziała”, w pieszego, przeszkodę i beton — własne zdania; pasek przeszkody gracza i menu MG
mówią to samo. `/jako Kłoda …` u MG — wiersz z imieniem Kłody u gracza, bez portretu.

**04.11.2026 (piąta sesja) — oględziny w przeglądarce zmian pościgu i czatu.** Zmiany
sprawdzone tylko testami (serwer, klient) i buildem, bez przeglądarki. Przy stole (Firefox):
pieszy z bronią w ręku klikiem w wolny fotel Wozu wsiada, a klikiem w kadłub strzela; prawy
klik w auto (MG i gracz) otwiera menu auta; klik MG w jezdnię przy NPC-u w fotelu daje odmowę
„przeciągnij ją na jezdnię”; kolczatka i przeszkoda znikają po pierwszym aucie; Barykada —
podpowiedź „beton” w palecie, menu i pasku kierowcy, taran = wrak; prośba o Test u MG podaje
postać (konto w podpowiedzi). Lista obecności gracza w poczekalni odświeża się na żywo.

**04.11.2026 — resztki z naprawionych zaległości 66c.** (1) Przeciągnięcie MG w turze figury
zjada jej metry (tak liczyło Kłodzie i Lutce przy wysiadce) — do decyzji MG, czy wysiadka
ręką MG ma być darmowa. (2) Wrak albo zgaszone auto po taranowaniu dalej ląduje za tylnym
zderzakiem (`pushVehicleBehind`, decyzja z 03.11) i może trafić na auto jadące tuż za nim —
przeszkody z palety już tak nie robią (znikają, beton zostaje w miejscu). (3) Podpis figury
z przedniego fotela nachodzi na pierścień figury z fotela obok (`car-4`, `van-8`).

**04.11.2026 — drobiazgi z przebiegu 66c (UI pościgu i czatu).**

- Bryła `van-8` jest ok. 0,6 kratki dłuższa niż grafika furgonu: Wóz „dotykał” go, stojąc na
  obrazku 0,4 kratki dalej; „Zatrzymaj się przed” przy zderzeniu od pierwszego kroku nie rusza
  auta wcale.
- Kubek z polem Szczęścia zasłania „Następna tura” w lewym panelu MG (Playwright nie kliknie,
  klawisz E działa). Esc z fokusem na kubku MG raz odłożył atak, dwa razy nie.
- Po „Cofnij” na karcie obrażeń kadłuba karta ataku znów ma „Na kubek” / „Zastosuj”, a kubek
  MG dostaje z powrotem rzut obrażeń — łatwo zastosować je drugi raz. **04.11 (szósta sesja):
  to umowa, nie błąd** — tak samo przy figurach „Cofnij” przywraca przyciski, bo tak MG
  przenosi trafienie na inny cel (`DamageControls.tsx`, `settled`). Do decyzji MG, czy po
  „Cofnij” przyciski mają wracać tylko na prośbę.
- MG nie ma „Ucieka” / „Odjedź” w menu auta (notatki wzorca o nim wspominały): na stojącej
  drodze eskorta zablokowana Wozem nie miała jak odjechać.
- Kamera gracza (`coverZoom` na estakadzie 35 × 18) mieści ok. 23 kratki długości — furgon
  i Wóz nie były razem w kadrze, gracz przesuwa widok ręką.
- Karty NPC-ów wzorca z EMP 2 (Kłoda, Szron, Grot, Kabel) mają na liście MG „EMP 2 · NA
  GRANICY” — szum przy NPC-ach; do decyzji: EMP 3 we wzorcu?

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

**04.11.2026 — `surgery.test.ts` migocze pod pełną suitą serwera.** W jednym z dwóch pełnych
przebiegów padły 2 testy (Test montażu z `outcome.success` innym niż oczekiwany); osobno
3/3 zielone. Nie dotyka zmian 66c — do zbadania przy najbliższym przeglądzie testów (`testy`).
04.11 (piąta sesja): `chase-combat.test.ts` („kadłub: obrażenia minus OB 13…”) padł raz pod
`vitest run src/chase`, osobno 7/7 i w pełnej suicie zielony — pewnie ta sama przyczyna.

**03.11.2026 — kreator pościgu: oględziny w Firefoksie i przy stole, wdrożenie.** Oglądane
tylko w Chromium (skrypt `playwright` na instancji E2E) — Firefoksa w kontenerze nie ma, Playwright
MCP niepodłączony. Przy stole (Firefox): „Utwórz → Pościg” — kreator, każda z czterech dróg
w kafelku i na mapie (czy przewija się bez szwu na żywo i czy wygląd pasuje do stołu), „Wgraj
własną mapę”, przeciągnięcie obu krawędzi pasa w kroku „Droga”, „Na drogę” dla trzech aut
(nie lądują na sobie), „Pełna edycja sceny…” otwiera zakładkę „Pościg”. Na VPS pliki
`/art/roads/*.webp` jadą w obrazie klienta (bez migracji). Stałego E2E kreatora nie ma
(wymaga `po-T6` i Firefoksa) — dopisać do `48-poscig` przy najbliższym przebiegu.

**03.11.2026 — przegląd mechanik pościgu: oględziny w przeglądarce i wdrożenie (migracja
`20261103210000_chase_vehicle_blocking`).** Z kontenera nie oglądane (brak punktu `po-T6`, mapy
wiaduktu z `C:\AI\materialy` i Firefoksa; Playwright MCP niepodłączony), E2E
`48-poscig/t65-przeszkody` się pominęło z tych samych powodów. Przy stole (Firefox): zgaś silnik
auta NPC-a przed autem gracza w tym samym pasie — w następnej rundzie gracz dostaje pasek „Na
drodze: … (stoi na drodze)” z „Gwałtowny skręt / Taranuj”, a po wyborze auto NPC-a stoi za
tylnym zderzakiem; to samo z wrakiem (PUK 0) i menu MG „Za kierowcę: …” na stojącym aucie. Słaby kierowca (REF + Prowadzenie ≤ 9): Nitro, potem jazda — karta „Zwykła jazda”
raz, auto jedzie podwójny budżet.

**03.11.2026 — przegląd ulepszeń pojazdów: oględziny w przeglądarce i wdrożenie.** Z kontenera
nie oglądane (brak punktu `po-T6`, Playwright MCP niepodłączony). Przy stole (Firefox):
w oknie pojazdu „Zamontuj” Wzmocnioną konstrukcję — „PUK teraz” rośnie o 20; Ulepszenie foteli
— po zapisie auto na scenie pościgu ma 6 foteli; menu auta MG po zrzucie kolczatki albo Nitro
pokazuje „Uzupełnij Nitro i kolczatki”; czy przy którejś broni pokładowej stoi ostrzeżenie
„Brak broni w katalogu” (jeśli tak — id wpisu do poprawy w `CPRED_VEHICLE_MOUNTS`). Bez migracji.

**31.10.2026 — T4b 4.8 „pięść, która trafia” raz spudłowała.** Na trzy przebiegi T4b od
`po-T4a` (sesja piąta 31.10) jeden padł w 4.8 na `punch.attack?.hit === false` (kość
skryptowana 8, Iskra pod Rzeźnikiem); powtórka bez zmian w kodzie 20/20. Adnotacji z rozbiciem
rzutu tamten przebieg nie zostawił (bez raportu JSON). Przy kolejnej porażce sprawdzić, czy kości
skryptu nie zjada wcześniej ukryta Percepcja z marszu Iskry („Iskra przystanęła: ukryta rzecz
po drodze” w 4.9).
**03.11: przyczyna ustalona z kodu, naprawa w teście — do potwierdzenia przebiegiem.** Lądowanie
marszu zapisuje pozycję w bazie przed ukrytą Percepcją (`runZonesAfterMove` /
`runHiddenFiguresAfterMove`), a 4.8 wpisywał kość 8 zaraz po `waitAt`; teraz czeka na klatkę
`final` u MG (`finalFrameOf`). Pułapka na górze sekcji `testy`. Zamknąć po kilku zielonych
przebiegach T4b od `po-T4a`.

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
