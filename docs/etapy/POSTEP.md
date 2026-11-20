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
| ⬜ otwarty   | **72** Przebudowa pościgu: prędkość, pasy ruchu i kokpit kierowcy (🟨 projekt 15.11, `etap-72-poscig-kokpit.md`; **72a ✅ 19.11** rdzeń w `shared`, **72b1 ✅ 19.11** serwer nowej jazdy z migracją `20261119200000_chase_speed_lanes`, **72b2 ✅ 20.11** grupa „Pojazd” w belce i bieżnia, **72c ✅ 20.11** Wyścig, **72d1 ✅ 20.11** belka w pełnym kształcie z migracją `20261120200000_chase_swerve_round`, **72d2 ✅ 20.11** mapa kokpitu, **72e ✅ 20.11** autopilot aut NPC-ów z migracją `20261120230000_chase_intent_gap`, następny **72f** panel „Pościg”, plan rund i kreator, potem 72g); **73** Parafraza zdań podręcznika w reszcie kodu (⬜ decyzja MG 18.11, ~535 ciągów, plik etapu do napisania); **70** Przebudowa netrunningu: okno jednego piętra i przejęte urządzenia na mapie (🟨 zrobione 12–14.11, `etap-70-siec-przebudowa.md`: **70a** okno jednego piętra, **70b** przejęta wieżyczka i kamera, **70c** dron, oczy, pasek, **70d** obszar straży, Sieć ze sceny wg rodzaju, okienko strefy, **70e** automat LOD-u i Demona z hamulcem, **70f ✅ 14.11** wzorce 66b/66e pod nowe reguły i rozegranie; czeka na wdrożenie (70d z migracją `20261113180000_net_scene_installations`) i stół MG); **69** Lewa belka bez ramek (🟨 zrobione 11.11, czeka na wdrożenie i oględziny MG przy stole); **68** Warsztat: ulepszenia auta za ed i naprawa (🟨 zrobione 06.11, czeka na wdrożenie i oględziny MG przy stole); **67** Zakup pojazdu (🟨 zrobione 06.11, czeka na wdrożenie i oględziny MG przy stole); **66e** Scena przykładowa „Po zamknięciu” (🟨 zrobione 07.11, obejrzane w Firefoksie; rozegrana w przeglądarce do końca 07.11 — znaleziska w `zaleglosci.md` (27; pkt 18 i 19 nie, decyzja MG; 13 naprawionych 07.11); czeka na naprawę reszty, stół MG i wdrożenie); **66d** Scena przykładowa „Zastaw” (🟨 wzorzec zrobiony i rozegrany w przeglądarce 06.11; od 06.11 jeden taran na turę (decyzja MG); czeka na stół MG i wdrożenie); **66** Sceny przykładowe (🟨 zrobione 31.10, czeka na oględziny MG przy stole i wdrożenie; **66b** „Fabryka dronów” 🟨 zrobione 31.10, tak samo (netrunner obejrzany w przeglądarce 07.11, poprawki czekają na wdrożenie); **66c** „Ostatni zjazd” 🟨 wzorzec zrobiony, rozegrany w przeglądarce 04.11 i ponownie 05.11 po rebalansie (porażka o włos, balans zatwierdzony przez MG) — zaległości z przebiegów zamknięte 05.11, Esc na kubku MG 07.11 — czeka na stół MG i wdrożenie); **65** Scena pościgu i walka pojazdów (🟨 65a–65e ✅ 30–31.10, czeka na oględziny MG przy stole); **62** Sieć ze sceny (🟨 zrobione, czeka na oględziny MG na VPS po wdrożeniu); **61** Skradanie się (🟨 zrobione, czeka na słowo MG o rozstrzygnięciach); **28** Wdrożenie na VPS (🟨 działa na `https://vtt.tatanga.eu` z botami od 18.10; zostały off-site, utwardzenie, monitoring); **43b**, **43c** (UI walki); **60** Czytelny czat (zlecenie MG z 24.10; 🟨 60a–60c ✅, czeka na oględziny MG z pierwszego kryterium); T10; refaktoryzacja odłożona (MG 18.10) |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c, 43a, 44a–44d, 45, 46a1, 46a2, 46c1, 46c2, 46b1, 46b2, 47a, 47b, 48a, 48b, 48c, 49a, 49b, 50a, 50b, 50c, 51, 52, 53, 54, 55, 56, 57 (57a–57c), 58 (58a–58d), 59 (59a–59c), 63 (63a–63b; 63c wycofane 29.10), 64 (64a–64c), 71 (71a–71h2) (ostatni zamknięty: 71, 2026-11-18) |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Przebudowa pościgu (etap 72, zlecenie MG z 15.11) — 72a, 72b1 (19.11), 72b2, 72c, 72d1,
72d2 i 72e (20.11) zrobione, następny 72f (okno „Pościg” MG, plan rund z pytaniem w panelu
decyzji, kreator bez tempa: pasy, prędkość startowa, goni / ucieka, zamiar przy aucie, krok
„Plan”; format wzorca i paczki; `t65-kreator` do naprawy).** Plik `etap-72-poscig-kokpit.md`. **Serwer jeździ nowym modelem**
(`realtime/chase-drive.ts`, umowa na górze `mapa`): auto ma prędkość trwającą między turami i pas,
rusza się raz na rundę w turze kierowcy (`vehicle:drive` — gaz +50 / hamulec −100 mil/h, pas
o jeden, „Jedź”), a bez „Jedź” jedzie samo na koniec tury. Na początku rundy kadr sztywno stawia
auto drużyny na 30% od tyłu (albo od przodu przy `chaseRole: 'flee'`, bez przełącznika w UI do
72f), auta bez tury jadą od razu, a to, co wyjechało za krawędź, odpada; prędkość pościgu i suma
przesunięć idą do klientów w widoku sceny (`emitSceneView`), a droga przeskakuje razem z autami.
**Kierowca prowadzi z grupy „Pojazd” w lewej belce** (`HudVehicle.tsx`, umowa na górze `ui`):
kafel auta z grafiką modelu (klik — panel auta: fotele, kadłub), decyzje kierowcy wierszem pod
kaflem (przeszkoda: Gwałtowny skręt / Nagłe zatrzymanie / Taranuj; wezwanie do Manewru;
zderzenie po „Jedź”), „Po ruchu” z dystansem do celu, krzyżak, „Jedź” i rządek ikon Nitro /
Manewr (szuflada) / Kolczatka / Silnik. Menu auta w walce u gracza nie ma już akcji (MG — ma).
Udany Gwałtowny skręt daje w tej rundzie zjazd o dwa pasy; auto o prędkości 0 stoi na drodze
jak przeszkoda (umowa na górze `mapa`); kierowca nie liczy metrów (umowa na górze `tura`).
MG ma ten sam kokpit przy zaznaczonym kierowcy-NPC-u. **Na mapie** (umowa na górze `mapa`): kierowca
widzi ducha auta po „Jedź”, pas docelowy i miarkę do celu (`chaseStore.ghost`, tylko u niego),
każde auto ma prędkość drugą linią podpisu, przeszkoda — „N m · za N tur” od auta patrzącego
(`chase-map-notes.ts`), a auta, figury w fotelach, przeszkody i droga dojeżdżają płynnie
(~0,6 s, najazd kadru ~0,8 s). Za kierownicą w walce belka chowa portret (MG, 900 px).
**Auta NPC-ów jadą same z zamiarem** (`realtime/chase-autopilot.ts`, umowa na górze `mapa`):
MG wybiera w menu auta „Zamiar” (Ręcznie, Uciekaj, Goń / Trzymaj dystans / Taranuj / Blokuj
auto X), w turze kierowcy-NPC-a kokpit MG ma plan autopilota wybrany z góry („Autopilot”
zamiast „Po ruchu”, duch na mapie), a **bez „Jedź” auto jedzie planem na koniec tury**.
Zamiaru gracze nie widzą; przełącznik „Autopilot” (kierownica) na pasku narzędzi obok przeszkód.
**Na początku każdej rundy kierowcy rzucają Wyścig**
(`realtime/chase-race.ts`, umowa na górze `mapa`): NPC-e od serwera jedną kartą czatu
`chaserace`, gracz kubkiem na wezwanie, a **runda stoi bez tury** (pas: „🏁 Wyścig — czekam
na: …”), aż rzuci; MG rzuca za gracza albo pomija go (karta, panel decyzji, „Następna tura”).
Zryw dolicza się do „Jedź”; słaby kierowca z pełną kartą (próg z Moto, NOM-03 ✅) oblewając traci
kontrolę. Testy z dwoma kierowcami, które nie są o Wyścigu, pomijają go drugim `combat:next`
(pułapka na górze `mapa`). Wbudowana droga jest jedna: Neonowa ulica (3 pasy). Wzorce 66c/66d
MG wkrótce przerobi — zakres 72g ustalić z MG. E2E: `48-poscig/t65-przeszkody`, `t72b-kokpit`,
`t72c-wyscig`, `t72d-belka` i `t72e-autopilot` zielone, `t65-kreator` czerwony od 18.11 (do 72f).

