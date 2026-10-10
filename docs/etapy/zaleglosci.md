# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**10.10.2026 — okno handlarza pisze kwoty bez grupowania tysięcy (47b, drobiazg).** Kompendium
i kreator pokazują „1 200 ed” (`formatEddies`, 47a), a `MerchantPane` (półka, koszyk, stopka
„Płacisz … ed”, kasa handlarza) i karty czatu operacji — surowe „1200 ed”. Przy cenniku domowym
czterocyfrowe kwoty są na porządku dziennym. Przy zmianie poprawić asercje `t46a` („1200 ed”,
„Płacisz 1344 ed”).

**09.10.2026 — listy kart, które jeszcze nie pomijają pojemników (46b2, do triażu MG).** Karty skrzyń
i stosów to karty NPC-ów, więc wpadają na listy, gdzie są szumem: wybór karty bota (`BotEditor`),
okno zegara z efektami czasowymi (`ClockWindow`) i archiwum (`ArchivePanel`). „Postacie”, walka,
Szczęście i rozliczenie miesiąca już je pomijają. Wiersz „Pięści” z okna „Wymiana” zniknął 10.10 (47b): Bijatyka jest teraz stałym wierszem
z urzędu, którego nie ma w oknach wymiany (własny wpis MG „Pięści” z T4a wypadł z łańcucha).

**09.10.2026 — menu tury bota proponuje „podejście” do figury, przy której bot już stoi (46c2, E2E 46c.9).**
Towarzysz „Kumpel” stał obok Pasera z pustym pistoletem; model wybrał „Podejście do: Paser”, serwer odmówił
`ALREADY_IN_PLACE` („Już tam stoisz…”), a w poprawce bot spasował — tura stracona, choć mógł ciąć bronią białą.
`availableBotCombatActions` (`shared/bots/combat.ts`) wpuszcza „podejście”, gdy tylko są figury i metry; nie
odsiewa celów w zasięgu ręki. Do triażu MG: przyciąć menu celów podejścia (figury dalej niż sąsiednie pole).
Przy okazji: `runStep` zgłasza `outcome: refused` także wtedy, gdy druga decyzja po odmowie to pas.

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
