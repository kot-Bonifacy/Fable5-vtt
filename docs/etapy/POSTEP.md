# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.

**Ten plik czytasz w całości na starcie każdej sesji, więc ma zostać krótki.** Szczegóły mieszkają
w plikach obok — czytaj je **na żądanie, nigdy rutynowo**:

| plik                               | co w nim                                                           | kiedy czytać                                           |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `umowy-kodu.md`                    | gdzie dopisuje się nową rzecz — sekcja na obszar, każda z indeksem | **zanim** dołożysz coś w danym obszarze                |
| `pulapki-dev.md`                   | pułapki, które kosztowały czas — sekcje o tych samych nazwach      | **zanim** zaczniesz szukać błędu w danym obszarze      |
| `zaleglosci.md`                    | otwarte zaległości (dług oględzin, drobne braki)                   | gdy odhaczasz zaległości albo ruszasz etap z tej listy |
| `poligon.md`                       | stan sceny testowej „Poligon bojowy" i procedura oględzin          | przed oględzinami w przeglądarce                       |
| `decyzje-i-uproszczenia.md`        | świadome odstępstwa od podręcznika — **to nie są zaległości**      | gdy coś wygląda na błąd w mechanice CP RED             |
| `POMYSLY.md`                       | pomysły spoza zakresu etapów                                       | gdy masz pomysł do zapisania albo szukasz drobiazgu    |
| `archiwum/tabela-etapow.md`        | pełna tabela etapów (numer, nazwa, status, data), wyprowadzona 18.09 | gdy chcesz wiedzieć, co kryje się pod numerem etapu    |
| `archiwum/od-czego-zaczac.md`      | pełne akapity o zamkniętych etapach, wyprowadzane stąd (10.09, 18.09) | gdy wracasz do świeżo zamkniętego etapu                |
| `archiwum/dziennik-sesji.md`       | pełne notatki starszych sesji                                      | gdy potrzebujesz szczegółu konkretnej sesji            |
| `archiwum/zamkniete-zaleglosci.md` | zamknięte zaległości z diagnozą i opisem naprawy                   | gdy wraca coś, co już raz naprawiono                   |
| `archiwum/uwagi-etapow.md`         | kolumna „Uwagi" z tabeli niżej (jedno zdanie na etap, do 28)       | gdy chcesz szybkie „co było w etapie N"                |

| stan         | etapy                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- |
| ⬜ otwarty   | **refaktoryzacja** całości pod osłoną suity (następna); **28** Wdrożenie na VPS; **43b**, **43c** (UI walki); triaż #79–#81, T10 |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c, 43a, 44a–44d, 45, 46a1, 46a2, 46c1, 46c2, 46b1, 46b2, 47a, 47b, 48a, 48b, 48c (ostatni zamknięty: 48c, 2026-10-10) |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Etap 48 „Ekwipunek gracza: skąd przybywają rzeczy” zamknięty 10.10 (48a–48c) — następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** **Od 48c karta nie ma pustych wierszy** —
także u MG: rzeczy przychodzą z zakupu, wymiany, łupu, kreatora i od MG („Dodaj za darmo”; rzecz
fabularną MG zakłada własnym wpisem w Kompendium, sekret pisze w uwagach wiersza — wpis widzi cały
stół). Gracz pisze tylko uwagi, wyrzuca, zużywa (ilość w dół), zakłada pancerz i umieszcza wszczep;
nazwa, Obrażenia, LA, OB, kara, ↻ i ⊕ Ulepszanie są MG. Serwer: `ITEM_LOCKED`
(`cpredPlayerItemPatchProblem`, `itemlocks.ts`) — **nowe pole wiersza, które gracz zmienia sam,
dopisz do listy `*_FREE`**. Dodatek do broni to towar (montaż z Wyposażenia, zdjęty wraca),
„Znaleziony — montaż” wszczepu wymaga wiersza w Wyposażeniu (MG: „Do Wyposażenia”). Od 48b dek
i Programy to towar (`character:deck`, umowa w `siec`); od 48a przypomnienie o zakupach w kreatorze
gracza i Zakwaterowanie Korpo wg Pracy Zespołowej. Decyzje — `etap-48-ekwipunek-gracza.md`, umowy
w `ekwipunek`, `siec`, `postac`, `ui`.

