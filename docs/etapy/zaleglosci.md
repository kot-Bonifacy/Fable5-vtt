# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**15.10.2026 — etap 52: T5b i długie specyfikacje odporności niepuszczone (gateway AI wyłączony).**
Łańcuch po etapie 52 zielony od `po-T3a` do T5a (T3b, T4a, T4b, T5a) i od starego `po-T5` T6a + T6b,
ale **T5b nie ruszył** (start wymaga gatewaya), więc `po-T5` jest sprzed 52, a `po-T6a`/`po-T6`
zbudowane na nim — **bez kroków `@llm`**, jak `po-T3`…`po-T5a`. Z odporności puszczone tylko
`t7c-marsz-pod-figura` i `t7a-handel-kreator`; `t7a-walka-siec`, `t7b-`, `t7c-mapa` (marsze
przepięte na dwa kliknięcia) czekają. Do zrobienia przy gatewayu: T5b → T6b od `po-T5a`, potem
pełny przebieg i `40-odpornosc`.

**15.10.2026 — menu figury MG wychodzi poza dół okna (oględziny „Zmień grafikę”, drobiazg).**
`TokenContextMenu` przycina pozycję tylko `top = innerHeight − 320`, a menu MG z paskiem PW,
statusami i rozwiniętym „🎯 Atak…” albo „🖼 Zmień grafikę…” bywa dwa razy wyższe — figura nisko
na mapie ma „🗑 Usuń” i statusy pod krawędzią. Do zrobienia: mierzyć menu po wyrenderowaniu
(albo `max-height` + przewijanie) i podnosić je nad kursor.

**10.10.2026 — kwoty bez grupowania tysięcy poza oknem „Wymiana” (drobiazg, reszta zaległości z 47b).**
Okno „Wymiana” i karty czatu łupu i transakcji piszą od 10.10 „1 200 ed” (`formatEd`, umowa
w `ekwipunek`). Surowe „1000 ed” zostały w prośbie do Medyka (`SurgeryRequest`: cena domyślna,
„Wyceń na”, „Operuję za”, „Zgadzam się na”, `shared/surgery.ts`) i w przyciskach instalacji
wszczepu w Kompendium („Zainstaluj — 1000 ed”, „Znaleziony — montaż”). Przy zmianie poprawić
asercje T6a 6.3 („Zainstaluj — 1000 ed”, „Wyceń na 1100 ed”, „Zoperowane — 1100 ed”), a to
łańcuch z gatewayem.

**10.10.2026 — w Firefoksie separator tysięcy znika przy małym kroju (oględziny zrzutu `t46a`, drobiazg).**
`formatEddies` grupuje wąską twardą spacją U+202F (nie zwykłą). Chromium rysuje ją w Jost
wyraźnie, Firefox przy `.inventory-row-detail` (0,72 rem) prawie wcale — „Gotówka 1 180 ed”
i „Kasa handlarza 2 016 ed” wyglądają jak „1180” i „2016” (DOM ma 8239, sprawdzone w `46a.11`).
W pogrubionej stopce („zostanie 1 090 ed”) i w cenach półki separator widać. Do triażu MG:
zwykła twarda spacja U+00A0 w `formatEddies` (szersza; dotyczy też Kompendium i kreatora) albo
zostawić.

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
