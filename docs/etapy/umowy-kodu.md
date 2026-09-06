# Umowy kodu (gdzie dopisuje się nową rzecz)

Wyprowadzone z „Od czego zacząć" w `POSTEP.md` 22.08.2026. Indeks jednolinijkowy został tam;
tu leżą pełne wersje. Czytaj wpis, **zanim** dołożysz coś w obszarze, którego dotyczy — każdy
z nich powstał po tym, jak ktoś dołożył to w złym miejscu.

**Wezwanie do Testu powstaje w JEDNYM miejscu: `createCheckCall` (06.09, etap 40).**
Do etapu 40 całe wystawianie wezwania siedziało w ciele handlera `check:call` — walidacja postaci,
`planCpredRoll`, `rollLabel`, `cpredDifficultyRungAt`, wstawienie wiadomości i dostarczenie jej
wzorem szeptu. Zgoda na prośbę gracza kończy się **dokładnie takim samym wezwaniem**, więc funkcja
wyszła z handlera i ma dziś dwóch wołających (`check:call` i `check:request-resolve`), a handler
czyta wyłącznie payload. Druga kopia tej logiki rozjechałaby się z oryginałem w pierwszym etapie,
który dołoży wezwaniu cokolwiek nowego — dokładnie tak, jak rzut na wezwanie świadomie jedzie
istniejącym `character:roll`, zamiast mieć własne zdarzenie. **Ramę MG** (próg albo przeciwnik,
modyfikator, widoczność) czyta z payloadu jedna funkcja `parseCheckFrame`, też wspólna dla obu
dróg — inaczej widełki PT rozeszłyby się przy pierwszej zmianie drabinki.

