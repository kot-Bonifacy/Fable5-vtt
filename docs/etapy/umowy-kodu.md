# Umowy kodu (gdzie dopisuje się nową rzecz)

Wyprowadzone z „Od czego zacząć" w `POSTEP.md` 22.08.2026. Indeks jednolinijkowy został tam;
tu leżą pełne wersje. Czytaj wpis, **zanim** dołożysz coś w obszarze, którego dotyczy — każdy
z nich powstał po tym, jak ktoś dołożył to w złym miejscu.

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