**Weryfikacja Ról (etap 71) — ✅ 18.11.** Stan Ról: `role-macierz.md`, co zostało prozą —
`decyzje-i-uproszczenia.md` („Role po weryfikacji”). Testy Zdolności: `52-role/t71-<rola>`.
Parafraza zdań podręcznika w reszcie kodu — **etap 73** (plik do napisania).

**Na VPS czeka dużo (ostatnie pełne opisy zmian: `archiwum/od-czego-zaczac.md`, „Stan na
20.11”).** Prawie wszystko od początku listopada jest „zrobione, czeka na wdrożenie”: etapy
65–72e, sceny przykładowe 66–66e, Sieć 70, zaległości 03–18.11. Przed wdrożeniem porównaj
`git log` na VPS z `main`. **Migracje listopada** (które już są na VPS — sprawdzić; od 72d1
także `20261120200000_chase_swerve_round`, od 72e `20261120230000_chase_intent_gap`):
`20261102120000_chase_car_ambience`, `20261102200000_merchant_assortment`,
`20261103210000_chase_vehicle_blocking`, `20261105180000_chase_vehicle_momentum`,
`20261113180000_net_scene_installations`, `20261119200000_chase_speed_lanes`. **Nowe
pliki danych z repo:** `data/public/scenes/` (wzorce 66c–66e), `data/public/cpred/vehicle-models.json`
i grafiki aut. Po `./deploy.sh` sprawdzić `"linked": true` kopii (lista na końcu `docs/DEPLOY.md`).
Z etapu 28 zostało: test odtworzenia na VPS, fail2ban, unattended-upgrades, monitoring; potem T10 → T11.
Oględziny MG przy stole czekają przy etapach wymienionych w tabeli stanu wyżej.

