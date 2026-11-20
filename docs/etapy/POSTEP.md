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
| ⬜ otwarty   | **72** Przebudowa pościgu: prędkość, pasy ruchu i kokpit kierowcy (🟨 projekt 15.11, `etap-72-poscig-kokpit.md`; **72a ✅ 19.11** rdzeń w `shared`, **72b1 ✅ 19.11** serwer nowej jazdy z migracją `20261119200000_chase_speed_lanes`, **72b2 ✅ 20.11** grupa „Pojazd” w belce i bieżnia, **72c ✅ 20.11** Wyścig, **72d1 ✅ 20.11** belka w pełnym kształcie z migracją `20261120200000_chase_swerve_round`, następny **72d2** mapa kokpitu, potem 72e–72g); **73** Parafraza zdań podręcznika w reszcie kodu (⬜ decyzja MG 18.11, ~535 ciągów, plik etapu do napisania); **70** Przebudowa netrunningu: okno jednego piętra i przejęte urządzenia na mapie (🟨 zrobione 12–14.11, `etap-70-siec-przebudowa.md`: **70a** okno jednego piętra, **70b** przejęta wieżyczka i kamera, **70c** dron, oczy, pasek, **70d** obszar straży, Sieć ze sceny wg rodzaju, okienko strefy, **70e** automat LOD-u i Demona z hamulcem, **70f ✅ 14.11** wzorce 66b/66e pod nowe reguły i rozegranie; czeka na wdrożenie (70d z migracją `20261113180000_net_scene_installations`) i stół MG); **69** Lewa belka bez ramek (🟨 zrobione 11.11, czeka na wdrożenie i oględziny MG przy stole); **68** Warsztat: ulepszenia auta za ed i naprawa (🟨 zrobione 06.11, czeka na wdrożenie i oględziny MG przy stole); **67** Zakup pojazdu (🟨 zrobione 06.11, czeka na wdrożenie i oględziny MG przy stole); **66e** Scena przykładowa „Po zamknięciu” (🟨 zrobione 07.11, obejrzane w Firefoksie; rozegrana w przeglądarce do końca 07.11 — znaleziska w `zaleglosci.md` (27; pkt 18 i 19 nie, decyzja MG; 13 naprawionych 07.11); czeka na naprawę reszty, stół MG i wdrożenie); **66d** Scena przykładowa „Zastaw” (🟨 wzorzec zrobiony i rozegrany w przeglądarce 06.11; od 06.11 jeden taran na turę (decyzja MG); czeka na stół MG i wdrożenie); **66** Sceny przykładowe (🟨 zrobione 31.10, czeka na oględziny MG przy stole i wdrożenie; **66b** „Fabryka dronów” 🟨 zrobione 31.10, tak samo (netrunner obejrzany w przeglądarce 07.11, poprawki czekają na wdrożenie); **66c** „Ostatni zjazd” 🟨 wzorzec zrobiony, rozegrany w przeglądarce 04.11 i ponownie 05.11 po rebalansie (porażka o włos, balans zatwierdzony przez MG) — zaległości z przebiegów zamknięte 05.11, Esc na kubku MG 07.11 — czeka na stół MG i wdrożenie); **65** Scena pościgu i walka pojazdów (🟨 65a–65e ✅ 30–31.10, czeka na oględziny MG przy stole); **62** Sieć ze sceny (🟨 zrobione, czeka na oględziny MG na VPS po wdrożeniu); **61** Skradanie się (🟨 zrobione, czeka na słowo MG o rozstrzygnięciach); **28** Wdrożenie na VPS (🟨 działa na `https://vtt.tatanga.eu` z botami od 18.10; zostały off-site, utwardzenie, monitoring); **43b**, **43c** (UI walki); **60** Czytelny czat (zlecenie MG z 24.10; 🟨 60a–60c ✅, czeka na oględziny MG z pierwszego kryterium); T10; refaktoryzacja odłożona (MG 18.10) |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c, 43a, 44a–44d, 45, 46a1, 46a2, 46c1, 46c2, 46b1, 46b2, 47a, 47b, 48a, 48b, 48c, 49a, 49b, 50a, 50b, 50c, 51, 52, 53, 54, 55, 56, 57 (57a–57c), 58 (58a–58d), 59 (59a–59c), 63 (63a–63b; 63c wycofane 29.10), 64 (64a–64c), 71 (71a–71h2) (ostatni zamknięty: 71, 2026-11-18) |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Przebudowa pościgu (etap 72, zlecenie MG z 15.11) — 72a, 72b1 (19.11), 72b2, 72c i 72d1
(20.11) zrobione, następny 72d2 (mapa kokpitu: duch auta, pas, miarka, prędkości, „za N tur”,
animacja ruchu i płynny najazd kadru, oględziny dzień/noc i 900 px).** Plik `etap-72-poscig-kokpit.md`. **Serwer jeździ nowym modelem**
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
MG ma ten sam kokpit przy zaznaczonym kierowcy-NPC-u. **Na początku każdej rundy kierowcy rzucają Wyścig**
(`realtime/chase-race.ts`, umowa na górze `mapa`): NPC-e od serwera jedną kartą czatu
`chaserace`, gracz kubkiem na wezwanie, a **runda stoi bez tury** (pas: „🏁 Wyścig — czekam
na: …”), aż rzuci; MG rzuca za gracza albo pomija go (karta, panel decyzji, „Następna tura”).
Zryw dolicza się do „Jedź”; słaby kierowca z pełną kartą (próg z Moto, NOM-03 ✅) oblewając traci
kontrolę. Testy z dwoma kierowcami, które nie są o Wyścigu, pomijają go drugim `combat:next`
(pułapka na górze `mapa`). Wbudowana droga jest jedna: Neonowa ulica (3 pasy). Wzorce 66c/66d
MG wkrótce przerobi — zakres 72g ustalić z MG. E2E: `48-poscig/t65-przeszkody`, `t72b-kokpit`,
`t72c-wyscig` i `t72d-belka` zielone, `t65-kreator` czerwony od 18.11 (do 72f).

