# Przegląd projektu — plan 28 etapów

Każdy etap to jedna sesja pracy z Claude. Etapy są pogrupowane w 9 faz. Szczegóły każdego etapu w osobnym pliku `etap-NN-*.md`. Bieżący stan prac: `POSTEP.md`.

## Mapa etapów

| #   | Etap                                                | Faza                 | Kamień milowy                  |
| --- | --------------------------------------------------- | -------------------- | ------------------------------ |
| 01  | Szkielet projektu i środowisko                      | A. Fundament         |                                |
| 02  | Baza danych, użytkownicy, role                      | A. Fundament         |                                |
| 03  | Rdzeń realtime i czat                               | A. Fundament         |                                |
| 04  | Mapa i sceny                                        | B. Stół MVP          |                                |
| 05  | Tokeny                                              | B. Stół MVP          |                                |
| 06  | Silnik kości CP RED                                 | B. Stół MVP          |                                |
| 07  | Karta postaci — model i edytor                      | B. Stół MVP          |                                |
| 08  | Karta interaktywna i integracja                     | B. Stół MVP          | 🏁 Grywalny stół               |
| 09  | AI Gateway — fundament botów                        | C. Boty MVP          |                                |
| 10  | Edytor botów                                        | C. Boty MVP          |                                |
| 11  | Boty NPC na czacie                                  | C. Boty MVP          | 🏁 MVP z ankiety komplet       |
| 12  | TTS — głos botów                                    | C. Boty MVP          |                                |
| 13  | Dane z podręcznika i kompendium                     | D. Walka             |                                |
| 14  | Inicjatywa i tury                                   | D. Walka             |                                |
| 14b | Ekonomia akcji: budżet tury i katalog akcji         | D. Walka             |                                |
| 14c | Ruch w turze: budżet metrów na mapie                | D. Walka             |                                |
| 14d | Statusy w mechanice: zwarcie, kryty, automaty tury  | D. Walka             | 🏁 Pełna mechanika tur         |
| 15  | Obrażenia, pancerz, krytyki, Death Save             | D. Walka             |                                |
| 16  | Zasięgi, DV z mapy, autofire                        | D. Walka             | 🏁 Pełna automatyka walki      |
| 16b | Linia strzału i atak z mapy                         | D. Walka             |                                |
| 16c | Osłony jako obiekty sceny                           | D. Walka             |                                |
| 16d | Granaty, wzorce obszarowe i amunicja specjalna      | D. Walka             | 🏁 Pełny ostrzał               |
| 16e | Ruch klikiem: zaznaczenie, automat chodzenia, marsz | D. Walka             |                                |
| 16f | Celowanie kursorem i HUD walki                      | D. Walka             | 🏁 Walka bez otwierania paneli |
| 17a | Fog of war i warstwa MG                             | E. Widoczność        |                                |
| 17b | Rysowanie po mapie                                  | E. Widoczność        |                                |
| 18  | Dynamiczne oświetlenie i ściany                     | E. Widoczność        |                                |
| 19  | Pamięć botów — RAG, dziennik, relacje, asystent MG  | F. Boty zaawansowane |                                |
| 20a | Akcje botów: structured output i rzuty              | F. Boty zaawansowane |                                |
| 20b | Tura bota w walce                                   | F. Boty zaawansowane | 🏁 Pełne boty                  |
| 21  | STT — polecenia głosowe                             | G. Głos              |                                |
| 22  | WebRTC — czat głosowy graczy                        | G. Głos              |                                |
| 23  | Cyberware, humanity, ekonomia, reputacja            | H. Świat CP RED      |                                |
| 24  | Handouty, dziennik kampanii, screamsheets           | H. Świat CP RED      |                                |
| 25  | Generator postaci (lifepath)                        | H. Świat CP RED      |                                |
| 26  | Netrunning                                          | H. Świat CP RED      |                                |
| 27  | Kości 3D i szlif UI                                 | I. Wykończenie       |                                |
| 28  | Wdrożenie na VPS                                    | I. Wykończenie       | 🏁 Produkcja                   |

## Kolejność i zależności

Fazy A→B→C odwzorowują priorytety MVP z ankiety (mapa+tokeny, kości, karty, boty na czacie). Fazy D–I można w razie potrzeby lokalnie przestawiać, ale:

