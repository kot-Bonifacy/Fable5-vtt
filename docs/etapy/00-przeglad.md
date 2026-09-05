# Przegląd projektu — plan 28 etapów, z czego 3 wycofane

Każdy etap to jedna sesja pracy z Claude. Etapy są pogrupowane w 8 faz. Szczegóły każdego etapu w osobnym pliku `etap-NN-*.md`. Bieżący stan prac: `POSTEP.md`.

**Głos wypadł z projektu (decyzja MG, 09.08.2026).** Wycofane zostały trzy etapy: **12 (TTS — mowa botów)**, **21 (STT — polecenia głosowe)** i **22 (WebRTC — czat głosowy graczy)**, czyli cała faza G. Etap 12 był ukończony 26.07 i jego kod został z repozytorium **usunięty**; 21 i 22 nie zdążyły się zacząć. Numery pozostałych etapów zostają bez zmian, żeby nie unieważniać odwołań w archiwum. Opisy wycofanych etapów: `archiwum/wycofane/`. Rozmowa z botami odbywa się na czacie, głos przy stole załatwia zewnętrzny komunikator.

## Mapa etapów

| #   | Etap                                                | Faza                 | Kamień milowy                   |
| --- | --------------------------------------------------- | -------------------- | ------------------------------- |
| 01  | Szkielet projektu i środowisko                      | A. Fundament         |                                 |
| 02  | Baza danych, użytkownicy, role                      | A. Fundament         |                                 |
| 03  | Rdzeń realtime i czat                               | A. Fundament         |                                 |
| 04  | Mapa i sceny                                        | B. Stół MVP          |                                 |
| 05  | Tokeny                                              | B. Stół MVP          |                                 |
| 06  | Silnik kości CP RED                                 | B. Stół MVP          |                                 |
| 07  | Karta postaci — model i edytor                      | B. Stół MVP          |                                 |
| 08  | Karta interaktywna i integracja                     | B. Stół MVP          | 🏁 Grywalny stół                |
| 09  | AI Gateway — fundament botów                        | C. Boty MVP          |                                 |
| 10  | Edytor botów                                        | C. Boty MVP          |                                 |
| 11  | Boty NPC na czacie                                  | C. Boty MVP          | 🏁 MVP z ankiety komplet        |
| 13  | Dane z podręcznika i kompendium                     | D. Walka             |                                 |
| 14  | Inicjatywa i tury                                   | D. Walka             |                                 |
| 14b | Ekonomia akcji: budżet tury i katalog akcji         | D. Walka             |                                 |
| 14c | Ruch w turze: budżet metrów na mapie                | D. Walka             |                                 |
| 14d | Statusy w mechanice: zwarcie, kryty, automaty tury  | D. Walka             | 🏁 Pełna mechanika tur          |
| 15  | Obrażenia, pancerz, krytyki, Death Save             | D. Walka             |                                 |
| 16  | Zasięgi, DV z mapy, autofire                        | D. Walka             | 🏁 Pełna automatyka walki       |
| 16b | Linia strzału i atak z mapy                         | D. Walka             |                                 |
| 16c | Osłony jako obiekty sceny                           | D. Walka             |                                 |
| 16d | Granaty, wzorce obszarowe i amunicja specjalna      | D. Walka             | 🏁 Pełny ostrzał                |
| 16e | Ruch klikiem: zaznaczenie, automat chodzenia, marsz | D. Walka             |                                 |
| 16f | Celowanie kursorem i HUD walki                      | D. Walka             | 🏁 Walka bez otwierania paneli  |
| 17a | Fog of war i warstwa MG                             | E. Widoczność        |                                 |
| 17b | Rysowanie po mapie                                  | E. Widoczność        |                                 |
| 18  | Dynamiczne oświetlenie i ściany                     | E. Widoczność        |                                 |
| 19  | Pamięć botów — RAG, dziennik, relacje, asystent MG  | F. Boty zaawansowane |                                 |
| 20a | Akcje botów: structured output i rzuty              | F. Boty zaawansowane |                                 |
| 20b | Tura bota w walce                                   | F. Boty zaawansowane | 🏁 Pełne boty                   |
| 23  | Cyberware, humanity, ekonomia, reputacja            | H. Świat CP RED      |                                 |
| 24a | Handouty                                            | H. Świat CP RED      |                                 |
| 24b | Dziennik kampanii dla stołu                         | H. Świat CP RED      |                                 |
| 24c | Screamsheets                                        | H. Świat CP RED      |                                 |
| 25a | Kreator postaci: rola, cechy, umiejętności          | H. Świat CP RED      | podział 25 → 25a/25b (14.08)    |
| 25b | Kreator: Ścieżka Życia                              | H. Świat CP RED      | podział 25b → 25b/25c (14.08)   |
| 25c | Kreator: wyposażenie startowe i poziomy dostępności | H. Świat CP RED      |                                 |
| 26a | Sieć: dane, architektura i cyberdek                 | H. Świat CP RED      | podział 26 → 26a–26d (14/15.08) |
| 26b | Run: punkty dostępu, winda i Akcje Sieciowe         | H. Świat CP RED      |                                 |
| 26c | Walka w Sieci: Programy, Paf, Ślizg, Czarny LOD     | H. Świat CP RED      | wydzielone z 26b (15.08)        |
| 26d | Węzły kontrolne i systemy obronne                   | H. Świat CP RED      | dawne 26c                       |
| 26e | Demony                                              | H. Świat CP RED      | wydzielone z 26d (15.08)        |
| 26f | Samodzielne systemy obronne i broniona strefa       | H. Świat CP RED      | wydzielone z 26e (16.08)        |
| 27  | Kości 3D i szlif UI                                 | I. Wykończenie       | rozbity na 27a–27l (13–23.08)   |
| 27k | Edycja sceny: zaznacz, skasuj, cofnij               | I. Wykończenie       | dopisany 23.08 (zlecenie MG)    |
| 27l | Karty obiektów sceny                                | I. Wykończenie       | wydzielone z 27k (23.08)        |
| 28  | Wdrożenie na VPS                                    | I. Wykończenie       | 🏁 Produkcja                    |
| 29  | Rozwój postaci za Punkty Doświadczenia              | H. Świat CP RED      | dopisany 29.08 (audyt)          |
| 30  | Zdolności Specjalne dziewięciu Ról                  | H. Świat CP RED      | dopisany 29.08 (audyt)          |
| 31  | Dodatki do broni                                    | H. Świat CP RED      | dopisany 29.08 (audyt)          |
| 32  | Wezwanie MG do Testu                                | H. Świat CP RED      | dopisany 02.09 (zlecenie MG)    |
| 33  | Kopie zapasowe, eksport i import                    | I. Wykończenie       | dopisany 02.09 (przegląd VTT)   |
| 34  | Tabele losowe                                       | I. Wykończenie       | dopisany 02.09 (przegląd VTT)   |
| 35  | Ping, zaznaczanie wielu figur, klonowanie           | I. Wykończenie       | dopisany 02.09 (przegląd VTT)   |
| ~~36~~ | ~~Makra i pasek własnych akcji~~                 | —                    | **wycofany 05.09** (decyzja MG) |
| 37  | Kalendarz kampanii i upływ czasu                    | H. Świat CP RED      | dopisany 02.09 (przegląd VTT)   |
| 38  | Przedmioty między kartami                           | H. Świat CP RED      | dopisany 02.09 (przegląd VTT)   |
| 39  | Efekty czasowe modyfikujące Cechy                   | H. Świat CP RED      | dopisany 02.09 (przegląd VTT)   |