**Stała wiedza na start:**

- VTT stoi na `https://vtt.tatanga.eu` (od 18.10), boty przez Tailscale; **źródłem prawdy jest
  VPS**, lokalny `pnpm dev` niczego nie synchronizuje. Wydanie: push z PC, na VPS `./deploy.sh`.
- Model: Qwen3.8-27B UD-Q3_K_XL (~50 tok/s, VRAM 15,5 / 16,3 GB — na GPU nic nie dokładamy).
- Sceny testowe i konta: `poligon.md`. „Korytarza 16e” nie kasuj (jedyna widoczność Dynamiczna).
  Zaproszenie `tester-dev` unieważnione — wchodzi się zaproszeniem aktywnej kampanii.
- Największe pliki (`MapRenderer.ts`, `CharacterSheet.tsx`, `socket.ts`, `roleability.ts`,
  `CharacterCreator.tsx`) czytaj fragmentami (`grep` + zakres). Refaktoryzacja odłożona (MG 18.10).
- Nie proponuj makr (36) ani głosu (12, 21, 22). Safari i iPada nie testujemy.
- „Gracz nie może chodzić” — najpierw znaczek „⚠” i przełącznik „Ruch graczy” w górnym pasku MG
  (każdy start sesji stawia Stop), potem mgła (`refuseWalkIntoFog`) i `Token.ownerId`.
- `>=` przy PT jest błędem, nie wariantem (wyjątek: Test Lojalności) — `decyzje-i-uproszczenia.md`.
- `requireCallableRequest` (`realtime/checks.ts`) to biała lista — nowe pole `CpredRollRequest`
  trzeba do niej dopisać.