**Etap 47 „Cennik domowy” zamknięty 10.10 (47a + 47b) — następna jest refaktoryzacja całości pod
osłoną suity, potem T10.** Ed to mniej więcej euro: katalog z plików mnoży się **przy wczytaniu**
(`systems/cpred/pricing.ts`: sprzęt trwały ×10, amunicja i drobny sprzęt ×3; czynsz, Poziom
życia, wypłaty i gotówka startowa bez zmian; pasma i poziomy sklepu bez zmian). Kompletny Pakiet
dostaje **gratis wyposażenie Roli**, a Krawędziarzowi pakiet Roli daje MG „Dodaj za darmo”.
**Od 47b każda karta poza pojemnikiem ma stały wiersz „Bijatyka”** (i „Sztuki walki” od
Umiejętności 1) na końcu broni — nie da się go usunąć ani oddać (`barehands.ts`, umowy w `atak`
i `ekwipunek`). **Łańcuch E2E liczy w nowych cenach** (Kowal z pakietem Roli od MG, wypłata
1000 ed w T6a), `po-T3`…`po-T6` odbudowane 10.10; stare punkty w `.e2e/checkpoints-bak-47a`.
Zapis tabeli losowej nie czeka już na kości (#72). Decyzje w `etap-47-cennik.md`, cennik
z pozycjami: `data/private/cpred/cennik-x10.md`.

**Etap 46 „Wymiana, sklepy, amunicja, pojemniki” zamknięty 09.10 (46b2 ostatnia).** Pojemnik to karta NPC-a z polem `container`
i figurą: MG stawia skrzynię, bagażnik albo schowek narzędziem „📦” w pasku mapy (rodzaj, klik —
otwiera się kompaktowa karta: zamek, PT, Umiejętności, „Wydaj klucz”, „Pozwól spróbować znowu”,
zawartość); karty pojemników siedzą w „Postaciach” w zwiniętej grupie „Pojemniki”. Gracz podwójnym
klikiem albo „📦 Otwórz…” z menu figury dostaje okno „Wymiana” w trybie `container`: „Otwórz”,
„🔑 Otwórz kluczem” albo „Otwórz zamek” (wezwanie do Testu, kubek otwiera się sam, jedna próba na
postać), po otwarciu „←”, „Zabierz wszystko”, „→”. **„Stos”** powstaje z wiersza przeciągniętego
na mapę — z ikonki wiersza na karcie (cały wiersz) albo z „Mój ekwipunek” w oknie (ilość z pola)
— i znika pusty. Zawartość nieotwartego nie opuszcza serwera (kanarek w T2c i `t46b-`). Decyzje MG
i odstępstwa — w pliku etapu (sekcje 46b), umowy w `ekwipunek` i `mapa`.

**Etap 46c „Zapas amunicji” zamknięty 09.10 (46c1 + 46c2).** **Przeładowanie zużywa naboje z pudełek w ekwipunku** na kartach drużyny
(gracz, towarzysz-bot); NPC i statysta MG są „bez dna”, dopóki MG nie zaznaczy „Licz amunicję”.
Pudełko to wiersz wyposażenia z `ammo` (kaliber = pole „Amunicja” typu broni), kupowany paczkami
(10 kul / 1 granat) w Kompendium, w kreatorze i u handlarza; granat ręczny bez magazynka bierze
sztukę przy rzucie, gracz naboi ręką tylko odejmuje (`AMMO_LOCKED`). **Łańcuch E2E liczy amunicję
od 46c2:** Kowal kupuje w kreatorze 2 paczki zwykłej do B.C. Pistoletu (230 ed), po walce T4b
retest #82 (granat bez zapasu → `NO_AMMO`, pudełko od MG → 2/2), w T5a MG daje 2 paczki
przeciwpancernej z Kompendium, T5b 5.9 zmienia rodzaj z zapasu; **`po-T3`…`po-T6` odbudowane
pełnym przebiegiem 09.10**. Pudełka w E2E rozdaje `giveAmmo` z `fixtures/kompendium.ts`. **T3b i T5b
zakładają już „oczy drużyny” z etapu 45** (Ola widzi oczami Kowala; marsz Kowala obchodzi kuchnię
tarasem). Decyzje MG w pliku etapu (sekcja 46c), umowy w `atak` i `ekwipunek`. Jedno okno
„Wymiana” z 46a — kontekst w `archiwum/od-czego-zaczac.md`.

**Etap 44 „Konta MG” zrobiony i odebrany — T9b zamknięty 04.10** (`t9b-dwie-grupy` 15/15 dwa razy
— środkowy z trzech przebiegów padł tylko na filtrze konsoli, zero B0–B2, trzy B3 #79–#81 czekają na triaż MG; wynik w `testy.md` 6.5). **Następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** T9b gra AI na atrapie gatewaya z dziennikiem
żądań (`fixtures/fake-gateway.ts`, tryb `reply`), a progi slotów i karencji skraca env. Kampanie i sesje jak w 44c
(kampania **otwarta** u MG, sesja zajmuje jeden z dwóch slotów, gracz bez sesji ma „Między
sesjami”). **AI właściciela:** zwykły MG prosi w Panelu MG, właściciel decyduje z **każdego**
swojego konta — znaczek „AI” w górnym pasku z licznikiem próśb (konto gracza dostaje flagę
w „Ustawienia → Konto” hasłem właściciela). AI dostaje kampania właściciela zawsze, a kampania MG
ze zgodą — gdy właściciel jest obecny i ma włączone „Udostępniam AI” (gaśnie samo 2 min po jego
ostatniej karcie i po restarcie). **AI trzyma jedna trwająca sesja** (pierwsza uprawniona; koniec
przekazuje dalej; „Przejmij AI” tylko dla własnej sesji właściciela), przygotowanie dostaje AI, gdy
nikt go nie trzyma. Każde żądanie AI idzie przez bramę kampanii (`campaignAi`, umowa w `boty`),
odmowa to `AI_UNAVAILABLE` z powodem. Decyzje MG z 04.10 na końcu `etap-44d-ai-wlasciciela.md`.
**W `dev.db` zostało konto MG `ogledziny-b` (hasło `ogledziny-b-haslo`) z kampanią „Oględziny 44d
(MG-B)”, zgodą na AI i graczem „Właściciel”** — śmieci z oględzin, wolno skasować.

**Kolejność (MG 03.10, korekty 08.10 i 09.10): 44a → 44b → T9a → 44c → 44d → T9b → 45 → 46a1 → 46a2 → 46c1 → 46c2 → 46b1 → 46b2 → 47a → 47b → 48a → 48b → 48c → refaktoryzacja → T10 → 28 → T11.** (48c zamknięta 10.10.)

**Etap 43a zamknięty 26.09 (zlecenie MG spoza planu):** zakładka „Walka” to portrety z ranami od
dołu, ikonami efektów i akcjami grającego pod jego kartą; inicjatywa (rzut, remis, wpis, kubek
gracza, kolejność) żyje tylko na czarnym pasie; **odsetek PW widzi cały stół** (`hpShare`, decyzja
MG — obrączka na cudzych żetonach), „Postacie” w dwa wiersze. **43b** (animacja trafienia, iskry,
cięcie wręcz) i **43c** (plamy krwi na serwerze) rozpisane — MG wybrał „43a teraz, potem T4b”, więc
kolejność 43b/43c względem testów ustala MG. Umowy w `ui` i `mapa`.

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim idą **testy przed betą** (`testy.md`,
rejestr `testy-rejestr.md`): **T1, T2, T3a–T6c zamknięte** — **T6c 01.10: pełny przebieg od zera 196/196 dwa razy z rzędu (~31,5 min)** po dwóch poprawkach: kreator T3a skryptuje kości Cech Kowala, gateway ogranicza bufor promptów llama-server (`--cache-ram 2048`, wcześniej 8 GB w RAM-ie dusiło PC); T6b 30.09 (efekt na Cesze co do minuty, Ustabilizowanie obejściem krótką walką — **#42 B1: poza walką nie ma go w UI**, doba i odpoczynek, dziennik z kanarkiem, streszczenie i screamsheet botem, eksport, kopia z harmonogramu odtworzona na czystym katalogu, import na pustej instancji; nowe #42–#45, dopisek do Z10), T6a 29.09 (handel, sklep, Paser, PD,
Ola Medykiem operuje Kowala; zadanie Z10 — brak importu kampanii), T5b 27.09 (walka druga na „Bramie”: wieżyczka ze strefy, Demon, Kruk, przejęcie węzła, pad gatewaya w turze bota przez pośrednika TCP, F5 w Sieci, amunicja przeciwpancerna; sześć nowych błędów #34–#39), T5a 27.09 (przygotowanie „Bramy”, Skaner, run do Pliku; jego błędy #28–#33 naprawione i retestowane tego samego dnia), T4b 27.09 (granat, rana
krytyczna, Test Przeżywalności, Pochwycenie, wezwanie, łup i przekazanie; T4a przekalibrowany pod
obecne `po-T3`, retest #16, #19, #20 OK). **27.09 naprawione i retestowane:** #15, #17, #18, #23–#27
(`574cf4d`) oraz #28–#33 z T5a (`77e0f6f`; wagi w rejestrze dalej „do triażu MG”). **29.09 naprawione i retestowane #34–#39** (`8277386`), **30.09 — #40 i #41** (`21cbedd`:
gracz wskazuje po id tylko drużynę; operacja u Medyka innego gracza to prośba z ceną Medyka) oraz
retest #21 i #22. **01.10 naprawione i retestowane #10–#13 oraz #42–#45** (`a551f3a`) — #1–#45 zamknięte; **01/02.10 naprawione i retestowane #46 i #47** (`1e6f5dd`: limit odpowiedzi modelu w turze bota to `AI_TIMEOUT`, zapis karty nie cofa figury w marszu — umowy w `boty` i `mapa`) — **02.10 naprawione i retestowane #48 i #49** (`715df2b`: rzuty doganiają stół, karta niesie `revision` — umowy w `kosci` i `karta`), **02/03.10 naprawione i retestowane #50–#52** (`17f42a4`: figura łapie klik tylko na swoich polach, zmiana sceny zwalnia grafiki Pixi i pulę, kości zwalniają klony geometrii — umowy w `mapa` i `kosci`) — **rejestr bez otwartych błędów**; limity tempa, sesja gniazda i uploady za logowaniem (umowa w `serwer`), sesja i link zaproszenia ważne rok; zadania Z2–Z4, Z7 (reszta), Z9–Z11 dla etapów 28 i „Konta MG”. Suita `packages/e2e` (`pnpm test:e2e`)
stawia izolowaną instancję z `dist/` na :3101/:4173 i nie dotyka `dev.db`; **T6 podzielony na T6a/T6b/T6c** (decyzja MG z 29.09); **T7a zamknięty 01.10** (sieć, restart, dwie karty, degradacja AI — `pnpm test:e2e 40-odpornosc`,
poza domyślnym przebiegiem, od 02.10 z T7b i T7c 42 testy); **T7b zamknięty 02.10** (obciążenie stołu,
długi czat, rozmiar bazy — liczby w `testy.md` 6.3; **#48** stół minuty za serwerem przy częstych
rzutach, **#49** spóźnione echo zapisu karty gubi dopiski — triaż MG 02.10: B2 i B0, naprawione tego samego dnia); **T7c zamknięty 02.10**
(wydajność mapy na scenie 4096 i wyciek pamięci — `t7c-mapa`, `t7c-pamiec`, liczby w `testy.md` 6.3:
mapa 60 kl./s wszędzie poza Firefoksem gracza w marszu na Dynamicznej, serwer bez wycieku;
**#50** bufory Pixi po przełączeniu sceny, **#51** geometrie kości 3D, **#52** klik pod cudzą figurą
łapie jej podpis — to był „marsz Sowy”); **T8a zamknięty 03.10** (decyzja MG: T8 przed refaktoryzacją, podział T8a/T8b/T8c — `specs/50-przegladarki`,
macierz silników, ekrany 1920 × 1080 i 2560 × 1440, motyw, konsola; nowe #53–#55 — **03.10 triaż MG: #53 naprawiony** (szew sprite'a zasłony, `isRenderGroup`, umowa w `mapa`), **#54 i #55 odrzucone** — rejestr znów bez otwartych błędów);
**T8b zamknięty 03.10** (pierwszy kontakt: nowy gracz od linku do strzału w ~20 min bez pytań o UI; #56–#71 w rejestrze) i **tego samego dnia nowa zasada stołu (decyzja MG): obrażenia za kartę ataku rozliczają się same, Unik przed obrażeniami, jeden rzut na trafienie, grot za celownikiem** (`029cd36`, umowy w `atak` i `mapa`) — **03.10 (druga sesja): retest T5b → T6b z gatewayem zielony, triaż #57–#71 zrobiony (12 naprawionych w `120646b`, #66/#68/#71 B3 czekają), grot celowania widzi cały stół (`token:aim`, umowa w `mapa`), pełny przebieg 240/240**; **T8c zamknięty 03.10 (trzecia sesja)** — pobieżna regresja obszarów spoza scenariusza: `pnpm test:e2e t8c-` 31 testów z `po-T6` (mapa i „Lombard”, UI i ustawienia, tabele, asystent zasad, baza wiedzy, siedem Zdolności Ról, Reputacja, styl życia; lista w `testy.md` 6.4), nowe #72–#78; **03.10 (czwarta sesja) triaż MG i poprawki #66, #68, #71–#78** (`b9873e8`, retest `00-baseline` + `t8c-` 36/36) — **rejestr znów bez otwartych błędów**; **refaktoryzacja pod osłoną suity przesunięta za etap 44 (decyzja MG 03.10)** (pomiary T7b/T7c i T8a to jej linia bazowa). **Pełny przebieg puszczaj we własnym oknie konsoli, a gateway — w terminalu MG** (pułapka w `testy`).
Kolejność (decyzja MG z 26.09, korekta 01.10):
**T3–T6 → T7a–T7c → T8a–T8c (korekta 03.10) → 44a → 44b → T9a → 44c → 44d → T9b (korekta 03.10, piąta sesja) → 45 → 46a → 46c → 46b (korekta 08.10) → refaktoryzacja całości pod osłoną suity → T10 (z powtórką automatu T8a) → 28 → T11**.
Refaktoryzację odłożono 05.09 — od tamtej pory doszło sześć etapów i naprawa kreatora.
Nie proponuj makr (36 wycofany) ani głosu (12, 21, 22). Największe pliki do pocięcia przy
refaktoryzacji: `MapRenderer.ts` (294 KB), `CharacterSheet.tsx` (172 KB), `socket.ts` (152 KB),
`roleability.ts` (121 KB), `CharacterCreator.tsx` (111 KB) — czytaj je fragmentami (`grep` + zakres).

**Stan UI (20.09):** cały chrom i karta postaci są „starą kartką” — `chrome.css`, `sheet.css`,
tokeny papieru w `theme.css`, kafle UI z maski karty (`tools/art/chrome-paper.py`), wspólna paleta `--cp-*`; MG odrzuca
wszystko ciemniejsze od papieru („żadnego brudu”). Dzień od 24.09 w tonie tapety logowania,
z własną maską (wyblaknięcia + pognieciona kartka) i przypalonym brzegiem (`assety-chrom.md`). Poza skórą: Sieć, pasek mapy, screamsheet,
logowanie. **Od 25.09 kolejka inicjatywy to czarny pas nad mapą, a „Kończę turę” gracza stoi na
górze lewego panelu** (umowa w `ui`). **Od 25.09 (piętnasta) MG ma w prawym górnym rogu mapy
znacznik „Czeka na MG”** z listą spraw, kaflem i licznikiem w tytule karty, a baner portretu
ma własny kadr albo bierze kadr żetonu (umowy w `ui`). **Safari i iPada nie testujemy ani nie dostosowujemy** (decyzja MG z 25.09). **`styles.css` jest od
18.09 spisem `@import` 19 plików w `styles/`** — czytaj plik obszaru, nie całość (umowa w `ui`).

**Naprawa kreatora (`naprawa_karty_postaci.md`) zamknięta 18.09** (etapy 1, 2a–2c, 3a–3d, odbiór
obu metod). **Od 24.09 rzuty kreatora idą po jednej kości przez kubek** (zlecenie MG z 17.09 —
gracz rzuca Cechę raz, przerzut daje MG), a **nowa postać gracza wymaga zgody MG, przeczytanych
zasad i zatwierdzenia** („Przyjmij do gry” od 24.09 blokuje kartę); **od 25.09 zgoda niesie
warunki** — metodę, Rangę Postaci i pulę umiejętności (zasada domowa, podręcznik: 86). Dalsza praca przy kreatorze wychodzi z `POMYSLY.md`
i `zaleglosci.md`. Co obowiązuje w kodzie — sekcja `postac` w umowach; kontekst —
`archiwum/od-czego-zaczac.md`.

**Model lokalny to od 24.09 Qwen3.8-27B UD-Q3_K_XL** (build 10735 w `C:/AI/llm/llama-prism/`,
~50 tok/s, VRAM 15,5 / 16,3 GB przy 32k — na GPU nic nie dokładamy). Qwythos-9B jest skasowany
z dysku; pomiary obu w `ai-gateway/README.md`. Zaległości „na żywy model” zamknięte 24.09.

**Zaległości: z „wiele grup i wielu MG” (26.09) została tylko paczka AI dla innych MG (po becie)** — konta MG, limit dwóch sesji i AI właściciela zamknięte odbiorem T9b 04.10 (archiwum) (RAM llama-server i wyścig `token:sync` zamknięte 03.10 — archiwum). Co ocenia się tylko przy stole (kafel papieru,
sesja zero w kreatorze, pełny ekran, polszczyzna Qwen, Wsparcie 10) — pierwszy wpis `POMYSLY.md`.
**Playwright MCP jest włączony** (MG w Chromium, gracz w Firefoksie, stan sceny z konsoli przez
`await import('/src/socket.ts')` — pułapki w `ogledziny`). Kampania-śmieć „Oględziny 12.09” ma członka `Tester`;
**zaproszenie `tester-dev` jest unieważnione od 17.09** — wchodzi się ważnym zaproszeniem
aktywnej kampanii (`poligon.md`).

**Sceny testowe — pięć.** Aktywna **„StrefaPrzemysłowa”** (kratka 36,2 px, 40 × 30) z **włączonym
trybem turowym** (RUNDA 1: Marcin, Tony — decyzja MG z 12.09, wyłącza tylko jego ręka; „✕” woła
gołego `window.confirm`, pułapka w `ogledziny`). „Korytarza 16e” **nie kasuj** — jedyna scena
z widocznością Dynamiczną. Konta, współrzędne, procedura oględzin: `poligon.md`.

**Pułapki, które wracają przy stole:**

- „Gracz nie może chodzić” — najpierw znaczek „⚠” i przełącznik „Ruch graczy” w górnym pasku MG
  (`Scene.playerMove`; nowa scena startuje w Stop, MG nie dotyczy), potem ręczna mgła: od 14.09
  gracz chodzi tylko po odsłoniętym (`refuseWalkIntoFog`, umowa w `mapa`), potem `Token.ownerId`.
- `>=` przy PT jest błędem, nie wariantem (decyzja z 28.08 cofnięta; wyjątek: Test Lojalności,
  s. 154) — przeczytaj `decyzje-i-uproszczenia.md`, **zanim** to ruszysz.
- Kara za rany ma jedno miejsce: `cpredWoundPenaltyRows(cpredSheetWoundCondition(sheet))`; nowe
  zawieszenie kary dopisuje się w `cpredWoundSuspensionSource` (umowa w `kosci`).
- `requireCallableRequest` (`realtime/checks.ts`) to **biała lista** — nowe pole `CpredRollRequest`
  trzeba do niej dopisać, inaczej ginie po cichu między prośbą gracza a rzutem.
- `data/private/cpred/compendium/` bywa starsze niż parser — `python tools/import/parse-manual.py`
  przed szukaniem błędu. `shop-tiers.json` i `weapon-icons.json` (24.09) też są poza gitem i jadą na VPS z kompendium.
- Pozycje z `POMYSLY.md` sprawdź w kodzie, zanim je ruszysz (29.08 cztery były nieaktualne);
  triaż z 28.08 w `decyzje-i-uproszczenia.md` nie wraca jako nowe odkrycia.
- Karty czatu piszą alias figury (`Token.publicName`) wyłącznie przez `tokenTableName` (umowa
  w `czat`); odmowa broni spoza rąk idzie przez `cpredDrawFits` (umowa w `atak`).

**Git:** `main` na GitHubie zrównany z dyskiem 14.09. Push publikuje całą historię — przed każdym
`git log --name-only --format= origin/main..HEAD` nie może pokazać `data/private/`, `uploads/`,
`.env` ani baz.

**Testy na koniec ostatniej sesji:** 10.10 (siódma — zaległości): **2431** `shared` (+4: `combat.test.ts` 3, `merchant.test.ts` 1), **1430** serwer (+12: nowy `gm-care.test.ts` 11, `bot-combat.test.ts` +1), **330** klient; ESLint, Prettier i `tsc` czyste w zmienionych plikach; E2E: nowy `t8c-leczenie` 3/3, `t46a-` + `t46b-` + `t46c-` + `00-baseline` **41/41** z gatewayem (46c.9 na żywym modelu), po poprawce Bijatyki `t46a-` 17/17; domyślny przebieg ma teraz **+3** testy (`t8c-leczenie`), pełnego nie puszczano. Wcześniej 10.10 (48c): **2423** `shared` (+13 `itemlocks.test.ts`), **1417** serwer (+4: dodatek bez Wyposażenia i z niego, „Znaleziony” z Wyposażenia w montażu i w prośbie do Medyka; przygotowanie stanu łatą MG zamiast gracza w 5 plikach), **331** klient; ESLint, Prettier i `tsc` czyste; E2E z gatewayem: T3a **17/17** (nowy krok 3.8 — 48c), łańcuch od nowego `po-T3a`: T3b–T6a **112/112** + T6b **18/18** (pierwszy przebieg padł w T6b 6.6a — asercja czytała czat jednym odczytem przed wierszem „Efekty wygasły”; poprawiona na `expect.poll`, punkty `po-T3a`…`po-T6` odbudowane 10.10), `t46a-` + `t46b-` + `t46c-` **36/36**. Wcześniej 10.10 (48b): **2410** `shared` (+17: `cyberdeck.test.ts`, kreator z dekiem), **1413** serwer (+1 `character:deck` w `netrunning.test.ts`, kreator Netrunnera i macierz izolacji poprawione), **331** klient; ESLint (pakiety), Prettier i `tsc` czyste; E2E z gatewayem: T3a **16/16**, łańcuch T3b–T6b od nowego `po-T3a` **130/130** (punkty `po-T3a`…`po-T6` odbudowane 10.10), `t46a-` + `t46b-` + `t46c-` + `00-baseline` 40/41 (46a.15 — menu figury Pasera nie otworzyło się prawym klikiem, migotanie; powtórka `t46a-` 17/17, pułapka w `testy`). Wcześniej 10.10 (48a): **2393** `shared` (+5: przypomnienie o zakupach, Zakwaterowanie Korpo), **1412** serwer (+2: brak zakupów gracza, `HOUSING_LOCKED`; helper `allocateRemaining` zaznacza „Ruszam bez zakupów”), **331** klient; ESLint, Prettier i `tsc` czyste; E2E `@szybkie` 52/53 (T9a „konsola” — zerwane gniazdo Firefoksa, znana pułapka z 47a; powtórka `t9a-konta` 7/7); łańcucha i pełnego przebiegu nie puszczano (T3a kupuje w kreatorze, więc nowy brak go nie dotyczy). Wcześniej 10.10 (47b): **2388** `shared` (+11 `barehands.test.ts`), **1410** serwer (+1 gołe ręce w `inventory.test.ts`, asercje list broni w 6 plikach), **331** klient; ESLint, Prettier i `tsc` czyste w czterech pakietach (poza starymi ostrzeżeniami Prettiera w `e2e/fixtures/brama.ts` i `wydajnosc.ts`); łańcuch T3a–T6b zielony kawałkami z gatewayem (T3a 16/16, T3b–T4a, T4b–T5b, T6a + T6b 32/32), `t46a` + `t46b` + `t46c` 35/35 i `t46c` 10/10 po poprawce, `t7a-handel-kreator` 3/3; **pełny domyślny przebieg z gatewayem dwa razy** (369 testów): 365 + #72 + szew zasłony (migotanie), po poprawce #72 **366/369** (52,3 min; 6.9c — przerwany obrazek w Firefoksie, dwa testy za nim nie poszły), potem `t6b-` 18/18 i `00-baseline` + `t8c-` 37/37. Wcześniej 10.10 (47a): **2377** `shared` (+10: `pricing.test.ts`, wyposażenie Roli, zasady domowe asystenta), **1409** serwer (+3 wyposażenie Roli; kwoty w 8 plikach pod cennik domowy), **331** klient; ESLint i `tsc` czyste w czterech pakietach; E2E `@szybkie` 51/52 (T9a „konsola” — zerwane gniazdo Firefoksa, powtórka 7/7); **łańcuch T3a–T6b i specyfikacje z jego stanów czerwone do 47b**; domyślny przebieg bez nowych testów (**367**). Wcześniej 09.10 (46b2): **2367** `shared`, **1406** serwer, **331** klient (bez nowych testów jednostkowych — zmiany w kliencie i E2E); E2E `t46b-` **9/9 trzy razy z rzędu** (nowy `specs/46-wymiana/t46b-pojemniki`), `t46b-` + `t46a-` + `00-baseline` + `01-dym` + `t2c-` (nowy kanarek skrzyni) **50/50**; ESLint i `tsc` czyste w czterech pakietach; domyślny przebieg ma teraz **367** testów (+9 `t46b`), pełnego nie puszczano. Wcześniej 09.10 (46b1): **2367** `shared` (+18 `container.test.ts`), **1406** serwer (+11 `containers.test.ts`, macierz izolacji z pięcioma nowymi zdarzeniami), **331** klient; E2E `00-baseline` + `01-dym` **20/20**, `t46a-` **17/17**; ESLint, Prettier i `tsc` czyste; domyślny przebieg bez zmian (**358**). Wcześniej 09.10 (46c2): **pełny domyślny przebieg od zera z gatewayem
354/358** (49,5 min; padły 46c.9 ze zbyt ostrą asercją — poprawiona — i znane migotanie T8c #72,
dwa `@llm` T8c po nim nie poszły), potem od nowego `po-T6`: `t46c-` + `t8c-narracja` **16/16**
i `t46c-` **10/10 trzy razy z rzędu** (z 46c.9 na żywym modelu); wcześniej łańcuch kawałkami
(T3a 15/15, T3b–T4a, T4b–T5a, T5b 27/27); kodu aplikacji nie ruszano, więc jednostkowych nie
puszczano; domyślny przebieg ma teraz **358** testów (+#82 w T4b, +46c.9). Wcześniej 09.10 (46c1): **2349** `shared`, **1395** serwer, **331** klient; E2E `t46c-` **9/9 trzy razy z rzędu** (nowy `specs/46-wymiana/t46c-amunicja`), `00-baseline` + `01-dym` + `t46a-` 36 zielonych (1 pominięty bez gatewaya); **łańcucha T4a–T5b i pełnego przebiegu nie puszczano — do 46c2 są czerwone z założenia**; domyślny przebieg ma teraz **356** testów (+9 `t46c`). Wcześniej 08.10 (46a2): **2318** `shared`, **1386** serwer, **331** klient; E2E `t46a-` **17/17 trzy razy z rzędu** (plus kolejne zielone po poprawkach z oględzin), T4b od `po-T4a` 19/19 (zapisał na nowo `po-T4` — stan równoważny), T6a od `po-T5` 12/12 (1 `@llm` pominięty, bez bramki), `t7a-handel-kreator` 3/3, `00-baseline` + `01-dym` + `35-bezpieczenstwo` 89 zielonych + T9b krok 4 (szept między grupami — migotanie, powtórka T9b 15/15); pełnego przebiegu nie puszczano — domyślny przebieg ma teraz **347** testów (+17 `t46a`). Wcześniej 08.10 (46a1): **2317** `shared`, **1385** serwer, **321** klient; E2E `00-baseline` + `01-dym` 19/19 (jeden pominięty bez gatewaya), T2b + T9a **38/38** (12,5 min, macierz ról, śmieci i izolacja z nowymi zdarzeniami); domyślny przebieg ma tyle testów co po 45 (46a1 nie dodała E2E). Wcześniej 08.10 (etap 45): **2276** `shared`, **1369** serwer, **321** klient; E2E `00-baseline` + `01-dym` + `45-druzyna` 27/27 (jeden pominięty bez gatewaya), potem `45-druzyna` 8/8 drugi raz; pełnego przebiegu nie puszczano — domyślny przebieg ma teraz **330** testów (T3b, T5a i T9a ruszone tylko w miejscu blokady mapy, nieprzebiegnięte). Wcześniej 04.10 (jedenasta — T9b): E2E `t9b-` **15/15 dwa razy** (~5,5 min, atrapa gatewaya; przebieg pomiędzy padł tylko na filtrze konsoli — 500 pośrednika przy restarcie, poprawione); kodu aplikacji nie ruszano, więc jednostkowych i pełnego przebiegu nie puszczano — domyślny przebieg ma teraz **322** testy. Wcześniej 04.10 (dziesiąta — 44d): **2267** `shared`, **1358** serwer, **321** klient; **pełny domyślny przebieg E2E 307/307** z gatewayem (42,5 min, nowy `01-dym/t44d-ai-wlasciciela` 4). Wcześniej 04.10 (dziewiąta — 44c): **2267** `shared`, **1347** serwer, **321** klient; pełny przebieg E2E **303 testy** (300 zielonych + migotanie T8c #72, powtórka zielona). Wcześniej 04.10 (ósma sesja — T9a): **pełny domyślny przebieg E2E 299/299** z gatewayem w 41,5 min (nowe `t9a-konta` 7 i `t9a-izolacja` 14), kodu aplikacji nie ruszano. Wcześniej **2264** w `shared`, **1337** na serwerze, **319** u klienta (04.10, siódma sesja — 44b; E2E `00-baseline` + `01-dym` + `35-bezpieczenstwo` 59/59, `t3a-` 15/15; wcześniej 03.10, szósta sesja — 44a; E2E: `00-baseline` + `01-dym` + `35-bezpieczenstwo` z nowym `t2d-konta-mg`, domyślny przebieg ma teraz **278** testów); **63** w gatewayu (03.10, czwarta sesja: `00-baseline` + `t8c-` 36/36 z gatewayem po poprawkach #66–#78; domyślny przebieg ma teraz **272** testy — pełnego od zera z T8c jeszcze nie puszczano; trzecia — T8c — `t8c-` 31/31; E2E drugiej sesji: **pełny domyślny przebieg 240/240 w 36,4 min** z gatewayem, wcześniej T5b 27/27 i T6a + T6b 31/31; dalej stan starszy:)
**61** w gatewayu (01.10, `--cache-ram`), **240** E2E w domyślnym przebiegu (196 + 44 T8a z 03.10: `t8a-` 44/44 po poprawce #53; wcześniej 42/42 dwa razy, `@szybkie` 30/30) + **42** odporności T7a–T7c poza nim (02/03.10 po poprawkach #50–#52: `t7c-` 16/16 w 53,7 min z progami wycieku, `00-baseline` 5/5; 02.10 T7c: `t7c-mapa` 9/9, `t7c-pamiec` 4/4 w 43,7 min, `t7c-marsz-pod-figura` 2/2 z jednym `test.fail` #52, `00-baseline` 5/5; wcześniej 26 bez `test.fail`; po poprawkach #48/#49 `40-odpornosc` 26/26 w pełnej skali, 24,1 min) (02.10 T7b — `t7b-obciazenie` 3/3 w pełnej skali, `t7b-czat-baza` 5/5; 02.10 — `40-odpornosc` 17/17 dwa razy, T4a → T4b od `po-T3` 34/34; 01.10 T6c — pełny przebieg od zera 196/196 dwa razy z rzędu, 31,5 i 31,6 min; 01.10 — T2 od `po-T3` 41/41, T6b od `po-T6a` 18/18; 30.09 — T6b od `po-T6a` trzy razy, T6a → T6b od `po-T5` 30/30, T6a od `po-T5` 13/13 cztery razy, T2 od `po-T3` 41/41; 29.09 — T4a → T5b od `po-T3` 84/84; 27.09 system zabił procesy w tle z braku pamięci — przyczyną był bufor promptów llama-server) — sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół. ESLint, Prettier
i `tsc --noEmit` czyste w trzech pakietach. **Nie puszczaj `pnpm format` na `POSTEP.md`,
`POMYSLY.md` ani `00-przeglad.md`** — Prettier przelałby kilkaset wierszy szumu do commita.

## Zanim dotkniesz obszaru — co przeczytać

Indeksy umów kodu i pułapek dev **wyprowadzone stąd 10.09.2026** (ważyły 62 KB ze 107 KB tego
pliku i rosły z każdym etapem). `umowy-kodu.md` i `pulapki-dev.md` są pocięte na **te same sekcje,
w tej samej kolejności**, a każda sekcja zaczyna się własnym indeksem — czytasz **jedną sekcję**,
nie cały plik:

```
grep -n '^## atak' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md
```

Umowa mówi, **gdzie dopisuje się nową rzecz** — czytaj przed dokładaniem czegokolwiek w obszarze.
Pułapka mówi, **gdzie już raz zniknął czas** — czytaj, zanim zaczniesz szukać błędu. Nową umowę
albo pułapkę dopisujesz do sekcji jej obszaru (wiersz na górę indeksu, pełny wpis pod spodem),
a nie do tego pliku.

| obszar      | co obejmuje                                                    | umów | pułapek |
| ----------- | -------------------------------------------------------------- | ---- | ------- |
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty  | 64   | 26      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`                     | 7    | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 23   | 21      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 30   | 15      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 22   | 2       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany       | 13   | 5       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 42   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`      | 13   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 9    | 11      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 51   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, sklepy, zasięg  | 32   | 3       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 17   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury, dek jako towar     | 8    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy, brama AI  | 8    | 8       |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 6    | 11      |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`    | 0    | 112     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 138     |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 10.10 (ósma) — poprawka spoza etapów: krok „Wyposażenie” w kreatorze

**Zlecenie MG:** „zorganizuj lepiej wygląd zakładki Wyposażenie” w kreatorze i usuń komunikaty,
które nowemu graczowi mówią, czego VTT nie ma (przykład: 800 ed na Modę).

**Zrobione:** krok to **dwie kolumny** — sklep po lewej (półki, szukaj, podpowiedź o poziomie,
filtr typów, lista bez własnego przewijania), po prawej przyklejone „Twoje wyposażenie”: kwota,
Wyposażenie Roli gratis, **Koszyk** z sumą, „Ruszam bez zakupów”, ostrzeżenie o amunicji (bez
powtórzeń nazw), „Po utworzeniu postaci”. Przy oknie węższym niż 52rem (`@container` na
`.creator-body`) jedna kolumna, koszyk na górze. **`creationLeftOutside` mówi, co dojdzie, a nie
czego brak:** wiersza o Modzie nie ma wcale (decyzja w `decyzje-i-uproszczenia.md`, „Kreator
postaci — naprawa”), reszta przepisana; parametr `data` usunięty. Nagłówki w podsumowaniu i na
ekranie końcowym: „Po utworzeniu postaci” / „Co jeszcze dojdzie”.
**Druga runda (MG):** szukajki nie ma; w jej miejscu, na końcu rzędu półek, stoi checkbox „Ruszam
bez zakupów” (tylko gracz, wyszarzony przy pełnym koszyku). Wiersz półki nie rozwija się — klik
podświetla go i pokazuje opis rzeczy (`CreatorShopDetails`) na górze prawej kolumny, z ✕. Obie
kolumny przewijają się osobno; **pułapka:** `sheet.css` daje dzieciom `.sheet-body` w papierowym
oknie `flex: 1 0 auto`, więc krok potrzebuje `.sheet-body.creator-body > .creator-gear`. `t3a`
czeka teraz na „Koszyk — 60 ed” zamiast „wydane 60 ed” (napis zniknął w pierwszej rundzie).

**Weryfikacja:** vitest `creation.test.ts` 88/88, `tsc` client/shared/server, eslint i prettier
zmienionych plików; E2E nieuruchamiane (napis „… ed startowych”, na który patrzą `t3a` i `t46c`,
zostawiony; `t3a` poprawiony, nieuruchamiany). Oglądane w **Firefoksie** (MG, Playwright MCP,
`dev.db`, „Test_1”): 1600, 900 i 700 px, koszyk pusty i z bronią + wybór gratisu Solo,
podsumowanie, opis w prawej kolumnie; w **Chromium** jako gracz Ewa („Ulice NewLublin”, jej
istniejący szkic Medyka): checkbox i opis. **Ślady w `dev.db`:** szkic
kreatora MG (był pusty „bez Roli”) ma teraz Kompletny Pakiet, Solo, dwie bronie w koszyku i Ciężki
pistolet z gratisu.

### Sesja 10.10 (siódma) — zaległości spoza etapów: testy leczenia MG, kwoty, pojemniki, „podejście” bota

**Zlecenie MG:** „napraw kilka zapisanych zaległości”, pytać o niejasności. **Decyzje MG (pytania na
starcie):** wszystkie cztery zaległości poza paczką AI (ta czeka do bety); pojemniki ukryć **wszędzie**,
także w archiwum; sąsiad nie jest celem „podejścia” bota; ręczna zmiana PW **bez śladu** na czacie
(`decyzje-i-uproszczenia.md`, „Leczenie”).

**Zrobione:** (1) **testy leczenia i efektów MG** — `server/src/gm-care.test.ts` (PW cudzej karty
i figury bez karty, naklejki ran, przycięcie, odpoczynek i dawka za postać gracza, stany żetonu,
odmowy gracza) i E2E `specs/50-przegladarki/t8c-leczenie` (MG leczy strzałką PW, Marek w Firefoksie
widzi kartę i pasek, efekt z „Efektów czasowych”). (2) **Kwoty w oknie „Wymiana”** przez `formatEd`
(`exchange/items.ts`, wszystkie tryby i sekcja „Sklep”) i „Gotówka: …” w kartach czatu łupu
i transakcji; asercje `t46a` na „1 200 ed”. (3) **Pojemniki znikają** z wyboru karty bota,
„Nastawienia do postaci”, odpoczynku w oknie zegara, archiwum, a poza listą z zaległości także
z leczących w „Lecz ranę” i z wyboru karty figury. (4) **Bot:** figura w zasięgu ręki jest `adjacent`,
„podejście” znika, gdy wszyscy stoją obok, prompt mówi „tuż obok ciebie”; pas w poprawce po odmowie to
`outcome: 'pass'` („pasuje po odmowie”), nie druga odmowa. **Poza zleceniem (błąd z oględzin):**
„Bijatyka 0 ed” na półce handlarza — `cpredMerchantShelf` odsiewa gołe ręce (umowa 47b).
Umowy w `ekwipunek` i `boty`, zamknięte wpisy w `archiwum/zamkniete-zaleglosci.md`.

**Nowe zaległości (drobiazgi do triażu MG):** surowe kwoty w prośbie do Medyka i w przyciskach
instalacji w Kompendium; separator tysięcy (U+202F) prawie niewidoczny w Firefoksie przy małym
kroju (okno „Wymiana”: „Gotówka”, „Kasa handlarza”).

**Weryfikacja:** jak w „Testy na koniec ostatniej sesji”. Oglądane na zrzutach E2E: Firefox (Ola,
`46a.11` — kwoty, odczyt DOM z U+202F) i Chromium (Marek, koszyk bez „Bijatyki”). Listy kart bez
pojemników nieoglądane w przeglądarce — zmiana to filtr `isContainerCard`, `tsc` czysty. **Ślady
w `dev.db`:** brak (wszystko na instancji E2E i w bazach testów).
