# Umowy kodu (gdzie dopisuje się nową rzecz)

Wyprowadzone z „Od czego zacząć" w `POSTEP.md` 22.08.2026. Indeks jednolinijkowy został tam;
tu leżą pełne wersje. Czytaj wpis, **zanim** dołożysz coś w obszarze, którego dotyczy — każdy
z nich powstał po tym, jak ktoś dołożył to w złym miejscu.

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

**Nowy rodzaj wiersza czatu dopisuje się w `shared/src/chat.ts` w dwóch czystych funkcjach**
(`chatCategoryOf`, `chatCompactLine`), w `toChatMessageView` po stronie serwera i w jednej gałęzi
`FullMessageRow` u klienta. Umowa jest z 01.09; 03.09 przeszedł nią rodzaj `recovery` (dzień
odpoczynku i podana dawka — jedna karta na dwie czynności, bo z miejsca stołu to jedno zdarzenie:
„komuś zrobiło się lepiej i wiadomo dlaczego"). Kto pominie te dwie funkcje, dostanie wiersz
wpadający do grupy „Stół", którego nie da się ścisnąć.

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

**Nowy rodzaj wiersza czatu dopisuje się w dwóch czystych funkcjach (01.09, trzecia sesja).**
Filtry czatu i tryb zwarty stoją na `chatCategoryOf` i `chatCompactLine` w `shared/src/chat.ts`
— obie mają wyczerpujący `switch` po `ChatKind`, więc nowy rodzaj **nie skompiluje się** bez
przydziału do grupy, ale `chatCompactLine` można przeoczyć i wtedy wiersz zostanie pełną kartą
mimo trybu zwartego. Streszczenie **czyta wyłącznie pola, które i tak są w wiadomości**: redakcja
widoczności robi się na serwerze (etap 15), więc zwarty wiersz ściska dokładnie to, co ten ekran
dostał, i nie ma jak odsłonić cudzych PW.

Trzy rzeczy, które łatwo zepsuć przy dokładaniu:

- **Filtr nie chowa pytań.** `isPending` w `ChatPanel.tsx` wyjmuje spod filtra nierozstrzygniętą
  propozycję bota i notatkę z przyciskami (16c). Nowy wiersz, który czeka na czyjeś kliknięcie,
  dopisuje się tam — inaczej schowa się pod separatorem w środku cudzej tury. Taki wiersz jest
  też zwolniony z trybu zwartego, bo zwarta linia nie ma przycisków.
- **Ukryte nie znaczy skasowane.** Odfiltrowane wiersze zwijają się w klikalny separator
  („⋯ 4 ukryte wiersze ⋯"), a nie znikają: czat jest logiem sesji. Odmianę liczebnika robi
  `hiddenLabel`.
- **Nastawienie jest lokalne.** `chatFilterStore` trzyma wybór w `localStorage` i **nigdy** nie
  jedzie zdarzeniem Socket.IO — to samo rozstrzygnięcie, co przy głośnościach z 27d. Rozwinięcie
  pojedynczego wiersza żyje tylko w stanie panelu: tryb jest nastawieniem na sesję, rozwinięcie
  — jednym zajrzeniem.

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