- `data/private/cpred/compendium/` bywa starsze niż parser — `python tools/import/parse-manual.py`
  przed szukaniem błędu; `shop-tiers.json` i `weapon-icons.json` są poza gitem.
- Pozycje z `POMYSLY.md` sprawdź w kodzie, zanim je ruszysz.
- **Git:** push publikuje całą historię — przed każdym `git log --name-only --format= origin/main..HEAD`
  nie może pokazać `data/private/`, `uploads/`, `.env` ani baz.
- **Nie puszczaj `pnpm format` na `POSTEP.md`, `POMYSLY.md` ani `00-przeglad.md`.**
- Liczby testów — w notatce ostatniej sesji niżej (20.11: `shared` 3261, serwer 1881, klient 526).
  Sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół.

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
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty, zamek drzwi, ukryta figura zauważona, ikony urządzeń, wspólny widok drużyny, okienko strefy przy marszu gracza, scena pościgu, jazda kierowcy i dryf, Manewr i taranowanie, przeszkody pościgu, sceny przykładowe, wzorzec zwykłej mapy, ulepszenia pojazdu, stojące auto na drodze, kreator pościgu i wbudowane drogi, załoga auta poza pościgiem, rama pościgu i pęd auta bez kierowcy, długa pętla drogi, ucieczka auta ręką MG, otarcie brył, wrak za autem, podpis w fotelu, furgon z wyglądu (`van-6`), przesadzanie foteli przy starcie, skręt z menu przed przeszkodą, wysiadka tylko przeciągnięciem, światła, zamki, strefy i pojemniki we wzorcu, obszar straży we wzorcu, model jazdy etapu 72 (`chase-drive.ts`), jazda 72 na serwerze (`realtime/chase-drive.ts`) i sonda styku, widok sceny po rundzie pościgu (`emitSceneView`), Wyścig rundy (`realtime/chase-race.ts`), auto o prędkości 0 i skręt o dwa pasy, mapa kokpitu (duch, dopiski, dojazd), autopilot aut NPC-ów (`chase-autopilot.ts`) | 102  | 30      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`, `gmrecovery`, „to dotyczy mnie”, grupy kart, kolor gracza, czyszczenie, gęsta karta rzutu, przebieg ataku, `/jako` za NPC-a, karta rzutu bez konta, karta Wyścigu (`chaserace`) | 18   | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 26   | 21      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście, panel decyzji MG, kubek przestawiany i jego menu (Szczęście jako żetony), lewa belka bez ramek i dymek `HudTip`, grupa „Pojazd” w belce (`HudVehicle.tsx`) i jej decyzje kierowcy, portret za kierownicą | 45   | 16      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe, PT od MG, wezwanie Wyścigu | 25   | 2       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany, skok, walka z zauważenia, pytanie MG o przekroczenie, Percepcja w drodze (z linią wzroku), ukryte figury, skradanie, kropki ataków, kierowca bez Biegu, Test jazdy w Akcji Ruchu, darmowa ręka MG, napis wiersza Akcji, taran raz na turę, spóźniona inicjatywa rundy 1, krok planera w jednym oku, „Następna tura” z widzianą turą, kierowca: Akcja Ruchu w `vehicle:drive` i hak końca tury, runda bez tury (Wyścig), kierowca bez metrów | 45   | 9       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne, trucizna na ostrzu, auto-unik, strach z Konfrontacji, auto jako cel, broń pokładowa, wybór celu ze stosu, skutki amunicji po karcie ataku, ikona gołych rąk, broń dwuręczna w rękach przy tarczy | 57   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat` (tylko zmienione grupy), wzorce, pełna karta bez sześciu pól, rany każdej karty na żetonie | 20   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list, usuwanie przedmiotu, „Używane” i „Plecak”, czekanie na autozapis (`characterSaved`) | 13   | 12      |
| `postac`    | kreator, PD i awanse, koszyk i cofanie awansów, Role i Zdolności, cyborgizacje, chrom zmieniający liczby, ekonomia, Test montażu gracza, pojazdy i Tabor, Tabor jako stan auta (`fleet.ts`), naprawa i montaż Technikiem (`repair-work.ts`), skutki Ulepszania na wierszu (`itemupgrade.ts`), Praca Twórcy (`fabrication.ts`), kriopompa (`cryo.ts`), Lojalność na zamknięciu sesji (`teamloyalty.ts`), zasoby narracyjne Ról (`role-records.ts`: fani, Pogłoski, publikacje, wezwania), pakiet Krawędziarza (`edgerunnerKits`, `kitPicks`), wybór Farmaceutyków (`pharmaPicks`), zamiana Roli MG (`gmSwap`), testy Ról w `52-role` | 69   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup (także ciała graczy), handel, sklepy, asortyment handlarza z kompendium, zasięg, amunicja bez dna, egzoszkielet, latarka z ekwipunku, narkotyki i fiolki, siatka okna „Wymiana”, zgoda z góry, odświeżanie po naklejkach, znaczek „w użyciu”, zakup auta z modelu, warsztat (ulepszenia i naprawa auta), auto bokiem i „w garażu”, grafika auta to model i skala miniatur, postać na karcie przekazania, zasięg ręki do figury spoza siatki, targ przy ladzie i raty Fixera (`haggling.ts`) | 51   | 3       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie, dawki i uzależnienia (`chems`), czas pracy z karty rzutu (`roll:clock`), Prowizorka w przemiataniach i czas zabiegu, tydzień w kriośnie, tydzień kalendarza (`gameWeekIndex`) | 23   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury, dek jako towar, strefy bronione, kamery (także w ciemności), rozbrajanie, Sieć ze sceny, jedna próba i pamięć sukcesów, strzał z urządzenia, strefa tylko z marszu gracza, widok runu z rundą, strefa rozbrojona w Sieci, okno jednego piętra i ładunek bez szybu, pełny wiersz czatu zamiast skrótu, przejęta figura urządzenia (`operatorOf`, `netDeviceUse`), marsz drona, oczy urządzeń, figury wyciszone (`net-off`), pasek „Oczy i urządzenia”, Sieć ze sceny wg rodzaju, strefy i drzwi w „Instalacjach”, obszar straży od figury, okienko strefy, automat obrony Sieci i hamulec MG, „Włącz / Wyłącz w Sieci” MG i przeszukanie wyłączonego, Maskowanie piętro po piętrze, czerwone ślady bez Maskowania, Programy za wyjściem, rzut Sieci na kubek ze Szczęściem, „Zapomnij” sceny czyści Sieć, wykrycie w Sieci zakłada starcie | 33   | 12      |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy, brama AI  | 10   | 10      |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 9    | 12      |
| `kopie`     | `snapshot`, `archive`, paczki ZIP, wczytanie kampanii, „czeka na gracza”, kopie kampanii i cofnięcie, sklep i bot w paczce, zgłoszenie karty gracza, pojazdy w paczce, auta na scenie pościgu, przeszkody poza paczką | 22   | 6       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 0    | 128     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 0    | 167     |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 20.11 (piąta) — etap 72e: autopilot aut NPC-ów

