# Otwarte zaległości (dług oględzin i drobne braki)

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

**12.09 (etap 17a, znalezione przy oględzinach widoczności żetonów): gracz nie widzi pod mgłą
nawet własnej figury — serwer obiecuje co innego niż rysuje renderer.** `concealedFrom`
(`realtime/tokens.ts`) zwalnia z filtra mgły każdego, kto steruje figurą, i mówi to wprost
w komentarzu: „a player must never lose their own character off the map… losing sight of your own
token reads as a bug, not as suspense". Figura **przyjeżdża** do gracza — sprawdzone w `tokenStore`
— ale `fogSprite` leży nad `tokenLayer` i przy `visibility = 'fog'` bez odsłoniętych kształtów jest
czarny i nieprzezroczysty, więc zamalowuje ją razem z mapą. Objaw: gracz wchodzi na scenę
i widzi **czarny ekran bez niczego**, choć jego kamera jest wykadrowana dokładnie na nim.
To jest **coś innego** niż „czarne pole pod nieodsłoniętą mgłą", które MG zamknął 11.09 jako
zachowanie: tam chodziło o mapę, tu o obietnicę serwera, której klient nie dotrzymuje.
**Możliwa naprawa (do decyzji MG, bo to zmiana w tym, co gracz widzi):** wyciąć w masce mgły
kółko wokół figur, które ten widz kontroluje — mgła zostaje wszędzie indziej, ale gracz widzi
siebie i kawałek podłoża pod sobą. Kompozyt mgły już umie wycinać (`setFog` maluje kształty
z `blendMode: 'erase'`), więc to jedna pętla po `movableTokens`, nie nowa warstwa.

**11.09 (etap 04, zlecone przez MG): edytor sceny ma pytać o liczbę kratek, a nie o piksele.**
Dziś rozmiar kratki ustawia się suwakiem w pikselach, więc trafienie w skalę mapy jest
zgadywanką — i na świeżej scenie MG **nie trafił**: „StrefaPrzemysłowa" ma siatkę **47 px**, a plik
40 × 30 wymaga **36,2 px** (1448 / 40), przez co kratki nie siedzą na miejscach parkingowych ani
na jezdni. Mapy z paczek są opisane skalą w nazwie (`…-40x30`), więc to jest informacja, którą MG
ma pod ręką, tylko nie ma jej gdzie wpisać. **Naprawa:** w `ScenePanel.tsx`, obok suwaka, dwa pola
„kratek w poziomie / w pionie"; z rozmiaru tła (`scene.background.width/height`) liczą `gridSizePx`
i wpisują je do szkicu — suwak zostaje dla map bez okrągłej skali. Ta sama arytmetyka co
w `map/welcome-map.ts` (`szerokość / kolumny`), więc warto ją wyjąć do jednego miejsca.
**Przy okazji** (MG potwierdził 11.09): scena „StrefaPrzemysłowa" ma wgrany **starszy plik
w połowie rozdzielczości** (1448 × 1086 zamiast 2896 × 2176 z `Downloads`) — po dołożeniu pola
warto wgrać nowy i poprawić siatkę jednym wpisem.

**11.09 — decyzje MG do rzeczy zgłoszonych po sesji kamery (żeby nie wracały jako pytania):**

- **„Ani piksela czerni" zostaje.** Gracz przy maksymalnym oddaleniu nie obejmie całej mapy
  40 × 30 na szerokim oknie i **tak ma być** — „może sobie poprzesuwać albo odpowiednio rozciągnąć
  okno". Nie proponuj powrotu do wariantu „cała mapa z czarnymi pasami".
- **Mapa powitalna zostaje bez wyznaczanego punktu startu** — zawsze środek dolnej krawędzi.
  Tło nie ma wiersza w bazie, w którym MG mógłby punkt zapisać, i nikomu to nie przeszkadza.
- **Czarne pole gracza pod nieodsłoniętą mgłą jest zachowaniem, nie usterką** — ale czyta się jak
  awaria: MG sam „miał obawy, że jest zepsuta", patrząc na własną scenę z widocznością `fog`.
  Nic z tym nie robimy; warto o tym pamiętać przy oględzinach i przy pierwszej sesji z drużyną.
- **Usterka „MG widzi «Brak sceny» po własnej aktywacji" zostaje na tej liście** (wpis niżej) —
  MG ją przyjął, naprawa przy okazji.

**11.09 (etap 04, znalezione przy oględzinach kamery): MG, który połączył się przy braku
aktywnej sceny, po własnej aktywacji widzi dalej „Brak sceny".** Serwer przenosi wtedy gniazdo MG
do pokoju sceny (`realtime/scenes.ts`, `data.viewedSceneId === null` w `scene:activate`), ale
klient tego nie odnotowuje: gałąź MG w `socket.ts` robi `scenes().applyScene(...)`, a `applyScene`
**milczy**, gdy `state.scene?.id !== scene.id` — czyli zawsze, gdy lokalna scena jest `null`.
Mapa MG zostaje pusta do przeładowania karty albo kliknięcia „Pokaż". Gracze są bez zmian
(ich gałąź woła `setScene`). Usterka jest stara jak 17a, a widać ją tylko w jednym stanie:
pierwsze uruchomienie kampanii bez aktywnej sceny. **Naprawa:** w gałęzi MG wołać `setScene`,
gdy lokalna scena jest `null` (`applyScene` zostawić dla podglądu innej sceny).

