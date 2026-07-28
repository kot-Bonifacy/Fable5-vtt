# Przegląd projektu — plan 28 etapów

Każdy etap to jedna sesja pracy z Claude. Etapy są pogrupowane w 9 faz. Szczegóły każdego etapu w osobnym pliku `etap-NN-*.md`. Bieżący stan prac: `POSTEP.md`.

## Mapa etapów

| #   | Etap                                               | Faza                 | Kamień milowy             |
| --- | -------------------------------------------------- | -------------------- | ------------------------- |
| 01  | Szkielet projektu i środowisko                     | A. Fundament         |                           |
| 02  | Baza danych, użytkownicy, role                     | A. Fundament         |                           |
| 03  | Rdzeń realtime i czat                              | A. Fundament         |                           |
| 04  | Mapa i sceny                                       | B. Stół MVP          |                           |
| 05  | Tokeny                                             | B. Stół MVP          |                           |
| 06  | Silnik kości CP RED                                | B. Stół MVP          |                           |
| 07  | Karta postaci — model i edytor                     | B. Stół MVP          |                           |
| 08  | Karta interaktywna i integracja                    | B. Stół MVP          | 🏁 Grywalny stół          |
| 09  | AI Gateway — fundament botów                       | C. Boty MVP          |                           |
| 10  | Edytor botów                                       | C. Boty MVP          |                           |
| 11  | Boty NPC na czacie                                 | C. Boty MVP          | 🏁 MVP z ankiety komplet  |
| 12  | TTS — głos botów                                   | C. Boty MVP          |                           |
| 13  | Dane z podręcznika i kompendium                    | D. Walka             |                           |
| 14  | Inicjatywa i tury                                  | D. Walka             |                           |
| 15  | Obrażenia, pancerz, krytyki, Death Save            | D. Walka             |                           |
| 16  | Zasięgi, DV z mapy, autofire                       | D. Walka             | 🏁 Pełna automatyka walki |
| 17a | Fog of war i warstwa MG                            | E. Widoczność        |                           |
| 17b | Rysowanie po mapie                                 | E. Widoczność        |                           |
| 18  | Dynamiczne oświetlenie i ściany                    | E. Widoczność        |                           |
| 19  | Pamięć botów — RAG, dziennik, relacje, asystent MG | F. Boty zaawansowane |                           |
| 20  | Autonomia botów w mechanice                        | F. Boty zaawansowane | 🏁 Pełne boty             |
| 21  | STT — polecenia głosowe                            | G. Głos              |                           |
| 22  | WebRTC — czat głosowy graczy                       | G. Głos              |                           |
| 23  | Cyberware, humanity, ekonomia, reputacja           | H. Świat CP RED      |                           |
| 24  | Handouty, dziennik kampanii, screamsheets          | H. Świat CP RED      |                           |
| 25  | Generator postaci (lifepath)                       | H. Świat CP RED      |                           |
| 26  | Netrunning                                         | H. Świat CP RED      |                           |
| 27  | Kości 3D i szlif UI                                | I. Wykończenie       |                           |
| 28  | Wdrożenie na VPS                                   | I. Wykończenie       | 🏁 Produkcja              |

## Kolejność i zależności

Fazy A→B→C odwzorowują priorytety MVP z ankiety (mapa+tokeny, kości, karty, boty na czacie). Fazy D–I można w razie potrzeby lokalnie przestawiać, ale:

- 13 (dane podręcznika) przed 15–16, 19, 23, 25, 26 — wszystkie konsumują dane z pipeline'u.
- 14 (inicjatywa) przed 15–16 i 20.
- 9–11 (boty podstawowe) przed 12 i przed 19–20.
- 12 (TTS) nie blokuje niczego — nic od niego nie zależy, więc można go przesunąć dalej, jeśli wolisz najpierw walkę. Jedyne powiązanie to wspólny budżet VRAM z etapem 21 (STT): kto pierwszy, ten ustala rezerwę dla drugiego.
- 17a przed 18 (oświetlenie buduje na fog of war); 17b (rysowanie) nie blokuje niczego.
- 28 (VPS) na końcu, ale można go wcześniej „wcisnąć" w dowolnym momencie, gdy zechcesz grać zdalnie — plan etapu jest samodzielny.

## Decyzje projektowe (ustalone z użytkownikiem 16.07.2026)