**Prośba o Test nie zna ani progu, ani widoczności (06.09, etap 40).**
`CheckRequestPayload` jest lustrem `CheckCallPayload` **pomniejszonym o wszystko, co należy do
MG**: zostaje karta, czym rzucić i zdanie „po co". Gracz, który mógłby nazwać PT, ustalałby
trudność wymyślonego przez MG wydarzenia — to ta sama umowa, którą wezwanie trzyma od 32, tylko
z drugiej strony stołu. Przy zgodzie serwer bierze Umiejętność **z zapisanej prośby**, nie
z żądania MG; jedyną drogą do jej podmiany jest pełne okno wezwania („Ustaw…"), które idzie przez
`check:call` i zamyka prośbę polem `requestMessageId` w tym samym żądaniu.

**Prawo do prośby czytaj z bazy, nie z karty czatu (06.09, etap 40).**
`askedById` w `CheckRequestEntry` służy do **rysowania**, a nie do wpuszczania: `check:request`
sprawdza `character.ownerId === user.id` w bazie, a `check:request-cancel` porównuje `authorId`
zapisanej wiadomości. Między prośbą a kliknięciem MG może minąć scena — karta zmienia właściciela
albo znika — więc `characterId` z karty służy do **znalezienia** postaci, a nie do
uwierzytelnienia (ten sam wzorzec, co `bot:proposal` z 20a). Postać, której już nie ma, zamyka
prośbę **odmową ze śladem na karcie**, a nie cichą bezczynnością.

**Kubek nie woła na prośbę, i rozstrzyga to RODZAJ wiersza (06.09, etap 40).**
`openCheckCallFor` (`stores/chatStore.ts`) pomija `kind !== 'check'` **wprost**, a nie przez to,
że prośba akurat nosi payload w innym polu. Kubek zapalony nad prośbą dałby graczowi rzut przed
zgodą, czyli dokładnie to, czego ten etap miał się pozbyć — a przy prośbie progu jeszcze **nie
ma**. Pilnuje tego strażnik źródłowy `check-request-cup.test.ts`, wzorem `tables-cup.test.ts`
z etapu 34.

**Okno otwierane znad karty postaci potrzebuje `z-index: 400` (06.09, etap 40).**
`.sheet-window` ma 300, a `.dialog-backdrop` — 50. Okno prośby i okno wezwania dopisały się do
listy `:has()` obok `.roll-dialog`, bo obydwa otwiera się przy rozłożonym arkuszu: prośbę
Alt+klikiem w wiersz, wezwanie przyciskiem „Ustaw…" na karcie czatu. Bez tego okno **powstaje,
ale nie widać niczego** — ekran przygasa scrimem, a treść zostaje pod arkuszem.

**Nowy panel Zdolności Roli dopisuje się do `ROLE_ABILITY_PANEL_IDS` (06.09).**
Lista w `CharacterSheet.tsx` mówi paskowi „Zdolność Specjalna", czy ma co pokazać, jednym
warunkiem zamiast dziewięciu; dziesiąty panel dopisuje się w niej **i** w gałęzi niżej. Sam pas
idzie przez całą szerokość siatki strony pierwszej (`grid-column: 1 / -1`), jak „Broń i pancerz"
z 27b — w kolumnie tożsamości panele stać nie mogą, bo ta ma 15 rem i rozciągnąć się nie da
(umowa z 30a), więc ciągnęły ją dwa razy niżej niż Cechy i Umiejętności.

**Przedmiot przenosi się JEDNĄ czystą funkcją: `cpredMoveItems(from, to, refs)` (06.09, etap 38b).**
`shared/src/systems/cpred/inventory.ts` bierze dwie karty i listę adresów wierszy, a zwraca
**obie** karty naraz. Rozdzielenie tego na „zabierz" i „dołóż" pozwoliłoby wywołującemu zapisać
połowę operacji — a przedmiot, który zniknął z jednej karty i nie pojawił się na drugiej, jest
gorszy niż przedmiot, którego nie dało się przenieść. Wiersz jedzie **w całości**: magazynek,
`ammoId`, `attachmentIds`, `attachmentAmmo`, zużyte OB i „prowizorka" siedzą na wierszu od etapów
16/16g/31/30b, więc kto dołoży broni nowe pole, dostanie je tutaj za darmo. **Cyborgizacje nie
jadą nigdzie** — wszczep zdejmuje `character:cyberware` z 23a, z Testem i ceną.

**Pancerz przeniesiony przychodzi ZDJĘTY (`equipped: false`) — 06.09.** Jedyne pole, które
`cpredMoveItems` zmienia po drodze, i to jest reguła, nie szczegół: podniesiona kurtka inaczej
zmieniałaby OB odbiorcy w tej samej chwili, w której ląduje na karcie, a o tym, co się nosi,
decyduje właściciel karty. Broń nie ma odpowiednika tej decyzji, bo samo jej trzymanie nie zmienia
na karcie żadnej liczby.

**Dwa wiersze wyposażenia sklejają się po `compendiumId`, nigdy po nazwie (06.09).**
`stacksWith` żąda zgodnego wpisu katalogu **oraz** nazwy, uwag, `consumable` i `upgrade` — dwie
fiolki z tej samej pozycji kompendium są nierozróżnialne, a dwa ręcznie wpisane „Notatnik" mogą
być czymkolwiek. Bez sklejania trzy stimpaki z trzech ciał zjadłyby trzy z czterdziestu wierszy
(`ITEM_ROWS_MAX`).

**Id wiersza ekwipunku jest unikalne w obrębie KARTY, nie kampanii (06.09).** Kopia figury
z etapu 35 dostaje kartę z przepisanym ekwipunkiem, więc dwie karty naprawdę potrafią nieść ten
sam `rowId`; `landedRow` mintuje nowe id przy kolizji. Każdy nowy kod przenoszący cokolwiek
między kartami ma ten sam problem — nie zakładaj, że id z jednej karty jest wolne na drugiej.

**Przekazanie na kartę Z WŁAŚCICIELEM jest propozycją, nie przelewem (06.09, decyzja MG z 05.09).**
`inventory:give` wystawia wiersz czatu rodzaju `inventory` bez `resolution` i **nic nie rusza**,
dopóki odbiorca (albo MG w jego zastępstwie) nie kliknie „Przyjmij"; dopiero `inventory:respond`
woła `cpredMoveItems`. Kartę **bez** właściciela nie ma kto potwierdzić, więc tam operacja
wykonuje się od ręki, a ack niesie `pending: false` — klient nie zgaduje tego z listy odbiorców,
której gracz i tak nie widzi w całości. Wiersze do przeniesienia czyta się **z zapisanej karty
czatu** (`entry.system.items`), nie z żądania klienta — ta sama umowa, którą wezwanie do Testu
trzyma Umiejętność i próg od etapu 32.

**Zasięg przy przenoszeniu to długość ramienia, mierzona WSZYSTKIM — MG włącznie (06.09).**
`CPRED_MELEE_REACH_M`, ten sam, którym `Ustabilizowanie` mierzy się od 14e, i ten sam wyjątek od
zwyczaju „MG omija blokady": MG podaje przedmiot figurą, która stoi na mapie. **Przy `give`
warunku nie ma, gdy karty nie stoją na żadnej wspólnej scenie** — nie ma czego mierzyć, a to jest
przerwa między scenami. **Przy `take` tej furtki nie ma**: figura biorącego musi stać na scenie
ciała (`NOT_ON_SCENE`), bo nie da się przeszukać kogoś, przy kim się nie stoi.

**Gracz przeszukuje wyłącznie kartę BEZ właściciela, i tylko leżącą albo martwą (06.09).**
Trzy warunki razem, w `inventory:take` i w `inventory:sources`: `ownerId === null`,
`tokenCondition` = `down`/`dead` (liczone tak, jak rysuje to mapa od 27j) i zasięg. Z karty innego
**gracza** przenosi wyłącznie MG — „pierwsza kłótnia przy stole nie rozgrywa się przez interfejs".
Lista źródeł **nie pokazuje** tego, czego nie wolno wziąć, więc odmowa jest wyłącznie zabezpieczeniem
przed podrobionym żądaniem.

**Klient nie zna `characterId` cudzej figury i nie ma poznać (06.09).** `TokenView.characterId`
jest częścią prywatną żetonu od etapu 05, więc `inventory:take` adresuje źródło **żetonem**
(`fromTokenId`), a listę kart, z których wolno brać, buduje serwer (`inventory:sources`). Lista
odbiorców to same nazwy wszystkich kart kampanii — ta sama umowa, co `payees` przy przelewie z 23b.

**Cecha „jak teraz" czyta się jedną funkcją: `cpredEffectiveStats(sheet)` (05.09, etap 39).**
Od tego etapu `data.stats[...]` **nie jest** liczbą, którą cokolwiek rozstrzyga — jest liczbą
**wydrukowaną na karcie**. To, czym pada kość, liczy `cpredEffectiveStats` w
`shared/src/systems/cpred/stateffects.ts`: bazowa Cecha, poprawka Człowieczeństwa z 23a, suma
efektów czasowych i przycięcie do podłogi i sufitu. Przez tę jedną funkcję idą Testy, atak, Unik,
Inicjatywa, RUCH, Rzut na Śmierć, Zwarcie, Koncentracja, Konfrontacja, obrażenia wręcz i podgląd
kubka u klienta. **Wyjątkiem, i jedynym, są PULE**: maksymalne PW, pula Szczęścia i sufit
Człowieczeństwa czytają Cechę bazową (powód w `decyzje-i-uproszczenia.md`) — jak i tempo
naturalnego leczenia, bo dobowy rachunek nie ma nic wspólnego z godzinnym efektem. Nowe miejsce,
które czyta Cechę, wybiera jedną z tych dwóch stron **świadomie**; jeśli modyfikator wejdzie do
rzutu, ale nie do wartości pochodnej (albo odwrotnie), karta i kości zaczną mówić dwie różne
rzeczy, a przy stole wyjdzie to po trzech sesjach.

**Efekt na Cesze w rozbiciu rzutu to WŁASNY WIERSZ, nie mniejsza liczba przy Cesze (05.09).**
`cpredStatEffectRows(sheet, statId)` zwraca po jednym wierszu na efekt („Lisz −3"), a wiersz
Cechy zostaje przy wartości z karty — dokładnie tak, jak od 15 działa kara z pancerza i z tego
samego powodu: modyfikator jest **czasowy i zdejmowalny**, a gracz, który czyta „REF 8 · Lisz −3",
wie, że za godzinę będzie rzucał inaczej. **Gdy podłoga Cechy przycina sumę, funkcja zwija
wiersze w jeden zbiorczy** z nazwami wszystkich źródeł i przyciętą liczbą — inaczej rozbicie
sumowałoby się do REF −2, czyli do czegoś, czym nikt nie rzuca. Nowe miejsce rysujące rozbicie
woła tę funkcję, nigdy nie składa wierszy samo.

**`CpredCharacterData.statEffects` pisze wyłącznie `character:stat-effect` (05.09).** Pole wypada
z `character:update` z kodem `FORBIDDEN` **u wszystkich, także u MG** — inaczej niż Reputacja,
która MG zostaje. Powód: nałożenie ma **cenę**, której łata karty nie ma czym zapłacić —
wylosować 1k6, zapisać wynik i policzyć oba terminy z bieżącej rundy i zegara świata. Lista
wpisana ręką byłaby listą efektów **bez terminu**, czyli takich, które nie zejdą nigdy. Ta sama
furtka, którą `eddies` zamknęło w 23b.

**Efekt czasowy niesie DWA terminy naraz, a zegar świata stawia się ZAWSZE (05.09).**
`cpredStatEffectDeadlines(clock, durationS)` daje `expiresAtRound` (tylko gdy trwa walka)
**i** `expiresAtMinute` (zawsze, bo od 37 każda kampania ma zegar). Wygasanie jest **alternatywą,
nie koniunkcją**: schodzi ten, który dogonił pierwszy. Termin świata jest obowiązkowy, bo tylko on
przeżywa koniec walki — efekt z samym terminem rundowym, nałożony w rundzie 8 walki, która się
skończyła, wisiałby do ósmej rundy **następnej** walki (ta pułapka siedzi w `CpredTimedEffect`
z 16h do dziś).

**Liczba efektu pada RAZ, przy nałożeniu (05.09).** „1k6" z opisu Nerwosolu jest instrukcją dla
chwili nałożenia, a nie formułą efektu: serwer rzuca, zapisuje wynik na wierszu (`value`) i notację
obok (`rolled`, sam napis, do podpowiedzi). Efekt trzymający formułę przeliczałby się przy każdym
odczycie i karta zmieniałaby się sama, ilekroć ktoś na nią spojrzy — ta sama umowa, którą wiersz
broni ma wobec kompendium. Żądanie z `value` **i** `formula` naraz jest odmową (`BAD_VALUE`), a nie
cichym wyborem jednego z nich.

**Wygaszanie efektów ma DWA przemiatania i chodzą po dwóch różnych listach (05.09).** Rundowe
(`sweepTimedEffects` w `realtime/timed-effects.ts`) chodzi po **żetonach sceny**, bo naklejka jest
własnością żetonu, i woła `expireStatEffectsOfCharacter` z `{ round, minutes: null }` — minuta
świata nie rusza się na granicy tury i podanie jej tam zdjęłoby „na godzinę" po sześciu
sekundach. Światowe (`sweepStatEffects` w `realtime/stat-effects.ts`, wołane z `gametime.ts`)
chodzi po **kartach kampanii**, bo efekt jest wierszem karty i postać, która przespała noc poza
sceną, ma prawo obudzić się bez Nerwosolu. Nowy efekt czasowy dopisuje się do obu, albo świadomie
do jednego.

**Zegar świata zdejmuje efekty czasowe — i to jedyny wyjątek od „zegar podpowiada, nie rządzi"
(05.09).** `realtime/gametime.ts` nadal nie woła ekonomii ani leczenia i nadal nie wie, czym są
PW; woła jedną funkcję z `stat-effects.ts`. Wyjątek broni się tym, że **nie ma tu czego
wybierać**: „na godzinę" jest terminem zapisanym przy nałożeniu, tak samo jak „do rundy 9"
z 16h, które granica tury zdejmuje sama od dawna. Czynsz i odpoczynek MG **wybiera** (ile, komu,
czy w ogóle) — i te zostają za guzikiem. Nowa rzecz wołana z `gametime.ts` musi przejść ten sam
test: czy MG ma tu jakikolwiek wybór.

**Hak Programu, którego silnik nie umie rozliczyć, idzie do `NET_PROGRAM_HOOKS_MANUAL` (05.09).**
Lista jest od etapu 39 **pusta** — `statDrain` i `moveDrain` przeszły na automat — i pusta ma
zostać, dopóki nie dojdzie Program, którego skutku VTT nie umie policzyć. Nie kasuj jej i nie
kasuj gałęzi `netHookIsManual` w `netice.ts`: to jest to jedno miejsce, dzięki któremu dołożenie
takiego Programu jest zmianą jednej linijki, a nie nową gałęzią w pętli efektów.

**„Backup" w tym repozytorium znaczy Wsparcie, nie kopię zapasową (05.09).**
`realtime/backup.ts`, `characterBackupCallEvent` i `BackupPanel.tsx` to Zdolność Roli **Wsparcie**
z etapu 30c — wezwanie posiłków na mapę. Kopie zapasowe nazywają się `snapshot` (praca na dysku:
`snapshots.ts`, zdarzenia `archive:list` / `archive:snapshot`), a pliki wymiany — `archive`
(`shared/src/archive.ts`, `server/src/archive.ts`, `ArchivePanel.tsx`). Nowa rzecz w tym obszarze
dopisuje się do jednej z tych dwóch rodzin; słowa „backup" nie używa się na nic poza Wsparciem.

**Kopia zapasowa nie kopiuje pliku bazy — robi `VACUUM INTO` (05.09).** SQLite w trybie WAL
trzyma część świeżego stanu w pliku `-wal` obok bazy, więc `copyFile` na `.db` w trakcie zapisu
daje kopię niespójną albo starszą, niż wygląda. `vacuumInto` w `snapshots.ts` otwiera bazę
**drugim połączeniem, tylko do odczytu**, i to jest cała sztuczka: ten sam kod chodzi w timerze
przy działającym serwerze i w skrypcie przy zatrzymanym. Nowa droga do kopii woła `vacuumInto`,
nigdy `copyFile`.

**Pliki `uploads/` w kopii to twarde dowiązania, nie kopie — i to zależy od ich niezmienności
(05.09).** `linkTree` dowiązuje każdy plik (z ucieczką do `copyFile`, gdy się nie da), dzięki
czemu trzydzieści osiem samowystarczalnych kopii kosztuje 14 MB grafik **raz**, a nie
trzydzieści osiem razy. Jest to bezpieczne wyłącznie dlatego, że trasy `/api/uploads/*` zapisują
plik raz, pod losową nazwą, i nigdy go nie nadpisują. **Jeśli kiedykolwiek zaczną pisać
w miejscu — dowiązania trzeba zamienić na kopie**, bo inaczej podmiana grafiki zmieni ją we
wszystkich kopiach naraz.

**Rotacja liczy się z NAZW katalogów, nigdy z czasu pliku (05.09).** `planSnapshotRotation`
w `shared/src/archive.ts` sortuje leksykalnie (`snapshot-2026-09-05-1430` — format tak dobrany,
że porządek nazw jest porządkiem czasu) i dobę bierze wprost z nazwy, więc strefa czasowa nie ma
tu nic do rzeczy. **Nazwa spoza schematu nie jest kasowana nigdy** i to jest funkcja, a nie
niedopatrzenie: kopię, która ma przeżyć wszystko, przemianowuje się (`przed-refaktorem`).
Tą samą furtką idą kopie bezpieczeństwa spod `restore` (`przed-przywroceniem-<ISO>`).

**Eksport wypisuje wiersze z wypisanymi kolumnami, import normalizuje (05.09).** Kopia zapasowa
ma być prawdą o bazie, więc `exportCharacter`/`exportScene` **nie** idą przez widoki —
`toTokenView` podmienia nazwę figury na `publicName`, a kopia gubiąca prawdziwą nazwę żetonu nie
jest kopią. Kolumny wypisuje się ręką (nigdy `select` hurtem): nowa kolumna ma tu wymusić
decyzję, czy jedzie. Kolumny JSON-owe (`data`, `statuses`, `combatProfile`…) jadą jako **prawdziwy
JSON**, żeby plik dało się przeczytać w edytorze. W drugą stronę `importCharacter` przepuszcza
kartę przez `parseCharacterData` — ten sam parser, którym czyta ją reszta serwera — więc karta
sprzed etapu 30b wraca z dopisanymi domyślnymi polami. **Round-trip nie jest więc bajt w bajt
i nie ma być**; nic nie ginie, dochodzą wartości domyślne.

**Import nigdy nie odtwarza cudzych id, ale swoje utrzymuje (05.09).** Każdy wiersz z pliku
dostaje nowe `cuid`. Odnośniki do kogoś (`Token.ownerId`, `Token.characterId`) przeżywają
**tylko po sprawdzeniu, że taki wiersz naprawdę stoi w tej kampanii** (`survivingIds`); reszta
schodzi do `null`, a `ArchiveImportResult.note` mówi ile. `MapDrawing.authorId` jest kluczem
obcym z kaskadą i nie może być pusty, więc rysunki przejmuje ten, kto stawia scenę.

**Nazwa pliku w `Content-Disposition` musi być ASCII (05.09).** Nagłówek HTTP jedzie jako
latin-1: „Bezpański" wprost w `filename` wywraca całą odpowiedź (`ERR_INVALID_CHAR`, 500 zamiast
pobrania). `archiveContentDisposition` składa polskie znaki do gołych liter i dokłada prawdziwą
nazwę parametrem `filename*=UTF-8''…` (RFC 5987). Każdy nowy nagłówek z nazwą od użytkownika
idzie tą samą drogą.

**Kopie są sekcją opcjonalną w konfiguracji i to jest ich wyłącznik (05.09).**
`ServerConfig.backups` może nie istnieć — wtedy proces kopii nie robi. Tak stoją wszystkie
54 zestawy testów dymnych, bez ani jednej linijki zmiany w ich konfiguracjach, i tak samo
działa `snapshotPathsFor`. Osobna flaga „wyłącz kopie" byłaby drugim sposobem na to samo.

**Kto operuje przy montażu, jest jednym polem protokołu — nie kartą NPC (04.09).**
`CharacterCyberwarePayload.surgeon` ma trzy warianty i tyle ich będzie: `none` (montaż bez Testu,
czyli zachowanie sprzed tej sesji — „cena montażu cyborgizacji wliczona jest w ich cenę"), `gm`
(**ripperdoc bez karty**: MG podaje jedną liczbę „TECHNIKA + Chirurgia", serwer dorzuca 1k10)
i `character` (Medyk z kampanii — jego Chirurgię czyta `cpredMedicineSkillLevel` z karty, nigdy
klient). Wariant `gm` jest decyzją MG z tej sesji i ma konkretny powód: ripperdoc przy stole jest
zdaniem w opisie, a nie figurą, więc wymaganie dla niego karty postaci zamieniłoby jeden rzut
w pół godziny pracy. Nowy sposób montażu dopisuje się **do tej unii**, a nie jako drugi tor
w `installCyberware`: PT bierze się zawsze z `CYBERWARE_INSTALL_DV[entry.install]`, a porażka
zawsze niszczy wszczep (s. 226) — pieniądze schodzą, wiersz nie powstaje, Człowieczeństwo zostaje
nietknięte, bo nic nie zostało wszczepione.

**Czy jest gdzie wszczepić, rozstrzyga jedna czysta funkcja (04.09).** `cyberwareInstallRefusal`
w `systems/cpred/cyberware.ts` zwraca `MISSING_FOUNDATION`, `NO_SLOTS`, `POOL_FULL` albo `null`
i jest **jedynym** źródłem tych trzech odmów — ten sam kod wraca do klienta jako klucz w
`CYBERWARE_INSTALL_REFUSAL_MESSAGES`, więc zdanie po polsku jest w jednym miejscu. Liczy się
**na rodzinie, nie na pudełku sylwetki**: pudełko („które oko?") wybiera się dopiero po montażu,
więc pytanie o wolne gniazdo w prawej ręce nie ma jeszcze odpowiedzi. Trzy rzeczy, które łatwo
tu zepsuć: wpis **bez rodziny** nie jest odmawiany (wiersze sprzed 23a jej nie mają, a odmowa
blokowałaby import); **podstawa wchodzi zawsze** (to ona dopiero robi gniazda); a rodzin
wymagających podstawy jest **cztery** — `CYBERWARE_FOUNDATION_TYPES` — i Borgizacje do nich nie
należą, bo ramownica jest podstawą sama dla siebie. **MG przechodzi przez odmowę** (jak przez
blokady ruchu i progi sklepu), ale karta czatu wtedy ją zapisuje.

**Wszystko, co wisi przy naklejce żetonu, mieszka w `Token.statusData` i schodzi razem z nią (04.09).**
Kolumna trzyma `{ damage?, timer?, feared?, disabled? }` na status; `disabled` to nazwy
cyborgizacji zdjętych Impulsem EMP — **nazwy, nie id wierszy**, bo czyta je stół, a wiersz karty
może zniknąć, zanim minie minuta. Zapis idzie przez `writeSheetStatusDisabled`, odczyt przez
`readSheetStatusDisabled`, a **kasowanie jest wspólne**: `writeSheetStatusTimer(raw, id, null)`
zdejmuje cały wpis (zostawiając samo `damage`, czyli nastawienie MG). Ta jedna zasada jest
powodem, dla którego „Cofnij" w `realtime/damage.ts` musi po zdjęciu naklejki przelecieć
`statusesAdded` i wyczyścić dane — inaczej po cofniętym trafieniu zostaje zegar i następna walka
ogłasza „Minęła minuta" dla statusu, którego na żetonie już nie ma (błąd znaleziony 04.09).

**O tym, czy karta ataku ma guzik „Obrażenia", rozstrzyga serwer — klient tylko go rysuje (04.09).**
Serwer liczy `damages = (trafienie || obszar) && ammoDealsDamage(ammo)` i **nie wysyła
`damageNotation`**, gdy odpowiedź brzmi „nie" — komentarz przy tej linii mówi wprost
„no button, no notation, nothing to apply". Klient ma więc jeden warunek:
`attack.damageNotation !== undefined`. Warunek „trafił albo obszar" powtórzony po jego
stronie kosztował guzik z pustą kością na każdej karcie amunicji bez obrażeń z 16h (dym, gaz
łzawiący, hukbłyskowa, EMP, usypiająca). Nowa cecha ataku, która ma coś **odebrać** karcie,
odbiera to samo w tym jednym miejscu na serwerze, nie drugą gałęzią w `AttackControls.tsx`.

**Nowe pole typu broni dopisuje się w TRZECH miejscach, nie w dwóch (04.09).** Do
`CpredWeaponTypeInput`, do wpisu w `manual-overrides.json` — **i do białej listy `schema_fields`
w `tools/import/parse-manual.py`**. Ta lista tnie przy zapisie wszystko, czego na niej nie ma,
i robi to po cichu: tak zginęły najpierw `explosive` i `ammoPatterns`, a potem `thrown`,
`maxRangeM` oraz `ammoIds` — granat przestał być „rzucany" i latał bez zasięgu
maksymalnego, a miotacz ognia przyjmował cudzy śrut. Od 04.09 parser **mówi o tym na głos**:
każde pole spoza listy (poza `cost`, `costCategory` i `features`, które jadą do wpisu
kupowalnego) wychodzi jako ostrzeżenie importu. Ostrzeżenia czyta się przy każdym
`python tools/import/parse-manual.py`.

**Stan figury czyta się z pozycji stołu, a nie z legendy (27j + 04.09).** Podstawka niesie kolor
stanu, naklejka — jego ikonę, ✕ zostaje trupowi, a od 04.09 **portret kładzie się na bok**
(`CONDITION_TILT_DEG` w `TokenNode.ts`) dla `down` **i** `dead`. Obraca się wyłącznie portret —
`image` i `initial`; pierścień, łuk PW, podstawka, imię i naklejki zostają pionowe, bo
przekrzywiony podpis to błąd, a przekrzywione koło to nic. Kąt jest w tabeli obok pozostałych
tabel stanu i **dobiera się go w przeglądarce, przy zoomie stołu**, nie na oko w edytorze:
dwadzieścia stopni wyglądało dobrze w kodzie i było niewidoczne na mapie.

**Przedmiot, który da się zużyć, jest wierszem ekwipunku — nie tabelą obok niego (03.09).**
`CpredGearRow.consumable` niesie id z `systems/cpred/pharma.ts`, a `qty` liczy sztuki tak samo,
jak liczyło je zawsze. Dawka **jest** przedmiotem: waży, kupuje się ją, oddaje i gubi razem
z plecakiem, więc osobna lista rozjechałaby się z ekwipunkiem przy pierwszym „daję Rico dwie
fiolki". Nowy rodzaj środka dopisuje się **wyłącznie** do `CPRED_PHARMACEUTICALS` (nazwa, zdanie
z podręcznika, `applies`, ewentualne „raz dziennie") i do jednej gałęzi `applyDose`
w `realtime/recovery.ts`. `pharma.ts` **nie importuje niczego** — to warunek, nie przypadek:
walidacja karty (`character.ts`) sprawdza przeciw tym id, a `roleability.ts` bierze z karty typy.

**Powrót do zdrowia liczy serwer, a karta deklaruje tylko „minął dzień" (03.09).** `cpredRestDay`
w `shared/systems/cpred/recovery.ts` jest jedynym miejscem, które wie, ile PW wraca; klient wysyła
`character:rest` z samym `strained` i dostaje kartę czatu z **rozbiciem** (`rate.sources`), bo
liczba bez powodu nie da się sprawdzić przy stole. Nowe źródło tempa (chrom, środek, warunki)
dokłada wiersz w `cpredHealRate`, nie mnożnik w wywołaniu. Warunek „po udanej stabilizacji"
mieszka w `CpredCharacterData.recovery.stabilized` i **pisze go wyłącznie udane Ustabilizowanie**
(`applyStabilization`) — na każdym progu ran, nie tylko przy zerze.

**Tabela losowa nie dotyka kubka — i to jest cały etap 34.** `rollStore.ts` trzyma siedem pól
(`pending`, `initiative`, `attack`, `evasion`, `grapple`, `facedown`, `creation`), a każdy
`load…Cup` rozsypuje przed sobą `EMPTY_CUP`, czyli **czyści wszystkie pozostałe**. Gdyby „Losuj"
ładowało kubek, MG straciłby wzięty do ręki rzut Percepcji NPC-a w chwili kliknięcia, a graczowi
zdmuchnęłoby czekające wezwanie do Testu z 32. Dlatego losowanie jest **rzutem serwera**:
`table:roll` z panelu i `/tab <nazwa>` przez `chat:send` — dokładnie tą samą drogą, którą od
etapu 03 chodzi `/r 1d10` wysłane Enterem (bez gestu, `rollFormula` bierze zwykły RNG serwera,
żaden slot nie jest zajęty). W drabince `CupMode` tryb `randtable` stoi na **tym samym szczeblu,
co `roll`** — na samym dole, pod wezwaniem — więc nic nie traci pierwszeństwa. Reguła jest
niewidoczna w kodzie (łamie ją dopiero **dopisanie** wywołania, którego dziś nie ma), dlatego
pilnuje jej strażnik źródłowy `tables-cup.test.ts`: żaden plik tabel u klienta nie ma prawa
wspomnieć o `rollStore`.

**Rzut z tabeli idzie z `checkRule: false` i `plain: true`, i pada to w jednym miejscu.**
`rollFormula` **wnioskuje** regułę Testu z formuły (`isCheckFormula`), a `1d10` jest formułą
Testu w rozumieniu etapu 06 — bez jawnego wyłączenia dziesiątka rozsadza rzut dorzutem i tabela
dziesięciowierszowa wypluwa jedenastki. `plain: true` jest drugą połową tej samej prawdy: karta
czatu ma **nie malować** skrajnych oczek, bo dziesiątka znaczy „wiersz dziesiąty", a nie krytyk
(ta sama umowa, co rzuty kreatora z 27d). Oba ustawienia siedzą w `rollRandomTable`
(`shared/src/tables.ts`) i nowa droga do losowania ma iść przez tę funkcję, a nie obok niej.

**Widoczność wyniku losowania to RODZAJ wiersza czatu, nie pole w payloadzie.** `visibleTo`
w `realtime/chat-io.ts` filtruje **po `kind`, w zapytaniu do bazy**, więc jawny wynik zapisuje się
jako `rolltable`, a cichy jako `gmrolltable` — wzorem `roll`/`gmroll` z etapu 06 i
`action`/`gmaction` z 14b. Z tego samego powodu **„Pokaż stołowi" DOKŁADA publiczny wiersz**
zamiast odsłaniać istniejący: wiersz raz zapisany jako `gmrolltable` nigdy nie wejdzie graczowi
do historii, choćby doleciał rozgłoszeniem. Treść nowego wiersza czyta się **z zapisanej karty**,
nie z żądania klienta (ta sama umowa, co obrażenia po ataku z 16 i wezwanie z 32), a stara karta
dostaje `shown: true` przez `chat:update`, więc przycisk znika i drugie kliknięcie odbija się
o `ALREADY_SHOWN`. Obie kategorie idą do grupy filtra **„Stół", nie „Rzuty"**: kość tam pada, ale
patrzy się na treść wiersza, a zgaszone „Rzuty" mają schować testy, nie losowanie fabularne.

**Zakresy i graf podrzutów sprawdza się przy ZAPISIE, na całej kampanii.** Pokrycie liczy
`randomTableCoverageIssues` — **ta sama funkcja** w formularzu (podpowiedź po każdym znaku)
i w handlerze (odmowa), więc oba mówią to samo zdanie; klient nie zgaduje, co się uda. Graf
podrzutów sprawdza `randomTableNestingIssue` na **wszystkich** tabelach kampanii z tą jedną
podmienioną, bo dopisanie podrzutu w „broni" potrafi przekroczyć limit „łupu", którego nikt
w tej chwili nie edytuje — i odmowa musi paść tam, gdzie ktoś naprawdę klika zapis. Limit to
`RANDOM_TABLE_NESTING_MAX` = 3; czwarty poziom zamieniłby jedno kliknięcie w cztery karty naraz.
Losowanie ma **drugi** bezpiecznik w `rollRandomTable` (zbiór odwiedzonych plus licznik kroków),
bo baza może nieść graf sprzed tej reguły — import wchodzi do niej z boku.

**Nowy rodzaj wiersza czatu dopisuje się w PIĘCIU miejscach, nie w czterech (poprawka z 05.09).**
Trzy pierwsze były w umowie od 01.09: dwie czyste funkcje w `shared/src/chat.ts`
(`chatCategoryOf`, `chatCompactLine`), `toChatMessageView` po stronie serwera i jedna gałąź
`FullMessageRow` u klienta. **Piątym jest `visibleTo` w `realtime/chat-io.ts` — i to ono jest
jedynym, którego pominięcie widać dopiero z drugiego konta.** `visibleTo` to **biała lista
rodzajów**: wiersz, którego na niej nie ma, dociera do stołu rozgłoszeniem na żywo i znika przy
pierwszym przeładowaniu, bo zapytanie o historię go nie zwraca. Widzi go wtedy wyłącznie **autor**
(klauzula `{ authorId: user.id }`), czyli przy oględzinach z jednego konta wszystko wygląda
dobrze. Tak przeżyły dwa etapy dwa błędy naraz: `recovery` (30b) i `time` (37) — obie karty
opisane w kodzie jako **publiczne**, obie niewidoczne dla nikogo poza tym, kto je wystawił.
Pilnują tego odtąd dwa testy patrzące **oczami gracza** (`recovery.test.ts`, `gametime.test.ts`).
Kto pominie dwie czyste funkcje, dostanie wiersz wpadający do grupy „Stół", którego nie da się
ścisnąć — to nadal prawda, tyle że jest łagodniejszą z dwóch kar.

**Co gracz może nazwać figurę, rozstrzyga serwer — od 03.09 przez `Token.publicName`.**
Trzy stany w jednej kolumnie nullable, więc żadna scena nie wymagała konwersji: `null` = gracz
widzi `name` (tak było zawsze), tekst = widzi ten tekst, `''` = nie widzi żadnej etykiety.
Podmiana siedzi **w dwóch miejscach i tylko tam**: `toTokenView` (`realtime/tokens.ts`) wpisuje
`includePrivate ? name : (publicName ?? name)` i sam alias wkłada **do gałęzi prywatnej** —
gracz nie ma się nawet dowiedzieć, że druga nazwa istnieje; `filterCombatForPlayer`
(`shared/combat.ts`) wymienia `name` w wierszu trackera, zdejmuje pole `publicName` i przy
okazji poprawia `grapple.otherName`, żeby Pochwycenie nie nazwało nikogo po prawdziwemu. Nowa
ścieżka, którą figura dociera do gracza, **filtruje nazwę u siebie** — nie w kliencie, i nie
przez trzecie miejsce, które trzeba pamiętać. Czat jest świadomie poza tą umową: nazwa jest
tam wpisana w **treść** zapisanej wiadomości, opis w `zaleglosci.md`.

**Ruch gracza jest od 21.08 sprawdzany geometrią na serwerze.** `refuseWalkThroughSolid`
w `realtime/movement.ts` odrzuca trasę przez ścianę, zamknięte okno i stojącą osłonę — **także
poza walką**, i **odmowa nie nazywa przeszkody** (gracz nie może mapować budynku, wchodząc w nią).
MG jest zwolniony. Nowe narzędzie, które stawia coś nieprzenikalnego, dokłada segmenty
w `movementSegments`/`coverMovementSegments`, nie w nowej gałęzi walidacji.
**Od 22.08 sprawdzana jest cała figura, nie jej środek**: `firstBlockedStep` prowadzi jedną
linię na każde pole footprintu — te same punkty, które sprawdza planer u klienta (`isNodeOpen`),
więc serwerowa odmowa i narysowana trasa nie mają jak się rozjechać.

**Drugi pas zasięgu tury jedzie jako `TurnDistanceView.extra`, a rdzeń nie zna słowa „Bieg".**
Podgląd trasy maluje dwa progi: ile figura przejdzie z Akcji Ruchu i dokąd sięgnie, oddając
za to Akcję. Nazwę tego handlu i liczbę metrów wystawia **system**: `cpredRunMetres`
w `systems/cpred/turn.ts` dokłada `distance.extra = { label, max }`, a `combat.ts` opisuje pole
jako „ile jeszcze da się dokupić, oddając coś innego" — bez CP RED w typie. `MapRenderer`
dostaje z `MapArea` samo `extraMetres`/`extraLabel` i maluje bursztyn, nigdy nie pytając, co za
to płaci; separacja rdzeń/system trzyma się tu na jednym polu, więc nowy system RPG dokłada
własne `extra`, a mapa nie zmienia ani linijki. Uwaga na jeden szczegół: `cpredRunMetres`
**nie** sprawdza `requiresSpentMove` — dojście za pierwszą Akcję Ruchu wydaje ją po drodze,
więc próg widać, zanim Bieg stanie się klikalny. Zeruje go dopiero wydana Akcja albo blokada
(rana, status).

**Podgląd trasy nie pisze liczb i nie stawia znaczników.** Trasa mówi **wyłącznie** śladami
butów: kolor = pas zasięgu, odstęp = metr, kierunek = dokąd idzie figura. Etykiety metrów
(noga, suma, „Bieg: +X"), kreski na granicach pasów i ✖ na kratce lądowania były po kolei
dokładane i po kolei zdjęte (MG, 23.08) — każde z nich mówiło drugi raz to, co mówi kolor,
z dokładnością, do której nikt nie planuje tury. Dokładny metr daje linijka. Ślad skaluje się
**szerokością tokenu** (`FOOTPRINT_*_RATIO`), nie `overlayScale()`, więc trzyma rozmiar przy
każdym przybliżeniu; pilnuje tego `walk-bands.test.ts`.

**Powód odmowy jedzie na zasobie tury, nie w prozie obok niej.** `TurnResourceView.blocked`
niesie zdanie, którym rana albo status zabrały Akcję (14e), a `hotbarSlotsFor` stawia je
**przed** „Akcja w tej turze już wykorzystana". Kolejność prawdy jest trzystopniowa: status,
potem rana zapisana na turze, dopiero na końcu budżet — jedyne z tych zdań, które naprawdę
mówi o wydawaniu. Nowy powód odmowy dopisuje się tam, nie w komponencie.

**Akcja, którą ma tylko część figur, dopisuje się do `CPRED_HOTBAR_NETRUNNER_ACTION_IDS`**
(26b: Skaner) — nie do `CPRED_HOTBAR_ACTION_IDS`, którą dostaje każdy. Warunek liczy `shared`
z karty, a klient tylko go podaje (`netrunner` w `CpredHotbarInput`); slot z własnym zdarzeniem
obsługuje się w `activateSlot`, **bez** `spendCombatAction` — serwer księguje swoją Akcję sam.

**Nowe narzędzie mapy dopisuje się do dwóch getterów, nie do czterech list.** `MapRenderer`
pyta o narzędzia w ręku wyłącznie przez `toolSpentThisClick` (gest rozliczony na `pointerdown`
— ściany, lampy, gniazda, osłony, strefy) i `mapToolArmed` (wszystkie, pędzle włącznie).
Pominięcie ich znaczy klik płacony dwa razy: narzędziu i grze pod spodem (błąd #8 z 08.08).
Pilnuje tego `map-click.test.ts`, który czyta `MapRenderer.ts` jako tekst.

**Aktywną kampanię przełącza `campaign:activate`, nie zapis w bazie.** Zdarzenie przenosi
**wszystkie** podpięte gniazda (pokoje, scena, `state:sync`) i odsyła `campaign:switch`; trasa
REST tworząca kampanię woła je zaraz po utworzeniu, żeby „utwórz" i „aktywuj" szły jedną drogą.
Przycisk „Aktywuj" jest w Panelu MG przy każdej nieaktywnej kampanii.

**Zdanie o tym, co się komuś stało, nie nosi id z pliku danych.** `describeAmmoFailure` wymaga
teraz etykiet (parametr obowiązkowy), a nazwy ran daje `criticalInjuryNames` w `shared`. Nowy
wołający, który zapomni podać nazw, zobaczy brak członu — nigdy `injury.head-uraz-oka`.

**Skróty klawiszowe mają jedno źródło i tak ma zostać.** `MAP_TOOL_KEYS` w
`packages/client/src/shortcuts.ts` czyta obsługa klawiatury w `MapArea` **i** okno pomocy —
nowe narzędzie mapy dopisuje się **tam**, nie w drabince `if`-ów. Pilnuje tego
`shortcuts.test.ts`, który czyta `MapArea.tsx` jako tekst i przewraca się na literale
`toggleTool('...')` w obsłudze klawiszy.

**Pływające okno bierze się z `useWindowPlacement`, nie z własnego `dragRef`.** Nowe okno
dostaje hook (`window-placement.ts`) plus `<WindowResizeGrip />` w rogu — i tyle. Uchwyt siedzi
**13 px od krawędzi**, bo róg okna jest wycięty (`clip-path` karty z 27a, zaokrąglenie
pozostałych okien) i uchwyt dosunięty do rogu przepuszcza kliknięcie na mapę pod spodem.

**Ikonowy przycisk potrzebuje `title` i `aria-label`, ale tylko wtedy, gdy jego treścią jest
znak.** Ikony SVG (`MapIcons`, `UiIcons`) są `aria-hidden`, więc tam `title` wystarcza za nazwę
dostępną. Pilnuje tego `a11y.test.ts`.

**Kierunek patrzenia jest stanem serwera i publiczną częścią żetonu.** `Token.facing` (stopnie,
0 = góra, zgodnie ze wskazówkami) pisze drop ruchu, strzał i gałka na pierścieniu zaznaczenia
(`token:facing` — drugie po `token:light` zdarzenie tokenu, które wykonuje **gracz**). Ręczny kąt
trzyma się do następnego **ruchu**, który go nadpisuje. Żadna reguła CP RED tego nie czyta —
to czytelność, nie mechanika.

**Efekt mapy jest przycinany na serwerze, nie w rendererze.** `fx:play` jedzie **per gniazdo**:
kto nie widzi lufy, nie dostaje ani jej, ani dźwięku; kto nie widzi żadnego końca strzału, nie
dostaje niczego. Reguła jest czystą funkcją (`trimMapFxForViewer` w `shared/src/fx.ts`) i ma
własne testy — nowy rodzaj efektu dopisuje się tam, nie w `MapFxLayer`.

**Kolor dokłada się tylko w `theme.css` — i pilnuje tego test.** `packages/client/src/theme.test.ts`
(pierwszy test w tym pakiecie) przewraca się, gdy w `styles.css` albo `sheet.css` pojawi się
literał koloru, gdy ktoś sięgnie po token, którego nie ma, gdy token zostanie bez odbiorcy albo
gdy tokenowi chromu zabraknie pary dziennej. Wszystkie cztery ścieżki sprawdzone celowym
psuciem plików, nie samym „przechodzi".

**Limity wgrywanych obrazów mieszkają w `shared/src/uploads.ts` — i tylko tam.** Cztery pary
liczb (mapa 40 MB / 16384 px, token i portret 8 MB / 2048 px, handout 12 MB / 4096 px) czyta
serwer (`routes/uploads.ts` re-eksportuje je pod starymi nazwami) i klient. Zdanie odmowy
buduje `uploadRejectionText`, a nie prywatna kopia `switch`-a w panelu: **każda odmowa niesie
pełne wymaganie** (format · rozdzielczość · waga), bo „nieobsługiwany format" zostawia człowieka
z pytaniem „to jaki mam podać". Nowy `<input type="file">` bierze `accept` z
`UPLOAD_ACCEPT_ATTRIBUTE`, podpowiedź z `uploadRequirementText(kind)` i sprawdza plik przez
`fileRejectionText` **przed** wysyłką. Pilnuje tego `shared/src/uploads.test.ts` (12 testów).

**Stan figury zawsze ma naklejkę — a przekreślenie zostaje śmierci.** Od 22.08 `down`
(Nieprzytomny, Śmiertelnie ranny albo samo zero PW) nie przygasza już portretu: mówi o sobie
ikoną statusu i ciemnoczerwoną podstawką, a wielki ✕ przez twarz ma **wyłącznie** `dead`.
Ponieważ `down` bierze się także z samych punktów życia, `fallbackConditionStatusId`
(`shared/src/figures.ts`) dokłada domyślną naklejkę figurze, której żaden status tego nie mówi
— statysta bez karty na zerze PW nie może wyglądać jak zdrowy. Pilnuje tego `figures.test.ts`.

**Pole typu broni musi trafić na białą listę importera.** `tools/import/parse-manual.py`
zapisuje `weapon-types.json` przez filtr `schema_fields` — zbiór nazw pól, które przechodzą.
Pole spoza zbioru ginie **po cichu**, także wtedy, gdy dopisał je `manual-overrides.json`.
Kosztowało to całą mechanikę obszaru: `explosive` (Granatnik, Wyrzutnia rakiet) i `ammoPatterns`
(dobór naboi do broni) były w overrides od początku, a filtr wycinał je przy każdym imporcie,
więc w kampanii nic nie wybuchało i żaden nabój nie pasował do żadnej broni — mimo gotowego
kodu z etapów 16d i 16g i mimo testów, które przechodziły na **publicznej** próbce
(`data/public/.../sample.json` ma `explosive`). Dokładając pole do `CpredWeaponTypeInput`
w `shared/src/systems/cpred/compendium.ts`, dołóż je **w tej samej zmianie** do `schema_fields`.

**Pula portretów kampanii — pliki portretów dokłada wyłącznie MG (23.08).** `PortraitAsset`
jest bliźniakiem `TokenAsset` (model, trasy, kosz dwustopniowy), z jedną różnicą: listę
`GET /api/portrait-assets` widzi **każdy zalogowany**, bo to z niej gracz wybiera portret swojej
postaci — biblioteka żetonów zostaje przy `requireGm`. `POST /api/uploads/portraits` (wgranie
wprost na kartę) też przeszło na `requireGm`; gracz nie ma już żadnej trasy, którą wstawiłby
plik do `uploads/`. Wspólny komponent to `PortraitPicker` — używają go i karta postaci, i
kreator; nowe miejsce z portretem bierze jego, nie własnego `<input type="file">`.

**Nowy rodzaj obiektu na mapie dopisuje się do `SCENE_OBJECT_KINDS` w `shared/scene-objects.ts`
— i nigdzie indziej nie wolno zapomnieć (etap 27k).** Od 27k wszystko, co stoi na scenie,
kasuje się jednym gestem: warstwa → klik w obiekt → `Delete`, a `Ctrl+Z` cofa. Ta jedna lista
trzyma to razem w czterech miejscach naraz:

- `pickSceneObject` w `shared` odpowiada „co jest pod kursorem" — po **jednym rodzaju naraz**,
  bo wywołujący podaje tylko te kolekcje, których dotyczy jego uzbrojone narzędzie. To jest cała
  reguła „warstwa": narzędzie świateł nie złapie osłony, choćby leżała dokładnie pod kursorem.
  Kolejność wpisów w tablicy to kolejność **od wierzchu** (pinezka wygrywa z gniazdem, gniazdo
  z lampą, rysunek przegrywa ze wszystkim) i jest odwrotnością kolejności rysowania warstw
  w `MapRenderer`;
- `armedLayerKind()` w `MapRenderer` mapuje uzbrojone narzędzie na rodzaj; brak wpisu znaczy
  warstwę, która niczego nie łapie (linijka, mgła — nie zostawiają obiektów);
- `deleteSceneObject` w `MapArea` to **jedyna** droga kasowania i jest `switch`-em, nie drabinką
  warunków: ósmy rodzaj nie skompiluje się, dopóki nie dostanie tam swojej gałęzi. Każda ścieżka
  sprawdza `ack` i mówi zdaniem, gdy się nie udało — trzy gumki tego nie robiły i chybiony klik
  nie tłumaczył niczego (to był jeden z trzech błędów zamkniętych w 27k);
- `restoreRows` w `realtime/scene-undo.ts` odtwarza wiersz **z tym samym id**. Tam też dopisuje
  się emiter, którym nowy rodzaj rozsyła swoją zmianę.

**Cofanie żyje na serwerze, w pamięci procesu.** `rememberDeletion` (`realtime/undo-buffer.ts`)
wołane **przed** `delete`, z całym wierszem Prismy przepuszczonym przez `scalarRow`. Kosz hurtowy
odkłada całą grupę jako **jedną** pozycję, więc jedno `Ctrl+Z` cofa cały kosz — to zastąpiło okna
potwierdzenia, których kosze nie miały. `undo-buffer.ts` nie importuje **żadnego** modułu zdarzeń
i to jest jedyny powód jego istnienia: zapisuje do niego siedem plików naraz, a odtwarzanie
(które musi znać ich emitery) mieszka piętro wyżej w `scene-undo.ts`.

**Ściany: końcówka rysuje, środek zaznacza.** `wallEndpointNear` w `shared/walls.ts` rozstrzyga
klik przy narożniku (≤ `WALL_ENDPOINT_SNAP_PX`) na korzyść **rysowania łańcucha**, bo promień
trafienia w segment jest większy od promienia przyciągania i bez tego wyjątku nie dałoby się
zacząć nowej ściany dokładnie na rogu istniejącej. Trwający łańcuch wygrywa z jednym i drugim.
(Tryby `lock` i `share`, które do 27l nie zaznaczały nic, **przestały istnieć** — rygiel
i „gracze mogą otwierać" przeszły na kartę segmentu.)

**Podpowiedź nad mapą pisze się `--map-ink`, nie `--text`.** `--map-panel` jest ciemny w **obu**
motywach i taki ma zostać (Pixi rysuje pod nim białe podpisy żetonów), więc kolor pisma
aplikacji daje w dzień czarne na czarnym. Znalezione 23.08 przy 27k; dotyczyło wszystkich
podpowiedzi nad mapą.

**Nowa karta obiektu sceny — trzy miejsca, nie siedem** (etap 27l). Karta jest **jedna** dla
wszystkich rodzajów: ramkę, belkę, zamykanie, `Esc` i kosz daje `SceneObjectCard`, a rodzaj
dokłada wyłącznie **treść** (`SceneCardWall`, `SceneCardCover`, …). Dopisując rodzaj:

- gałąź w `findSceneObject` w `SceneObjectCard.tsx` — `switch` po `SceneObjectKind`, więc
  kompilator nie przepuści braku; tam też zapada, czy karta ma kosz i kto ją w ogóle widzi;
- ikona w `ICONS` — **ta sama, którą nosi narzędzie na pasku**, bo karta ma się czytać jako
  „to, co przed chwilą kliknąłem tamtym narzędziem";
- gałąź w `moveSceneObject` w `MapArea.tsx`, jeśli obiekt da się przesunąć.

Karta **nie kasuje sama**: `onDelete` przychodzi z `MapArea` i prowadzi do `deleteSceneObject`,
czyli tej samej jedynej drogi, którą idzie `Delete` (umowa z 27k). Okno ma **jeden** klucz
`useWindowPlacement('scene-object')` — karta lampy otwiera się tam, gdzie MG zostawił kartę
ściany, i to jest część zdania „to samo okno" z kryteriów etapu.

**`Esc` wewnątrz karty zamyka kartę na miejscu.** Globalna drabina `Esc` w `MapArea` odrzuca
**każdy** klawisz naciśnięty w polu tekstowym (pierwszy warunek jej obsługi), a karta notatki
sama ustawia kursor w treści — więc karta ma własny `onKeyDown` na `<section>`. Do 27l robił to
prywatny listener `NoteEditor`; przy scalaniu kart trzeba go było przenieść, nie skasować.

**Uchwyty przesuwania i skalowania: geometria w `shared`, decyzja u klienta** (etap 27l).
`shared/scene-handles.ts` sprowadza siedem rodzajów do **trzech kształtów** (punkt, prostokąt,
odcinek) i odpowiada na dwa pytania: `pickSceneHandle` („co kursor złapał") i `dragSceneShape`
(„gdzie to wyląduje"). Renderer nie wysyła nic sam — woła `onSceneTransform(ref, shape)`, a to
`MapArea` wie, którym zdarzeniem obiekt danego rodzaju się zapisuje. Reguły, które łatwo złamać:
róg wygrywa z wnętrzem (inaczej prostokąta nie da się przeskalować), rogi ma tylko to, co da się
rozciągnąć (rysunek jest w prostokąt **wpisany**, więc dostaje sam ruch), a przyciąganie jest
domyślne i wyłącza je `Ctrl` na czas gestu.

**Figura bez karty rzuca przez `RollSource`, a jej adres niesie karta ataku** (naprawa 26.08).
Statysta jest „kartą postaci uszytą na jedną walkę" (`systems/cpred/statist.ts`) i tak wchodzi
do każdej mechaniki: `sheetFromCombatProfile` daje `CpredCharacterData`, więc planer, rozbicie
i karta na czacie **nigdy nie dowiadują się, że statyści istnieją**. Nowe wejście do mechaniki
dokłada się dwoma krokami, oboma po istniejącym wzorcu:

- **na serwerze** — union `kind: 'character' | 'statist'` (`AttackSource` w `attacks.ts`,
  `RollSource` w `character-rolls.ts`). Gałęzi pyta **wyłącznie to, co pisze**: Szczęście,
  Test Przeżywalności, Ustabilizowanie, magazynek. Wszystko, co tylko czyta, bierze `source.data`
  i nie zagląda głębiej. Odmowy reużywają kodów ścieżki z kartą (`CHARACTER_NOT_FOUND` dla
  cudzej figury), żeby tablica błędów u klienta nie rosła o drugie słownictwo na tę samą
  odpowiedź;
- **na karcie** — adres figury jedzie w `CpredAttackMeta` i jest **wypełniany na serwerze**
  (`buildAttackMeta`), nigdy przyjmowany od klienta. `attackerTokenId` powstał dokładnie
  dlatego, że go nie było: klient szukał strzelca po wierszu broni, a statysta nie ma karty,
  w której ten wiersz by leżał — więc przycisk „Obrażenia" po prostu nie istniał.

Statysta rzuca przez `character:roll` **tylko na obrażenia** (`STATIST_CANNOT_ROLL_THIS`).
Nie z ostrożności: jego atak ma `attack:roll`, jego Unik `attack:evade`, a Szczęścia i Testu
Przeżywalności nie ma gdzie zapisać. Nowy rodzaj rzutu dla figury bez karty dostaje własne
zdarzenie albo rozszerza tę listę świadomie.

**Kasowanie z biblioteki, które rusza scenę, jest zdarzeniem gniazda** (kosz grafik żetonów,
27.08). Biblioteka grafik i pula portretów wyglądają jak bliźniaki — wgrywanie i listę mają
w `routes/uploads.ts` — ale ich kosze **muszą się różnić** i różnią się świadomie:

- **portret** zdjęty z puli zostaje na karcie, która go wybrała („nie proponuj tego dalej" to co
  innego niż „odbierz komuś obrazek"), więc wystarcza `DELETE /api/portrait-assets/:id`;
- **grafika żetonu** schodzi też z **żetonów na scenie** (`Token.imageUrl` → `null`, figura wraca
  do krążka), bo inaczej `uploads-gc` zabrałby plik spod stojącej figury i na mapie zostałby
  zepsuty obrazek. Skoro zmiana rusza żetony, musi dojechać do wszystkich ekranów **tą samą
  drogą co każda inna zmiana żetonu** — stąd `token:asset-delete` w `realtime/tokens.ts`
  (`emitTokensById` → `token:upsert`), a nie trasa REST obok `GET /api/token-assets`: trasy nie
  mają `io` (jest tworzone po ich rejestracji) ani liczników `RoomSequences`.

Reguła ogólna: **REST wgrywa plik, gniazdo zmienia stan stołu.** Nowy kosz w bibliotece czegoś,
co leży na scenie, dokłada zdarzenie i mówi w acku, ilu figur dotknął (`clearedTokens`) — panel
powtarza tę liczbę zdaniem, bo „usunięto" nie mówi, że komuś właśnie zniknęła twarz z mapy.

## Nowe pole w szkicu kreatora postaci

Szkic kreatora przechodzi przez **dwie** funkcje w `shared/systems/cpred/creation.ts` i nowe
pole trzeba dopisać do **obu**:

- `applyCreationPatch` — zapis, czyli co wolno przysłać klientowi;
- `parseCreationDraft` — odczyt, czyli co wraca do klienta z bazy.

`parseCreationDraft` składa szkic z domyślnego (`createDefaultCreationDraft`) i przepisuje pola
**po nazwie**, więc pominięte pole nie wywołuje żadnego błędu — po prostu wraca puste przy
każdym odczycie. Tak zginęły `skillSpecialties` (naprawione 27.08): zapis działał, w bazie
wartość siedziała, a pola „w czym?" nie dało się wypełnić, bo ack zawsze przynosił `{}`.
Objaw jest mylący — wygląda jak zepsute pole tekstowe, nie jak zgubiony odczyt.

Walidacja ma być **jedną funkcją wołaną przez obie strony** (wzór: `readSkillSpecialties`),
a nie skopiowaną pętlą — inaczej zapis i odczyt rozjadą się przy pierwszej zmianie reguł.

## Reindeks RAG-u (dziennik, baza wiedzy)

`knowledge:reindex` i `journal:reindex` **rozsyłają odświeżone wpisy**, nie tylko status indeksu.
Chip „⟳ nieaktualny" siedzi na **wierszu**, a nie w nagłówku, więc sam `KnowledgeIndexStatus`
w acku zdejmuje licznik „czeka na indeks" i zostawia czerwone chipy aż do przeładowania strony.
Klient obsługuje `knowledge:upsert`/`journal:upsert` od 19b, więc wystarczy je wysłać do pokoju
MG. Dwie rzeczy, które łatwo zrobić źle: status licz **raz** dla całej paczki (`emitUpsert`
liczyłby go per wpis, czyli N zapytań pod rząd), a wpisy czytaj z bazy **po** `markIndexed` —
doklejenie `stale: false` do kopii sprzed zapisu wysyła wiersz z `indexedAt: null`.

## Nowa próbka dźwiękowa mapy

Dźwięk mapy żyje w **pięciu** miejscach i wszystkie pięć musi się zgadzać, bo cztery z nich nie
mają typu, który by tego pilnował:

1. **plik** w `packages/client/public/sfx/` (`.wav` albo `.ogg` — paczki się różnią),
2. `MapFxSound` i `MAP_FX_SOUNDS` w `packages/shared/src/fx.ts` — rdzeń zna nazwę dźwięku, nie
   nazwę pliku,
3. `SFX_FILES` **i** `SFX_GAIN` w `packages/client/src/sfx.ts` (`Record<MapFxSound, …>`, więc te
   dwa pilnuje kompilator),
4. wiersz w `SFX_SAMPLES` w `SettingsWindow.tsx` — bez niego nikt próbki nie **usłyszy**, dopóki
   nie trafi na nią w walce,
5. wiersz w `public/sfx/ATTRIBUTION.md` z paczką, autorem i licencją.

Który dźwięk gra która broń, rozstrzyga **jedna tabela** — `ICON_FX` w
`shared/src/systems/cpred/fx.ts`, indeksowana ikoną z `cpredWeaponIcon`. Nie dokładaj drugiego
rozgałęzienia „czy to strzelba" po stronie klienta: renderer ma nie wiedzieć, co to Cyberpunk.

Kompletu pilnuje `packages/client/src/sfx.test.ts` (dźwięk bez pliku, plik-sierota i dźwięk bez
przycisku odsłuchu wywalają test) — tak wyszedł zapomniany `bowstring.ogg` po wymianie próbki
cięciwy na `bowstring.wav` 28.08.

**Komunikat o błędzie, który może przestać być prawdą, niesie kod odmowy.** Dziennik trzyma błąd
u siebie (`journalStore.error`), a nie w statusie z serwera, więc nic go sam z siebie nie
odświeża — „Brak połączenia z AI Gateway" wisiał po powrocie gatewaya do następnej akcji MG.
Od 28.08 `fail(message, code)` zapisuje też `errorCode`, a odbiór `ai:status` z
`available: true` woła `clearAiError()`, który zdejmuje **wyłącznie** `AI_UNAVAILABLE` —
„nie ma czego streścić" ma wisieć, dopóki nie ma. Dokładając komunikat, który zależy od stanu
zewnętrznej usługi, dołóż kod i sprzątanie w tym samym miejscu; pilnują tego trzy testy
w `journal-error.test.ts`.

**Nowy element w górnym pasku ma nie kurczyć się w nieskończoność.** `.top-bar` to trzy grupy:
tytuł, `.combat-bar` i `.top-bar-right`. Miejsce oddają **tylko** te, które mogą (tytuł
i nazwa kampanii — wielokropkiem); przyciski i stan połączenia są `flex: none`, a kolejka
inicjatywy ma `min-width: min-content`, żeby nie zwinąć się do zera i nie wypuścić swoich
przycisków na sąsiadów (tak powstało nachodzenie przy ~900 px). Dokładając coś do prawej grupy,
sprawdź pasek przy ~900 px — poniżej 1000 px tytuł aplikacji znika i to jest cały zapas.

**„Jedno kliknięcie w mapę trafia w jedną rzecz" — a to znaczy jedno pole na tryb.**
`mapToolStore` trzyma i `tool`, i `tokenPlacement` (żeton czekający na postawienie), bo to jest
**jedna** odpowiedź na pytanie „co zrobi następny klik w mapę": `setTool`/`toggleTool` odkładają
żeton, `setTokenPlacement` odkłada narzędzie, a `pointer` z pustą ręką jest stanem „ręce wolne".
Do 28.08 żeton mieszkał w `tokenStore`, obok wyboru narzędzia zamiast w nim — i przy oględzinach
26b jeden klik postawił **i** punkt dostępu, **i** żeton. Naprawa z 22.08 (`toolSpentThisClick`)
zdjęła podwójny skutek, ale zostawiła gorszy objaw: żeton wisiał w ręku niewidzialnie, każdy klik
szedł na narzędzie i nic tego nie tłumaczyło. Dokładając trzeci tryb kliknięcia, dopisz go **do
tego samego store'a**, nie obok. Pilnuje `map-mode.test.ts`; kolejność znaczeń w samym rendererze
— `map-click.test.ts`.

**Nowy sposób postawienia żetonu postaci przechodzi przez `TokenPlacement`.** Pole `characterId`
(plus `ownerId` przepisany z karty) niesie wiązanie do `token:create`; bez niego powstaje pusty
krążek o tej samej nazwie, a nie figura postaci — różnica widoczna dopiero w menu żetonu
(„📄 Otwórz kartę postaci") i w pasku PW liczonym z karty. Serwer przyjmował `characterId` od
zawsze; do 28.08 nikt go z UI nie podawał i jedyną drogą do drugiej figury była konsola.

**Czynność, której nic nie cofa, pyta przez `confirmDestructive`** (`packages/client/src/confirm.ts`),
nie przez gołe `window.confirm`. Na kampanii oznaczonej jako poligon zdanie zostaje krótkie;
przy stole, przy którym ktoś naprawdę gra, dochodzi **nazwa kampanii** — bo pomyłka, którą to
ma łapać, to kliknięcie w dobrą rzecz w złej kampanii. Dotyczy kasowania postaci, sceny i bota.
**To nie jest cofnięcie decyzji z 23.08 („kasowanie nie pyta — cofa się `Ctrl+Z`")**: tamta
dotyczy obiektów sceny, które wracają z bufora cofania; te trzy nie wchodzą do żadnego bufora.

**Zdanie „czego tu brakuje" należy do paska, nie do pustego paska.** `HudContext.sheetNotMine`
mówi „ta figura ma kartę, ale nie twoją" i renderuje się **niezależnie** od `slots.length`:
Akcje z katalogu (Ustabilizowanie, Bieg) nie potrzebują karty, więc pasek gracza nigdy nie jest
pusty i wygląda po prostu jak figura bez broni. Pierwsza wersja tej poprawki wisiała pod
`slots.length === 0` i **nie pokazywała się nigdy** — wyszło dopiero w przeglądarce.

**Nowy punkt Celowania to `CPRED_AIM_POINTS`, a jego skutek — dwa miejsca w `sheets.ts`.**
Lista w `shared/systems/cpred/locations.ts` trzyma trzy cele Akcji Celowania (s. 170) i jest
źródłem dla etykiet, dla podpowiedzi na banerze i dla `hitLocationForAim` — to ona mówi, czy
trafienie liczy się przeciw pancerzowi głowy, czy ciała. **`CpredHitLocation` zostaje przy dwóch
wartościach i tak ma być**: noga i trzymany przedmiot mają pancerz ciała, więc trzecia lokacja
trafień byłaby pancerzem, którego nikt nie nosi. Skutek dokłada się w `applyDamageToSheet`
(karta postaci) **i** w `applyDamageToTokenHp` (statysta — tam może być tylko zdanie, bo nie ma
gdzie zapisać rany); rana nadana z celowania idzie w `injuryAimed`, a nie w `injury`, żeby
„Cofnij" zdjęło wszystkie trzy naraz, gdy ten sam strzał wylosował ranę **i** złamał nogę.

**Rana nadana z nazwy szuka się po tabeli i wyniku, nie po id.** `criticalInjuryAt(pool, 'body', 8)`
znajduje „Złamaną nogę", bo „ósemka w tabeli korpusu" to adres z podręcznika, a `id` powstaje
z polskiej nazwy przy imporcie i ginie, gdy MG przepisze wiersz w edytorze kompendium. Brak
wiersza jest **zdaniem na karcie**, nie cichym pominięciem połowy reguły.

**Cecha ataku, którą czyta dopiero rozliczenie obrażeń, jedzie kartą ataku — nigdy żądaniem
klienta.** Od 29.08 dotyczy to trzech pól: `ammo` (16g), `aimedAt` (s. 170) i `halvesArmor`
(s. 176). Droga jest jedna i cała: `planCpredAttack` wpisuje pole do `CpredAttackMeta`, meta ląduje
w `RollAttackMeta.system`, `readAttackContext` (`character-rolls.ts`) czyta je z **zapisanej**
wiadomości do `CpredRollRequest`, plan obrażeń przekłada je do `RollDamageMeta.system`,
a `realtime/damage.ts` odczytuje z powrotem do `SheetDamageRequest`. Powód jest ten sam za każdym
razem: „Zastosuj" klika się kwadrans po ciosie, kompendium mogło się w międzyczasie zmienić,
a klient nazywający własną przebijalność pancerza wybierałby, ile warta jest kamizelka celu.

**Skutek rany krytycznej, który dotyka _cudzego_ rachunku, jest liczbą na wierszu rany — nie
stałą w silniku.** `movePenalty` (14c), `actionPenalty` (14e), a od 29.08 `headDamageMultiplier`
(„Pęknięta czaszka" mnoży trafienia w głowę ×3, s. 188) i `conditionalPenalty` (liczba + warunek
słowami podręcznika). Silnik pyta o wartość przez `cpredHeadDamageMultiplier`
/ `cpredInjuryConditionalModifiers` w `statuses.ts` i **nie zna żadnej nazwy rany**, więc wiersz
napisany ręką MG działa dokładnie tak, jak drukowany. Nowe pole dopisuje się w **czterech**
miejscach naraz: `CriticalInjuryEntry`, `CpredCriticalInjuryRow`, `toCriticalInjuryRow`
(kopiuje ranę z kompendium na kartę) i `parse-manual.py`. Pominięcie `toCriticalInjuryRow`
oznacza pole, które istnieje w katalogu i nigdy nie dociera do rannego.

**Kara, której VTT nie umie sprawdzić, nie jest odejmowana — jest podawana.** `actionPenalty`
wchodzi do sumy rzutu (`cpredInjuryModifiers` → `sheetSituationModifiers`); `conditionalPenalty`
**nigdy** tam nie trafia, bo silnik nie wie, w której ręce jest broń („Strzaskane palce −4 do
Akcji wykonywanych tą ręką") ani czy ten Test wymaga mówienia („Złamana szczęka"). Kara stoi jako
chip przy ranie na karcie i jako guzik w oknie rzutu, który wpisuje liczbę do modyfikatora
sytuacyjnego. Błędne automatyczne −4 jest gorsze niż widoczne przypomnienie (decyzja MG z 29.08).

**Statysta nosi rany krytyczne od 29.08 — profil bojowy to nie „karta uboga w pola".** Etap 16b
świadomie zostawił rany poza `CpredCombatProfile` („to opisuje osobę z historią"); powód przestał
być prawdziwy, gdy 16h i 26f zaczęły rany **nadawać z zasady**. Rany siedzą w
`CpredCombatProfile.criticalInjuries` (pole opcjonalne — nietknięty profil ma się serializować
bajt w bajt tak, jak w 16b), a `combatProfileSheet` podaje je syntetycznej karcie, więc
`cpredInjuryDodgeBlock` i `cpredInjuryModifiers` działają bez jednej gałęzi „czy to statysta".
Żeton **bez** profilu nadal dostaje samo zdanie na czacie: nie ma gdzie zapisać.

**Zdolność Specjalna Roli poznaje się po _nazwie_, nie po id Roli.** `cpredRoleAbilityRank(data,
registry, nazwa)` w `roleability.ts` — bliźniak `cpredInterfaceRank` z 26a, i z tego samego
powodu: id Ról przychodzą z `roles.json`, pliku danych, który grupa może przemianować albo
przetłumaczyć inaczej. Zwraca **null**, a nie zero, gdy postać tej Zdolności nie ma: zero
czytałoby się jak „Solo, które jest w tym słabe", a każdy wołający musi odróżnić jedno od
drugiego, żeby wiedzieć, czy w ogóle coś rysować. Nowa Zdolność (30b–30d) dokłada tu stałą
z nazwą i własną sekcję — nie gałąź w istniejącej.

**Efekt Zdolności liczony z samej karty wchodzi wprost do planera, nie kontekstem.** Precyzyjny
atak (`planCpredAttack`) i Wyczucie zagrożenia (`skillBreakdown` w `rolls.ts`) czytają
`cpredSheetCombatAwareness(data, registry)` — dzięki temu podgląd u klienta i werdykt serwera
dochodzą do tej samej liczby bez obiektu kontekstu podróżującego między nimi. Kontekst
(`CpredAttackContext.modifiers`) zostaje dla tego, co wie **świat**: Trzymanie, dym, Konfrontacja.

**„Pierwsze w tej Rundzie" mieszka w `CpredTurnLedger`, nie w `turnState`.** Redukcja obrażeń
i Wykrycie słabości (30a) stemplują `Combatant.turnEffects` numerem Rundy przez
`claimRoundOnce` (`realtime/round-once.ts`) — jedyną drogą, bo pyta i księguje w jednym wywołaniu.
Budżet tury jest wydawany na nowo przy każdym starcie tury (a „start" obejmuje cofanie kolejki
przez MG), więc ledger w nim zostałby wytarty dokładnie przez to, co ma przetrwać. Stempel jest
numerem Rundy, nie flagą: stary wpis sam przestaje obowiązywać. „Cofnij" na karcie obrażeń oddaje
stempel przez `releaseRoundOnce`.

**Zdolność, której zapis coś kosztuje, ma własne zdarzenie i wypada z łaty karty.** Przydział
Zmysłu Walki jedzie `character:combat-awareness`, a `character:update` odmawia go przez
`FORBIDDEN` — tak samo jak `eddies` od 23b. Cena z bramą obok nie jest ceną, a autozapis karty
nie ma czym zapłacić Akcji. Kody odmowy **są** kodami silnika (`NO_ABILITY`, `BAD_STEP`,
`NOT_ENOUGH_POINTS`, `BAD_VALUE`), żeby klient tłumaczył je tą samą tabelą
(`CPRED_COMBAT_AWARENESS_PROBLEMS`), którą wyszarza guziki panelu.

**Nowa Zdolność Roli z punktami do rozdzielenia** (29.08, czwarta, etap 30b) idzie przez wspólną
maszynerię Specjalizacji w `roleability.ts`: `CpredSpecialtyDefinition` (nazwa, opis słowami
podręcznika, własny sufit, strona) plus `CpredSpecialtyRules` (`perRank`, `across`). Sakiewkę
liczy `cpredSpecialtyPool`, sufit jednej Specjalizacji — `cpredSpecialtyCap`, legalność —
`cpredSpecialtyProblem`. Nowa Zdolność tego kształtu **nie dostaje własnej walidacji**: dostaje
listę definicji i dwie liczby reguł. Panel `SpecialtyPanel.tsx` obsługuje ją wtedy bez zmian.

**Przydział Specjalizacji jedzie zwykłą łatą karty**, w przeciwieństwie do Zmysłu Walki z 30a:
awans nie ma czym zapłacić Akcji, więc nie ma za co zamykać drogi. Rozmiar sakiewki zależy
jednak od rangi, której `applyCharacterPatch` nie widzi — dlatego `character:update` woła
`cpredSpecialtiesProblem` **na scalonej karcie**, tuż przed zapisem. Dzięki temu podniesienie
rangi i wydanie nowych punktów mieszczą się w jednej łacie. Nowe pole tego rodzaju dopisuje się
w trzech miejscach: typ i domyślna wartość w `CpredCharacterData`, blok walidacji kształtu
w `applyCharacterPatch`, gałąź w `cpredSpecialtiesProblem`.

**Zdanie z tabeli ran o leczeniu** (`quickFix`, `treatment`) jedzie **na wierszu rany**, jak
każdy inny jej skutek: kopiuje je `toCriticalInjuryRow`, przepuszcza walidacja wiersza, a czyta
`cpredParseCare`/`cpredTreatmentOptions` w `treatment.ts`. Nowa droga leczenia (nowa Umiejętność
w zdaniu) dopisuje się **do jednej listy** `CARE_SKILLS` razem z odmianami, których podręcznik
używa; nigdzie indziej. Nie ma pola strukturalnego w kompendium — parser czyta prozę, żeby rana
wpisana ręką MG działała jak drukowana.

**Nowa Umiejętność dostępna tylko przez Zdolność Roli** (Chirurgia, Technologia Medyczna) **nie
trafia do `skills.json`** — jej poziom jest funkcją przydziału, a nie liczbą, którą ktoś wpisuje.
Mieszka w `CPRED_MEDICINE_SKILLS` w `roleability.ts`, poziom liczy `cpredMedicineSkillLevel`,
a rzut nią rozstrzyga gałąź `isCpredMedicineSkillId` w planerze — nigdy `registry.skills`.

**Nowa Zdolność Roli, która stawia na mapie cudze figury** (Wsparcie, 30c) idzie przez trzy
warstwy i **żadna z nich nie zna dwóch pozostałych**. Dane: `CpredBackupTier` w `roleability.ts`
— liczby z tabeli plus `unit` (nazwa jednej figury) i `weapon` (nazwa, nie id). Silnik:
`cpredBackupCall(rank, level, callRoll, arrivalRoll)`, czyste, obie kości z zewnątrz. Serwer:
`backup.ts` — `spawnBackup` robi żetony i wiersze inicjatywy, `scheduleBackup` decyduje, czy
grupa czeka, czy staje od razu. **Broń szuka się po nazwie w kompendium** (`weaponFor`), nigdy
po id: id powstają przy imporcie z polskiej nazwy i giną przy regeneracji — ta sama umowa, którą
`criticalInjuryAt` ma dla ran. Broń nieznaleziona degraduje do pięści z zachowaną nazwą wiersza.

**Stan gry dotyczący całej walki, a nie uczestnika**, mieszka w `Combat.systemState` — kolumnie
nieprzezroczystej dla trackera, bliźniaku `Combatant.turnState` z 14b. Rdzeń przechowuje string
i nie czyta z niego pola; tłumaczy go `reinforcementsOf` w `sheets.ts` na `ReinforcementView`
(etykieta, liczba figur, runda, opcjonalne pytanie do MG). Kolumna **umiera razem z walką**, i to
jest jej sens: „za 4 Rundy" mierzy w jednostce, która poza walką nie istnieje. Poza walką nic się
nie zapisuje — grupa staje od razu.

**Zespół Korpo to karty postaci, nie profile bojowe.** „Członkowie zespołu zbudowani są tak samo
jak Postacie Graczy" (s. 154), a Korporacyjny Netrunner ma w pakiecie cyberdek — statysta nie ma
gdzie go trzymać. Pracownik powstaje jako zwykły `Character` bez właściciela (`ownerId: null`),
a **Lojalność siedzi na karcie pracodawcy** (`CpredCharacterData.team`), bo to cecha układu, nie
osoby: ten sam ochroniarz u innego Korpo zaczyna od nowa na 1k6+1. Kasowanie karty pracownika
sprząta wiersz przez `dropFromTeams` — lista jest JSON-em, więc baza nie ma czego kaskadować.

**Cyborgizacje pakietu zespołu zostają prozą.** „Nie musisz obniżać Empatii tej Postaci z uwagi
na Utratę Człowieczeństwa […] Wzięto to już pod uwagę" — prawdziwe wiersze chromu policzyłyby
Człowieczeństwo drugi raz. Ta sama zasada obowiązuje każdy przyszły pakiet BN-a z gotowymi
Cechami: chrom opisuje się w notatkach, a liczby zostają takie, jakie wylosowała tabela.

**Drabina rang Zdolności Roli** (etap 30d) to `CpredAbilityTier`: `id`, `min`, `max`, `page`.
Podręcznik paruje poziomy („POZIOMY 7 I 8") aż do dziewiątki, więc szczeblem jest **przedział**,
nie liczba — wiersz na każdy poziom byłby czterema kopiami tego samego zdania. Cztery tabele
30d dziedziczą po tym interfejsie, a `cpredAbilityTierAt` i `cpredAbilityTiersUpTo` są ich
jedyną drogą odczytu; nowa Zdolność z drabiną dokłada tabelę, nie własną funkcję szukającą.

**Zdolność Roli, która zmienia cenę**, zapisuje skutek na karcie **wyłącznie z własnego
zdarzenia** i wypada z `character:update` (`FORBIDDEN`) — tak jak `eddies` od 23b, przydział
Zmysłu Walki od 30a i zespół od 30c. Dobity targ Fixera (`CpredCharacterData.haggle`) pisze
tylko `character:haggle` po wygranym rzucie przeciwstawnym, a zdejmuje go zakup
(`economy:buy`) albo ręka Fixera. Zniżka z drzwiami bez rzutu obok nie jest zniżką.

**Rzut przeciwstawny z fikcją po drugiej stronie** bierze **jedną liczbę od MG**, a kość rzuca
sam: `character:haggle` dostaje `opponentBonus` (CHA + Handel + Znajomości drugiej strony)
i losuje jej 1k10 obok kości Fixera. Sprzedawca nie ma karty, więc pytanie o trzy składniki
osobno byłoby pytaniem trzy razy o jedno. Remis wygrywa druga strona — jak w każdym rzucie
przeciwstawnym w tym projekcie.

**Lista wpisów kupowanych awansem** (Tabor Rodziny z 30d, Specjalizacje z 30b) jedzie **zwykłą
łatą karty**, a rozmiar puli sprawdza się na **scalonej** karcie w `character:update`
(`cpredFleetSheetProblem` obok `cpredSpecialtiesProblem`) — bo `applyCharacterPatch` nie widzi
rangi, którą ta sama łata może właśnie podnosić. Niezmiennik zamiast historii awansów: wpisów
najwyżej tyle, ile poziomów, i żaden nie z kategorii wyższej niż poziom.

**Rzut, który nie jest Testem**, planuje się z pominięciem `finishCheck`: bez Cechy, bez
Umiejętności, bez kary za rany, bez eksplodującej dziesiątki i z `checkRule: false`. Tak jedzie
Rzut na Śmierć i tak jedzie Test Rzetelności z 30d (`plan.reliability` niesie szansę, pod którą
ma się zmieścić goła kość). Wszystko, co **jest** Testem, przechodzi przez `finishCheck` — także
Efekt Charyzmy, który ma w rozbiciu **samą rangę** zamiast pary Cecha + Umiejętność.

**Cena poziomu** mieszka wyłącznie w `advancement.ts` (`shared/systems/cpred`) — trzy drabinki
z s. 411 stoją tam jako tablice, a jedyną drogą do zakupu jest `planCpredAdvance`, przez którą
przechodzi **i** panel karty (żeby wyszarzyć guzik), **i** serwer (żeby odmówić). Nowa rzecz
kupowana za PD dokłada drabinkę i gałąź w tej jednej funkcji, nigdy własnego liczenia u klienta:
zapalony guzik i odmowa serwera muszą wychodzić z tego samego rachunku. Poziom docelowy
(`to`) jedzie w żądaniu, bo dwa kliknięcia w wyścigu inaczej kupiłyby dwa poziomy za cenę
pokazaną raz.

**Pole karty, którego zmiana ma cenę**, wypada z `character:update` u **gracza**, a u MG zostaje
polem (bo sędzia musi móc naprawić kartę). Od 29a tak jedzie czwórka: `improvementPoints`,
`skills`, `roleAbilityRank` i `roleId` — ten ostatni razem z rangą, bo Rola przełączona pod
zachowaną rangą oddaje inną Zdolność Specjalną na tym samym poziomie za darmo. Ręczna zmiana
licznika przez MG **nie jest wyjątkiem od audytu**: ląduje jako wiersz `adjust`, scalany w oknie
minuty, dokładnie jak korekta salda z 23b.

**Drugi audyt przy karcie** (rejestr awansów z 29a) to **osobna tabela**, nie nowy `kind`
w `LedgerEntry`: pieniądze i doświadczenie są audytami dwóch różnych rzeczy, a wspólna lista
rodzajów uczyniłaby „Zakup" legalnym powodem punktu Percepcji. Wzorzec jest ten sam co w 23b —
`applyImprovementPoints` przesuwa licznik i zapisuje powód **jednym zapisem**, a to, co ten
sam zapis zmienia na karcie (nowy poziom, nowa ranga), jedzie w jego `sheet`.

**Zdolność Roli czyta się przez `CpredRoleSheet`, nigdy przez `roleId` wprost.** Od 29b karta
niesie **listę** Ról: `roleId` + `roleAbilityRank` to Rola **bieżąca** (ta, przez którą widzi cię
Ulica — Reputacja, tytuł karty, wiersz w „Postaciach", `hud.ts`), a wszystko zdobyte wcześniej
siedzi w `formerRoles`. Trzy pola razem tworzą alias `CpredRoleSheet` i to on jest parametrem
każdego wyszukania Zdolności; `cpredRoleAbilityRank` pyta o **każdą** Rolę z listy, więc dziesięć
paneli etapu 30 i `cpredInterfaceRank` z 26a zaczęły działać obok siebie **bez jednej zmiany
w nich samych**. Nowe wyszukanie Zdolności bierze `CpredRoleSheet`, nie własny `Pick<…>` —
dwanaście takich literałów to dwanaście miejsc, o których zapomni się przy następnym polu.
Kolejność listy jest znacząca: `cpredRoleRanks` zwraca bieżącą pierwszą.

**Zmiana Roli** idzie wyłącznie przez `character:role-change` i `planCpredRoleChange`, jak każdy
zakup z 29a: bramka to Zdolność Specjalna **bieżącej** Roli ≥ `CPRED_MULTICLASS_MIN_RANK` (4,
s. 143) — i to ona sprawia, że trzecia Rola pyta o drugą, a nie o pierwszą. Nowa Rola kosztuje
pierwszy szczebel drabinki Zdolności (60 PD) i startuje od 1; powrót do Roli już posiadanej jest
darmowy, ale bramki **nie omija** (decyzja MG, 30.08.2026). Zapis na karcie liczy czysty
`cpredRoleChangeSheet`, a rejestr dostaje własny rodzaj `role` — „Awans: 0 PD" przy darmowym
powrocie czytałoby się jak błąd. `formerRoles` wypada z `character:update` u gracza, a to, czy
karta może nieść daną Rolę (`cpredRolesProblem`: `ROLE_TWICE`, `UNKNOWN_ROLE`), rozstrzyga się na
**scalonej** karcie — jak Specjalizacje z 30b i Tabor z 30d.

**Nazwa Roli z `roles.json` stoi w zdaniu wyłącznie w mianowniku**, po dwukropku albo na końcu:
plik danych niesie „Nomada", a odmiany nazwy, którą grupa może sobie przetłumaczyć inaczej, nie
da się zgadnąć — „zostań Nomada" i „widzi cię jako Nomada" to nie są zdania po polsku. Tak samo
z nazwami Zdolności. (Znalezione przy oględzinach 29b.)

**Skutek rany czyta się przez `cpredActiveInjuries`, nigdy z listy wprost.** Od etapu 15 (Łatanie)
wiersz rany może być **załatany** (`patched`: kto i czym) — rana zostaje na karcie, a jej skutki
milczą do końca dnia (s. 223). Jeden filtr przepuszcza wszystkie odczyty **skutku**: kary płaskie
i warunkowe (`cpredInjuryModifiers`, `cpredInjuryConditionalModifiers`), blokadę Uniku, haki końca
tury (`cpredInjuryTurnEnd`), Test Przeżywalności (`injuryDeathSavePenalty`), mnożnik trafień
w głowę i karę do RUCH-u (`injuryMovePenalty`, `cpredMoveBudget`). Filtr siedzi **wewnątrz** tych
funkcji, więc dziesięć miejsc, które je wołają, nie musiało się zmienić — i nowe wywołanie też nie
będzie musiało. Lista na karcie jest celowo **niefiltrowana**: załatana ręka wciąż jest złamana
i karta ma to mówić.

**Droga leczenia rany to tryb, nie osobna ścieżka.** `CpredCareMode` (`quickFix` | `treatment`)
jedzie w żądaniu jako `treatMode` i w planie jako `mode`; która kolumna tabeli jest czytana,
rozstrzyga `cpredCareOptions`, a to, czy sukces zdejmuje ranę czy tylko ją ucisza —
`cpredCarePermanent` (trzy rany drukują „Łatanie trwale usuwa Efekt tej Rany" i wtedy łatanie
**jest** leczeniem). Serwer wypełnia `treatPermanent` sam, jak `treatDv`: klient nie obiecuje sobie
trwałego wyleczenia z minutowej łaty. Brak `treatMode` znaczy „Leczenie" — starszy klient robi to,
co robił. Reguła „można łatać samego siebie, nie można leczyć samego siebie" (s. 223) stoi w obu
warstwach: pacjent wypada z listy leczących u klienta, a serwer odmawia `SELF_TREATMENT`.

**Podgląd rzutu bierze tę część kontekstu, którą widać na karcie.** `RollDialog` woła
`planCpredRoll` z `modifiers: cpredInjuryModifiers(...)`, bo płaskie kary z ran są policzalne
z samej karty — bez tego okno obiecywało sumę, którą serwer po cichu obniżał (znalezione
w przeglądarce 30.08 przy ranie za −1). Serwerowi zostaje to, czego karta nie wie: Zwarcie jest
faktem o scenie, nie o postaci.

**Nowa droga ataku kończy się w `loadAttackFor` — i stamtąd wychodzi Celowanie (31.08).**
Uzbroić broń da się z kafla paska (`hudStore.activeWeapon`), z wiersza karty i z menu żetonu
(`attackStore.targeting`), a strzał w osłonę wraca jeszcze kartą odmowy — ale **każda** z tych
dróg kończy się jednym wywołaniem `loadAttackFor` w `attack-targeting.ts`. Dlatego to ono, a nie
żaden baner, otwiera przy kursorze wybór lokacji trafienia (`AimMenu`, warunek `mayAimShot`:
pojedynczy strzał w figurę). Nowa droga ataku dostaje Celowanie za darmo; droga, która by go nie
miała, musiałaby ominąć ładowanie kubka. Wybór **nie jest lepki** — nie mieszka przy uzbrojonej
broni, tylko przeładowuje kubek tym samym `AttackIntent` z dopisanym `aimedAt`. Adres, pod którym
staje okno, zostawia ten, kto zna ekran (`onTokenTarget` → `aimMenuStore.placeAt`); bez adresu
okno się nie pokazuje, bo strzał wywołany z czatu nie ma kursora.

**Broń na karcie powstaje z wpisu katalogu, nigdy z wolnego tekstu (31.08).** Wiersz musi nieść
`compendiumId` wpisu (`weapon.*`), bo dopiero on prowadzi do typu broni (`weapon-type.*`), a typ
niesie tabelę zasięgów — bez niej planer odmawia `UNKNOWN_WEAPON`. „+ Broń z katalogu" buduje
wiersz przez `purchasedSheetRow` w `shared/shopping.ts`, czyli tą samą funkcją, co zakup
i „Dodaj za darmo": łup, zakup i ręka MG mają być tym samym wierszem. **Dopasowania po nazwie nie
ma i mieć nie ma** — „Pistolet" pasuje do kilkunastu modeli i cicho przypina zły PT na każdym
dystansie. Wiersz bez wiązania mówi to sam (chip „⚠ Wskaż broń z katalogu" i wyszarzony „Atak"),
a wiązanie zostawia nazwę i uwagi użytkownika, biorąc z katalogu tylko liczby.

**Rana, której nikt nie wyrzucił, powstaje przez `namedCriticalInjuryRow` (31.08).** Gaz łzawiący,
granat hukowy, broniona strefa, Celowanie w nogę i „Nadaj ranę" w ręku MG **nazywają** wiersz
tabeli, zamiast go losować — więc rana nie niesie `rolled` (karta nie drukuje „2k6 = N", którego
nie było) i niesie `assigned`, z którego karta robi chip „nadana". Jedna funkcja w `shared`, nie
trzy kopie `delete row.rolled`: dokładnie dlatego, że kopia przy Celowaniu tę zasadę znała,
a dwie ścieżki wymuszonej porażki nie.

**Figura bez karty ma rany w profilu, a Umiejętności — na osobnej liście (31.08).**
`CpredCombatProfile.skills` (id → poziom) jest odwrotnością jednej liczby `skillLevel`: tamta
należy do broni i milczy o wszystkim innym, ta mówi „ta figura umie **to**, i tyle". Wpisana
liczba jest **całym** modyfikatorem — `combatProfileSheetForSkill` zeruje wtedy Cechy, bo Wartość
bojowa „reprezentuje sumę Cechy i Umiejętności" (s. 158) i doliczona INT policzyłaby ją drugi raz.
Wolno rzucać wyłącznie Umiejętnością z tej listy (`combatProfileRollableSkills`; reszta wraca
`STATIST_CANNOT_ROLL_THIS`), a rzut idzie przez `character:roll` z `attackerTokenId` — tym samym
adresem, którym statysta rzuca na obrażenia. Sufitem poziomu jest `STATIST_SKILL_LEVEL_MAX`,
nie `SKILL_LEVEL_MAX`: dziesiątka ogranicza Umiejętność postaci, a nie Wartość bojową.

**Rany figury bez karty jadą do klienta publicznie, reszta profilu nie (31.08).** `TokenView.injuries`
stoi obok `statuses`, a nie w prywatnej połówce z `combatProfile`: przy stole widać, że ktoś ma
odciętą dłoń, a Medyk gracza ma mieć co załatać — natomiast broń, pancerz i Wartość bojowa to
rzeczy, których gracz uczy się, dostając w twarz. Rdzeń VTT niesie blob (`TokenInjuryRow`),
wyjmuje go z profilu warstwa systemu (`readSheetTokenInjuries` w `sheets.ts`, obok
`readSheetFearedTokens`), a klient czyta rany figury bez karty **wyłącznie** z tego pola —
`combatProfile.criticalInjuries` zostaje dla mechaniki serwera.

**Klik w figurę, której ten widz nie prowadzi, opisuje ją w pasku i nic więcej (31.08).**
`MapRenderer.onTokenPreview` → `selectionStore.focus(tokenId)` rusza wyłącznie `focusTokenId`;
`tokenId` (sterowanie), ring i podgląd marszu zostają przy figurze prowadzonej. Pasek rozróżniał
opis od sterowania od 27h (`HudContext.steering`) — brakowało tylko drogi, którą cudza figura
mogła do niego trafić, i przez to publiczne rany były dla gracza nieosiągalne.

**Nowy dodatek do broni to wiersz kompendium, nie gałąź w kodzie (01.09).** `AttachmentEntry`
niesie `fit` („Pasuje do:" z podręcznika — lista Umiejętności, lista zakazanych, „musi liczyć
naboje") i flagi skutku (`slots`, `magazine`, `attackBonus`, `rangedBonus`, `ignoresObscurement`,
`blocksConcealment`, `secondary`, `exclusiveGroup`). Ta sama decyzja, co przy amunicji w 16g
i ranach krytycznych w 14e: MG wpisujący własny dodatek dostaje go egzekwowanego dokładnie tak,
jak drukowany, a kod walki nigdy nie uczy się słowa „bagnet". Każdą flagę trzeba **przepisać
ręcznie** w `toAttachmentProfile` — pominięta tam jest regułą, której mechanika nigdy nie zobaczy
(ta sama lekcja, którą zapisał `toAmmoProfile`).

**Kolumny tabeli magazynków siedzą na typie broni, nie na dodatku (01.09).**
`magazineExtended`/`magazineDrum` w `WeaponTypeDefinition`, bo tabela z s. 344 czyta się bronią:
jeden magazynek bębnowy, dziesięć różnych odpowiedzi. Dodatek mówi tylko, **którą kolumnę**
wybrać (`magazine: 'extended' | 'drum'`), a liczbę podaje `weaponMagazineWith`. Typ, którego
w tabeli nie ma, zostaje przy zwykłym magazynku — to uczciwa odpowiedź, nie zgadywanie.
Obie kolumny musiały trafić na białą listę `schema_fields` w `parse-manual.py` (umowa o nowym
polu typu broni).

**Druga broń doczepiona do wiersza to id typu broni, nigdy kopia jego liczb (01.09).**
`CpredAttachmentWeapon.weaponTypeId` (+ opcjonalny `magazine`), a pełny profil składa
`resolveAttachmentWeapon`. „Trzymaną oburącz broń można wykorzystać jako Granatnik z tylko jednym
granatem w magazynku" (s. 343) to cały profil granatnika z jednym zmienionym polem; skopiowanie
reszty zostawiłoby bagnet, którego obrażenia przestają się zgadzać z Lekką bronią białą, gdy MG
poprawi tabelę. Planer podmienia broń **raz**, w `planCpredAttack`, i od tego miejsca w dół każda
reguła (zasięg, zwarcie, tryby ognia, połowa pancerza) działa, bo dotyczy broni — nie dlatego,
że ktoś dopisał gałąź o podwieszanych.

**Magazynek broni podwieszanej jest jej własny (01.09).** `CpredWeaponRow.attachmentAmmo`
(id dodatku → naboje). Bez tego jeden granat kosztowałby dwadzieścia pięć naboi karabinowych:
`spendAttackCosts` czyta `meta.attachmentId` i pisze do właściwego licznika, `weapon:reload`
z polem `attachmentId` napełnia ten licznik za tę samą Akcję, a demontaż zabiera go z karty razem
z dodatkiem. Broń doczepiona przychodzi **załadowana** — nikt nie kupuje pustego granatnika,
a alternatywą jest wyrzutnia wymagająca Akcji, zanim w ogóle wystrzeli.

**Reguły montażu stoją po stronie odczytu, nie zapisu (01.09).** `attachmentIds` jest zwykłym
polem karty i jedzie `character:update` jak nazwa broni, więc gracz może tam wpisać trzy bębny
albo złącze smartguna na łuku. `fittedAttachmentsFor` sądzi listę **przy każdym odczycie**
(`attachmentMountProblem` wobec tego, co już zachowano): to, czego nie dałoby się zamontować,
po prostu nie daje nic. Sprawdzanie przy zapisie trzeba by powtórzyć w każdej ścieżce piszącej
kartę — tak jest jedno miejsce do zapomnienia, a karta, pod którą MG zmienił kompendium, leczy
się sama. Zdarzenie `weapon:attachment` zostaje mimo to, bo robi trzy rzeczy, których łata nie
policzy: przepisuje `ammoMax` z tabeli, przycina naboje przy demontażu i **odmawia** drugiej
kopii zdaniem, zamiast milczeć.

**Bonus dodatku warunkowany chromem pyta kartę przez `hasRequiredCyberware` (01.09).**
`requiresCyberware` niesie **nazwy** cyborgizacji, nie id — id powstają z polskich nazw przy
imporcie i giną, gdy MG przepisze wiersz (ta sama umowa, co przy ranach przez `criticalInjuryAt`
i broni Wsparcia w 30c). Dopasowanie na `trim().toLowerCase()`. Przez tę jedną funkcję idą oba
tory z podręcznika: +1 złącza smartguna („musisz być z nim połączony za pomocą złączy interfejsu
lub uchwytu podskórnego", s. 344) i odmowa strzału amunicją inteligentną („z powodów
bezpieczeństwa … nie wystrzeli", s. 347, kod `AMMO_NEEDS_CYBERWARE`). Do 23a modelu chromu nie
było, więc drugie z tych zdań stało jako proza na karcie.

**Kara „nie widzę celu" ma własny `kind`, żeby dało się ją zdjąć (01.09).**
`CPRED_OBSCUREMENT_KIND` w `environment.ts` zamiast `situational`: „Celownik noktowizyjny …
zmniejsza do zera modyfikatory ujemne za strzelanie do celu ukrytego w ciemności, dymie, mgle"
(s. 343), a noktowizor musi odróżnić chmurę od Trzymania — po polskiej etykiecie się nie
rozgałęzia. Kasowane są **wyłącznie ujemne** wiersze tego rodzaju i **kasowane**, nie
kompensowane plusem: podręcznik mówi, że kara przestaje istnieć, a „Dym −4 · Noktowizor +4"
na karcie byłoby teatrem arytmetycznym.

**Nowa droga ataku z drugiej broni kończy się `attachmentId` w żądaniu (01.09).**
`CpredAttackRequest.attachmentId` → `AttackIntent.attachmentId` → `AttackTargeting.attachmentId`;
podgląd u klienta i werdykt serwera rozwiązują dodatek **z tego samego katalogu**
(`resolveAttachmentWeapon`), więc bąbelek pod kursorem i karta na czacie nie mają jak się
rozjechać. Karta niesie `attachmentId` + `attachmentName`, bo jest czytana długo po strzale
i „czym to było" musi odpowiadać także po edycji kompendium.

**Tożsamość broni na pasku to wiersz PLUS dodatek (01.09, druga sesja).**
`weaponOptionKey(rowId, attachmentId)` w `hotbar.ts` — bagnet i karabin, w który jest wkręcony,
dzielą **ten sam** `rowId`, więc od chwili, w której pasek pokazuje broń podwieszaną, sam
`rowId` przestał być tożsamością. Klucza używają **cztery** miejsca i pominięcie któregokolwiek
zlepia dwie bronie w jedno pudełko: id slotu (`weapon:<klucz>:<tryb>`), id przeładowania
(`reload:<klucz>`), grupowanie panelu w `cpredHotbarGroups` i pamięć trybu ognia u klienta
(`fireModeKey` bierze **id grupy**, nie `weaponRowId`). Katalog dodatków wchodzi do
`hotbarSlotsFor` polem `attachments` i jest **opcjonalny**: kto go nie poda — jak tura bota —
dostaje pasek sprzed tej zmiany, czyli same bronie z karty.

**Nowy rodzaj wiersza czatu przydziela się do grupy filtra (01.09, trzecia sesja; tryb zwarty
usunięty 06.09.2026).** Filtry czatu stoją na `chatCategoryOf` w `shared/src/chat.ts` — funkcja
ma wyczerpujący `switch` po `ChatKind`, więc nowy rodzaj **nie skompiluje się** bez przydziału
do grupy. Pasek filtrów to wyłącznie cztery przełączniki kategorii: gęstość feedu, skrót
„solo" pod Alt+klikiem i przycisk „Pokaż wszystko" zostały wycofane razem z `chatCompactLine`
(nikt ich nie używał, a każdy nowy rodzaj wiersza wymagał drugiego streszczenia).

Cztery rzeczy, które łatwo zepsuć przy dokładaniu:

- **Biała lista widoczności (`visibleTo`) jest osobnym krokiem i najgroźniejszym** — patrz umowa
  wyżej. Rodzaj publiczny dopisuje się do **obu** gałęzi (gracza i MG); gałąź MG nie jest
  zbędna, bo bez niej MG traci karty wystawione z drugiego konta MG.

- **Filtr nie chowa pytań.** `isPending` w `ChatPanel.tsx` wyjmuje spod filtra nierozstrzygniętą
  propozycję bota i notatkę z przyciskami (16c). Nowy wiersz, który czeka na czyjeś kliknięcie,
  dopisuje się tam — inaczej schowa się pod separatorem w środku cudzej tury.
- **Ukryte nie znaczy skasowane.** Odfiltrowane wiersze zwijają się w klikalny separator
  („⋯ 4 ukryte wiersze ⋯"), a nie znikają: czat jest logiem sesji. Odmianę liczebnika robi
  `hiddenLabel`.
- **Nastawienie jest lokalne.** `chatFilterStore` trzyma wybór w `localStorage` (klucz
  `vtt.chat.categories`) i **nigdy** nie jedzie zdarzeniem Socket.IO — to samo rozstrzygnięcie,
  co przy głośnościach z 27d.

**Wezwanie do Testu jest jedynym źródłem prawdy o tym, co zaraz padnie (etap 32).** Rzut
odpowiadający na wezwanie jedzie zwykłym `character:roll` z jednym dodatkowym polem
(`callMessageId`), a `payloadFromCall` w `character-rolls.ts` **podmienia cały payload** na to,
co stoi w zapisanej karcie wezwania: kartę postaci, Umiejętność albo Cechę, modyfikator MG
i widoczność wyniku. Z żądania klienta zostają dokładnie dwie rzeczy — **zadeklarowane Szczęście
i gest kubka**. To ta sama umowa, którą od etapu 16 mają obrażenia po ataku („notacja i mnożnik
z zapisanej wiadomości, nigdy z żądania"), i z tego samego powodu: klient nazywający własne PT
ustalałby trudność wydarzenia, które wymyślił MG.

Podmiana stoi **na początku** `performCharacterRoll` świadomie: od tej linii w dół działa
wszystko, co ta funkcja umie od etapu 08 (kary z ran, Zwarcie, wydanie Szczęścia, skórka kości,
wstrzymanie karty do końca animacji 3D). Osobne zdarzenie musiałoby to powtórzyć i rozjechałoby
się z oryginałem przy pierwszej zmianie w rzutach.

Trzy szczegóły, które łatwo przeoczyć:

- **Wezwanie zamyka się dokładnie raz.** `resolveAnsweredCall` sprawdza `isCheckCallOpen`
  i uprawnienie (`mayAnswerCheckCall`: właściciel karty albo MG), a po rzucie `emitCheckCallUpdate`
  dopisuje `resolved` i rozsyła kartę przez `chat:update` — nie drugą wiadomość.
- **Samo wezwanie jedzie wzorem szeptu** (MG + wezwany), niezależnie od wybranej widoczności:
  to prośba do jednej osoby. Widoczność dotyczy **karty rzutu**. Wezwanie z widocznością
  „MG + wezwany", na które rzucił MG w zastępstwie, dostaje `recipientId = ownerId` — bez tego
  wypadłoby graczowi z historii po przeładowaniu (`visibleTo` przepuszcza po adresacie).
- **Werdykt liczy CP RED, nie rdzeń.** `cpredCheckOutcome` obsługuje obie drogi z s. 130: przeciw
  PT (`>`, remis nie zdaje) i przeciw drugiej stronie (jej 1k10 też eksploduje, remis wygrywa
  Broniący). `CheckCallEntry` w `shared/src/checks.ts` niesie same etykiety i stan, a żądanie
  systemu trzyma jako nieprzezroczyste `system` — jak `RollOpposedMeta.system` od 14d.

**Kubek woła wezwaniem, czytając feed czatu (etap 32).** `openCheckCallFor` w `chatStore.ts`
szuka **ostatniego otwartego** wezwania, którego właścicielem jest ten użytkownik — bez drugiego
magazynu stanu, bo dwa źródła prawdy o tym, czy MG jeszcze czeka, rozjechałyby się przy pierwszym
„Odwołaj". Kubek w tym trybie **nie potrząsa się od razu**: chwyt otwiera okno rzutu, żeby dało
się zadeklarować Szczęście, a dopiero „Weź kubek" ładuje Test i drugi chwyt jest tym prawdziwym.
Świadomie widzi je **wyłącznie właściciel karty** — MG z pięcioma wystawionymi wezwaniami miałby
kubek migający bez przerwy, a jego „Rzuć za nią" stoi na karcie czatu.

**Nabój broni podwieszanej ma własne pole i własne wejście planera (02.09).** Magazynek dodatku
jest jego własny od etapu 31 (`attachmentAmmo`), a od 02.09 własny jest też **nabój**:
`CpredWeaponRow.attachmentAmmoId` (`id dodatku → id naboju`) i wejście planera
`secondaryAmmo`, rozwiązywane przez wołającego dokładnie tak, jak `ammo` — serwer w
`resolveWeaponRow`, klient w `planAttackPreview`. Bez obu naraz nie działa nic: samo pole karty
nie wystarczy, bo `planCpredAttack` **zerował** profil dla każdego strzału dodatkiem
(`firedWith ? null : weapon.ammo`), a samo wejście planera nie ma skąd wziąć naboju. Ładuje go
`weapon:reload` z `attachmentId` **i** `ammoId`; pasowanie idzie po **broni podwieszanej**
(`requireLoadableAmmo` z parametrem `against`), nigdy po broni, która ją niesie — karabin bierze
kule, a wiszący pod nim granatnik granaty. Demontaż zabiera dodatkowi **oba** pola.
Skutek, dla którego to powstało: bez tego z granatnika podwieszanego nie dało się wystrzelić dymu
ani gazu, czyli jedynej drogi, jaką podręcznik daje tym nabojom.

**Intencję uzbrojonego celownika buduje jedna funkcja.** `intentFromTargeting`
(`attack-targeting.ts`) obsługuje **obie** drogi: klik, który ładuje kubek (`loadAttackAtToken`),
i dymek, który wycenia strzał chwilę wcześniej (`TargetTooltip`). Wcześniej każda miała własną
kopię tego samego przepisywania i dymek zgubił w niej `attachmentId` — chmurka nad celem mówiła
„Militech Dragon", gdy baner i karta ataku mówiły „Bagnet". Pole dołożone do `AttackTargeting`
dopisuje się **tu**, nie u wołających; gałąź paska akcji czyta swoje pola z `HudActiveWeapon`.

**Odmowa zapisu karty wraca do widoku serwera i mówi, dlaczego.** `characterStore` trzyma cień
`serverViews` — to, co serwer ostatnio powiedział o każdej karcie — aktualizowany przez
`applySync`, `applyUpsert` (**także wtedy, gdy optymistyczny stan wygrywa**) i udany zapis.
Przy odmowie `endSave` przywraca z niego kartę, gdy nic już nie jest w locie; warunek jest
lustrem tego, który adoptuje widok przy sukcesie, bo zapis czekający w buforze sam rozstrzygnie
prawdę. Cień jest potrzebny, bo odmowa **nie niesie widoku** (`{ ok: false, error }`), a
broadcast nie idzie — nic się przecież nie zmieniło. Powód odmowy jedzie osobno: `saveErrors`
niesie kod, a `characterSaveErrorText` tłumaczy go na zdanie do paska „issues" na dole karty.
Zdania kodów silnika mieszkają w `shared` obok typu problemu (`CPRED_ROLES_PROBLEMS`,
`CPRED_SPECIALTY_PROBLEMS`, `CPRED_FLEET_PROBLEMS`) — ta sama tabela wyszarza guzik i tłumaczy
odmowę.

**Kara z pancerza mieszka w `character.ts` i ma jednego liczącego (03.09).** Ciężki pancerz
zabiera podręcznikowo (s. 185) trzy rzeczy naraz: RUCH, REF i ZW. RUCH liczy `cpredArmorPenalty`,
Testy — `cpredArmorStatPenalty(armor, statId, statValue)`; **obie siedzą w
`shared/systems/cpred/character.ts`**, bo czytają je `rolls.ts` i `attacks.ts`, a `movement.ts`
importuje `rolls.ts` — postawienie ich w `rolls.ts` albo `movement.ts` domknęłoby cykl. Trzy
reguły funkcji, każda kosztowała test: bierze **jedną najgorszą sztukę**, nie sumę; pomija
zdjęty pancerz (`equipped === false`); i **nie schodzi poniżej zera** — Cecha 2 pod pancerzem −4
traci 2, nie 4, a wynik zerowy zwraca `0`, nigdy `-0`. Wchodzi jako **nazwany wiersz rozbicia**
(`CPRED_ARMOR_PENALTY_LABEL`, `kind: 'situational'`) wszędzie, gdzie rozbicie istnieje: Test
Cechy, Test Umiejętności, atak. Tam, gdzie rozbicia nie ma — **bierny PT Uniku i Inicjatywa** —
liczba wchodzi w sumę, a Inicjatywa dokleja ją do etykiety („Refleks (REF) 5 Pancerz −2"). To
świadomy kontrast z Człowieczeństwem, które obniża EMP **wewnątrz** własnej etykiety Cechy.

**Zacięcie broni to flaga wiersza karty i osobna Akcja (03.09).** Jakość broni (s. 244) jedzie
z **wpisu** kompendium, nigdy z typu broni: `ResolvedWeapon.quality` wychodzi z `resolveWeapon`
tylko wtedy, gdy nie jest `standard`. `excellent` dokłada wiersz rozbicia
`CPRED_EXCELLENT_ATTACK_BONUS` (+1); `poor` po Krytycznej Porażce zapala
`CpredWeaponRow.jammed` (`jamPoorWeapon` w `realtime/attacks.ts`). Zacięta broń **odmawia
zdaniem** (`CPRED_JAM_REFUSAL`, problem `WEAPON_JAMMED`) — z tego samego napisu korzysta pasek
akcji, wyszarzając wszystkie tryby ognia. Usterkę zdejmuje **własna Akcja**
(`CPRED_ACTION_CLEAR_JAM` + zdarzenie `weapon:clear-jam`), nie przeciążone `weapon:reload`:
RAW to dwie różne Akcje, a broń bez magazynka nie ma kafelka przeładowania, który dałoby się
pożyczyć. Trzy granice są celowe i pilnują ich testy: zacina się **broń niosąca**, nigdy
podwieszany dodatek (składa się go z **typu** broni, więc jakości nie ma), nigdy statysta (profil
bojowy nie ma wpisu katalogu), i nigdy Krytyczna Porażka **pominięta** (`critical.ignored`)
przez „Wyjście z opresji" Solo.

**Sakiewka Zdolności bez Zdolności schodzi z karty, zanim ktokolwiek ją osądzi (04.09).**
`character:update` waliduje **scaloną** kartę trzema funkcjami (`cpredSpecialtiesProblem`,
`cpredFleetSheetProblem`, `cpredRolesProblem`), bo rozmiar sakiewki zależy od rangi, której
łata może dopiero nadawać. Problem w tym, że ta sama łata potrafi **zabrać Zdolność**: `roleId`
jest od 29a u MG zwykłym polem, a zmiana Roli bez odłożenia starej do `formerRoles` zostawia
`medicine`, `fabrication` albo `fleet` bez właściciela. Walidator odrzucał wtedy nie tylko tę
łatę, ale **każdą następną** — Medyka z wydanymi punktami Specjalizacji nie dało się zrobić
niczym innym, a zdanie odmowy mówiło o Specjalizacji, której nikt nie dotykał. Dlatego
`cpredDropOrphanedRolePurses` (`systems/cpred/roleability.ts`) czyści osierocone sakiewki
**przed** walidacją: pyta o Zdolność przez `cpredRoleAbilityRank`, więc przy wieloklasowości
(stara Rola w `formerRoles`) nie zdejmuje nic, a pustej sakiewki nie rusza w ogóle i zwraca ten
sam obiekt. Nowa sakiewka zależna od rangi dopisuje się **w tej funkcji**, nie w walidatorze —
inaczej odziedziczy dokładnie ten sam potrzask.

**Panel Zdolności Roli mieszka w dwóch wąskich kolumnach i obie są sztywne (04.09).**
Osiem paneli 30a–30d renderuje się w `.cp-field.cp-awareness` wewnątrz `.cp-identity`, czyli
w pierwszej kolumnie `.sheet-page` — a ta ma **`15rem` na stałe**, więc rozciąganie okna karty
nic jej nie daje. `CombatAwarenessPanel` ma drugi dom: pudełko „Zmysł Walki" w pasku akcji
(`.hud-form` w `.hud-rail`, ~254 px). W obu wiersz `.awareness-row` przestaje być siatką
i układa się **flexem z zawijaniem**: nazwa bierze całą pierwszą linię (`flex: 1 0 100%`,
`white-space: normal`), a wartość, koszt i guziki schodzą do drugiej, z `.awareness-steps`
dosuniętym do prawej (`flex: none` **obok** `margin-left: auto` — bez tego automatyczny
margines zjada wolną przestrzeń i ściska guzik do minimum). Poza tymi dwoma miejscami wiersz
zostaje jednolinijkową siatką: rejestr awansów (`.cp-advance`) stoi w polu `cp-span2` i ma dość
miejsca. **Guzik w `.awareness-steps` ma `min-width: 1.6rem`, nie `width`** — ± mają być
kwadratowe i równe, ale w tym samym rządku siedzą „Wezwij", „Targuj" i „Podnieś".

**Zaznaczenie figur ma dwa wskaźniki, a bramka z 27k zamyka oba (05.09).**
`selectionStore` trzymał do etapu 35 dwie rzeczy: `tokenId` („kto chodzi, gdy klikam podłogę")
i `focusTokenId` („kogo opisuje lewa szyna"). Doszedł trzeci — `groupIds`, czyli zaznaczenie
grupowe. Jest **prywatny jak tamte**: ramka to wskaźnik jednej przeglądarki, nie stan stołu,
i nigdy nie jedzie po sieci. Trzy zdania, które trzeba znać, zanim się go dotknie:

- **Trzyma wyłącznie figury, którymi ten widz może sterować.** Filtruje `MapRenderer`
  (`tokensInMarquee`, `selectAllSteerable`), bo tylko on ma `movableTokens`; u MG przechodzi
  wszystko. Na tej jednej linijce stoi całe „gracz z ramką na całą mapę dostaje pod kontrolę
  wyłącznie swoje figury" — nie ma drugiego sprawdzenia w operacjach grupowych i nie ma go tam
  potrzeby, bo każda z nich i tak idzie zwykłym zdarzeniem figury.
- **Pojedynczy wybór zeruje grupę, ale `select(null)` jej nie rusza.** `select(null)` leci przy
  **każdym** zakończonym marszu; gdyby zerował, marsz jednej figury z zaznaczonej szóstki
  gubiłby pozostałe pięć. Zerowanie siedzi więc w gałęzi „wybrano figurę", nie na wejściu.
- **Bramka wykluczająca ze scenerią (27k) ma teraz dwa wejścia.** `sceneSelectionStore.select`
  woła `select(null)` **i** `clearGroup()`, a subskrypcja w drugą stronę reaguje i na nowe
  `tokenId`, i na nowe `groupIds`. Bez obu połówek `Delete` miałby pod ręką ścianę i sześć
  figur naraz — dokładnie tę niejednoznaczność, której umowa z 27k zabrania.

**Kotwicę grupy wybiera store, a renderer wyrównuje się do niej `syncSteering` (05.09).**
Przy pojedynczym wyborze źródłem jest **renderer**: `setSelection` ustawia pierścień i odsyła
`onSelectionChange`, a store jest lustrem. Przy grupie jest odwrotnie — co ostatecznie wyszło
z `Shift`+kliknięcia, wie tylko store, więc to on wyznacza kotwicę (pierwsza figura listy).
Wyrównanie mapy nie może iść przez `setSelection`, bo tamto odesłałoby `onSelectionChange` →
`select(anchor)` → a ten świadomie zeruje grupę: ramka kasowałaby sama siebie. Stąd
`syncSteering(tokenId)` — ta sama robota bez zgłaszania zmiany z powrotem. Nowa droga, która
ustala prowadzoną figurę **poza** rendererem, ma używać jej, a nie `setSelection`.

**Ping jest gestem, nie stanem — i dlatego nie ma store'a (05.09).**
`map:ping` (`realtime/ping.ts`) jest zbudowany na `ruler.ts` co do joty: bez zapisu w bazie, bez
`seq`, bez powtórki przy resynchronizacji, do pokoju sceny i **z pominięciem nadawcy**
(`socket.to`), bo pingujący rysuje kółko u siebie od razu. U klienta idzie przez moduł
`map-ping.ts` — nie przez zustanda — z tego samego powodu, dla którego modułem jest `map-fx.ts`:
nic tutaj nie przeżywa klatki, a subskrybent store'a przeliczałby drzewo komponentów za rzecz,
która już się stała. `pull` („przyciągnij widok") przyznaje **wyłącznie serwer i wyłącznie MG**;
prośba gracza nie jest odmową — ścina się do zwykłego pingu, żeby gest zrobił mniej, a nie padł.

**Kopia figury to zdarzenie serwera, nie pętla `token:create` u klienta (05.09).**
`token:duplicate` istnieje z trzech powodów naraz, i każdy z nich sam by wystarczył:
numeracja liczy się **z całej sceny** (klient trzyma tylko figury, które wolno mu widzieć, więc
kopia zrobiona z jego listy nazwałaby się tak samo jak ukryta figura MG); `combatProfile` jest
kolumną, której klient nie dostaje w całości; a `characterId` **nie jedzie** — dwie figury na
jednej karcie to dwa paski PW nad jednym zestawem punktów. Z karty bierze się jedno: **rozmiar**
puli PW, żeby kopia figury związanej z NPC-em miała pasek tej samej wysokości. Kopia jest
**świeżą figurą**: pełne PW, bez naklejek, ran i listy „boi się". Miejsce upuszczenia jedzie
opcjonalnie (`x`, `y`) i jest życzeniem, nie rozkazem — `snapTokenPosition` przyciąga je do
kratki i zawraca w granice sceny.

**Nazwa kopii powstaje z rdzenia, nie z pełnej nazwy** — `nextTokenCopyName` w
`shared/src/tokens.ts`. Ucinana jest wyłącznie **końcowa liczba oddzielona spacją** („Ganger 2"
→ rdzeń „Ganger"), więc „MOX-7" i „Ganger 2.0" zostają w całości. Bierze **najniższą wolną**
liczbę, nie „ostatnia + 1", żeby po skasowaniu „Gangera 2" numery nie rosły w nieskończoność.
Przy limicie `TOKEN_NAME_MAX_LENGTH` przycinany jest **rdzeń**, nigdy numer: kopia bez numeru
przestałaby być rozróżnialna, a o to w tym całym chodzi.

**Operacja grupowa to pętla po zwykłych zdarzeniach figury (05.09).**
`TokenGroupBar` nie ma ani jednego własnego zdarzenia poza `combat:add` (to bierze listę od
etapu 14, bo kolejka inicjatywy jest jednym stanem i przepisanie jej sześć razy pod rząd byłoby
sześcioma przetasowaniami). Reszta — ukrycie, naklejka, kosz, kopia — jedzie po jednym
`token:update` / `token:delete` / `token:duplicate` na figurę, i **to jest cała ochrona
uprawnień**: pętla dziedziczy odpowiedzi serwera zamiast powtarzać je u siebie. Przy jednej
aktywnej sesji koszt sześciu zdarzeń zamiast jednego nie ma znaczenia (umowa o skali z
`CLAUDE.md`). Odmowy mówią **jednym zdaniem o całej paczce** („nie udało się przy 2 z 6"),
nie sześcioma o każdej figurze — inaczej jedna zerwana operacja zalewałaby czat.

**Kosz grupowy pyta zawsze, także na poligonie.** `confirmDestructive` z 23.08 dotyczy
obiektów sceny, które wracają `Ctrl+Z`; figury nie wracają — ich id noszą inicjatywa i runy
Sieci. Dlatego `Delete` figur nadal nie dotyka (odstępstwo od Foundry zostaje w mocy), a jedyna
droga do usunięcia paczki prowadzi przez guzik z pytaniem niosącym liczbę.

**Czas świata to jedna liczba: minuty od epoki uniksowej, liczone w UTC (05.09, etap 37).**
`Campaign.gameTime` jest `Int`-em, a nie `DateTime`, i cała arytmetyka w `shared/src/gametime.ts`
idzie przez `getUTC*` / `Date.UTC`. Dwa powody, oba kosztowałyby cichy błąd. Po pierwsze strefa
czasowa maszyny nie ma nic wspólnego z porą dnia w Night City — gdyby gdziekolwiek wszedł czas
lokalny, granica doby przesunęłaby się o kilka godzin między dev-em na Windows a VPS-em, a wraz
z nią „minęła doba" i klucz miesiąca. Po drugie po tekście nie da się dodać dziesięciu minut ani
porównać dwóch chwil. `new Date('2045-03-15T08:00')` (bez `Z`) przeglądarka czyta jako czas
**lokalny** — dlatego `gameTimeFromInput` składa datę ręcznie z `Date.UTC`, a nie parsowaniem.
Liczba `GAME_TIME_DEFAULT` w `shared` i `@default` kolumny **muszą być tą samą liczbą**.

**Skok zegara jedzie identyfikatorem, nie liczbą minut (05.09, etap 37).** `time:set` przyjmuje
albo `step` z katalogu `GAME_TIME_STEPS`, albo `minutes` — nigdy obu naraz. „+1 h" jest
**intencją**, a arytmetykę robi serwer (`applyGameTimeStep`), tak samo jak rzut kośćmi. Jedynym
wejściem niosącym liczbę jest ustawienie daty wprost, i to jedyna droga, którą da się zegar
cofnąć. Nowy skok = wiersz w `GAME_TIME_STEPS` (z `label`, `title` i `past` na kartę czatu)
plus gałąź w `applyGameTimeStep`; kompilator pilnuje kompletu, bo `switch` jest wyczerpujący.

**Monit rozliczenia miesiąca to różnica dwóch kluczy, nie licznik dni (05.09, etap 37).**
`settleDue` porównuje `gameMonthKey(minutes)` z `Campaign.settledMonth`, więc pierwszy dzień
miesiąca przekroczony jednym skokiem o kwartał i dwoma po dziesięć minut daje **dokładnie jeden**
monit. Stempluje wyłącznie **prawdziwe** `economy:settle` (`markMonthSettled`), nigdy podgląd.
Kampania z `settledMonth === null` monitu nie dostaje — świeży stół nie zaczyna od zaległego
czynszu — dlatego tworzenie kampanii stempluje miesiąc startowy, a kampanie sprzed etapu 37
dostały go migracją danych.

**Zegar podpowiada, nie rządzi (05.09, etap 37).** W `realtime/gametime.ts` **nie ma** ani
jednego wywołania `economy:settle`, ani jednego leczenia i żadnego tykania w tle. Serwerowy
moduł zegara nie wie, czym są PW ani eurodolce, i to jest jego reguła architektoniczna: listę
„komu doba odpoczynku coś da" składa okno zegara u klienta z kart, które i tak ma, a leczy
`character:rest`. Serwer, który sam sobie przesuwa zegar, obudziłby się po nocy z rozliczonym
miesiącem, którego nikt nie rozegrał.

**Data świata przy wpisie dziennika stempluje się przy powstaniu i nie wędruje (05.09, etap 37).**
`JournalEntry.worldDate` wypełnia **serwer** z zegara kampanii przy `create`, nigdy klient
w łacie: gdyby przychodziła w żądaniu, kronikę dałoby się przedatować. Edycja wpisu jej nie rusza
— poprawka literówki w streszczeniu sprzed miesiąca nie ma prawa przenieść tej sesji
w kalendarzu Night City. Stoi **obok** `sessionDate`, nie zamiast: jedna mówi, kiedy drużyna
grała, druga — kiedy to się działo.

**Polska liczba mnoga ma trzy formy i mieszka w rdzeniu (05.09, etap 37).** `gameDaysLabel`
i `gameDaysPassed` w `shared/src/gametime.ts`: 1 → „doba", końcówka 2–4 **poza 12–14** → „doby",
reszta → „dób". Warunek na nastolatki jest całą treścią tej funkcji — bez niego wychodzi
„13 doby". Każdy następny rzeczownik liczony w UI (godziny, tygodnie, naboje) dostaje własną
funkcję tam samo, nie ternary w komponencie.

**Rozgłoszenie, które rysuje `seq`, musi go u klienta skonsumować (05.09, poprawka).**
`deps.seqs.next(room)` na serwerze podnosi numer pokoju dla **wszystkich**, więc handler
u klienta, który go zignoruje, zostawia dziurę: następna wiadomość czatu wygląda jak luka
i cały stół idzie w zbędny `state:request`. Wzorzec jest jeden i widać go w `scene:update`:
`if (chat().applySeq(broadcast.seq)) { socket?.emit('state:request'); return; }`. Do 05.09
łamały go **cztery** zdarzenia naraz — `compendium:upsert`, `compendium:delete` (etap 13),
`shop:tier` (25c) i świeżo dopisany `time:set` (37), który wzorzec po prostu odziedziczył po
sąsiadach. Nowe rozgłoszenie z `seq` w typie zaczyna się od tych trzech linii, nie od `apply…`.

**Zegar świata pokazuje graczowi dobę i porę dnia, MG godzinę (05.09, etap 37).**
`formatGameDayTime` kontra `formatGameClock` — rozstrzygnięcie MG, i **nie jest to filtr
ani tajemnica**: minuta jedzie w `state:sync` do wszystkich, bo z godziny nikt nic nie ugra,
a trzymanie jej w ładunku znaczy, że zmiana zdania kosztuje jedną funkcję zamiast zmiany
protokołu i migracji. Powód jest inny: zegar rusza się **wyłącznie na kliknięcie MG**, a rundy
walki nie dotykają go wcale (czterdzieści rund to dwie minuty świata, których nikt nie wklepie),
więc godzina pokazana graczowi obiecuje dokładność, której nie da się dotrzymać. Etykieta
grubsza niż dryf czyta się jak działający zegar. Kartę czatu — cezurę („minęła noc") — traktuje
się tak samo i **dla wszystkich**, bo zostaje w dzienniku sesji na zawsze. Pora dnia zostaje,
bo nie jest ozdobą: nocą ulica należy do kogo innego, a ciemność jest mechaniką od 18b.

**Figura ostatystykowana MA KARTĘ POSTACI — `Token.combatProfile` nie istnieje (05.09, etap 38a).**
Umowa etapu 16b („statysta nie jest osobą, jego liczby siedzą w kolumnie JSON żetonu") została
**cofnięta** decyzją MG. Od 38a każdy ganger, funkcjonariusz Wsparcia, Demon i wieżyczka mają
prawdziwy rekord `Character` — stoją w rosterze obok Vex, otwierają się jak każda karta i mają
zwykły ekwipunek. W silniku zasad **nie ma już ani jednej gałęzi „to statysta"**: `AttackSource`
ma jedno ramię, `cpredWeaponOptions` czyta wiersze karty, obrażenia jadą przez
`applyDamageToSheet`, a rana zapisuje się przez `applyForcedFailureToSheet`. Kółko z paskiem PW
i **bez** karty nadal istnieje (rdzeń VTT sprzed CP RED) i ma własny, chudy tor: same PW, żaden
pancerz, żadne rany — bo nie ma ich gdzie zapisać.

**Trzy liczby, których karta sama by nie utrzymała, mieszkają w `statBlock` (05.09, etap 38a).**
`CpredCharacterData.statBlock` (`shared/src/systems/cpred/statblock.ts`) trzyma **Wartość bojową**
(„suma Cechy i Umiejętności", s. 158 — sięga 16, a Umiejętność karty ma sufit 10), **zakaz uniku
przed pociskami** (s. 158) i **wydrukowane PW** (C-SWAT ma 35 przy BC 4, z Cech wyszłoby 20) oraz
**poziom broni** (`weaponSkill`). `null` na karcie postaci. **To nie jest kategoria karty** — MG
odrzucił 05.09 znacznik odróżniający statystę w rosterze; to trzy liczby z podręcznika, które
nazwanemu NPC-owi wolno mieć tak samo.

**Maksimum PW karty to `cpredSheetHpMax(data)`, nigdy `hpMax(data.stats)` (05.09, etap 38a).**
Ta sama umowa co `cpredEffectiveStats` z etapu 39, w drugim obszarze: `hpMax` liczy z BC i SW
i zostaje **wyłącznie** dla kreatora, który karty jeszcze nie ma. Wszystko, co dostaje kartę,
czyta `cpredSheetHpMax` — inaczej `normalizeCharacterData` ścina funkcjonariuszowi piętnaście
punktów przy pierwszym zapisie, a próg poważnej rany wypada w złym miejscu. Stan ran karty liczy
`cpredSheetWoundState(sheet)`, nie `woundState(hp, stats)`.

**Wartość bojowa wchodzi do liczb w JEDNYM miejscu: `sheetForRoll` (05.09, etap 38a).**
`cpredSheetRollSheet(data, skillId)` zeruje Cechy i podstawia Wartość bojową (albo poziom broni
z `statBlock.weaponSkill` pod Umiejętność, której karta sama nie wymienia). Woła się je tam, gdzie
do 38a wołało się `sheetFromCombatProfile` — przy ataku, przy biernym PT Uniku i przy Teście
figury — i **nigdzie indziej**: karta _zapisana_ trzyma to, co wydrukowano, a nie to, co z tego
wychodzi w rzucie. Umiejętność **wpisana** na karcie wygrywa z poziomem broni, bo to deklaracja MG.

**Sześć pól menu żetonu pisze `token:stat`, nie `token:update` (05.09, etap 38a).**
Jedno zdarzenie zakłada kartę **i** podpina ją do figury (albo poprawia tę, którą figura ma) —
trzy kroki z trzema okazjami do zerwania zostawiłyby figurę bez karty albo kartę bez figury.
Szybkość z 16b zostaje: MG nadal wpisuje sześć liczb, a nie wypełnia karty. Projekcję w obie
strony robią `statistQuick` i `applyStatistQuick` (`statist.ts`) — i **`applyStatistQuick` nie
rusza niczego poza tymi polami**, bo ta sama figura bywa edytowana raz szybkim polem, a raz pełną
kartą.

**Karta ginie z figurą tylko na pytanie, i tylko gdy nie ma po niej kto płakać (05.09, etap 38a).**
Bez znacznika w bazie serwer nie ma po czym poznać, którą kartę skasować — więc pyta klient
(`figure-cards.ts`), a serwer sprawdza jeszcze raz dwa warunki: karta **bez właściciela** i **bez
innej figury** pod sobą. Karta gracza nie ginie nigdy, choćby klient poprosił. Ta sama reguła
rządzi klonowaniem: kopia figury MG dostaje **własną** kartę (inaczej dwa żetony dzieliłyby jedne
PW), a kopia figury gracza zostaje bez podpięcia, jak od etapu 35.

**Karta jedzie też do właściciela FIGURY, nie tylko do właściciela karty (05.09, etap 38a).**
Trzecia droga w `character-io.ts`, dopisana dlatego, że zniknął profil bojowy: gracz, któremu MG
oddał gangera, dostawał jego liczby w prywatnej części żetonu, a teraz mieszkają one na karcie.
Bez tego sterowałby figurą, której statystyk nie widzi, a podgląd rzutu liczyłby się z niczego.

**Cecha zero jest legalna na karcie, ale nie w kreatorze (05.09, etap 38a).**
`CPRED_SHEET_STAT_MIN` to 0, `CPRED_STAT_MIN` zostaje jedynką. Powód jest jeden: figura
z Wartością bojową ma **wyzerowane** REF, ZW i SW, żeby rozbicie rzutu nie doliczyło Cechy drugi
raz („Broń długa 14", bez Cechy). Walidator karty odrzucał wtedy całą mapę Cech i figura wracała
jako przeciętny człowiek po pięć — błąd znaleziony przy pierwszym uruchomieniu testów 38a.
