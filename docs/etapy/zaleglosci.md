# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**31.10.2026 — etap 65d1 „Ostrzał pojazdów”: oględziny MG i wdrożenie.** Oglądane na instancji
E2E (spec `99-ogledziny/t99-ostrzal`, nie w repo): Ola w **Firefoksie** strzela w kadłub (kubek
„→ Wóz Maelstromu · 5 m · PT 13”, okno Celowania z „Słabym punktem”, karta z wierszem
„Słaby punkt pojazdu −8”), strzał w pasażera wraca kartą „Cel za szybą”, wrak jest
przyciemniony z podpisem „wrak”; MG w Chromium — panel auta (PUK z paskiem i polem, OB, szyby,
ulepszenia). Trafienia w kadłub na żywo nie widziałem (dwa strzały w słaby punkt chybiły),
obrażenia auta i szyby sprawdza `chase-combat.test.ts`. Ulepszone zespolenie — tylko test serwera.
**Ikony okna Celowania (także dla figury, sprzed 65d1) nie rysują się na zrzutach Firefoksa**:
maska ma dobry adres (`/icons/hud/aim-body.svg`) i kolor, a kafel jest pusty — sprawdzić przy
stole w Firefoksie i Chrome, zanim ktoś zacznie szukać błędu w kodzie.

**30.10.2026 — etap 65b „Scena pościgu”: oględziny MG i wdrożenie.** Oglądane na instancji E2E
(spec `99-ogledziny/t99-poscig`, nie w repo): MG w Chromium, gracz w **Firefoksie** na mapie
wiaduktu MG — bieżnia jedzie, auta z grafiką, fotel kierowcy klikiem, menu auta, przeciągnięcie
auta przez MG niesie figurę. Szew bieżni oglądany tylko na zrzutach (nie na żywo). Pas jezdni
ustawiono na oko (wiersze 7–12), prawdziwy pas mapy wiaduktu wyznaczy MG. **Motocykl nie ma
grafiki** — wolnej licencji w stylu paczki Unlucky Studio nie znalazłem (OpenGameArt „Bikes”
to 32-pikselowy pixel-art na czarnym tle), rysuje się bryłą. Na VPS: migracja
`20261031090000_chase_scene` wjedzie z `./deploy.sh`; `vehicles.json` z 65a dalej trzeba dograć.

**30.10.2026 — T4b pada na granacie (4.6), niezależnie od etapu 64.** `E2E_FROM=po-T4a`,
dwa przebiegi pod rząd: Marek rzuca granat w Zbira i Ochroniarza, a karta „Granat odłamkowy →
wybrane pole” nie przychodzi w 20 s (`rollAndWait`, `t4b-walka-knajpa-lup.spec.ts:356`). Krok
dotyka rzutu granatem, nie okna wymiany; podejrzany „jedna broń w rękach” (`6ab9f2c2`, 29.10 —
granat ręczny poza limitem). Dalszych 15 kroków T4b (w tym przekazanie pistoletu kaflem) nie
uruchomiono; ten sam przepływ wymiany sprawdza zielone `t46a` 46a.3.

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

**24.10.2026 — oględziny łupu z ciała gracza.** Zmiana z sesji piątej 24.10 (ciała leżą otworem)
ma testy serwera, ale nie była oglądana. Do sprawdzenia w Firefoksie (Playwright) obok Chrome MG:
MG daje figurze gracza „Ogłuszony”, drugi gracz obok niej — „Wymiana…” i podwójny klik otwierają
łup („Weź”, „Zabierz wszystko”), okradany dostaje kartę czatu; po zdjęciu naklejki znów handel.

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