1. **Stack:** Node.js + TypeScript (Fastify + Socket.IO) dla serwera VTT, React + Vite + Pixi.js dla klienta, osobny AI Gateway w Pythonie (FastAPI) na PC z GPU.
2. **Baza:** SQLite + Prisma. Backup = kopia pliku wg harmonogramu. Ewentualna migracja na Postgres w przyszłości przez ORM.
3. **Runtime LLM:** llama.cpp / `llama-server` (natywny GGUF, API zgodne z OpenAI, kontrola nad blokami think per żądanie).
4. **RAG na podręczniku** (w ankiecie „doradź mi"): **TAK** — indeksujemy skonwertowany podręcznik lokalnie, wyłącznie do użytku prywatnego; asystent MG cytuje zasady z odwołaniem do źródła.
5. **Ekspozycja serwera** (w ankiecie „doradź mi"): VTT publicznie za Caddy z HTTPS + dostęp przez linki zaproszeń i hasło; kanał VPS↔PC (LLM) wyłącznie przez Tailscale. Alternatywa „cały VTT w tailnecie" odrzucona — wymagałaby instalacji VPN u każdego gracza.

## Świadome odstępstwa od ankiety

1. **WebRTC „od razu" → etap 22.** Wbudowany głos nie jest w priorytetach MVP z ankiety, a pełny test NAT/TURN i tak wymaga VPS. Do tego czasu gracie z zewnętrznym komunikatorem.
2. **Kości 3D → etap 27.** Czysto wizualne; mechanika kości działa od etapu 6, animacja to nakładka na wynik z serwera.
3. **Netrunning → etap 26.** Najbardziej złożony moduł, używany rzadziej niż walka; wcześniej MG prowadzi netrunning „ręcznie" na czacie. Jeśli okaże się za duży na jedną sesję — podzielimy na architektura+wizualizacja / programy+akcje.
4. **Etap 18 (dynamiczne oświetlenie)** to technicznie najtrudniejszy pojedynczy etap — z góry dopuszczamy podział na dwie sesje.

## Rozszerzenia planu po starcie

1. **Etap 12 — TTS: głos botów** (dodany 24.07.2026, plan urósł z 27 do 28 etapów; dawne etapy 12–27 przenumerowane na 13–28). Boty dostają mowę po polsku jako **opcję** — włączaną per bot i per sesja, z pełną degradacją do samego tekstu. Umieszczony w fazie C, zaraz po etapie 11: faza G to głos **ludzi** (wejście STT i rozmowa graczy), a mowa botów jest domknięciem samych botów i nie musi na nią czekać. Twardy budżet: **≤ 3 GB VRAM**, przy czym realny sufit wyznacza rezerwa pod whisper z etapu 21 — patrz „Ryzyka".

## Ryzyka i ograniczenia

- **VRAM (16 GB) — najciaśniejszy zasób projektu.** Bilans po pomiarach z etapu 09: Windows z pulpitem ~2,8 GB + llama-server @32k ~9,2 GB ⇒ **wolne ~4,0 GB** na wszystko pozostałe, do podziału między whisper (etap 21) i TTS (etap 12). Szacunki dla tych dwóch (1,5–2 GB i 2–3 GB) to górne widełki z dokumentacji, nie pomiary — **prawdopodobnie zawyżone i możliwe, że wszystko zmieści się bez zabiegów**; rozstrzygną to etapy 12 i 21, każdy z obowiązkiem zaktualizowania bilansu w `ai-gateway/README.md`. Gdyby jednak zabrakło, kluczowa obserwacja brzmi: **te modele nie muszą stać w karcie jednocześnie** — bot mówi wtedy, gdy LLM skończył generować, a mikrofon milczy. Ścieżki ratunku w kolejności rosnącego kosztu: leniwe ładowanie TTS z wyładowaniem po bezczynności → zwolnienie whispera na czas syntezy (~1–2 s przeładowania) → kontekst LLM 32k→16k (+0,5 GB) → `--cache-type-k/v q8_0` (+~0,3 GB) → zatrzymanie `llama-server` na czas syntezy (~3,5 s wczytania, tylko przy pustej kolejce) → whisper `small` (+~1 GB) → TTS na CPU (Piper, 0 GB) → ostatecznie kwant LLM Q6_K.
-
- **Czas odpowiedzi bota ≤ 15 s:** limituje długość promptu (RAG top-k, przycinanie historii) i max tokenów odpowiedzi; kolejka jeden-bot-naraz zgodnie z ankietą.
- **Upload 50 Mb/s w domu:** wystarcza na Tailscale (tekst do LLM), ale duże mapy trzymamy na VPS, nie serwujemy z PC.
- **Etapy 13, 23, 25, 26 wymagają materiałów od Ciebie** (skonwertowany tekst podręcznika) — przygotuj je przed tymi sesjami.
- **Jakość polskiego TTS** (etap 12): modele open-source obsługujące polski to wąska grupa (Piper, Chatterbox Multilingual, XTTS-v2 — Kokoro i Qwen3-TTS polskiego nie mają). Ryzykiem nie jest brak rozwiązania, tylko rozczarowanie brzmieniem: darmowy TTS bywa „lektorski". Dlatego etap zaczyna się od odsłuchu i pomiaru, a nie od implementacji — i dlatego mowa jest opcją, nie wymogiem.
- **Próbki głosu do klonowania** (etap 12): nie klonuj głosu realnej osoby bez jej zgody. Próbki lądują w `uploads/voices/` (gitignore) i nigdy w repo.