**11.09 (etap 27e/27h, znalezione przy przeglądzie ikon): naklejka statusu wnosi do interfejsu
czarny kwadrat, którego motyw dzienny nie umie zgasić.** Pliki w `data/public/cpred/status-icons/`
mają — w odróżnieniu od `public/icons/hud/` — zachowany czarny prostokąt tła z game-icons, i tak
ma być: na mapie rysuje je `TokenNode.updateStatuses` (`client/map/TokenNode.ts:550`) jako sprite'y
nad cudzą grafiką, gdzie biała sylwetka bez podkładu zniknęłaby na jasnym żetonie. Ale te same
pliki idą **jako zwykły `<img>`** w trzy miejsca interfejsu: chip w panelu postaci
(`CombatHud.tsx:84`), wybierak statusów (`TokenContextMenu.tsx:1039`) i pasek grupy
(`TokenGroupBar.tsx:208`). W motywie dziennym daje to czarny stempel 13,6 px na kremowej pigułce —
jedyny element panelu, który nie bierze koloru z motywu, obok trzydziestu siedmiu ikon HUD-u
rysowanych maską CSS (`HudIcon`, `.hud-icon`, `styles.css:5591`). **Naprawa:** w interfejsie
rysować statusy tą samą maską co resztę (URL pliku w `--hud-icon`, `background: currentColor`) —
czarne tło jest wtedy nieistotne, bo maska bierze alfę, a sylwetka dostaje kolor chipu. Mapa
zostaje bez zmian: tam podkład jest potrzebny.

**11.09 (ekran logowania, znalezione przy oględzinach plakatu): hasło podstawione z menedżera
haseł nie odblokowuje przycisku „Zaloguj się".** Chrome wypełnia pole przy wejściu na stronę,
w polu widać kropki — a przycisk zostaje wyszarzony, bo `LoginPage.tsx` pyta o stan Reacta
(`disabled={busy || password.length === 0}`), a tamto wypełnienie nie wysyła zdarzenia `input`,
dopóki użytkownik czegoś nie dotknie. Wygląda to na zepsuty przycisk: pole pełne, przycisk martwy.
Usterka jest **starsza niż plakat** (warunek stoi tam od etapu 02), ale plakat ją uwidocznił —
wyszarzona czerwień na kremowym papierze czyta się jak wyblakły nadruk, a nie jak stan „nieaktywny".
**Naprawa:** nie pytać o długość stanu, tylko o zawartość pola przy wysyłce (albo doczytać
`input.value` w `useEffect` po zamontowaniu). To samo dotyczy pola imienia na ekranie dołączania.

**10.09 (etap 14b/30b, znalezione przy oględzinach pięciu Akcji katalogu): gracz widzi „bez ran"
przy każdej cudzej figurze — także przy konającej.** `StabilizePicker`
(`client/components/CombatForms.tsx:145`) liczy `wounded` z `tokens[row.tokenId]?.hp`, a
`tokenStore` (`stores/tokenStore.ts:16`) **kasuje `hp` każdego żetonu, którego gracz nie jest
właścicielem** — i słusznie, bo dane niewidoczne dla gracza nie opuszczają serwera. Brak danych
zamienia się tu jednak w twierdzenie: `hp === null` daje `wounded === false`, czyli znacznik
„bez ran". Ten sam wiersz, dwie prawdy — sprawdzone różnicowo w jednej chwili na dwóch kontach:

```
konto MG:      Rudy Kwiatkowski |         | Ustabilizuj      (PW 1/40)
konto gracza:  Rudy Kwiatkowski | BEZ RAN | Ustabilizuj
```

Lista, która istnieje po to, żeby wybrać konającego, mówi graczowi, że nikt nie jest ranny —
i mówi to najgłośniej dokładnie w sytuacji, dla której ta Akcja istnieje. **Naprawa:** „bez ran"
tylko wtedy, gdy PW są **znane**; przy nieznanych czytać publiczne naklejki ran
(`CPRED_MANAGED_WOUND_STATUS_IDS` — serwer trzyma je zgodne z PW na każdym żetonie z kartą,
`shared/systems/cpred/damage.ts`), a gdy i one milczą — nie pisać nic. Znacznik ma orzekać
o wiedzy, nie o jej braku. Funkcja „stan ran z naklejek" jest regułą systemu, nie widokiem, więc
idzie do `shared` z własnym testem. Reszta Ustabilizowania przeszła oględziny bez zarzutu
(PT liczony przez serwer, powrót na 1 PW, Nieprzytomny na minutę, porzucony kubek za darmo).