- 13 (dane podręcznika) przed 15–16, 19, 23, 25, 26 — wszystkie konsumują dane z pipeline'u.
- 14 (inicjatywa) przed 15–16 i 20.
- 14b→14c→14d (ekonomia akcji, dopisane 30.07 — patrz „Rozszerzenia planu po starcie") **po** 15–16 (spinają istniejące ścieżki ataku i przeładowania) i **przed** 20 — bezpieczniki botów („limit akcji na turę, ruch ≤ MOVE") to wprost walidacja z tych etapów.
- 16b→16c→16d (linia strzału, osłony i amunicja, dopisane 31.07) **po** 18a–18e (linia strzału konsumuje geometrię ścian i otworów) i **przed** 20 — inaczej bot uczy się strzelać w świecie, w którym mury nie zatrzymują kul.
- 16e→16f (sterowanie z mapy i HUD, dopisane 31.07) **po** 16b (jest już co uruchamiać klikiem) i **przed** 16c/16d — osłony i granaty dokładają do mapy kolejne znaczenia kliknięcia, więc model wskaźnika ustala się raz, a nie przepisuje dwa razy. Wewnętrznie 16f wymaga 16e (HUD mówi o zaznaczonym tokenie).
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

2. **Etapy 14b/14c/14d — system tur** (dodane 30.07.2026). Pełny podręcznik, dostarczony po utworzeniu planu, opisuje kompletną mechanikę tur (Tura = 1 Akcja Ruchu + 1 Akcja, katalog akcji z kosztami, zwarcie, statusy, automaty przejścia tury), której pierwotny plan nie projektował — etap 14 dał sam tracker kolejności, a POMYSLY notowało ekonomię akcji jako „naturalne dla etapu 20". Decyzje z użytkownikiem: egzekwowanie **twarde z wolną ręką MG**, ruch liczony w **metrach po ścieżce**, pełny zakres RAW (zwarcie, kryty w turze, Wstrzymanie Akcji, DoT), rozłożone na **trzy sesje** (duże zmiany w kodzie i dużo testów). Numeracja literowa w fazie D, żeby nie przenumerowywać etapów 15–28.

3. **Etapy 16b/16c/16d — ostrzał w terenie** (dodane 31.07.2026, tego samego dnia 16b podzielony na 16b i 16c). Etap 16 zrobił całą matematykę strzelania (PT z dystansu, ogień ciągły i zaporowy, amunicja, przeładowanie, celowany strzał), ale **świadomie zostawił osłony poza zakresem**, bo ścian jeszcze nie było — dziś kula przechodzi przez mur, choć geometria jest gotowa od 18a–18e. 16b domyka „czy widzę, w co strzelam" (linia strzału, ogień zaporowy przez mury, atak z mapy, profil bojowy statysty bez karty postaci), 16c domyka „co stoi między nami" (osłona jako obiekt sceny z PW, ostrzeliwanie jej, Ludzka tarcza), 16d domyka „czym strzelam" (granaty i wzorce obszarowe, rzut przedmiotem, 12 typów amunicji). Decyzje z użytkownikiem: **ściana blokuje absolutnie, zniszczalne są tylko osłony**; **rozstrzyga linia środek—środek** (RAW nie zna kary za częściową osłonę); **osłona ma PW, nie ma SP** (podręcznik, s. 179 — pierwotny opis 16b mówił inaczej); **profil statysty obejmuje też obronę**; **przed etapem 19**, żeby autonomia botów z 20 stała na kompletnej walce.

