# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**19.10.2026 — E2E: okno „Załóż starcie” nie ma już pól wyboru figur, których szukają T4a i T6b.**
`t4a-walka-knajpa` 4.1 (`getByRole('checkbox', { name: /^Zbir$/ })`) i `t6b-czas-kopie` 6.6d
(„Tylko postacie graczy” → pole „Kowal”) czekają na pola, których nie ma. Na kodzie sprzed sesji
z 19.10 (szósta) t6b pada identycznie, więc to nie skutek pilnowania PT. Prawdopodobnie panel
„Walka” z etapu 56 („Dołącz do walki”, wrogie na górze) zmienił okno. Reszta T4a za 4.1 nie
ruszyła — do przepięcia specyfikacji na nowe okno i powtórki T4a/T4b/T6b.

**18.10.2026 (etap 28) — kopie na VPS nie dowiązują `uploads/` (`"linked": false`).** `db`, `uploads`
i `backups` są w `deploy/docker-compose.yml` osobnymi bind mountami, a twarde dowiązanie między
montowaniami pada (EXDEV), więc `linkTree` kopiuje pliki: każda kopia godzinowa to pełne ~66 MB,
przy rotacji 24 + 14 ok. 2,5 GB dysku VPS (wolne 185 GB — bez pośpiechu). Naprawa: jeden mount
`vtt-data:/data` zamiast czterech (zmienia ścieżki w compose i entrypoincie, wymaga redeployu).

**18.10.2026 (etap 28) — jedno odtworzenie kopii padło w kontenerze.** W Docker Desktop na Windows
`scripts/restore.ts` raz zakończył się stosem błędu po zrobieniu kopii `przed-przywroceniem-…`
(stos nie zachowany; cztery powtórki udane). Serwer wstał potem na pustej bazie, a `uploads-gc`
skasował 189 z 190 plików starszych niż godzina. Startowa kopia w tej samej minucie nadpisała kopię
o tej samej nazwie (`takeSnapshot` celowo zastępuje kopię z tej samej minuty). Bezpiecznik
w `deploy/server-entrypoint.sh` zatrzymuje ten łańcuch na VPS. Do zrobienia: odtworzyć awarię
(prawdopodobnie bind mount Docker Desktop) i rozważyć, czy `uploads-gc` powinien w ogóle ruszać,
gdy baza nie ma żadnej kampanii.

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
