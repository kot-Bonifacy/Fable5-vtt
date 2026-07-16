# Przegląd projektu — plan 27 etapów

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
| 12  | Dane z podręcznika i kompendium                    | D. Walka             |                           |
| 13  | Inicjatywa i tury                                  | D. Walka             |                           |
| 14  | Obrażenia, pancerz, krytyki, Death Save            | D. Walka             |                           |
| 15  | Zasięgi, DV z mapy, autofire                       | D. Walka             | 🏁 Pełna automatyka walki |
| 16  | Fog of war, rysowanie, warstwa MG                  | E. Widoczność        |                           |
| 17  | Dynamiczne oświetlenie i ściany                    | E. Widoczność        |                           |
| 18  | Pamięć botów — RAG, dziennik, relacje, asystent MG | F. Boty zaawansowane |                           |
| 19  | Autonomia botów w mechanice                        | F. Boty zaawansowane | 🏁 Pełne boty             |
| 20  | STT — polecenia głosowe                            | G. Głos              |                           |
| 21  | WebRTC — czat głosowy graczy                       | G. Głos              |                           |
| 22  | Cyberware, humanity, ekonomia, reputacja           | H. Świat CP RED      |                           |
| 23  | Handouty, dziennik kampanii, screamsheets          | H. Świat CP RED      |                           |
| 24  | Generator postaci (lifepath)                       | H. Świat CP RED      |                           |
| 25  | Netrunning                                         | H. Świat CP RED      |                           |
| 26  | Kości 3D i szlif UI                                | I. Wykończenie       |                           |
| 27  | Wdrożenie na VPS                                   | I. Wykończenie       | 🏁 Produkcja              |

## Kolejność i zależności

Fazy A→B→C odwzorowują priorytety MVP z ankiety (mapa+tokeny, kości, karty, boty na czacie). Fazy D–I można w razie potrzeby lokalnie przestawiać, ale:

- 12 (dane podręcznika) przed 14–15, 18, 22, 24, 25 — wszystkie konsumują dane z pipeline'u.
- 13 (inicjatywa) przed 14–15 i 19.
- 9–11 (boty podstawowe) przed 18–19.
- 16 przed 17 (oświetlenie buduje na fog of war).
- 27 (VPS) na końcu, ale można go wcześniej „wcisnąć" w dowolnym momencie, gdy zechcesz grać zdalnie — plan etapu jest samodzielny.

## Decyzje projektowe (ustalone z użytkownikiem 16.07.2026)

1. **Stack:** Node.js + TypeScript (Fastify + Socket.IO) dla serwera VTT, React + Vite + Pixi.js dla klienta, osobny AI Gateway w Pythonie (FastAPI) na PC z GPU.
2. **Baza:** SQLite + Prisma. Backup = kopia pliku wg harmonogramu. Ewentualna migracja na Postgres w przyszłości przez ORM.
3. **Runtime LLM:** llama.cpp / `llama-server` (natywny GGUF, API zgodne z OpenAI, kontrola nad blokami think per żądanie).
4. **RAG na podręczniku** (w ankiecie „doradź mi"): **TAK** — indeksujemy skonwertowany podręcznik lokalnie, wyłącznie do użytku prywatnego; asystent MG cytuje zasady z odwołaniem do źródła.
5. **Ekspozycja serwera** (w ankiecie „doradź mi"): VTT publicznie za Caddy z HTTPS + dostęp przez linki zaproszeń i hasło; kanał VPS↔PC (LLM) wyłącznie przez Tailscale. Alternatywa „cały VTT w tailnecie" odrzucona — wymagałaby instalacji VPN u każdego gracza.

## Świadome odstępstwa od ankiety

1. **WebRTC „od razu" → etap 21.** Wbudowany głos nie jest w priorytetach MVP z ankiety, a pełny test NAT/TURN i tak wymaga VPS. Do tego czasu gracie z zewnętrznym komunikatorem.
2. **Kości 3D → etap 26.** Czysto wizualne; mechanika kości działa od etapu 6, animacja to nakładka na wynik z serwera.
3. **Netrunning → etap 25.** Najbardziej złożony moduł, używany rzadziej niż walka; wcześniej MG prowadzi netrunning „ręcznie" na czacie. Jeśli okaże się za duży na jedną sesję — podzielimy na architektura+wizualizacja / programy+akcje.
4. **Etap 17 (dynamiczne oświetlenie)** to technicznie najtrudniejszy pojedynczy etap — z góry dopuszczamy podział na dwie sesje.

## Ryzyka i ograniczenia

- **VRAM (16 GB):** Q8_0 ~9,5 GB + KV cache (rośnie z kontekstem!) + whisper medium ~2 GB. Jeśli zabraknie: whisper small / CPU int8, mniejszy kontekst, ostatecznie kwant Q6_K. Decyzja pomiarem w etapach 9 i 20.
- **Licencja RTG:** dane podręcznika tylko lokalnie (`data/private/`, gitignore) — repo jest publiczne. Szczegóły w CLAUDE.md.
- **Czas odpowiedzi bota ≤ 15 s:** limituje długość promptu (RAG top-k, przycinanie historii) i max tokenów odpowiedzi; kolejka jeden-bot-naraz zgodnie z ankietą.
- **Upload 50 Mb/s w domu:** wystarcza na Tailscale (tekst do LLM), ale duże mapy trzymamy na VPS, nie serwujemy z PC.
- **Etapy 12, 22, 24, 25 wymagają materiałów od Ciebie** (skonwertowany tekst podręcznika) — przygotuj je przed tymi sesjami.