**Weryfikacja Ról (etap 71) — ✅ 18.11.** Stan Ról: `role-macierz.md`, co zostało prozą —
`decyzje-i-uproszczenia.md` („Role po weryfikacji”). Testy Zdolności: `52-role/t71-<rola>`.
Parafraza zdań podręcznika w reszcie kodu — **etap 73** (plik do napisania).

**Na VPS czeka dużo (ostatnie pełne opisy zmian: `archiwum/od-czego-zaczac.md`, „Stan na
20.11”).** Prawie wszystko od początku listopada jest „zrobione, czeka na wdrożenie”: etapy
65–72c, sceny przykładowe 66–66e, Sieć 70, zaległości 03–18.11. Przed wdrożeniem porównaj
`git log` na VPS z `main`. **Migracje listopada** (które już są na VPS — sprawdzić; od 72d1
także `20261120200000_chase_swerve_round`):
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
- Liczby testów — w notatce ostatniej sesji niżej (20.11: `shared` 3243, serwer 1875, klient 516).
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
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty, zamek drzwi, ukryta figura zauważona, ikony urządzeń, wspólny widok drużyny, okienko strefy przy marszu gracza, scena pościgu, jazda kierowcy i dryf, Manewr i taranowanie, przeszkody pościgu, sceny przykładowe, wzorzec zwykłej mapy, ulepszenia pojazdu, stojące auto na drodze, kreator pościgu i wbudowane drogi, załoga auta poza pościgiem, rama pościgu i pęd auta bez kierowcy, długa pętla drogi, ucieczka auta ręką MG, otarcie brył, wrak za autem, podpis w fotelu, furgon z wyglądu (`van-6`), przesadzanie foteli przy starcie, skręt z menu przed przeszkodą, wysiadka tylko przeciągnięciem, światła, zamki, strefy i pojemniki we wzorcu, obszar straży we wzorcu, model jazdy etapu 72 (`chase-drive.ts`), jazda 72 na serwerze (`realtime/chase-drive.ts`) i sonda styku, widok sceny po rundzie pościgu (`emitSceneView`), Wyścig rundy (`realtime/chase-race.ts`), auto o prędkości 0 i skręt o dwa pasy | 100  | 30      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`, `gmrecovery`, „to dotyczy mnie”, grupy kart, kolor gracza, czyszczenie, gęsta karta rzutu, przebieg ataku, `/jako` za NPC-a, karta rzutu bez konta, karta Wyścigu (`chaserace`) | 18   | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 26   | 21      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście, panel decyzji MG, kubek przestawiany i jego menu (Szczęście jako żetony), lewa belka bez ramek i dymek `HudTip`, grupa „Pojazd” w belce (`HudVehicle.tsx`) i jej decyzje kierowcy | 44   | 16      |
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
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 0    | 127     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 0    | 167     |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 20.11 (trzecia) — etap 72d1: belka w pełnym kształcie

**Zrobione (czeka na wdrożenie razem z 72b1–72c; nowa migracja `20261120200000_chase_swerve_round`):**

- **Decyzje MG z pytań na starcie:** 72d dzielone na **72d1 belka** i **72d2 mapa**; menu auta
  w walce u gracza tylko informacyjne (MG ma wszystko); pasek przy przeszkodzie i wezwaniu do
  Manewru **zostaje jako alarm** obok wiersza w belce; **Gwałtowny skręt o dwa pasy i Nagłe
  zatrzymanie przy przeszkodzie — oba teraz**.
- **Serwer:** trzecia odpowiedź na przeszkodę i stojące auto `stop` (PT 13, wspólne
  `answerWithManeuver`); auto o prędkości 0 stoi jak przeszkoda (przeszkoda i auto bez tury stają
  przy jego zderzaku bez pytania); `swerveRound` + `laneDelta` ±2 (`SWERVE_NEEDED`); widok
  `swerveReady` i `nitroArmed`; kierowca bez metrów w turze (`drivingMoveBudget` → całe Akcje Ruchu).
- **Klient:** `HudVehicle` — wiersze decyzji (`DecisionRow`, części szuflady trybów ognia),
  rządek ikon (`ToolSlot`; nowe ikony game-icons w `public/icons/hud/` z wpisem w
  `ATTRIBUTION.md`), szuflada Manewrów, drugi klik w kafel pasa po skręcie — „o dwa pasy”,
  dystans do celu i Nitro w „Po ruchu”, przeszkoda wyszarza krzyżak. Pasek „Zderzenie” po „Jedź”
  zniknął; `blockerFor` / `answerBlocker` / `BLOCKER_CHOICES` w `ChaseObstacleMenu.tsx` karmią
  i pasek, i belkę. Menu auta (`acts`) i menu przeszkody MG z „Nagłym zatrzymaniem”.
- **Znalezione oględzinami i naprawione:** Nitro z ostatniego zbiornika znikało z rzędu po
  odpaleniu (rząd chował ikonę przy `nitroLeft` 0); wiersz decyzji nie był wcięty pod nazwę auta
  (`.hud-armed` / `.hud-modes` stoją w CSS niżej — selektor z `.hud-vehicle`).

Testy: `shared` 3243/3243, serwer 1875/1875 (nowy `chase-cockpit.test.ts` — 5), klient 516/516;
lint, Prettier i `tsc` trzech pakietów czyste. E2E `T65e` + `T72b` + `T72c` + nowy `T72d` 16/16
(`T72d` powtórzony po poprawkach). **Oglądano w Firefoksie** (Ola: ikony, wiersz „Zderzenie”,
dwa pasy, wiersz „Na drodze”) i **Chromium** (stół MG z belką Iskry przy zatrzymanym aucie).
Dzień i noc, 900 px i mapa — w 72d2. `specs/99-zapomnij/` to dalej cudze oględziny z 14.11.

### Sesja 20.11 (druga) — etap 72c: Wyścig na początku rundy

**Zrobione (czeka na wdrożenie razem z 72b1–72b2; bez nowej migracji — stan w `Scene.chaseRace`):**

- **Decyzje MG z pytań na starcie:** reguła słabego kierowcy dotyczy **postaci gracza i NPC-a
  z pełną kartą** (nie statysty ani Wsparcia); za NPC-ów **jedna karta bez kości 3D**; „Następna
  tura” MG przy czekającym Wyścigu **pomija** brakujących; przyciski MG na karcie czatu
  i w **panelu decyzji MG**.
- **`realtime/chase-race.ts`**: `startChaseRace` w `advanceTurn` po `startChaseRound` — NPC-e
  rzucają od razu (planer z karty albo czyste 1k10 dla Wsparcia i figur bez karty), gracz dostaje
  wezwanie na kubek z adresem `chaseRace` (PT 10 tylko u słabego kierowcy), runda stoi na
  wskaźniku bez tury; `settleRace` pisze zryw / utratę kontroli i wznawia rundę
  (`resumeAfterChaseRace` w `combat-actions.ts`). MG: `chase:race-roll`, `chase:race-skip`,
  „Następna tura” = pomiń, „Cofnij” odmawia `RACE_PENDING`, koniec walki przerywa Wyścig.
- **Shared:** `cpredRaceRollMode`, `cpredRaceFullSheet`, `cpredRaceWeakDriver`; rodzaj czatu
  `chaserace` (`ChaseRaceLogEntry`), `ChaseSettings.race`. Stary Test zwykłej jazdy przy „Jedź”
  usunięty (`drivingTested`, `cpredDrivingTestNeeded`). **NOM-03 ✅** (macierz, `role-matrix.test.ts`).
- **Klient:** karta „Wyścig — runda N” (`ChaseRaceCard.tsx`), rodzaj `race` w „Czeka na MG”
  z panelem decyzji, „🏁 Wyścig — czekam na: …” na pasie inicjatywy, belka gracza mówi „Runda
  czeka na Wyścig” zamiast „poczekaj na swoją kolej”, werdykt „Wyścig” / „Panuje nad autem” /
  „Utrata kontroli” na karcie rzutu i wezwania. Rozbicie rzutu NPC-a przycina `redactChatMessage`.
- **Testy dostosowane:** serwer `chase-drive`, `chase-obstacles`, `chase-review`, `chase`
  (drugie `combat:next` pomija Wyścig), E2E `t65-przeszkody` i `t72b-kokpit` tak samo.

Testy: `shared` 3243/3243, serwer 1870/1870 (nowy `chase-race.test.ts` — 6), klient 516/516;
lint, Prettier i `tsc` trzech pakietów czyste. E2E `T65e` + `T72b` + nowy `T72c` 12/12. **Oglądano w Firefoksie** (gracz:
pas, karta, wezwanie, kubek) **i Chromium** (panel decyzji MG — po oględzinach poprawiony
kontrast kafli na tle mapy i numer rundy w panelu). `specs/99-zapomnij/` to dalej cudze oględziny
z 14.11.
