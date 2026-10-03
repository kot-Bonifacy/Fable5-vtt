# Otwarte zaległości (dług oględzin i drobne braki)

**Pusty od 25.09 do 26.09.2026.** Nową zaległość dopisz tu jako punkt z datą; zamkniętą
przenieś z diagnozą do `archiwum/zamkniete-zaleglosci.md`. Rzeczy do oceny przy stole stoją
w `POMYSLY.md` („Do sprawdzenia przy stole”), decyzje MG — w `decyzje-i-uproszczenia.md`.

## Otwarte

**03.10.2026 — po T8c: triaż siedmiu nowych B3 i trzy potwierdzone B3 z T8b.** T8c (pobieżna
regresja) zamknięty 03.10 — `testy.md` 6.4. Zostaje:

1. **Triaż MG #72–#78 (B3, T8c)** — formularz tabeli losowej gubi pierwszy klik (#72), mylące zdania
   odmowy `/tab` (#73) i Lojalności u gracza (#75), pracownik Korpo bez imienia u gracza (#74), ✕ Taboru
   poza kartą w Firefoksie (#76), czerwone puste pola siatki Zdolności (#77), cytaty asystenta zasad bez
   inicjałów nagłówków (#78) — `testy-rejestr.md`; testy `test.fail` w `t8c-narracja` i `t8c-zdolnosci`.
2. **#66, #68, #71 (B3, potwierdzone, poza sesją poprawek 03.10)** — nagłówek tabeli wklejony do dwóch
   odpowiedzi Ścieżki Życia (`parse-manual.py`), wybór portretu przy wyczerpanej puli bez zdania
   „poproś MG”, drobiazgi kreatora i wejścia — `testy-rejestr.md`.

Potem refaktoryzacja pod osłoną suity (T8a–T8c w niej).

**26.09.2026 — Wiele grup i wielu MG (decyzje MG przy projekcie testów, `testy.md`).** Kontekst:
VTT ma być serwerem dla kilku grup, każda z własnym MG. Dziś jest jedno konto MG (`User.role`
globalne) i jedna aktywna kampania dla wszystkich (`campaign:activate` przenosi każdego
połączonego gracza), a CLAUDE.md mówi „jedna aktywna sesja, nie optymalizuj pod multi-tenant” —
do poprawienia razem z etapem, który to zmieni. Cztery pozycje:

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
   **Korekta MG z 26.09 (trzecia tura):** boty innych MG przestają być z góry niedostępne —
   MG może poprosić właściciela o dostęp do jego AI (pozycja 4).
2. **Równoległa gra najwyżej dwóch grup — WCHODZI DO BETY, do etapu „Konta MG” (decyzja MG
   z 26.09, trzecia tura; wcześniej „po becie”).** Serwer prowadzi **najwyżej dwie sesje naraz**
   (dwie aktywne kampanie różnych MG). **Slot zajmuje start gry, nie logowanie:** trzeci MG loguje
   się i przygotowuje swoją kampanię (sceny, karty, boty), a przy „Aktywuj kampanię” dostaje
   komunikat, że wszystkie miejsca są zajęte i serwer nie obsłuży większej liczby sesji
   równocześnie. Slot zwalnia MG, kończąc sesję, oraz serwer po bezczynności (próg do ustalenia
   w etapie; bez tego porzucona sesja blokuje miejsce na zawsze). Limit w konfiguracji (env,
   domyślnie 2), bo to granica VPS (8 GB / 4 vCPU), nie zasada gry. Wspólna karta GPU — pozycja 4.
3. **Paczka instalacyjna AI dla innych MG — PO BECIE.** Gateway + llama-server + model na PC MG
   z RTX serii 5000 i co najmniej 16 GB VRAM, łatwe uruchomienie; VPS nie ma GPU, więc bez tego
   inni MG nie mają botów (VTT degraduje się łagodnie). Ustalone: **RAG podręcznika buduje się
   lokalnie z własnego PDF-a MG** — paczka nie zawiera treści podręcznika ani `data/private/`.
   Do rozstrzygnięcia przy etapie: jak PC MG łączy się z VPS (VPS ma stały publiczny IPv4; domowe
   PC zwykle za NAT-em — kierunek do oceny: gateway sam otwiera połączenie wychodzące do VPS
   z kluczem konta MG) i jak VTT kieruje żądania AI kampanii do gatewaya jej MG. Oddzielone od
   testów bety decyzją MG z 26.09. Inni MG mają mieć możliwość **pobrania paczki** (np. odnośnik w panelu
   MG), która łatwo skonfiguruje ich komputer pod lokalne AI dla własnej sesji VTT.
4. **Prośba MG o dostęp do AI właściciela (decyzja MG z 26.09, trzecia tura) — do etapu „Konta MG”
   albo osobnego etapu zaraz po nim.** MG bez własnego AI wysyła z panelu MG prośbę do
   **właściciela instancji** o udostępnienie jego AI (gateway + llama-server na PC właściciela),
   żeby nie instalować paczki z pozycji 3. Ustalenia:
   - **Właściciel to osobna flaga konta, nie rola MG.** Domyślnie właściciel jest **graczem**
     w kampanii innego MG; prośbę widzi, gdy jest zalogowany (dowolna rola), i ją zatwierdza,
     odrzuca albo później cofa. Prośba czeka w bazie, dopóki właściciel nie wejdzie.
   - **Zatwierdzenie jest per kampania** (albo per konto MG — do ustalenia w etapie); tylko
     zatwierdzone kampanie wysyłają żądania do gatewaya właściciela, reszta ma boty niedostępne
     jak dziś (T9, punkt 8, zmieniony).
   - **AI obsługuje najwyżej jedną kampanię naraz** (jedno GPU, `--parallel 1`). Druga zatwierdzona
     kampania, gdy pierwsza gra, ma boty niedostępne z komunikatem „AI zajęte przez inną sesję”
     i działa w pełni bez AI (łagodna degradacja). Do ustalenia w etapie: kto zajmuje AI (pierwszy
     start sesji?) i czy własna kampania właściciela ma pierwszeństwo.
   - **Kanał: Tailscale, jak w etapie 28** — VPS woła gateway po adresie tailnetowym, gateway nie
     słucha na publicznym adresie, mimo że PC właściciela jest poza NAT-em.
   - Kolekcje RAG pamięci i bazy wiedzy są per kampania, więc dane jednej kampanii nie trafiają do
     botów drugiej — sprawdzić w etapie. RAG podręcznika jest wspólny, jak kompendium (pozycja 1).