**Zrobione (czeka na wdrożenie razem z 72b1–72d2; nowa migracja `20261120230000_chase_intent_gap`):**

- **Decyzje MG z pytań na starcie:** autopilot jedzie **na koniec tury** (MG widzi plan w kokpicie
  i duchem, może nadpisać krzyżakiem; bez „Jedź” auto jedzie planem); „Trzymaj dystans” trzyma
  odstęp **z chwili nadania zamiaru**; „Goń” siada **tuż za celem, na jego pasie**; przełącznik
  „Autopilot” **na pasku narzędzi MG** obok przeszkód.
- **`shared`:** zamiary w rdzeniu (`CHASE_INTENTS`, `chaseIntentLabel`), `cpredChaseAutopilot`
  (przegląd trzech rund: koszt położenia względem celu, kary za zderzenie i za to, co stoi na
  pasie). Widok: `SceneVehicleView.intent` (tylko MG), `ChaseSettings.autopilot`.
- **Serwer (`realtime/chase-autopilot.ts`):** `chase:intent`, `chase:autopilot`, `autopilotPlan`
  (ten sam plan w widoku MG i w `chaseTurnEnd`, tryb `pilot`: taran tylko w cel „Taranuj”);
  graczom zamiar nie jedzie (`playerVehicleView`, `placedView` bez niego); `applyTurnPointer`
  rozsyła auta po zmianie tury (`refreshChaseOnTurn`), bo plan zależy od tury.