**10.09 (etap 14b/16f, tamże): zakładka „Walka" oferuje przyciski, które pasek na mapie
wyszarza — i odwrotnie.** `CombatActions.tsx:283` pyta o jedną rzecz:
`!isGm && action.cost === 'action' && actionSpent`. Nie pyta o `blockedAction` ani `blockedMove`
z 14e, o blokady statusowe (`cpredActionBlock` / `cpredMovementBlock`) ani o regułę katalogu
„druga Akcja Ruchu dopiero po pierwszej". Pasek mapy pyta o wszystkie naraz, bo idzie przez
`actionSlotRefusal` w `shared/systems/cpred/hotbar.ts:709`. Widać to gołym okiem:

```
pasek HUD:       Bieg ✗  „Bieg wymaga wcześniejszego wykonania Akcji Ruchu w tej turze."
zakładka Walka:  Bieg ✓  klikalny → serwer: „Odmowa: Bieg wymaga wcześniejszego…"
```

Odwrotna strona tej samej dziury: „Wstrzymanie Akcji…" i „Ustabilizowanie…" zostają w zakładce
**klikalne po zużytej Akcji** (są wyjęte z warunku jako formularze), choć pasek je gasi — dopiero
wysłana deklaracja wraca z „Nie masz już Akcji w tej turze.". Zasady są bezpieczne, bo serwer
odmawia w obu przypadkach; psuje się **obietnica interfejsu**, i to jest pułapka z 06.09
(„te same komponenty mają dwa domy") w czystej postaci. **Naprawa:** wyprowadzić z `hotbar.ts`
czystą `cpredActionRefusal(actionId, { statuses, turn, isGm })` — dziś ta wiedza siedzi
w prywatnym `actionSlotRefusal` — i wołać ją z **obu** wejść, żeby `disabled` i `title` miały
jedno źródło. Test w `hotbar.test.ts`: Bieg przy niewydanej Akcji Ruchu, Wstanie przy blokadzie
ruchu (ma przeżyć) i formularze przy zużytej Akcji.

**10.09 (etap 41 — oględziny wyposażenia): cały UI etapu nieoglądany w przeglądarce.**
Przez przeglądarkę przeszedł **start aplikacji i cisza w konsoli** (przeładowanie z nowym kodem,
zero błędów) — i na tym koniec, bo **oba wejścia do funkcji są dla automatyki zamknięte**:
menu figury otwiera się prawym klikiem w kanwę Pixi (przeszkoda znana od 38a), a dymek pod
celownikiem wymaga `onAimHover`, którego syntetyczny ruch kursora nie budzi — celownik się
uzbraja i linia strzału rysuje, ale dymek nie wychodzi (nowa pułapka, dopisana do `pulapki-dev.md`).
**Do kliknięcia ręką MG, najlepiej razem z długiem 38a/38b — to jest to samo menu:**
(1) „🔍 Przyjrzyj się…" u MG i u gracza, (2) okno oględzin: hełm/brak hełmu, ręce, chrom, rany,
(3) dwie linijki w dymku pod celownikiem, (4) „Poproś MG o dokładne oględziny" → zgoda z PT →
rzut → karta na czacie z liczbami, (5) guziki „Dobądź / Schowaj / Upuść" przy wierszach broni
i wyszarzony slot paska po schowaniu. Ryzyko jest **średnie, nie małe**: okno i karta czatu to
nowe komponenty, nie warianty istniejących. Mechanikę pokrywa 15 testów w `shared`
(`sighting.test.ts` + dwa w `hotbar.test.ts`) i 13 na żywych gniazdach (`sighting.test.ts`).

**06.09 (etap 38b — przedmioty między kartami): „🎒 Przeszukaj…" w menu figury nieoglądane.**
Cała reszta etapu przeszła przez przeglądarkę w dwóch sesjach naraz (szczegóły w pliku etapu):
okno „Wymiana" z karty, propozycja i jej przyjęcie u gracza, „Zabierz wszystko" z ciała razem
z gotówką, odmowa zasięgu, wycofanie i **przeżycie kart czatu po przeładowaniu u obu stron**.
Nieobejrzana została **jedna pozycja menu figury**, bo prawym klikiem z automatyki nadal nie da
się otworzyć menu kanwy Pixi (ta sama przeszkoda, co w 38a). Ryzyko jest małe: guzik otwiera
**ten sam** komponent `InventoryWindow`, który przeszedł oględziny z karty, tyle że z kotwicą
na karcie tej figury. **Do kliknięcia ręką MG razem z pozycjami z 38a** — są w tym samym menu.

**06.09 (etap 23b, znalezione przy 38b): lista odbiorców przelewu zawiera statystów.**
`economy:history` zwraca jako `payees` **wszystkie** karty kampanii poza własną
(`realtime/economy.ts`), a od etapu 38a statyści **są** kartami — więc w rozwijanym „przelew
do…" u gracza stoją teraz „Ganger", „Cel 23x", „Automatyczna wieżyczka" i Demony. Nic się nie
psuje (przelew do NPC-a jest legalny i bywa potrzebny), ale lista rośnie i szumi. **Uwaga przy
naprawie:** okno „Wymiana" z 38b buduje listę celów **tak samo** i tam wieżyczka bywa sensownym
celem, więc filtr musi być decyzją per lista, nie wspólnym helperem. Zgłoszone MG 06.09, bez
decyzji — poza zakresem etapu.

**05.09 (etap 38a — statysta jako karta postaci): UI szybkiego edytora nieoglądany
w przeglądarce.** Przez przeglądarkę przeszła **część** etapu, i to ta, na której najbardziej
zależało: trzy zmigrowane figury poligonu („Automatyczna wieżyczka", „Strzelec 23x", „Cel 23x")
stoją w panelu postaci obok Vex i Rudego, otwierają się jak każda karta, a „Cel 23x" pokazuje
**PW 33/35** — czyli wydrukowane maksimum przeżyło migrację i zapis (`statBlock.hpMax`). Pasek
figury po zaznaczeniu żetonu buduje się z karty (broń, akcje, przeładowania, PW 35/35).

**Nieoglądane zostały trzy rzeczy w menu figury**, bo prawym klikiem z automatyki nie udało się
otworzyć menu kontekstowego mapy (synteza `contextmenu` nie dochodzi do kanwy Pixi):
przełącznik „Statystyki bojowe (figura dostaje własną kartę)" i to, że zapis **zakłada kartę**;
nowe pole „Wartość bojowa zamiast Cech" wraz z „Nie unika pocisków"; oraz **pytanie o kartę przy
koszu figury** (pojedynczym i grupowym z 35). Wszystkie trzy ścieżki mają testy dymne na żywych
gniazdach (`tokens.test.ts` → „statysta jako karta postaci (etap 38a)"), więc chodzi wyłącznie
o obejrzenie układu i słów na ekranie. **Do zrobienia ręką MG w pierwszej sesji przy stole.**

**05.09 (etap 39 — efekty czasowe na Cechach):** etap **zamknięty w komplecie z oględzinami**
w tej samej sesji — pozycja „nie był oglądany" żyła kilkanaście minut. Przez przeglądarkę przeszły
wszystkie trzy kawałki UI (panel na karcie, małe pole „z" pod Cechą, chipy w pasku figury), obie
role (MG i `Tester` przez `[::1]:5173`), obie drogi liczby (wpisana i notacja `−1k6`), podłoga
Cechy, zdejmowanie ⌫, wygasanie skokiem zegara i **przeliczanie odliczania przy ruchu zegara**.
Znaleziona i naprawiona **jedna usterka układu**: pole „ile" miało 4,5 rem, przez co podpowiedź
„−2 albo −1k6" ucinała się na „−1k" — czyli gubiła dokładnie tę połowę, która mówi, że wolno
wpisać notację. **Żadna nowa pozycja nie została otwarta.** Ścieżka Czarnego LOD-u (Nerwosol
nakładający się sam) **nie była klikana w przeglądarce** — stoi na teście na żywych gniazdach
w `netcombat.test.ts`, a obejrzenie jej wymagałoby zbudowania na poligonie Sieci architektury
z Programem `statDrain`; uznane za nieopłacalne wobec pokrycia testem.

**05.09 (etap 33 — kopie zapasowe):** **żadna nowa pozycja nie została otwarta**, a etap
zamknięto w komplecie z oględzinami. Naprawiony po drodze **jeden błąd** (polski znak w nazwie
pobieranego pliku wywracał trasę eksportu błędem 500) i **jedna usterka układu** (polecenie
`restore` w podpowiedzi łamało się w środku słowa). Do sprzątnięcia ręką MG: dwa katalogi
`przed-przywroceniem-*` w `data/private/backups/`, zostawione po teście przywracania — kosz na
nie został w trakcie sesji odrzucony.

**04.09 (trzecia sesja):** zamknięte **trzy pozycje z `POMYSLY.md`** o cyborgizacjach — PT
montażu z Testem Chirurgii, odmowy „nie ma w co tego wszczepić" i EMP nazywający dwie wyłączone
cyborgizacje. Otwarte **dwie** pozycje, obie niżej: odmowy nieoglądane na koncie gracza oraz
„Dodaj za darmo", które omija cały montaż. Naprawione przy okazji **dwa błędy**: Borgizacje
liczone jak rodzina wymagająca podstawy (karta pisała nad Ramownicą „brak cyborgizacji
podstawowej") i **„Cofnij" zostawiające zegar statusu w `statusData`** po zdjętej naklejce.

**Zamknięte 04.09 (druga sesja):** paczka **„oczy i uszy"** — **wybuch i chmura gazu na mapie**,
**rzut obrażeń obszaru z 16d**, **„usuń wszystkie osłony" z 16c** i **przechylenie figury dla
stanu „nieprzytomny"**. Piąta pozycja — **dźwięki walki** — jest zmierzona, ale czeka na ucho MG
i została w `POMYSLY.md`. Przy okazji naprawiono **dwa błędy** (guzik „Obrażenia" przy amunicji
bez obrażeń; importer wycinający `thrown`, `maxRangeM` i `ammoIds`) oraz **jedno losowe
migotanie testu** (`bot-actions.test.ts` porównywał cuid z „bot"). Diagnozy i opisy napraw —
w `archiwum/zamkniete-zaleglosci.md`; **żadna nowa pozycja nie została otwarta**.

**Zamknięte 04.09:** **wszystkie cztery pozycje „etap 30x nie był oglądany w przeglądarce"**
— 30a, 30b, 30c i 30d przeszły przez przeglądarkę w komplecie, jedną kartą („Frank")
przestawianą kolejno na dziewięć Ról. Sześć znalezionych błędów naprawiono w tej samej sesji;
diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`. Jedna pozycja została otwarta —
**cyberdek pracownika Korpo**, niżej.

**Zamknięte 03.09 (trzecia sesja tego dnia):** **farmaceutyki bez zapasu dawek**
i **Ustabilizowanie bez zasięgu**. Przy okazji doszło naturalne leczenie PW, którego projekt nie
miał wcale (wpis z `POMYSLY.md`). Diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`;
jedna pozycja została otwarta — **Stym**, niżej.

**Zamknięte 03.09 (druga sesja tego dnia):** oba długi higieny — **czerwony `tsc --noEmit`**
na serwerze i **losowo padający zestaw testów**. Migotanie miało **cztery** przyczyny, nie jedną;
diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 02.09 (druga sesja tego dnia):** trzy błędy z oględzin etapów 31 i 32 — wybór
amunicji dla broni podwieszanej, nazwa dodatku w chmurce nad celem i odmowa `character:update`
zostawiająca na karcie wartość, której nie ma w bazie. Wszystkie naprawione **i obejrzane
w przeglądarce**; diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **Odmowy montażu nieoglądane na koncie gracza; monit „Minęła minuta" z nazwami — też.**
  Trzy odmowy z s. 111 (`MISSING_FOUNDATION`, `NO_SLOTS`, `POOL_FULL`) i dwie z s. 226
  (`SELF_INSTALL`, `NO_SURGERY_SKILL`) mają testy dymne na żywych gniazdach, ale **MG jest z nich
  zwolniony** — a ripperdoc, którym MG operuje, jest jedyną drogą przez UI, więc przy oględzinach
  04.09 nie było jak zobaczyć czerwonego zdania w czacie. To ta sama sytuacja co przy odmowach
  ruchu: trzeba konta gracza. Druga rzecz w tej samej kategorii: **„Minęła minuta … wraca:
  Kerenzikov, Cyberoko"** — zdanie dopisuje `sweepTimedEffects`, czyli zamiatanie, które chodzi
  wyłącznie w trybie turowym; żeby je zobaczyć, trzeba przepuścić sześć rund walki. Sama
  zawartość zapisu jest pokryta testem (`sheets.test.ts`), niepokryte jest **zdanie**.

- **„Dodaj za darmo" omija cały montaż.** Guzik MG przy wpisie kompendium woła
  `addCompendiumItemToCharacter`, czyli zwykłą łatę karty — nie `character:cyberware`. Wszczep
  wchodzi więc **bez rzutu na Utratę Człowieczeństwa, bez Testu montażu i bez odmów z s. 111**.
  Zachowanie jest sprzed 04.09 i po części celowe (to furtka MG na łup i nagrodę za zlecenie), ale
  od tej sesji różnica między dwiema drogami jest większa niż „płacisz albo nie": jedna liczy
  zasady, druga nie. Do rozstrzygnięcia przy stole — albo guzik dostaje ścieżkę przez zdarzenie
  z `payment: 'none'` (i wtedy znika „darmowy" wyjątek od Człowieczeństwa), albo zostaje jak jest
  i mówi to wprost w tooltipie.

- **Korporacyjny netrunner nie ma cyberdeku na karcie, tylko w prozie.** Pracownik zespołu
  Korpo (30c) dostaje pełną kartę postaci **właśnie dlatego**, że statysta nie mógłby zrobić
  jedynej rzeczy, do której netrunner istnieje — komentarz przy jego pakiecie w `roleability.ts`
  mówi to wprost („the reason a team member had to be a real sheet: a cyberdeck needs one").
  Karta wychodzi z HR z Rolą **Netrunner rangi 2** (`ability: { name: 'Interfejs', rank: 2 }`),
  ale `cyberdeck` zostaje `null`, a deck jest zdaniem w `gear`: „Cyberdek (7 gniazd: Miecz,
  Zabójca, Robak, Pancerz)". Netrunner z zespołu nie podłączy się więc do Sieci, dopóki MG nie
  złoży mu decku ręką na karcie. Przepis: `hireTeamMember` (`realtime/team.ts`) ma registry,
  więc może zbudować `CpredCyberdeck` z `slots: 7` i czterema `CpredNetInstallRow` z profilami
  Programów skopiowanymi z kompendium — tak samo, jak `purchasedSheetRow` kopiuje liczby broni.
  Otwarte świadomie 04.09: to dołożenie brakującego zakresu, nie naprawa usterki, i dotyka
  modelu z 26a.

- **Nazwa figury nadal jedzie do graczy w kartach czatu.** Alias `Token.publicName` (03.09)
  zasłania prawdziwą nazwę **na mapie i w Kolejce Inicjatywy** — obie ścieżki filtruje serwer
  (`toTokenView`, `filterCombatForPlayer`), obie obejrzane w przeglądarce. **Czat zostaje
  nieszczelny:** ponad trzydzieści miejsc w `realtime/` wpisuje `token.name` w **treść**
  wiadomości („Snajper Arasaki → Rudy Kwiatkowski"), a wiadomość jest zapisana w bazie
  i rozsyłana wszystkim tak samo — filtr per-odbiorca wymagałby albo przebudowy kart na dane
  plus szablon, albo drugiej kopii wiadomości. Praktycznie boli mniej, niż wygląda: kartę
  pisze figura, która **właśnie coś zrobiła**, więc stół i tak już wie, kto to. Okno edycji
  tokenu mówi to graczowi wprost („Karty na czacie nadal piszą prawdziwą nazwę"). Do zrobienia
  razem z **etapem 35**, do którego alias pierwotnie należał.

- **Wsparcie poziomu 10 nie pamięta „tej samej sprawy".** RAW: „po tym pierwszym wezwaniu na
  kolejne przybywają **ci sami** dwaj funkcjonariusze, dopóki wezwanie dotyczy tej samej
  »sprawy«, aż do jej zamknięcia lub śmierci tych funkcjonariuszy" (s. 159). VTT stawia za
  każdym razem nowe figury z pełnymi PW. Wymaga pojęcia „sprawy", którego projekt nie ma —
  najbliżej jest wątek dziennika kampanii z 24b. Zapisane, bo to jedyna kategoria, w której
  ciągłość jest zasadą, a nie kolorytem.

- **Stym nie zawiesza kar Poważnie Rannego — robi to MG.** Cztery z pięciu farmaceutyków (03.09)
  rozlicza silnik: Antybiotyk dopisuje tydzień do naturalnego leczenia, Turbo uzdrawiacz leczy
  BC + SW od ręki, Dynadetoks zdejmuje „Zatruty", Zryw jest zdaniem na karcie. Piąty nie:
  „przez godzinę cel ignoruje kary wynikające z bycia Poważnie Rannym" (s. 150) znaczy zawieszenie
  −2 **w każdym Teście**, a tę karę liczy `planCpredRoll` z `woundState`, czyli siedem ścieżek
  naraz (rzut, atak, Zwarcie, Konfrontacja, Sieć, ruch, obrona). Karta czatu mówi to wprost
  („kary zawiesza MG na godzinę"), a przepis na naprawę jest jeden i **ten sam, którego potrzebuje
  etap 39**: `sheetSituationModifiers` (`server/src/sheets.ts`) dostaje listę statusów figury
  i sam wystawia nazwany wiersz „Stym +2" obok „Poważnie ranny −2" — siedmiu wywołań tej funkcji
  nie trzeba wtedy uczyć niczego nowego, tylko podać im żeton. Świadomie odłożone do 39, żeby nie
  budować tej maszynerii dwa razy.

- **Strzykawka bezigłowa jako atak nie istnieje.** „Jeśli cel sprzeciwia się zabiegowi, Medyk może
  w ramach Akcji wykonać pojedynczy Atak Bronią Białą (strzykawką bezigłową). W przypadku
  trafienia, Atak zamiast obrażeń wstrzykuje celowi dawkę farmaceutyku" (s. 150). `character:use-dose`
  podaje dawkę **bez rzutu**, bo przy stole niemal zawsze podaje się ją komuś przytomnemu
  i chętnemu. Wrogi cel wymagałby broni „strzykawka" w kompendium i gałęzi w `planCpredAttack`,
  która zamiast obrażeń woła podanie dawki — czyli tej samej roboty co amunicja bez obrażeń
  z 16h, tylko od drugiej strony.

- **Etap 24c — zostały dwie ścieżki, obie wymagają modelu.** ~~(1) Zdjęcie prasowe~~
  i ~~(3) edycja zapisanego screamsheetu przez ✎~~ — **odklikane 28.08**, patrz
  `archiwum/zamkniete-zaleglosci.md`. Zostają: (2) **„Przerwij" w trakcie generacji** — przycisk
  pojawia się na czas pisania (`screamsheet:cancel`, pokryty ścieżką serwera), model odpowiadał
  jednak w 7 s i nie było czego przerywać. (4) **Drugi generator pod rząd** — czy szkic nadpisuje
  pola, w których MG już coś poprawił (nadpisuje: takie jest zachowanie `takeDraft`).

- **Etap 24c — polszczyzna 9B, nie kod.** W artykule z oględzin padło „tłumek zmyślonych
  bogaczy" i „krzyki prosić o pomoc" — model gubi odmianę w dłuższych zdaniach. Przy
  temperaturze 0,9 (świadomie wysokiej: brukowiec ma zmyślać) będzie się to zdarzać częściej
  niż u kronikarza z 19c. Jeśli przeszkadza, pierwszą rzeczą do ruszenia jest
  `SCREAMSHEET_TEMPERATURE` w `packages/shared/src/screamsheets.ts`.

- **Maszynopis wypowiedzi NPC-a (09.08) nieodklikany w przeglądarce.** Efekt jest czysto
  wizualny, więc żaden test go nie pokrywa. Do sprawdzenia przy stole: (1) **tempo** — 15 zn/s,
  czyli typowa wypowiedź 1–4 zdań pisze się 10–20 s; jeśli to za wolno albo za szybko, zmienia
  się jedną stałą `CHARS_PER_SECOND` w `packages/client/src/typewriter.ts` (obok
  `MAX_DURATION_MS` = 12 s, twardy limit na linię). (2) **Granica słowa** — tekst ma przyrastać
  całymi wyrazami, nie literami. (3) **Dwa boty pod rząd** — druga wypowiedź czeka, aż pierwsza
  się dopisze. (4) **Przełącznik „⌨" w górnym pasku** — wyłączony pokazuje wypowiedzi od razu,
  także tę, która właśnie się pisze; ustawienie przeżywa przeładowanie strony. (5) **Historia
  i resync** — linie wczytane z historii nigdy się nie animują.

- **Etap 20b — CAŁY etap nieodklikany w przeglądarce i niezmierzony na żywym modelu.** Kod jest
  pokryty 20 testami serwera na żywych gniazdach i 29 w `shared`, ale atrapa gatewaya odpowiada
  natychmiast i zawsze poprawnym JSON-em, więc **nie wie się nic o jakości decyzji 9B**. Do
  sprawdzenia przy stole, po kolei: (1) **„🤖 Graj turę"** — przycisk pojawia się sam obok ▶
  w górnym pasku i w wierszu zakładki „Walka", ale **tylko przy figurze, której karta postaci
  jest przypisana do bota**; na Poligonie trzeba więc najpierw komuś (np. Kai) podpiąć bota.
  (2) **Czy bot wybiera sensownie** — czy podchodzi, zanim strzeli, i czy nie strzela do
  sojusznika; strona bota to `data/private/bot-decisions.jsonl` z polami `figures` i `weapons`,
  czyli dokładnie tym, co model dostał w menu. (3) **Dwa kroki tury** — pierwszy ruch, drugi
  atak; w śladzie MG widać „krok 1 z 2" i „krok 2 z 2". (4) **Tryb propozycja** — karta na
  czacie z podsumowaniem („Atak: Rico — Zgrzyt 9"), a po „Zatwierdź" **druga karta na krok 2**.
  (5) **Czas całej tury** — jedyne kryterium etapu, którego nie da się odhaczyć bez GPU;
  szacunek to ~2 s (dwa przebiegi po 0,50–1,10 s z 20a), limit z etapu 11 to 20 s.
  (6) **Ruch po ścianach** — trasa liczy się A-gwiazdką na serwerze z `movementSegments`, więc
  bot nie powinien przejść przez mur; na Strzelnicy nie ma ścian, trzeba oglądać na scenie,
  która je ma. ~~(7) Strona gracza~~ — **odklikane 10.08**: gracz zatwierdził propozycję bojową
  bota ze swojego ekranu (linia „ZATWIERDZONE — AVATAR9" na czacie).

- **Etap 20a — jedna ścieżka nieodklikana.** **Tryb „kontrolowany"** — bot ma tylko mówić i nie
  dotykać mechaniki; pokryte testem (przebieg decyzyjny w ogóle nie dociera do modelu), w przeglądarce
  nieoglądane. ~~Sterowanie propozycją przez gracza i „Odrzuć"~~ — **odklikane 10.08**: gracz
  zatwierdził propozycję rzutu na Percepcję i **odrzucił** propozycję rzutu na Atletykę ze swojego
  ekranu (linie „ZATWIERDZONE — AVATAR9" i „ODRZUCONE — AVATAR9" na czacie).

- **Etap 20a — gdy bot „nie chce rzucić", zajrzyj do dziennika decyzji.** Przy oględzinach „Kolec, rzuć
  na Wygadanie" wróciło jako „rozmowa" — i słusznie: **„Wygadanie" nie jest umiejętnością CP RED**, a Kaya
  nie ma żadnej umiejętności perswazji. `data/private/bot-decisions.jsonl` (gitignore, jedna linia JSON
  na decyzję) ma pole `options` z pełnym menu, które bot dostał — to zwykle wystarcza za diagnozę.

- **Etap 19c — dwie ścieżki nieodklikane; obie wymagają żywego modelu.** ~~Kosz przy wpisie
  i „+ Wpis ręcznie"~~ oraz ~~degradacja „Zakończ sesję"~~ — **odklikane 27.08**, patrz archiwum.
  (1) **Mapowanie-redukcja na żywym modelu**: w przeglądarce log miał 4 wypowiedzi, czyli jedną porcję; podział na porcje jest pokryty testem serwera z ciasnym kontekstem (`journal.test.ts`, atrapa raportuje 2048 tokenów) i testem czystej funkcji w `shared`, ale na 32k modelu wymagałoby kilku tysięcy linii czatu. (2) **Relacja u gracza**: sprawdzona na żywym modelu skryptem A/B na tym samym prompcie (wrogi / przyjazny / bez relacji — odpowiedzi różnią się tonem nie do pomylenia) i testem serwera, ale **nie z konta gracza w przeglądarce** — wszystkie postacie w kampanii to „NPC (MG)", a relacja wiąże się z postać gracza.

- **Etap 19b — jedna ścieżka nieodklikana.** ~~Degradacja z martwym gatewayem~~ i ~~kosz przy
  wpisie~~ — **odklikane 27.08**, przy okazji naprawiony błąd (reindeks nie zdejmował chipów
  z wierszy); patrz archiwum. Zostaje: **Filtr tagów u bota**: sprawdzone, że bot **bez** dostępu nic nie dostaje i że bot **z** dostępem dostaje wpis; nieoglądany przypadek pośredni — bot z tagiem, który nie pasuje do żadnego wpisu (test to pokrywa).

- **Jakość polszczyzny modelu, nie kodu:** przy sprawdzaniu odpowiedzi bez wiedzy model powiedział „w moim pamięci nic mi o tym nie mówi" i „w moim wymiarze pojęcia…". To 9B, nie błąd promptu — ale jeśli takie potknięcia będą się powtarzać przy stole, warto rozważyć wniosek MG („Mów poprawną polszczyzną") jako lekcję albo wzmocnić zasadę 3.

- **Etap 19a — dwie ścieżki nieodklikane po poprawce.** ~~Degradacja panelu~~ — **odklikana
  27.08** (chip „brak indeksu", czerwone „brak połączenia z AI Gateway (fetch failed)",
  podpowiedź „Model offline — uruchom AI Gateway"), patrz archiwum.
  (1) **Powtórka bez rozumowania**: pytanie, przy którym model przemyśli całą pulę tokenów, ma teraz wrócić z odpowiedzią i przypisem „rozumowanie zajęło cały limit… pytanie poszło jeszcze raz bez rozumowania" — poprawka weszła po tym, jak błąd się pokazał, i nie została obejrzana na żywym modelu (pokryta testem `rules.test.ts`). Pytanie, które to wywołało: „Jak działa korzystanie z osłony w walce i co daje osłona?". (2) Kosmetyka: pytanie o **PT strzału z odległości** to jedyne z zestawu pomiarowego, które nie trafia w tabelę PT — tabela jest w indeksie, ale wygrywają z nią sąsiednie akapity.

- **⚠️ ZANIM ODHACZYSZ COKOLWIEK NIŻEJ: przeczytaj `docs/testy/sesja-testow-walki-2026-08-08.md`.**
  Sesja 08.08 zbudowała **gotowy poligon testowy** (kampania „Poligon bojowy", scena
  „Strzelnica", pięć uzbrojonych figur — nie buduj go od nowa) i **odklikała dużą część list
  poniżej**: całe 16d (**wraz z rzutem obrażeń obszaru — odklikanym 04.09**), punkty 1–6 z 16g, tryb turowy u MG, ruch
  i budżet, atak z mapy, PT z odległości, obrażenia, ablację pancerza, „Cofnij", ogień ciągły
  i zaporowy oraz menu kontekstowe tokenu. Plik zawiera też **plan dokończenia** (16h, osłony,
  zwarcie, Test Przeżywalności, strona gracza), trzy znalezione błędy i — ważne — **korektę
  dwóch „pułapek dev"**: menu kontekstowe _działa_ (nie dowozi go tylko `right_click` z CDP),
  a `window.confirm` da się przechwycić i nie zawiesza sterowania.
  **Druga sesja tego samego dnia** domknęła: resztę 16h (usypiająca, EMP, dym, „Minęła
  minuta", poprawka naboju inteligentnego, formularz amunicji w kompendium), **całe osłony
  16c u MG** (**wraz z „usuń wszystkie" — odklikanym 04.09, z Ctrl+Z**), **etap 15 — śmiertelne rany, Test Przeżywalności,
  śmierć i Ustabilizowanie od zera**, **Pochwycenie z „Broń się"** z 14d, monity początku
  tury z 14e i zakładkę „AI". Doszły błędy **#7** (etykieta odchylenia granatu) i **#8**
  (klik narzędziem osłon przecieka do warstwy gry) — **oba naprawione 22.08**.
  Ustalenie ważne dla reszty list: **odmowy statusowe są u MG niesprawdzalne** —
  `realtime/movement.ts:216` zwalnia MG z blokad, więc wszystko, co „ma odmówić ruchu",
  trzeba oglądać na koncie gracza.
  **Odklikane 27.08 na koncie `Tester`:** żeton gracza ze statusem **Nieprzytomny** nie ruszył
  się z miejsca, na czacie stanęło „Nieprzytomny token nie może się poruszać.", a wszystkie
  Akcje w panelu postaci były wyszarzone.
