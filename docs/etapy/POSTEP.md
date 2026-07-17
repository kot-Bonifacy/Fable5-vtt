# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony.

| #   | Etap                                      | Status | Data ukończenia | Uwagi                                                                  |
| --- | ----------------------------------------- | ------ | --------------- | ---------------------------------------------------------------------- |
| 01  | Szkielet projektu i środowisko            | ✅     | 2026-07-16      | repo: Fable5-vtt; shared konsumowany jako źródła TS (decyzja w README) |
| 02  | Baza danych, użytkownicy, role            | ✅     | 2026-07-16      | Prisma 7 (adapter better-sqlite3); dodatkowy model `CampaignMember`    |
| 03  | Rdzeń realtime i czat                     | ✅     | 2026-07-17      | moduł `realtime` (rejestr zdarzeń z rolą); szepty bez seq; fix `pnpm dev` (`--raw`) |
| 04  | Mapa i sceny                              | ⬜     |                 |                                                                        |
| 05  | Tokeny                                    | ⬜     |                 |                                                                        |
| 06  | Silnik kości CP RED                       | ⬜     |                 |                                                                        |
| 07  | Karta postaci — model i edytor            | ⬜     |                 |                                                                        |
| 08  | Karta interaktywna i integracja           | ⬜     |                 |                                                                        |
| 09  | AI Gateway — fundament botów              | ⬜     |                 |                                                                        |
| 10  | Edytor botów                              | ⬜     |                 |                                                                        |
| 11  | Boty NPC na czacie                        | ⬜     |                 |                                                                        |
| 12  | Dane z podręcznika i kompendium           | ⬜     |                 | wymaga materiałów od użytkownika                                       |
| 13  | Inicjatywa i tury                         | ⬜     |                 |                                                                        |
| 14  | Obrażenia, pancerz, krytyki, Death Save   | ⬜     |                 |                                                                        |
| 15  | Zasięgi, DV z mapy, autofire              | ⬜     |                 |                                                                        |
| 16  | Fog of war, rysowanie, warstwa MG         | ⬜     |                 |                                                                        |
| 17  | Dynamiczne oświetlenie i ściany           | ⬜     |                 | możliwy podział na 2 sesje                                             |
| 18  | Pamięć botów — RAG, dziennik, relacje     | ⬜     |                 |                                                                        |
| 19  | Autonomia botów w mechanice               | ⬜     |                 |                                                                        |
| 20  | STT — polecenia głosowe                   | ⬜     |                 |                                                                        |
| 21  | WebRTC — czat głosowy graczy              | ⬜     |                 | pełny test dopiero po etapie 27                                        |
| 22  | Cyberware, humanity, ekonomia, reputacja  | ⬜     |                 |                                                                        |
| 23  | Handouty, dziennik kampanii, screamsheets | ⬜     |                 |                                                                        |
| 24  | Generator postaci (lifepath)              | ⬜     |                 |                                                                        |
| 25  | Netrunning                                | ⬜     |                 | możliwy podział na 2 sesje                                             |
| 26  | Kości 3D i szlif UI                       | ⬜     |                 |                                                                        |
| 27  | Wdrożenie na VPS                          | ⬜     |                 |                                                                        |

## Notatki między sesjami

_(Tu zapisuj: gdzie przerwano pracę, znane problemy, od czego zacząć następną sesję.)_

- **2026-07-16 (etap 01):** Monorepo działa (`pnpm dev/test/lint/build` — wszystko zielone). `CRED-EasyMode.pdf` przeniesiony do `data/private/` (prawa autorskie). Repo wypchnięte: https://github.com/kot-Bonifacy/Fable5-vtt. Następny etap: 02 (baza danych, użytkownicy, role).
- **2026-07-17 (etap 03):** Rdzeń realtime i czat gotowe; kryteria zweryfikowane w dwóch odizolowanych przeglądarkach + obserwator socketowy (szept Rogue→Vex nie pojawia się w payloadach trzeciego uczestnika; reconnect po ubiciu serwera odtwarza historię; presence live). Architektura: moduł `packages/server/src/realtime/` — rejestr zdarzeń z deklaracją roli (`defineEvent`/`registerEvents`), pokoje `campaign:<id>`/`scene:<id>` (sceny dołączane od etapu 04), licznik sekwencji per pokój (in-memory; szepty i inne emisje celowane NIE zużywają seq — tylko broadcasty do pokoju), `state:sync` przy połączeniu i na `state:request` (klient żąda przy wykrytej luce seq). Czat: `ChatMessage` w DB (id autoincrement = kursor paginacji), parser komend w `shared/chat.ts` (aliasy `/w`, `/whisper`, `/szept`; cudzysłowy i dopasowanie wieloczłonowych imion z rosteru; `//` wysyła literalny ukośnik; limit 2000 znaków), historia stronicowana po `beforeId` (50/strona), szepty filtrowane w zapytaniu DB (nigdy nie opuszczają serwera). Odstępstwo/naprawa środowiska: `tsx watch` zawieszał się pod `concurrently` z prefiksami — root `pnpm dev` przełączony na `concurrently --raw` (bez prefiksów; logi serwera to i tak JSON pino). `gm:ping` zachowany jako przykład roli w nowym rejestrze. Następny etap: 04 (mapa i sceny).
- **2026-07-16 (etap 02):** Auth i baza gotowe; przepływ zweryfikowany w przeglądarce (logowanie MG → kampania → link → dołączenie gracza → unieważnienie linku) + 21 testów dymnych. Decyzje z użytkownikiem: konto MG auto-seed z `.env` (`GM_PASSWORD`), linki zaproszeń **wielorazowe** (z wygaśnięciem/unieważnieniem), powrót gracza przez ponowne wejście linkiem i wybór swojego imienia (bez hasła — zaufana grupa). Odstępstwa/notatki: Prisma 7 (nowy generator `prisma-client` → klient w `src/generated/`, gitignore; runtime przez adapter better-sqlite3; konfiguracja CLI w `prisma.config.ts`), dodatkowy model `CampaignMember` (przypisanie gracza do kampanii), w dev Vite proxy `/api` + `/socket.io` (same-origin cookies, bez CORS), socketowy guard ról na razie na placeholderze `gm:ping` (prawdziwe zdarzenia MG od etapu 04). Następny etap: 03 (rdzeń realtime i czat).