- **Klient:** lista „Zamiar” w menu auta MG (zamiar i cel jedną kontrolką), kokpit z planem
  wybranym z góry i tagiem „Autopilot”, ikona kierownicy `ChaseAutopilotButton` na pasku.

Testy: `shared` 3261/3261 (nowy `chase-autopilot.test.ts` — 18), serwer 1881/1881 (nowy
`chase-autopilot.test.ts` — 6, `chase.test.ts` z polem `autopilot`, macierz izolacji), klient
526/526; lint i `tsc` trzech pakietów czyste, Prettier na zmienionych plikach czysty. E2E: nowy
`T72e` 4/4 (dwa razy), `T72b` + `T72c` + `T72d` zielone; `T65e` w tym samym przebiegu padł raz na
pustej mapie MG, osobno 4/4 (zaległość z 20.11). **Oglądano zrzuty E2E w Chromium (MG):**
kokpit z planem i duchem, menu z „Zamiarem”, ikona na pasku. Ola w **Firefoksie** tylko w asercji
(zamiaru nie dostaje); UI gracza się nie zmienił. „Goń” przy krokach pedałów staje zwykle 4–8 m za
celem, nie 2 m — do oceny w 72g. `specs/99-zapomnij/` to dalej cudze oględziny z 14.11.

### Sesja 20.11 (czwarta) — etap 72d2: mapa kokpitu i oględziny

**Zrobione (czeka na wdrożenie razem z 72b1–72d1; bez migracji, bez zmian serwera i `shared`):**

- **Decyzje MG z pytań w sesji:** duch, pas i miarka **tylko u kierowcy**; duch **zawsze przed
  „Jedź”** (także bez pedału); prędkość **drugą linią podpisu** auta; dojazd **~0,6 s**, najazd
  kadru **~0,8 s**; po pomiarze 900 px — **za kierownicą w walce portret się chowa**.
- **Duch** (`HudVehicle` → `chaseStore.ghost` → `ChaseLayer.setGhost`): grafika auta w miejscu po
  ruchu (`chaseDriveStep`, te same liczby co „Po ruchu”), pas docelowy na całej długości kadru,
  miarka z metrami do celu dystansu (`ghostRuler` w `chase-map-notes.ts`).
- **Dopiski** (`chase-map-notes.ts`, `setChaseNotes`): „150 mil/h” pod nazwą auta w walce,
  „16 m · za 2 tury” / „inny pas” / „przy zderzaku” pod przeszkodą — od auta, w którym siedzi
  gracz, u MG od auta kadru.
- **Dojazd** (`ChaseLayer.glides`): auta i przeszkody dojeżdżają z miejsca, w którym je widać;
  przesunięcie kadru przewija drogę płynnie i zabiera ze sobą dojazdy z tej samej chwili. Figury
  w fotelach jadą z autem (`seatedTokenAt`), kamera gracza idzie za autem klatka po klatce
  (`setFollowedVehicle` zamiast `panBy`). Dystans do pieszego w „Po ruchu” od środka żetonu.

Testy: klient 526/526 (nowy `chase-map-notes.test.ts` — 10), `shared` i serwer bez zmian
(3243, 1875); lint, Prettier i `tsc` klienta czyste. E2E `T65e` + `T72b` + `T72c` + `T72d` 17/17
(przed i po zmianie portretu). **Oglądano tymczasowym specem `99-ogledziny-72d2` (nie w repo)
przy 1600 × 900:** gracz w **Firefoksie** (duch, pas, miarka, dojazd, najazd rundy 2, dzień
i noc, z portretem i bez), MG w **Chromium** (dopiski przy barykadzie, kokpit Gangera przy
przeszkodzie, noc). Duch u MG prowadzącego NPC-a nie wyszedł na zrzucie — Ganger miał akurat
barykadę przed zderzakiem (kokpit słusznie odmawia). `specs/99-zapomnij/` to dalej cudze
oględziny z 14.11.
