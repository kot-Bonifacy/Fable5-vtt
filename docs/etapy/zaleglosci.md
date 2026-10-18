# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**18.10.2026 — T6b 6.6b: dalszy ciąg marszu po „Złap oddech” serwer odrzuca `MOVE_PACE`
(znalezione przy przebiegu T6b od `po-T6a`, bez gatewaya).** Kowal (pula 10 m) idzie od baru do
(8, 8); marsz staje na granicy puli w (9, 9) i ląduje (`token:pace` `owedM: 10`), a ~2,8 s później
klient sam zgłasza resztę — jedno pole po przekątnej (2,8 m) — i dostaje `MOVE_PACE` przy długu
7,163, czyli przy 2,84 m w puli (ramki w `.e2e/test-results/…-stabilizuje-Kowala`). Na papierze
`checkPace` powinien przepuścić (luz 0,05 m), więc najpierw odtworzyć to testem serwera
(`walk-approval.test.ts`, `paceClock`) — podejrzane miejsca: `from`/`legs` w `token:walk`
i `tryResumeWalk` (klient rusza, gdy `plan.complete`). Do tego czasu T6b od 6.6b czerwony;
6.6b to pierwszy krok T6b z marszem od etapu 54.

**15.10.2026 — etap 52: T5b i długie specyfikacje odporności niepuszczone (gateway AI wyłączony).**
Łańcuch po etapie 52 zielony od `po-T3a` do T5a (T3b, T4a, T4b, T5a) i od starego `po-T5` T6a + T6b,
ale **T5b nie ruszył** (start wymaga gatewaya), więc `po-T5` jest sprzed 52, a `po-T6a`/`po-T6`
zbudowane na nim — **bez kroków `@llm`**, jak `po-T3`…`po-T5a`. Z odporności puszczone tylko
`t7c-marsz-pod-figura` i `t7a-handel-kreator`; `t7a-walka-siec`, `t7b-`, `t7c-mapa` (marsze
przepięte na dwa kliknięcia) czekają. Do zrobienia przy gatewayu: T5b → T6b od `po-T5a`, potem
pełny przebieg i `40-odpornosc`. **18.10:** T6a od starego `po-T5` zielony 13/13 (po poprawce
„Wymienione” z 55b, `po-T6a` zapisany na nowo), T6b pada na 6.6b — wpis wyżej.

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