## Kolejność i zależności

Fazy A→B→C odwzorowują priorytety MVP z ankiety (mapa+tokeny, kości, karty, boty na czacie). Fazy D–I można w razie potrzeby lokalnie przestawiać, ale:

- 13 (dane podręcznika) przed 15–16, 19, 23, 25, 26 — wszystkie konsumują dane z pipeline'u.
- 14 (inicjatywa) przed 15–16 i 20.
- 14b→14c→14d (ekonomia akcji, dopisane 30.07 — patrz „Rozszerzenia planu po starcie") **po** 15–16 (spinają istniejące ścieżki ataku i przeładowania) i **przed** 20 — bezpieczniki botów („limit akcji na turę, ruch ≤ MOVE") to wprost walidacja z tych etapów.
- 16b→16c→16d (linia strzału, osłony i amunicja, dopisane 31.07) **po** 18a–18e (linia strzału konsumuje geometrię ścian i otworów) i **przed** 20 — inaczej bot uczy się strzelać w świecie, w którym mury nie zatrzymują kul.
- 16e→16f (sterowanie z mapy i HUD, dopisane 31.07) **po** 16b (jest już co uruchamiać klikiem) i **przed** 16c/16d — osłony i granaty dokładają do mapy kolejne znaczenia kliknięcia, więc model wskaźnika ustala się raz, a nie przepisuje dwa razy. Wewnętrznie 16f wymaga 16e (HUD mówi o zaznaczonym tokenie).
- 9–11 (boty podstawowe) przed 19–20.
- 17a przed 18 (oświetlenie buduje na fog of war); 17b (rysowanie) nie blokuje niczego.
- 28 (VPS) na końcu, ale można go wcześniej „wcisnąć" w dowolnym momencie, gdy zechcesz grać zdalnie — plan etapu jest samodzielny.
- 33 (kopie zapasowe) **przed 28** — wdrożenie mnoży egzemplarze stanu przez dwa, a pytanie „która kopia jest prawdziwa" ma mieć wtedy odpowiedź.
- 37 (kalendarz) **przed 39** — efekt „na godzinę" nie ma na czym wisieć, dopóki czas istnieje wyłącznie w rundach walki.

