# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**26.09.2026 — Wiele grup i wielu MG (decyzje MG przy projekcie testów, `testy.md`).** Kontekst:
VTT ma być serwerem dla kilku grup, każda z własnym MG. Dziś jest jedno konto MG (`User.role`
globalne) i jedna aktywna kampania dla wszystkich (`campaign:activate` przenosi każdego
połączonego gracza), a CLAUDE.md mówi „jedna aktywna sesja, nie optymalizuj pod multi-tenant” —
do poprawienia razem z etapem, który to zmieni. Trzy pozycje:

1. **Osobne konta MG z otwartą rejestracją — WARUNEK BETY.** Każdy MG zakłada konto sam (otwarta
   rejestracja, własne hasło), widzi i steruje tylko swoimi kampaniami, botami, architekturami Sieci
   i scenami. Do zaprojektowania jako nowy etap przed 28. Testy: `testy.md`, etap T9. Uwaga
   z projektu testów: bez aktywnej kampanii **per MG** drugi MG, aktywując swoją kampanię,
   przeniesie graczy pierwszego — przy otwartej rejestracji to wyciek i sabotaż (waga B1), więc
   minimum izolacji aktywacji prawdopodobnie wchodzi już tutaj, nawet bez równoległej gry.
   **Rozstrzygnięcia MG z 26.09 (druga tura):** aktywna kampania **per MG wchodzi** do tego etapu;
   każdy MG ma własne hasło, gracze wchodzą **indywidualnymi (imiennymi) linkami**; pliki wgrane
   w kampanii są **za logowaniem**, tylko dla jej członków; boty innych MG są w becie
   **niedostępne** (gateway właściciela obsługuje tylko jego kampanie); **kompendium z
   `data/private/` na VPS jest wspólne** dla wszystkich MG i graczy.
2. **Równoległa gra kilku grup naraz — PO BECIE.** Kilka kampanii aktywnych jednocześnie, każda
   ze swoim MG; wspólna karta GPU nie wchodzi w grę (każdy MG ma własne AI, pozycja 3).
3. **Paczka instalacyjna AI dla innych MG — PO BECIE.** Gateway + llama-server + model na PC MG
   z RTX serii 5000 i co najmniej 16 GB VRAM, łatwe uruchomienie; VPS nie ma GPU, więc bez tego
   inni MG nie mają botów (VTT degraduje się łagodnie). Ustalone: **RAG podręcznika buduje się
   lokalnie z własnego PDF-a MG** — paczka nie zawiera treści podręcznika ani `data/private/`.
   Do rozstrzygnięcia przy etapie: jak PC MG łączy się z VPS (VPS ma stały publiczny IPv4; domowe
   PC zwykle za NAT-em — kierunek do oceny: gateway sam otwiera połączenie wychodzące do VPS
   z kluczem konta MG) i jak VTT kieruje żądania AI kampanii do gatewaya jej MG. Oddzielone od
   testów bety decyzją MG z 26.09. Inni MG mają mieć możliwość **pobrania paczki** (np. odnośnik w panelu
   MG), która łatwo skonfiguruje ich komputer pod lokalne AI dla własnej sesji VTT.