4. **Etapy 16e/16f — interfejs walki** (dodane 31.07.2026 na zgłoszenie MG: „obecny sposób używania myszki do sterowania tokenami jest niewygodny"). Mechanika walki jest kompletna (14b–14e, 15, 16, 16b), ale **wejściem do niej zostało UI z czasów, gdy walki nie było**: ruch to przeciąganie obrazka, a atak zaczyna się od otwarcia karty postaci albo menu kontekstowego. Wzorzec: klasyczne komputerowe RPG z rzutem od góry — zaznaczasz postać, klikasz w podłoże, żeby iść, i we wroga, żeby go zaatakować.

   **Odkrycie, które ukształtowało 16e (pomysł MG):** trasę omijającą ściany da się policzyć u gracza, który ścian nie ma — bo **granica pola widzenia jest obrazem ścian**. A* ograniczony do widocznego wielokąta i zapamiętanego terenu (18c) obchodzi mur, nie wiedząc o jego istnieniu; MG, który ściany ma, liczy po pełnej geometrii. Ta sama tożsamość, na której stoi 16b („linia strzału = blokady wzroku strzelca"), tylko dla nóg zamiast dla kul.

   Decyzje z użytkownikiem: **ruch klikiem, ale przeciąganie zostaje** (MG nie traci szybkiego ustawiania tokenów); **interfejs działa zawsze, a w walce dochodzi budżet tury i pasek akcji**; **klik w cel ładuje kubek, nie rzuca** (rzut kośćmi jest osobnym momentem przy stole); **trasa po terenie widocznym i zapamiętanym**, a klik w nieznane to marsz do granicy wiedzy; **marsz widoczny dla całego stołu**, przerywany przez pojawienie się kogoś w polu widzenia, koniec budżetu i zdarzenia w grze; **„idź, ile starczy"** zamiast odmowy ruchu ponad budżet. Podział na dwie sesje biegnie między **ruchem** (16e) a **atakiem i HUD-em** (16f). Kolejność: **przed 16c/16d**, bo osłony i granaty dołożą do wskaźnika kolejne przypadki.

5. **Etapy 20a/20b — autonomia botów** (podział 08.08.2026). Pierwotny etap 20 obejmował naraz
   nową zdolność gatewaya (structured output), nowy model danych z UI (tryby autonomii, karta
   propozycji) i całą warstwę taktyczną walki (stan taktyczny, „Graj turę", atak, ruch). **20a**
   bierze fundament plus jeden pionowy plaster, który go weryfikuje — bot rzuca kośćmi poza walką;
   **20b** bierze pole bitwy. Rozstrzygnięcie, które ukształtowało 20a: **gramatyka JSON obsługuje
   wyłącznie przebieg decyzyjny**, a wypowiedź NPC-a zostaje swobodnym tekstem — inaczej stracimy
   wszystko, co etapy 10–12 zbudowały wokół polszczyzny i mowy.

## Ryzyka i ograniczenia

- **VRAM (16 GB) — najciaśniejszy zasób projektu.** Bilans po pomiarach z etapu 09: Windows z pulpitem ~2,8 GB + llama-server @32k ~9,2 GB ⇒ **wolne ~4,0 GB** na wszystko pozostałe, do podziału między whisper (etap 21) i TTS (etap 12). Szacunki dla tych dwóch (1,5–2 GB i 2–3 GB) to górne widełki z dokumentacji, nie pomiary — **prawdopodobnie zawyżone i możliwe, że wszystko zmieści się bez zabiegów**; rozstrzygną to etapy 12 i 21, każdy z obowiązkiem zaktualizowania bilansu w `ai-gateway/README.md`. Gdyby jednak zabrakło, kluczowa obserwacja brzmi: **te modele nie muszą stać w karcie jednocześnie** — bot mówi wtedy, gdy LLM skończył generować, a mikrofon milczy. Ścieżki ratunku w kolejności rosnącego kosztu: leniwe ładowanie TTS z wyładowaniem po bezczynności → zwolnienie whispera na czas syntezy (~1–2 s przeładowania) → kontekst LLM 32k→16k (+0,5 GB) → `--cache-type-k/v q8_0` (+~0,3 GB) → zatrzymanie `llama-server` na czas syntezy (~3,5 s wczytania, tylko przy pustej kolejce) → whisper `small` (+~1 GB) → TTS na CPU (Piper, 0 GB) → ostatecznie kwant LLM Q6_K.
-
- **Czas odpowiedzi bota ≤ 15 s:** limituje długość promptu (RAG top-k, przycinanie historii) i max tokenów odpowiedzi; kolejka jeden-bot-naraz zgodnie z ankietą.
- **Upload 50 Mb/s w domu:** wystarcza na Tailscale (tekst do LLM), ale duże mapy trzymamy na VPS, nie serwujemy z PC.
- **Etapy 13, 23, 25, 26 wymagają materiałów od Ciebie** (skonwertowany tekst podręcznika) — przygotuj je przed tymi sesjami.
- **Jakość polskiego TTS** (etap 12): modele open-source obsługujące polski to wąska grupa (Piper, Chatterbox Multilingual, XTTS-v2 — Kokoro i Qwen3-TTS polskiego nie mają). Ryzykiem nie jest brak rozwiązania, tylko rozczarowanie brzmieniem: darmowy TTS bywa „lektorski". Dlatego etap zaczyna się od odsłuchu i pomiaru, a nie od implementacji — i dlatego mowa jest opcją, nie wymogiem.
- **Próbki głosu do klonowania** (etap 12): nie klonuj głosu realnej osoby bez jej zgody. Próbki lądują w `uploads/voices/` (gitignore) i nigdy w repo.