## Decyzje projektowe (ustalone z użytkownikiem 16.07.2026)

1. **Stack:** Node.js + TypeScript (Fastify + Socket.IO) dla serwera VTT, React + Vite + Pixi.js dla klienta, osobny AI Gateway w Pythonie (FastAPI) na PC z GPU.
2. **Baza:** SQLite + Prisma. Backup = kopia pliku wg harmonogramu. Ewentualna migracja na Postgres w przyszłości przez ORM.
3. **Runtime LLM:** llama.cpp / `llama-server` (natywny GGUF, API zgodne z OpenAI, kontrola nad blokami think per żądanie).
4. **RAG na podręczniku** (w ankiecie „doradź mi"): **TAK** — indeksujemy skonwertowany podręcznik lokalnie, wyłącznie do użytku prywatnego; asystent MG cytuje zasady z odwołaniem do źródła.
5. **Ekspozycja serwera** (w ankiecie „doradź mi"): VTT publicznie za Caddy z HTTPS + dostęp przez linki zaproszeń i hasło; kanał VPS↔PC (LLM) wyłącznie przez Tailscale. Alternatywa „cały VTT w tailnecie" odrzucona — wymagałaby instalacji VPN u każdego gracza.

## Świadome odstępstwa od ankiety

1. **WebRTC „od razu" → etap 22 → wycofane.** Wbudowany głos nie był w priorytetach MVP z ankiety, więc najpierw poszedł na koniec planu, a 09.08.2026 wypadł z niego całkiem. Głosem przy stole zajmuje się zewnętrzny komunikator — na stałe, nie tymczasowo.
2. **Kości 3D → etap 27.** Czysto wizualne; mechanika kości działa od etapu 6, animacja to nakładka na wynik z serwera.
3. **Netrunning → etap 26.** Najbardziej złożony moduł, używany rzadziej niż walka; wcześniej MG prowadzi netrunning „ręcznie" na czacie. Jeśli okaże się za duży na jedną sesję — podzielimy na architektura+wizualizacja / programy+akcje.
4. **Etap 18 (dynamiczne oświetlenie)** to technicznie najtrudniejszy pojedynczy etap — z góry dopuszczamy podział na dwie sesje.

## Rozszerzenia planu po starcie

1. **Etap 12 — TTS: głos botów** (dodany 24.07.2026, ukończony 26.07.2026 na Piperze, **wycofany 09.08.2026**). Boty dostały mowę po polsku jako opcję per bot i per sesja; po decyzji MG cały kod (silniki w gatewayu, proxy i cache na serwerze, kolejka odtwarzania u klienta, katalog głosów, kolumna `Campaign.speechEnabled`, sekcja „Głos" w profilu bota) został z repozytorium usunięty. Z etapu **zostaje jedna rzecz**: wypowiedź NPC-a nie pojawia się na czacie w całości, tylko dopisuje się słowo po słowie — od wycofania mowy to czysto kliencki efekt w stałym tempie czytania (`packages/client/src/typewriter.ts`), bez udziału serwera. Dodanie etapu przenumerowało wtedy dawne etapy 12–27 na 13–28 i numeracja tak zostaje.

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
   wszystko, co etapy 10–11 zbudowały wokół polszczyzny.

6. **Etapy 25a/25b/25c — kreator postaci** (podział 25→25a/25b 14.08.2026, 25b→25b/25c tego
   samego dnia po zobaczeniu rozmiaru pipeline'u). Pierwotny etap 25 niósł naraz dane tworzenia
   postaci, sześciokrokowy kreator, szkic w bazie, tabele Ścieżek Życia, zakupy startowe
   i wroga przerabianego na bota. **25a** wziął mechanikę (Rola, Cechy, Umiejętności), **25b**
   narrację (71 tabel Ścieżek Życia, 522 wiersze ze zrzutu PDF-a — rozmiar `parse-creation.py`),
   **25c** bierze wyposażenie startowe, ksywę z portretem i żeton. Do 25c dopisał się dodatkowo
   **życzenie MG spoza pierwotnego planu**: poziomy dostępności przedmiotów, które MG
   odblokowuje w miarę kampanii — mechanizm kampanii, nie zasada podręcznika, więc siedzi na
   `Campaign`, a nie w tabelach CP RED.

7. **Etapy 26a–26f — netrunning** (podział 14.08.2026, pogłębiony 15.08 i 16.08.2026). Opis etapu 26 sam
   dopuszczał podział na dwa („architektury + wizualizacja" / „programy, ICE i walka"), ale
   rozdział 11 podręcznika to w praktyce **sześć** niezależnych kawałków roboty: katalog (~40 wpisów:
   Programy, Czarny LOD, Demony, cyberdeki, Ulepszenia Sprzętowe) z modelem architektury
   i edytorem MG (**26a**), run — punkty dostępu, winda, budżet Akcji Sieciowych i siedem
   niebojowych zdolności Interfejsu (**26b**), walka w Sieci — Programy, Paf, Ślizg, Czarny LOD
   i obrażenia w obie strony (**26c**), węzły kontrolne sięgające do Somy wraz z trzema tabelami
   systemów obronnych (**26d**), bestiariusz Demonów z ich własną Turą (**26e**) — oraz systemy
   obronne, które działają **bez niczyjej ręki**: broniona strefa jako obiekt sceny, model efektu
   jako dane i wyzwalanie na ruchu figury (**26f**). Przy podziale na dwa druga
   sesja niosłaby run **i** Demony naraz; przy podziale na trzy 26b niosłoby run **i** całą walkę
   w Sieci. **Decyzja MG z 14.08:** ekran Sieci dla netrunnera to pływające okno (jak karta
   postaci), nie zakładka panelu — run dzieje się w trakcie walki fizycznej, więc mapa musi zostać
   widoczna. **Decyzja MG z 15.08:** punkt dostępu jest obiektem sceny stawianym narzędziem mapy
   i domyślnie ukrytym — odsłania go Skaner albo MG. **Druga decyzja MG z 15.08 (etap 26c):**
   Czarny LOD nigdy nie rusza się sam — MG ma przy nim dwa przyciski („LOD wykrywa intruza",
   „Tura LOD-a"), a walka w Sieci działa także bez włączonego trybu turowego. Etap 26c dołożył
   też jedyną zmianę w rdzeniu VTT, jakiej wymagał netrunning: **uczestnik kolejki inicjatywy
   nie musi mieć figury na mapie** (`Combatant.tokenId` jest nullowalny), bo „LOD zajmuje
   pierwsze miejsce w Kolejce Inicjatywy" (s. 205), nie stojąc nigdzie w Somie.
   **Trzy decyzje MG z 16.08 (etap 26f):** Percepcja przeciw ukrytej strefie rzuca się **sama**
   przy zbliżeniu i tylko **raz na postać**; strefa odpala się na każdego, kto wejdzie, ale nosi
   **imienną listę przepustek** (VTT nie wie, kto ma identyfikator, więc mówi to MG); stanowisko
   obronne strzela **na wejście w strefę**, a nie wyłącznie na klik — to jedyne miejsce, w którym
   rozdział 11 odchodzi od zasady „nic nie rusza się samo", bo kolumna „Standardowa aktywacja"
   mówi wprost, kiedy wieżyczka strzela.

8. **Etapy 29/30/31 — dziury zostawione przez podręcznik** (dopisane 29.08.2026 po audycie
   zgodności z podręcznikiem głównym). Audyt przeszedł całą mechanikę CP RED przeciwko
   rozdziałom 9–10 i 17 i znalazł dziewięciu kandydatów; trzy najmniejsze zrobiła sesja 29.08
   od ręki (połowa pancerza przy broni białej, mnożnik pękniętej czaszki, typowane kary ran),
   dwa zostały w `POMYSLY.md` jako materiał na przyszłość (tarcza jako przedmiot z PW, walka
   pojazdów), a **cztery okazały się za duże na sesję zaległości** i dostały numery: rozwój
   postaci za PD wraz z wieloklasowością (**29**), Zdolności Specjalne dziewięciu Ról (**30**)
   i dodatki do broni (**31**). Numery idą **za 28** świadomie: etapy 1–28 to plan z lipca,
   a te trzy powstały po nim i nie blokują wdrożenia. **Etap 30 jest z góry podejrzany
   o podział** — dziewięć Zdolności to dziewięć niezależnych mechanik, i tak samo wyglądały
   26 i 27 przed rozbiciem.

9. **Etap 32 — wezwanie MG do Testu** (dopisany 02.09.2026 na zlecenie MG). Do 31 etapu **każdy
   rzut zaczynał gracz**: mechanika CP RED była kompletna, ale MG nie miał czym powiedzieć
   kośćmi „sprawdź, czy to zauważasz". Etap dokłada trzecią drogę do kubka — wezwanie wystawiane
   przez MG, z Poziomem Trudności z drabinki s. 130 albo z rzutem przeciwstawnym. **Skutki
   zostają w rękach MG** (decyzja MG): karta dowozi werdykt, a przedmiot, PW czy ranę rozlicza
   się narzędziami, które MG ma od etapów 15, 23b i 30b.

10. **Etapy 33–39 — czego brakuje względem innych VTT** (dopisane 02.09.2026 po przeglądzie
    zamówionym przez MG). Przegląd zestawił kod z tym, co jest standardem w Foundry, Roll20,
    Fantasy Grounds i Owlbear Rodeo, i znalazł siedem braków wartych własnej sesji: **kopie
    zapasowe wraz z eksportem i importem** (33 — jedyna pozycja chroniąca przed utratą pracy
    nie do odtworzenia; `CLAUDE.md` obiecywał „kopię pliku wg harmonogramu", którego nigdzie
    nie było), **tabele losowe** (34), **ping, zaznaczanie wielu figur i klonowanie** (35),
    **makra i własny pasek** (36), **kalendarz i upływ czasu** (37), **przedmioty przenoszone
    między kartami** (38) i **efekty czasowe modyfikujące Cechy** (39).

    **Z tej siódemki MG wycofał 05.09.2026 etap 36 (makra i własny pasek)** — dokładał
    złożoność (model `Macro` w bazie, trzy zdarzenia, edytor, druga listwa klawiszy)
    nieproporcjonalną do pożytku przy stole, na którym `/r` wpisane Enterem i pasek akcji
    z 16f załatwiają to samo. Numer 36 zostaje **pusty**, żeby odwołania do etapów 37–39
    w dzienniku sesji i umowach kodu nie przestały się zgadzać. Pasek akcji z 16f
    (`hotbarSlotsFor`) jest i zostaje **generowany** z tego, co figura potrafi — nie ma i nie
    będzie miał slotów układanych ręcznie. Nie proponuj wracania do makr.

    **Rozstrzygnięcie MG, które ukształtowało etap 34:** losowanie z tabeli **nie dotyka
    kubka**. Kubek ma jeden slot naraz (`rollStore.ts`, `EMPTY_CUP` czyści wszystkie pozostałe
    pola), więc losowanie ładujące go zdmuchnęłoby rzut wzięty do ręki w oknie postaci albo
    wezwanie czekające u gracza z etapu 32. Tabela idzie drogą, którą `/r` wysłane Enterem ma
    od etapu 03: rzut po stronie serwera, bez gestu i bez slotu.

    **Druga decyzja MG z tego dnia:** muzyka i tła dźwiękowe przypisane do sceny **mieszczą się
    w projekcie** — wycofanie głosu z 09.08 dotyczyło mowy botów, poleceń głosowych i czatu
    głosowego, a nie odtwarzacza plików. Pomysł czeka w `POMYSLY.md`, nie ma jeszcze numeru.

    **Trzecia:** responsywność i obsługa tabletów schodzi na sam dół listy — gra się zdalnie,
    każdy przy własnym komputerze.

## Ryzyka i ograniczenia

- **VRAM (16 GB) — przestał być wąskim gardłem po wycofaniu głosu (09.08.2026).** Bilans po pomiarach z etapu 09: Windows z pulpitem ~2,8 GB + llama-server @32k ~9,2 GB ⇒ **wolne ~4,0 GB**. Ta rezerwa była pisana na whispera (etap 21) i TTS (etap 12); oba etapy wypadły, a embeddingi RAG z etapu 19a i tak liczą się na CPU, więc dziś **na karcie stoi wyłącznie model językowy**. Zapas wraca do puli: przy dokładaniu czegokolwiek na GPU (większy kontekst, mocniejszy kwant, model wizyjny) mierz od tych ~4,0 GB i aktualizuj tabelę w `ai-gateway/README.md`.
- **Czas odpowiedzi bota ≤ 15 s:** limituje długość promptu (RAG top-k, przycinanie historii) i max tokenów odpowiedzi; kolejka jeden-bot-naraz zgodnie z ankietą.
- **Upload 50 Mb/s w domu:** wystarcza na Tailscale (tekst do LLM), ale duże mapy trzymamy na VPS, nie serwujemy z PC.
- **Etapy 13, 23, 25, 26 wymagają materiałów od Ciebie** (skonwertowany tekst podręcznika) — przygotuj je przed tymi sesjami.
