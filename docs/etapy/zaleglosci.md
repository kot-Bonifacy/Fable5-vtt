# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**22.10.2026 — E2E: T4a, T6b, T7b i T8a nieprzepuszczone po poprawce klika 🎲 inicjatywy.**
Klik w pulsujący „Rzuć inicjatywę” (`click({ force: true })`, pułapka na górze `testy`)
sprawdzony tylko w T5b (27/27, sesja 58a). W pozostałych czterech poprawka jest ta sama, ale
przebiegu nie było — przy najbliższym pełnym przebiegu sprawdzić, czy kubek załadowany sam
(`offeredInitiative`) nie gryzie się z klikiem.

**22.10.2026 — E2E: „kreator Kuby (Na skróty)” w `t8a-ekrany` pada na blokadzie rozwoju w walce.**
Spec startuje z `po-T4a` (trwająca walka), a od 21.10 bramka ma „🧬 Stwórz postać” wyszarzone
(`COMBAT_LOCKED`, „W trakcie walki — poczekaj na koniec starcia.”) — klik czeka do limitu we
wszystkich czterech zestawach ekranów. Do przepięcia: kreator przed walką albo zakończenie walki
w kroku przygotowania. Ta sama okazja dla `t8a-macierz` „walka: inicjatywa kubkiem” (pole „Zbir”
w „Załóż starcie” — punkt z 19.10 niżej).

**22.10.2026 (etap 57a) — E2E: T6b 6.6d pada na pulsującym 🎲 inicjatywy.** Od `ced46d1` (22.10,
gracz rzuca inicjatywę sam) kubek gracza ładuje się inicjatywą sam przy wejściu do starcia, a 🎲 na
pasie pulsuje — `rollInitiative` w 6.6d klika „Rzuć inicjatywę: Kowal” i Playwright czeka na
stabilny element do limitu 4 min. Do przepięcia: potrząśnięcie załadowanym kubkiem zamiast kliku
w 🎲 (ta sama funkcja w T4a 4.1 i T8a-macierz). Przez to **6.8a/6.8b (eksport i import paczek ZIP)
nie przeszły jeszcze łańcuchem T6b** — 57a sprawdzają testy dymne serwera i `t57a-kopie` (`@szybkie`).

**19.10.2026 — E2E: okno „Załóż starcie” nie ma już pól wyboru figur, których szukają T4a i T6b.**
*22.10 (57a): przyczyna — od etapu 56 w etykiecie pola siedzi lista postawy, więc nazwa pola to nie
samo imię. Selektor `fightPick` (`fixtures/walka.ts`) przepięty w T4a 4.1, T5b, T6b 6.6d i
T8a-macierz; T6b przechodzi już przez „Załóż starcie” (pada dalej — punkt wyżej), T4a/T5b/T8a
niepuszczone.*
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
