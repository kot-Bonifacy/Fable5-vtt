# Umowy kodu (gdzie dopisuje się nową rzecz)

Wyprowadzone z „Od czego zacząć" w `POSTEP.md` 22.08.2026, pocięte na obszary 10.09.2026.
Czytaj sekcję swojego obszaru, **zanim** dołożysz w nim cokolwiek — każdy wpis powstał po tym,
jak ktoś dołożył coś w złym miejscu. Umowa złamana znaczy zwykle błąd, który już raz kosztował
sesję.

Sekcje w tym pliku i w `pulapki-dev.md` **nazywają się tak samo** i są w tej samej kolejności,
więc `grep -n '^## <obszar>' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md` pokazuje obie
naraz. Wskaźnik „który obszar do czego" stoi w `POSTEP.md`.

Każda sekcja zaczyna się **indeksem** (jeden wiersz = jedna umowa), pod nim leżą pełne wersje
w tej samej kolejności co dotąd. Nową umowę dopisz do sekcji jej obszaru: wiersz na górę
indeksu i pełny wpis pod spodem.

## mapa — Figury, narzędzia i obiekty sceny

- **Obwódka właściciela leży ZA obrączką PW i ma jej szerokość (03.10, #71, decyzja MG)** — od twarzy: koszulka i pasek PW (`hpRingRadius = extent/2 + koszulka + pasek/2`), potem obwódka (`ownerRingRadius(extent, hasHp)`, `ownerRingWidth(extent, hasHp)` = szerokość paska); figura bez PW — dawna kreska `RING_WIDTH` tuż przy portrecie. `furnitureRadius` to zewnętrzna krawędź obwódki, podstawka i cień liczą się dalej od brzegu portretu. Pogrubienie „prowadzę tę figurę” bierze `node.ownerRingWidth`. Kolor „czyja figura” jest najdalej od twarzy, bo przy stole wróg i sojusznik mieli tę samą zieloną obrączkę; pojęcia „wróg/sojusznik” VTT nie ma (MG odrzucił je jako osobny etap).
- **Grot strzelca idzie za celownikiem i widzi go cały stół (03.10, druga decyzja MG tego dnia)** — `MapRenderer.turnShooterToAim` przy każdej zmianie `aimTokenId` obraca `showFacing` zaznaczonej figury na środek celu i zgłasza kąt przez `onAimFacing` (`null` = zejście celownika; także `destroy` i `dropAim` przy zmianie tury). `MapArea` podpina to pod `reportTokenAim` (`socket.ts`): ulotny `token:aim`, **najwyżej jeden na `TOKEN_AIM_INTERVAL_MS` (1 s)** — pierwsza zmiana od razu, reszta zbiera się w jedną wysyłkę na końcu okna, liczy się ostatni stan. Serwer (`realtime/aim.ts`) nie zapisuje kąta: rozsyła go tym, którzy **widzą figurę** (`concealmentFor`/`concealedFrom` per gniazdo, ukryta tylko MG, kontrolerzy zawsze), pamięta widownię w `liveAims` i do niej wysyła zdjęcie (`facing: null`) — przy nowym celu gniazda, przy `null` i przy rozłączeniu (`releaseSocketAim` w `disconnect`). Odbiór: `map-aim.ts` → `MapRenderer.showRemoteAim`, który ustępuje własnemu ruchowi figury (marsz, przeciąganie, gałka, własny celownik). Kierunek **zapisuje** dalej tylko strzał (`turnTokenToward`, 27j). Testy: `tokens.test.ts` › „sends the aim…”, „keeps the aim of a hidden figure…”, „takes the aim down…”.
- **Obraz mapy trzyma się strony, gdy przesuwa się jej krawędź (03.10, #70)** — `MapRenderer.holdViewOnPage` po każdym `resize` przesuwa kamerę o tyle, o ile przesunął się lewy górny róg gospodarza (`cornerOf(host)`): pas inicjatywy z góry i zwijany lewy panel tylko zasłaniają albo odsłaniają pas mapy, nic nie jedzie. Pierwsza własna figura gracza, która przyszła po czasie (`CAMERA_REANCHOR_MS`), dostaje kadr, chyba że już stoi dobrze w widoku (`showsWell`, 20 % zapasu).
- **Legenda śladów stóp to linijka nad mapą, nie podpis na trasie (03.10, #69)** — `MapRenderer.onWalkPreview(tokenId | null)` mówi, czyją trasę rysuje `drawWalkPreview` (wynik w `finally`, bo podgląd ma kilka wyjść); `MapArea` pokazuje graczowi `map-placement-hint`, dopóki ta przeglądarka nie zobaczy pierwszego marszu (`vtt.walkPreviewLearned` w `localStorage`). Na samej trasie dalej nic (decyzja MG z 23.08).
- **Warstwy zasłon są grupami renderowania — `fogLayer.isRenderGroup` i `visionLayer.isRenderGroup` (03.10, #53)** — przekształcenie kamery liczy dla nich GPU, nie batcher; bez tego czworokąt sprite'a zasłony na płótnie z MSAA miał szew na przekątnej i przepuszczał mapę. Nowa nieprzezroczysta zasłona na całą scenę (sprite z teksturą renderowaną, np. przyszła warstwa poziomu) idzie do jednej z tych warstw albo dostaje własną grupę renderowania. Pilnuje `t8a-szew-zaslony` (`@szybkie`, oba silniki).
- **Figura łapie klik wyłącznie na swoich polach — `TokenNode.hitArea` (02.10, #52)** — prostokąt `size × kratka` od rogu figury, ustawiany w `update`. Pixi przycina nim też dzieci (`hitPruneFn`), więc podpis (pole niżej), cień i podstawka (wystają pod figurę) ani obrączka PW (na boki) nie zabierają kliku w środek sąsiedniego pola. Nowa ozdoba żetonu może wystawać poza kratkę bez własnego `eventMode = 'none'` — klikalna jest tylko na polach figury. Uchwyt, który ma działać poza figurą (jak grot), idzie przez nakładkę `MapRenderer`, nie przez dziecko żetonu.
- **Węzeł Pixi zdejmuje się z poddrzewem przez `destroy(DESTROY_TREE)` (02.10, #50)** — `map/pixi-destroy.ts`: `{ children: true, context: true }`, także `app.destroy(true, DESTROY_TREE)`. Samo `{ children: true }` zostawia `GraphicsContext` każdej grafiki-dziecka w rendererze razem z buforami WebGL (pułapka w `mapa`). W kliencie żaden `GraphicsContext` nie jest współdzielony między grafikami — kto wprowadzi wspólny kontekst, musi zmienić tę umowę, inaczej `context: true` zniszczy go pod innymi grafikami. Po zdjęciu starej sceny `setScene` woła `releasePooledGraphicsData()` (ten sam plik) — niszczy wolne `GraphicsContextRenderData` z `BigPool`, inaczej ich bufory rosną do największej grafiki, jaka je kiedykolwiek wzięła. Nowe miejsce, które hurtem zdejmuje duże grafiki (np. przyszły podział mapy na poziomy), woła je tak samo. Próg pilnuje `t7c-pamiec` (`SWITCH_LEAK_MB`).
- **Pozycję znanej figury zmienia `token:move`, nie `token:upsert` (01.10, #47)** — klient (`useTokenStore.upsert`) bierze z upsertu znanej figury wszystko poza `x`/`y`; pozycję przyjmuje tylko z `TokenUpsertBroadcast.moved` (dziś: Pochwycony ciągnięty za napastnikiem, `emitTokensById(…, { moved: true })`). Upsert po zapisie karty niesie pozycję z bazy, a w czasie marszu baza ma jeszcze pole startowe — każdy autozapis cofał figurę u całego stołu. Nowa ścieżka serwera, która **przesuwa** figurę upsertem, przekazuje `{ moved: true }` do `emitTokenUpsert`/`emitTokensById`; inaczej klienci, którzy figurę już mają, zostawią ją w starym miejscu. Lista `token:sync` (scena Dynamiczna, ściany zasłaniające figury) bierze z listy skład i pola figur, ale **nie** pozycję figury w marszu: `socket.ts` zgłasza każdą klatkę `noteMoveFrame(id, final)`, a `applyTokens` trzyma `x`/`y` figury, która dostała klatkę pośrednią w ostatnich `WALK_FRAME_HOLD_MS` (3 s) i nie dostała końcowej. `state:sync` dalej podmienia wszystko. **Od 03.10 (reszta #47)** `applyTokens` trzyma też pozycję figury przez `WALK_LANDED_HOLD_MS` (2 s) po jej lądowaniu (`holdsPosition`): lista zbudowana przed zapisem końcowej pozycji, a wysłana po klatce końcowej, nie cofa figury na start.
- **Chwyt grota zaczyna obrót dopiero za progiem kliknięcia (29.09, #36)** — `rotating.moved` w `MapRenderer`: `onRotateMove` czeka, aż ręka ruszy się o `viewport.threshold`; puszczenie w miejscu nie wysyła `token:facing` ani nie stawia `dragEndedAt`, a `clicked` zwalnia chwyt i idzie jak zwykły klik (marsz). Nowy uchwyt, którego strefa chwytu sięga poza figurę, trzyma tę samą zasadę. Aureola tury (`turnRing`) ma `eventMode = 'none'` jak grot (#25) — wypełniony krążek sięgał środka sąsiedniego pola i w turze figury klik tam był klikiem w nią.
- **Klamki drzwi i bram gracza na scenie bez widzenia Dynamicznego daje `standingOpeningsFor` (27.09, #30)** — `realtime/blockers.ts`, obok `standingBlockersFor`: flaga `playerToggle`, na ręcznej mgle tylko otwory ze środkiem na odsłoniętym (`isPointRevealed`), na mapie otwartej wszystkie. Jedzie w `state:sync` (`openings`) i w `emitBlockersToPlayers` (`opening:sync` razem z `blocker:sync`). Każdy widok otworu dla gracza przechodzi przez `playerOpeningView` (`vision.ts`) — nowe pole tajne MG na ścianie wycina się tam.
- **Odmowa „mgła” i „przeszkoda” wraca do klienta własnym kodem (27.09, #29)** — `refuseWalkIntoFog` rzuca `MOVE_INTO_FOG`, `refuseWalkThroughSolid` — `MOVE_BLOCKED_BY_TERRAIN`, w walce i poza nią; karta odmowy (tylko w walce) dalej niesie zdanie. `MOVE_REFUSED` zostaje odmowom tury i stanu, gdzie karta jest zawsze. Nowa odmowa z kroku 3 `validateTokenMove` dostaje własny kod i zdanie w `moveErrorText` (`MapArea.tsx`) i w `REFUSAL_TEXTS` botów.
- **Grot kierunku nie łapie kliknięć (27.09, #25)** — `TokenNode.nose.eventMode = 'none'`; obrót chwyta wyłącznie `grabFacingKnob` przy zaznaczonej figurze. Każde dziecko żetonu wystające na sąsiednie pole potrzebuje `eventMode = 'none'`, inaczej Pixi oddaje mu klik w sąsiada. Od 02.10 (#52) załatwia to dla całego żetonu `hitArea` — grot i aureola zostają przy `'none'` z ostrożności.
- **Ile figurze zostało PW, widzi cały stół — przez `TokenView.hpShare` (26.09, etap 43a, decyzja MG)** — widz bez prawa do `hp` dostaje od `toTokenView` ułamek i szczebel (`tokenHpShareOf`), nigdy liczby; `null` = figura bez PW (klient scala widoki spreadem). Nowe miejsce, które rysuje rany figury, czyta `tokenHpShare(token)` (pełne PW, a bez nich ułamek), nie `token.hp` — tak robią obrączka na mapie i portrety zakładki „Walka”. Publiczne rozgłoszenie żetonu musi dostać kartę (`toTokenView(token, false, linked)`), inaczej figura z kartą nie ma skąd wziąć ułamka. Figury ukryte i pod mgłą dalej nie jadą wcale.
- **Grot kierunku jest uchwytem obrotu; żeton z panelu przeciąga się na mapę (26.09)** — kształt grotu ma jedno źródło: `nosePolygon` / `noseLength` w `map/token-ring.ts` (figura i nakładka). Nowe źródło przeciągania żetonu woła `startTokenDrag(event, TokenPlacement)` z `map/token-drag.ts`; mapa przyjmuje tylko typ `TOKEN_DRAG_MIME` i stawia przez to samo `createPlacedToken` co klik.
- **Figury gracza leżą nad cudzymi (25.09)** — `tokenLayer` z `sortableChildren`, `node.zIndex = 1` dla figury, którą widz prowadzi, gdy nie jest MG. Stos na jednej kratce jest dozwolony, a Pixi oddaje klik figurze z wierzchu; u MG kolejność zostaje kolejnością wstawiania. Nowa warstwa w `tokenLayer` musi pamiętać o `zIndex`.
- **Siatka wyłącznie dla MG (20.09)** — `MapRenderer.drawGrid` wymaga `viewerIsGm`; `setTokens` przerysowuje ją przy zmianie roli. `scene.grid.visible` steruje tylko widokiem MG, gracz nigdy nie widzi nakładki siatki (także przy kontraście edytora i na mapie powitalnej). Kratkę CSS poza mapą nadal usuwa `map-area--plain`. Geometria ruchu i pomiary zachowują parametry siatki.
- **Siatka nie wystaje poza mapę u gracza (18.09)** — linie siatki liczy `gridLinePositions` w `map/grid-style.ts` i **pomija te na brzegu mapy** (tolerancja `GRID_EDGE_TOLERANCE_PX`); `drawGrid` tylko je rysuje. Kratka stołu w tle `.map-area` gaśnie u gracza klasą `map-area--plain` (dawne `map-area--welcome`, teraz dla każdej sceny gracza); MG ją zachowuje.
- **Pod ręczną mgłą gracz chodzi tylko po odsłoniętym (14.09)** — jedno pytanie dla planera i serwera: `fogFloorPassable` (`shared/fog.ts`: odsłonięte albo pola, na których figura stoi) sprawdzane przez `firstClosedFloorStep` (`shared/pathfinding.ts`, próbka `everyRunCell` — ta sama co wygładzanie). Serwer: `refuseWalkIntoFog` **przed** `refuseWalkThroughSolid`. Klient: `walkFloorFor` → `'revealed'` i `setWalkPassable(passable, canStep, enforcedFloor)`; `enforcedFloor` pilnuje lądowań w `clipToBudget` i `marchLanding` i podaje się go **tylko** tam, gdzie serwer sam egzekwuje podłogę.

**Grot kierunku jest uchwytem obrotu; żeton z panelu przeciąga się na mapę (zlecenie MG, 26.09).**
Uchwyt obrotu zaznaczonej figury to od 26.09 **sam grot**: zniknął biały patyk od środka figury
do kropki (przecinał portret) i sama kropka (MG: „niepotrzebna”). Punkt chwytu liczy
`facingKnob` w połowie grotu, a strefa chwytu (`reach`, co najmniej 10 px ekranu) przy oddaleniu
wystaje **na zewnątrz**, nigdy w głąb figury — inaczej zabierałaby przeciąganie figury za brzeg.
Figura bez kierunku pokazuje po zaznaczeniu blady, pusty zarys grotu u góry (`drawSelectionRing`).
Grot jest większy niż w 27j (0,3 kratki długości, 0,4 rozpiętości) i ma wcięcie; jego wierzchołki
daje `nosePolygon`, a pilnuje ich `token-ring.test.ts` (cały grot za oprawą figury). Przeciąganie
z panelu: `startTokenDrag` (kafel biblioteki, „Postaw pusty”, wiersz postaci i „⊕” — wszystko
tylko u MG) → `onDragOver`/`onDrop` na `.map-area` → `MapRenderer.clientToWorld` +
`showDropGhost` (żółty obrys pola lądowania) → `createPlacedToken`. Przesuwanie figur graczy przez
MG było już wcześniej (`movable = isGm || właściciel`, serwer MG nie ogranicza).

**Siatka nie wystaje poza mapę u gracza (zlecenie MG, 18.09).** Na zrzucie widać było dwie rzeczy: kratkowany margines stołu za krawędzią mapy i linię siatki leżącą dokładnie na brzegu obrazu (przy `offset = 0` i gdy kratka dzieli mapę równo, np. 40 × 36,2 = 1448) — ta linia nie oddziela pól, tylko robi za ramkę. `gridLinePositions(offset, size, extent)` oddaje pozycje linii wzdłuż osi bez tych bliżej brzegu niż `GRID_EDGE_TOLERANCE_PX` (1 px świata, co zbiera też ułamki z sumowania kratki). Kamera gracza i tak nie wyjeżdża poza mapę (`coverZoom`, 11.09), ale tło `.map-area` u gracza dostaje `map-area--plain` (sam ciemny stół) na każdej scenie, nie tylko pod mapą powitalną — gdyby kadr kiedyś wyszedł poza mapę, kratki stołu nie zobaczy. MG zachowuje kratkę stołu (robocza) i linie liczone tą samą funkcją.

**Pod ręczną mgłą gracz chodzi tylko po odsłoniętym (14.09, decyzja MG z 13.09, serwer — decyzja
z 14.09).** Poza Dynamiczną planer uznawał każde pole za chodzące, więc trasa do celu za odsłoniętym
kawałkiem bariery schodziła w czerń. Teraz na scenie `fog` gracz planuje i chodzi wyłącznie po
odsłoniętej podłodze, a pola, na których zaznaczona figura stoi, są zwolnione — figura postawiona
przez MG w czerni wychodzi na odsłonięte i nie wchodzi głębiej. **Kolejność na serwerze jest
treścią umowy:** sprawdzenie ścian odmawia tylko tam, gdzie coś stoi, więc samo zdradzało ścianę
w czerni jedną odmową na klik; mgła pytana pierwsza odmawia każdego kroku w czerń tak samo
(`MOVE_INTO_FOG` na karcie MG od rundy 1). Serwer i klient pytają **tę samą próbkę co pół
kratki**, więc trasa narysowana przez planer nie wraca odmowy. `enforcedFloor` nie jest ustawiany
w Dynamicznej: serwer nie sprawdza tam pola widzenia, a widok, który przesunął się za maszerującą
figurą, cofałby każde przerwane lądowanie. Klient bierze pola stojącej figury z `useTokenStore`
w chwili pytania (domknięcie żyje dłużej niż zaznaczenie), a pamięć odpowiedzi mgły — z domknięcia,
które powstaje na nowo przy każdej zmianie `fog`. Subskrypcja `useFogStore` porównuje `fog`, nie
cały stan: podgląd pędzla MG zmienia magazyn na każdy ruch kursora.

- **Lądowanie przerwanego marszu (13.09)** — `MapRenderer.marchLanding`. Przerwanie „ktoś w polu widzenia” (oba wywołania w `MapArea`) woła `interruptWalk(note, 'ahead')` i ląduje na polu, w które figura wchodziła (`marchStopPoint` w `map/march-landing.ts`), o ile krok do niego przechodzi `walkCanStep`; ręka, obrażenia i zmiana tury zostają przy `'nearest'`.

**Przerwany marsz nie cofa figury za róg (13.09, piąta sesja, oględziny 42c).** Do tej pory każde
przerwanie lądowało na `snapTokenPosition` bieżącej pozycji (`Math.round`). Figura, która w połowie
kroku wychyliła się za koniec bariery albo róg ściany i kogoś zobaczyła, wracała na pole, z którego
nikogo nie widać: serwer zabierał przybysza, a każdy następny marsz z tego pola przerywał się w tym
samym miejscu. Teraz przerwanie z powodu widzenia bierze punkt pół kratki dalej **wzdłuż odcinka
trasy** i dopiero go zaokrąga. Nie oś po osi: trasy są wygładzone, a osobne przesunięcie osi przy
odcinku mijającym koniec ściany dawało pole po drugiej stronie tego końca i odmowę serwera (złapane
podsłuchem `token:move`). Krok od ostatniego całego punktu trasy do lądowania musi przejść
`walkCanStep` — ta sama straż co w `clipToBudget` — inaczej zostaje zwykłe zaokrąglenie; budżet
tury nadal może cofnąć lądowanie. Nowy powód przerwania, który dotyczy **widzenia**, podaje
`'ahead'`; każdy inny zostaje przy domyślnym `'nearest'`.

- **Planer trasy gracza (13.09)** — gdzie wolno postawić krok, rozstrzyga `confinesWalkToSight(visibility, hasVision)` (`map/walk-sight.ts`); przeszkody niesie `blocker:sync`: w Dynamicznej `visibleWalkBlockersFor`, poza nią `movementSegments` przycięte do odsłoniętej mgły przez `revealedStretches`. `hasVision` znaczy „przyszedł widok”, nie „scena jest Dynamiczna”.

**Planer gracza zna ściany na każdej scenie (13.09, zaległość z 42a, decyzja MG).** Poza
Dynamiczną `standingBlockersFor` wysyła wszystko, co zatrzymuje ciało: na scenie otwartej całe
odcinki, pod ręczną mgłą tylko kawałki na odsłoniętej podłodze (`revealedStretches`: kawałek to pół
kratki, najwyżej `WALL_STRETCH_MAX` na odcinek, nawis poza odsłonięcie mniejszy niż kawałek). Nadal
gołe odcinki bez rodzaju i id. Listę odświeżają `afterWallChange` (ściany i otwory),
`afterFogChange` (pociągnięcie mgły, zmiana trybu) i pełna synchronizacja — w `sync.ts` o źródle
listy decyduje **tryb sceny**, nie obecność `vision`, bo od 42c widok przychodzi w każdym trybie.
Koszt liczony raz na zmianę: ~30 ms przy 400 ścianach i 300 pociągnięciach, ~300 ms przy 2000
ścian i 1000 pociągnięć. Skutek przycięcia: bariera odsłonięta kawałkiem jest dla planera tylko tym
kawałkiem, więc trasa może zejść w mgłę i przejść przez resztę — odmawia dopiero serwer.

- **Zasłona figur (42c)** — `figureBarriers` → `figurePolygonsOf` → `ViewerSight.figurePolygons` / `vision:sync`. Tę samą maskę czyta `concealedFrom` i przygaszenie renderera; `null` wyłącza zasłonę, `[]` znaczy brak widoku. Poza Dynamiczną nie wysyłaj `sight.polygons` (niosą zwykłe ściany). Efekty fizycznych figur filtrują zasłonę, wybuch/chmura/strefa pytają wyłącznie o mapę.

**Bariera zasłaniająca figury (13.09, etap 42c).** `Wall.hidesFigures` i `concealPenalty`
dotyczą wyłącznie bariery oraz zamkniętej bramy. `figureBarriers` wybiera przeszkody bez wyjątku
bliskiej szyby. `figurePolygonsOf` liczy drugi zestaw wielokątów: w Dynamicznej z przeszkodami
widoku mapy, w pozostałych trybach tylko z barierami i brzegiem sceny, bez limitu zasięgu.
Gracz bez źródła wzroku poza Dynamiczną dostaje `null`, a w Dynamicznej pustą listę.
Przygaszenie korzysta z `DIM_COVER_ALPHA`; mgła i ciemność nadal mogą całkiem zakryć mapę.

Każda droga emitująca figurę musi pytać tę maskę: pełny stan, aktualizacja, przeciąganie,
usunięcie źródła wzroku. `fetchSceneTokensFor` przyjmuje `liveOverride`, aby maska i lista figur
w połowie przeciągania opisywały tę samą pozycję. `tokenSightFor` daje maskę botowi;
oględziny dziedziczą `concealedFrom`, marsz MG używa `figureBarriers` w lokalnym raycaście.
`trimMapFxForViewer` ma osobne pytania o figurę i mapę; poświata noszonej lampy nie może oznaczać
pozycji schowanego właściciela. Pola bariery są zerowane w otworach wysyłanych graczowi.

- **Pancerz bariery** — `WallView.armor`: liczba tylko dla `barrier`/`gate` (retyp na cokolwiek innego zeruje ją w `wall:update`, a `toWallView` nie przepuszcza jej z żadnego innego wiersza). Sumuje ją **wyłącznie** `barrierArmorAlong` (odcinki stykające się w punkcie przecięcia liczą się raz); do gracza nie jedzie nigdy — zerują ją `visibleOpeningsFor` i ack `opening:toggle`. Rdzeń nie wie, że to OB.
- **Nowy rodzaj ściany** — `WALL_KINDS` w `shared/walls.ts` i **dwa** przełączniki: `wallBlocksSight` i `wallBlocksMovement` (`switch`, kompilator pilnuje kompletu); do tego `isOpening`/`isBarrier`, `WALL_COLORS` i `OPENING_GLYPHS` (renderer), `KIND_LABELS`/`KIND_HINTS` (karta segmentu), `WALL_TITLES` (`SceneObjectCard`), przycisk w `MapTools` i zdania w `OPENING_REFUSALS`. Co gracz ma omijać, liczą `walkOnlyWallsFor` (Dynamiczna) i `movementSegments` + `revealedStretches` (pozostałe tryby) → `blocker:sync` — nie nowa gałąź w planerze.
- **Kontrastowa siatka przy edycji sceny** — `sceneStore.gridContrast` (włącza `SceneEditor`, gasi jego zamknięcie; nigdy po sieci) → `MapRenderer.setGridContrast`. Jak siatka wygląda, rozstrzyga wyłącznie `gridStrokes` w `map/grid-style.ts`; obwódka liczy się w pikselach ekranu, więc `refreshOverlays` przerysowuje siatkę przy zoomie, póki tryb trwa.
- **Kratka ze skali mapy** — `gridSizeForColumns` / `gridCellsAlong` w `shared/scenes.ts`; liczy się z **kolumn** i z **szerokości obrazu tła**, wiersze tylko podpowiada. Czytają ją pole „Kratek w poziomie" (`GridColumnsField`) i mapa powitalna. Kratka bywa ułamkiem, więc żadne pole liczbowe siatki nie ma `step={1}`.
- **Ślad przebytej drogi to odciski butów, nie kreska** — `MapRenderer.drawWalkedTrail` (jedna droga dla marszu, ciągnięcia i poświaty), kolory `TRAIL_COLOR` / `TRAIL_COLOR_OVER`, granicę czerwieni liczy `trailOverFrom` w metrach **gruntu**. Trzy pule `FootprintPool` i żadna nie pożycza sprite'ów sąsiadce: trasa, ziemia pod figurą, poświata. Zapasowa kreska zostaje tylko na wypadek niewczytanego glifu. **Gdzie stoi który but, liczy wyłącznie `placeFootprints` (`map/footprints.ts`, 26.09)**: chód idzie po wygładzonej kopii trasy (zakręt łukiem na `FOOTPRINT_TURN_RATIO` szerokości żetonu), a odstępy i pasy kolorów po trasie prawdziwej — nie wracaj do kierunku i boku branych z odcinka. Marsz podaje całą trasę i `untilPx` (ile już przeszedł), żeby odcisk za rogiem nie pełzał. **Poświata gaśnie od najstarszego odcisku** (`trailFadeStrength`, `TRAIL_HOLD`, `TRAIL_FADE_EDGE`), nie całą trasą naraz.
- **„Prowadzę tę figurę" mówi pogrubiona obwódka właściciela**, nie osobny okrąg — `drawSelectionRing` rysuje ją na nakładce, promieniem `node.ownerRingRadius` i kolorem `node.ownerRingTint`, z sufitem grubości liczonym z kratki. Uchwyt obrotu wisi dalej na `outerRadius + 22k` i nie potrzebuje okręgu pod sobą.
- **Okienko w mgle wokół własnej figury** — `fogPeepRadius` w `map/token-ring.ts` (wielkość), `MapRenderer.drawFogPeepholes` (rysunek, ostatni przebieg kompozytu) i `refreshFogPeepholes` (trzy wejścia: `setTokens`, przeciąganie, krok marszu). Brzeg gaśnie gradientem z kanwy, nie pierścieniami.
- **Kadr portretu na mapie** — trzy liczby przy wierszu `PortraitAsset`, rachunek w `shared/portrait-crop.ts`, `TokenNode.fitImage` tylko go stosuje. Kadr jest cechą **obrazka**, pytany adresem pliku (`ctx.portraitCrops`), i musi być w podpisie figury, inaczej przestawienie go nie przerysuje żetonu.
  Kadr wolno wywieźć **poza obraz** — pustkę zamalowuje krążek tła (`PORTRAIT_BACKDROP`), rysowany zawsze.
- **Drabinka paska PW** — `tokenHpRung` w `shared/figures.ts`, jedna dla mapy i dla panelu postaci (cztery szczeble: `healthy`, `light`, `serious`, `mortal`). Kolory obrączki to nocne `--ok` / `--hurt-light` / `--warn` / `--err` przepisane do `HP_RUNG_COLORS`; rdzeń dalej nie woła `woundStateFromHp`, zgodności pilnują dwa testy.
- **Oprawa żetonu (obwódka właściciela, obrączka PW, aureola tury, klin kierunku, podpis)** — promienie liczy `map/token-ring.ts`, nie `TokenNode`. **Portret zajmuje całą kratkę** (`portraitRadius = extent / 2`), a obwódka właściciela i obrączka PW leżą **poza** nim; `furnitureRadius` jest jedyną odpowiedzią na „dokąd sięga figura", więc wszystko, co się o brzeg opiera, czyta tę funkcję.
- **Rozmiar płótna mapy** — `MapRenderer.watchHostSize` (`ResizeObserver` → `app.queueResize`). `resizeTo` Pixi słucha **wyłącznie** `window.resize`, więc każdy nowy pasek zmieniający szerokość mapy bez ruszania oknem jedzie tędy i nie potrzebuje niczego własnego.
- **Kamera mapy** — reguły w `map/camera.ts` (`coverZoom`, `startCamera`, `partyStart`, stałe zoomu), nie w rendererze. Gracz ma kamerę **zamkniętą w mapie** (`setCameraLocked`), MG wolną; kadr startowy to `frameAround`, osobno od `fitScene`.
- **Miejsce startu graczy** — `Scene.spawnX/spawnY` → `SceneView.spawn` → `ScenePatch.spawn` (`null` kasuje) → `SCENE_COLUMNS` w `archive.ts`. Stawia je narzędzie mapy `spawn` (klawisz `G`, MG), chorągiewkę rysuje `setSpawn` **tylko MG**, a czyta ją kamera gracza bez figury.
- **Tło powitalne gracza** — `map/welcome-map.ts` jedzie **wyłącznie** do `MapRenderer.setScene`; `sceneStore` dalej trzyma `null`, więc żadne narzędzie, żadne zdarzenie i żaden zapis go nie widzą. Nowa droga „pokaż coś bez sceny" idzie tędy, a nie przez atrapę w store.
- **Klient nie zna `characterId` cudzej figury** — łup adresuje `fromTokenId`, listę źródeł buduje serwer (`inventory:sources`), a lista celów to same nazwy **drużyny** (od 30.09, #40 — `teamCardsWhere`), jak `payees` z 23b.
- **Dane przy naklejce żetonu** — `Token.statusData` trzyma `{ damage?, timer?, feared?, disabled? }`; `disabled` to **nazwy** cyborgizacji zdjętych Impulsem. Kasowanie jest wspólne (`writeSheetStatusTimer(…, null)`), więc każda ścieżka zdejmująca status musi je zawołać — „Cofnij" tego nie robiło.
- **Leżąca figura** — `CONDITION_TILT_DEG` w `TokenNode.ts`, 35° dla `down` i `dead`; obraca się **wyłącznie** portret (`image`, `initial`), a kąt dobiera się w przeglądarce przy zoomie stołu, nie w edytorze.
- **Nazwa figury dla graczy** — `Token.publicName` (null = prawdziwa, tekst = alias, `''` = bez etykiety); podmiana per widz w `toTokenView` i `filterCombatForPlayer`, a karty czatu od 13.09 piszą alias **u wszystkich** przez `tokenTableName` (umowa w `czat`). Nowa ścieżka do gracza filtruje nazwę u siebie.
- **Nowe narzędzie mapy** — dwa gettery `MapRenderer`: `toolSpentThisClick` i `mapToolArmed`. Pominięcie = klik płacony dwa razy (błąd #8 z 08.08); pilnuje `map-click.test.ts`.
- **Skrót klawiszowy** — `MAP_TOOL_KEYS` w `packages/client/src/shortcuts.ts` czyta i `MapArea`, i okno pomocy; pilnuje `shortcuts.test.ts`. Numery kroków liczy `shortcutGroupsFor`, nie treść wiersza.
- **Kierunek patrzenia** — `Token.facing` to stan serwera i publiczna część żetonu (`token:facing`); czytelność, nie mechanika — żadna reguła CP RED tego nie czyta.
- **Efekt mapy** — przycinany na serwerze per gniazdo (`trimMapFxForViewer` w `shared/src/fx.ts`), nie w `MapFxLayer`.
- **Stan figury na żetonie** — ✕ tylko dla `dead`, reszta mówi ikoną; `fallbackConditionStatusId` dokłada naklejkę, gdy stan wynika z samych PW.
- **Nowy rodzaj obiektu na mapie** — `SCENE_OBJECT_KINDS` w `shared/scene-objects.ts`; ta jedna lista trzyma `pickSceneObject`, `armedLayerKind`, `deleteSceneObject` (`switch`, więc kompilator pilnuje kompletu) i `restoreRows`. Kolejność wpisów = kolejność od wierzchu.
- **Kasowanie ze sceny** — `deleteSceneObject` w `MapArea` to jedyna droga; każda ścieżka sprawdza `ack` i mówi zdaniem. Cofanie odkłada `rememberDeletion` **przed** `delete`, całym wierszem; kosz hurtowy to jedna pozycja.
- **Ściana pod klikiem** — końcówka (`wallEndpointNear`, ≤ 12 px) rysuje łańcuch, środek zaznacza; trwający łańcuch wygrywa z obydwoma, tryby `lock`/`share` nie zaznaczają nic.
- **Podpowiedź nad mapą** — kolor pisma to `--map-ink`, nie `--text`: `--map-panel` jest ciemny w obu motywach, więc `--text` daje w dzień czarne na czarnym.
- **Nowa karta obiektu sceny** — gałąź w `findSceneObject` (`SceneObjectCard.tsx`, `switch`, więc kompilator pilnuje kompletu), ikona **ta sama, co narzędzie na pasku**, i gałąź w `moveSceneObject` w `MapArea`, jeśli obiekt da się przesunąć. Karta nie kasuje sama — `onDelete` prowadzi do `deleteSceneObject`.
- **`Esc` w karcie** — obsługiwany przez `onKeyDown` samej karty, bo globalna drabina odrzuca każdy klawisz naciśnięty w polu tekstowym, a karta notatki sama ustawia tam kursor.
- **Uchwyty obiektu** — geometria w `shared/scene-handles.ts` (trzy kształty na siedem rodzajów); renderer woła `onSceneTransform(ref, shape)` i **nie wysyła nic sam**. Róg wygrywa z wnętrzem; przyciąganie domyślne, `Ctrl` je wyłącza.
- **Nowa próbka dźwiękowa mapy** — cztery miejsca naraz: plik w `public/sfx/`, `MAP_FX_SOUNDS` w `shared/fx.ts`, `SFX_FILES` + `SFX_GAIN` i wiersz w `ATTRIBUTION.md` (odsłuch w ustawieniach usunięty 24.09). Którą broń co gra, rozstrzyga wyłącznie `ICON_FX`; kompletu pilnuje `sfx.test.ts`.
- **Nowy tryb kliknięcia w mapę** — do `mapToolStore`, obok `tool` i `tokenPlacement`: jedno pole na tryb, więc dwóch mieć się nie da. Pilnuje `map-mode.test.ts`.
- **Żeton postaci z UI** — przez `TokenPlacement.characterId` (+ `ownerId` z karty); bez tego powstaje pusty krążek o tej samej nazwie, nie figura postaci.
- **Klik w cudzą figurę** — `onTokenPreview` → `selectionStore.focus`: pasek ją opisuje, nikt nią nie steruje.
- **Zaznaczenie figur ma dwa wskaźniki** — `selectionStore.groupIds` obok `tokenId`; prywatne jak reszta, **nigdy po sieci**, i trzyma wyłącznie figury sterowalne przez tego widza (filtruje renderer, bo ma `movableTokens`). `select(null)` grupy **nie rusza** — leci przy każdym zakończonym marszu.
- **Bramka „figury albo sceneria" (27k) ma teraz dwa wejścia** — `sceneSelectionStore.select` woła `select(null)` **i** `clearGroup()`, a subskrypcja w drugą stronę reaguje i na `tokenId`, i na `groupIds`. Bez obu połówek `Delete` miałby pod ręką ścianę i sześć figur naraz.
- **Kotwicę grupy wybiera store, mapa wyrównuje się `syncSteering`** — nie `setSelection`, bo tamto odsyła `onSelectionChange` → `select(anchor)` → a ten zeruje grupę, czyli ramka kasowałaby sama siebie.
- **Ping to gest, nie stan** — `map:ping` zbudowany na `ruler.ts` (bez `seq`, bez zapisu, bez powtórki, `socket.to` pomija nadawcę), u klienta moduł `map-ping.ts`, nie store. `pull` przyznaje **wyłącznie serwer i wyłącznie MG**; prośba gracza ścina się do zwykłego pingu, nie do odmowy.
- **Kopia figury to zdarzenie serwera** (`token:duplicate`) — numeracja liczy się z **całej** sceny, `combatProfile` jedzie z oryginałem, `characterId` **nie**. Z karty bierze się sam **rozmiar** puli PW. Kopia jest świeża: pełne PW, bez naklejek, ran i listy „boi się"; `x`/`y` to życzenie, które i tak przechodzi przez `snapTokenPosition`.
- **Nazwa kopii powstaje z rdzenia, nie z pełnej nazwy** — `nextTokenCopyName`; ucina wyłącznie **końcową liczbę po spacji**, bierze **najniższą wolną**, a przy limicie długości przycina **rdzeń**, nigdy numer.
- **Operacja grupowa to pętla po zwykłych zdarzeniach figury** (wyjątek: `combat:add` bierze listę od 14) — pętla dziedziczy uprawnienia serwera zamiast powtarzać je u siebie; odmowa mówi **jednym zdaniem o całej paczce**.
- **Kosz figur pyta zawsze, także na poligonie** — `Ctrl+Z` cofa scenerię, nie figury; dlatego `Delete` figur nie dotyka i jedyna droga to guzik z pytaniem niosącym liczbę.

---

**Pancerz bariery to liczba rdzenia, której rdzeń nie rozumie (13.09, etap 42b).** `Wall.armor`
stoi przy ścianie jak `locked`: rdzeń ją przechowuje, waliduje (`sanitizeWallArmor`,
`WALL_ARMOR_MAX`) i **dodaje** to, co przetnie prosta (`barrierArmorAlong`) — a co ta suma robi
z obrażeniami, wie dopiero CP RED. Liczy się tylko bariera i **zamknięta** brama: ściana i zamknięte
drzwi odmawiają strzału w całości, okno nie ma OB (s. 180), otwarta brama jest dziurą. Dwie pułapki
geometrii rozstrzygnięte w tej jednej funkcji: końce odcinka nie leżą „na drodze" (reguły
`isSegmentClear`, stąd `segmentCrossingDistance` w `vision.ts`), a przecięcia bliżej niż 1 px to jedno
przecięcie — płot przyciągnięty do siatki ma węzły na przecięciach kratek i strzał po przekątnej brałby
przez nie OB dwa razy. Nowe miejsce, które potrzebuje „ile pancerza stoi na tej linii", woła tę
funkcję (serwer: `barrierArmorBetween` w `walls-io.ts`), nigdy własnej pętli po ścianach.

**Bariera i brama (13.09, etap 42a): trzecia odpowiedź — co zatrzymuje ciało.** Ściany odpowiadały
dotąd na dwa pytania: co zatrzymuje wzrok (`wallBlocksSight`, `sightSegmentsFor`) i co zatrzymuje
kulę (`fireSegmentsFor`, ta sama lista plus osłony). Bariera (siatka, krata, barierka) jest pierwszą
rzeczą, dla której trzecie pytanie — **co zatrzymuje ciało** — ma własną odpowiedź: nie ma jej na
żadnej z tamtych list, a stoi każdemu na drodze. Ta odpowiedź ma **jedno** miejsce:
`wallBlocksMovement` → `movementSegments`, i czytają ją wszyscy — planer MG, odmowa upuszczenia
(`refuseWalkThroughSolid`), podejście bota, atak wręcz i Pochwycenie (`isBodyBlocked`). Brama to
otwór (`isOpening`) jak drzwi: klamka, rygiel, zasięg ramienia — tylko przezierna w obu stanach.

**Gracz nie dostaje ścian, ale planer musi znać to, przez co patrzy.** Pole widzenia gracza było
granicą podłogi, po której wolno chodzić, dopóki wszystko, co zatrzymuje ciało, zatrzymywało też
wzrok. Bariera i zamknięte okno z bliska (18d) to łamią, więc serwer wysyła graczowi **gołe odcinki**
(`blocker:sync`, pole `blockers` w `state:sync`) — tylko tego, co zatrzymuje ciało, a nie wzrok,
i tylko tego, co gracz widzi. Przy Dynamicznej liczy to `visibleWalkBlockersFor` per źródło wzroku
(punkty wzdłuż odcinka, `wallSamplePoints`, przeciw wielokątowi **tego** źródła); przy mgle ręcznej
i scenie otwartej `standingBarriers` — bez okien, bo okno należy do planu budynku — a przy mgle
tylko bariery z choć jednym odsłoniętym punktem. Wysyłają: `emitVisionToPlayers` (Dynamiczna),
`emitBlockersToPlayers` z `afterWallChange` i `afterFogChange` (pozostałe tryby). Nowa rzecz, która
zatrzymuje ciało, a nie wzrok, wchodzi przez `wallBlocksMovement` i sama trafi na tę listę.

**`roomSegments` pomija barierę i bramę** — ogrodzenie nie robi z placu pokoju, a lampa dopasowana
do siatki świeciłaby na pas przy płocie.

**Siatka przy otwartym edytorze sceny jest kontrastowa — tylko u MG i tylko na czas edycji (12.09).**
Wymóg MG: kratka nie musi trafiać w mapę idealnie, ale MG ma **sam zauważyć** rozjazd przed aktywacją
sceny — a czarna siatka 35% na ciemnej mapie pod mgłą była ledwo widoczna. `gridStrokes(grid,
contrast, worldPerScreenPx)` oddaje kreski w kolejności rysowania: bez kontrastu jedną (kolor i krycie
sceny, `pixelLine`), z kontrastem obwódkę 3 px ekranu w kolorze przeciwnym (próg luminancji 0,179)
i kreskę sceny z kryciem co najmniej 0,9. Przełącznik „Kontrastowa siatka podczas edycji" pokazuje MG
wygląd zapisany — bez niego suwaka „Krycie" nie dałoby się ocenić. Gracze nigdy tego trybu nie widzą.

**Kratka ze skali mapy liczy się z kolumn i z obrazu — nie z obu osi i nie z obszaru gry (12.09).**
`gridSizeForColumns(imageWidthPx, columns)` oddaje kratkę przyciętą do `GRID_SIZE_MIN`–`GRID_SIZE_MAX`
albo `null`. Kolumny wygrywają decyzją MG: kratka jest kwadratowa, a pliki z paczek nie dzielą się
równo (2896 × 2176 przy 40 × 30 to 72,4 i 72,53 px), więc wiersze są podpowiedzią z `gridCellsAlong`,
a nie drugim wejściem. Szerokość bierze się z `scene.background.width`, bo skalę opisuje nazwa
**pliku**, a `scene.width` bywa innym obszarem gry. Serwer przyjmuje ułamek (`sanitizeScenePatch`
tylko przycina), więc 36,2 px jest zwykłą, zapisywalną wartością.

**Ślad za idącą figurą to odciski butów, a zielone kreski nie wracają (zlecenie MG, 12.09).**
MG zażądał dwóch rzeczy naraz: obie zielone kreski mają zniknąć — ta rysowana pod idącą figurą
i ta pod ciągniętą myszą — a zostawać mają **szare odciski**, te same, którymi 27j rysuje trasę
planowaną. Powód jest z czytania mapy: figura zostawia za sobą dokładnie to, co obiecywała przed
sobą, więc „tędy poszedł" i „tędy pójdzie" czyta się jednym odruchem, a różni je sam kolor.

Jedna droga na trzy przypadki: `drawWalkedTrail(pool, graphics, points, scene, half, overFrom,
alpha)`. Woła ją marsz (`drawMarchTrail`), ciągnięcie (`drawMoveOverlay`) i poświata po
zatrzymaniu (`drawTrail`). `graphics` jest **zapasowym wyjściem**, nie drugą warstwą rysunku:
glif buta leci „wystrzel i zapomnij", a ślad, którego nie widać, byłby gorszy niż kreska, którą
MG kazał zdjąć.

**Czerwień jest odpowiedzią na pytanie, a nie ozdobą.** Zlecenie brzmiało: „ślady mają być
zabarwiane na czerwono w trybie turowym, aby gracz wiedział, jak daleko dojdzie jego postać
w danej turze". Do 12.09 kreska ciągnięcia szła na czerwono **od końca do końca**, czyli mówiła
„za daleko" bez powiedzenia _gdzie_. Granica szarości i czerwieni jest tą odpowiedzią, a liczy ją
`trailOverFrom` w metrach **gruntu** (`metresLeft / costFactor`) — bo ślad leży na ziemi, a nie
w budżecie. Marsz nosi tę granicę w `MarchState.overFrom`, osobno od `budget`: tamten stoi na
`null` przy budżecie niewymuszanym (MG), a kolor śladu ma mówić prawdę także jemu.

**Trzy pule odcisków i żadna nie pożycza sprite'ów sąsiadce.** `FootprintPool` (warstwa +
`Sprite[]`, `visible` mówi ile jest w użyciu) stoi trzy razy: `routePrints` — trasa pod kursorem,
`trailPrints` — ziemia pod figurą idącą **albo** ciągniętą (te dwie się wykluczają: klik
w cokolwiek zatrzymuje marsz, a `updateWalkHover` odpuszcza przy `this.drag`), `fadingPrints` —
poświata, która marsz przeżywa. Do 12.09 pula była jedna i wystarczała, bo poświata była linią;
od kiedy i ona jest odciskami, jedna pula znaczyłaby, że najechanie myszą kasuje ślad dopiero co
przebytej drogi. `TRAIL_FADE_MS` urósł z 1600 do 5000 ms, a gaśnie dopiero na **ostatniej
ćwiartce** życia — ślad blaknący od pierwszej klatki przez większość swojego istnienia jest już
ledwie widoczny, a właśnie wtedy pada pytanie, dla którego leży.

**„Prowadzę tę figurę" mówi pogrubiona obwódka właściciela (zlecenie MG, 12.09).**
Biały przerywany okrąg zniknął — MG zauważył go jako czwarty krąg na żetonie i spytał, po co jest,
skoro figura ma już obwódkę. Odpowiedź brzmiała „to nie to samo": kolorowa obwódka mówi **czyja**
jest figura (zielona — moja, błękitna — cudza gracza, czerwona — NPC) i nosi ją każdy żeton przez
cały czas, a biały okrąg mówił **którą prowadzę**. MG zdecydował mimo to złożyć obie wiadomości
w jedną kreskę.

Rysuje ją `drawSelectionRing` — **na nakładce**, nie w `TokenNode`, i to jest jedyny sposób, w jaki
to może działać: wszystko w `TokenNode` liczy się w pikselach **świata**, a stół ogląda mapę 4096 px
w jednej piątej skali, gdzie kreska szeroka na trzy piksele świata ląduje na pół piksela ekranu
(komentarz na górze `TokenNode.ts` mówi to od 16e). Nakładka mnoży grubość przez `overlayScale()`,
więc obwódka przeżywa oddalenie — ale grubość ma **sufit liczony z kratki** (`extent * 0.14`),
bo bez niego przy oddaleniu zjadłaby cały portret. Ciemna koszulka po obu stronach, jak pod
obrączką PW: pogrubiona kreska leży wprost na rysunku mapy, a ten bywa i czarny, i piaskowy.
Uchwyt obrotu został tam, gdzie był (`outerRadius + 22k`) — kropka na patyku trzyma się sama.

**Kadr portretu na mapie mieszka przy obrazku, nie przy postaci (12.09).** Krążek żetonu jest
kwadratem przyciętym do koła, a portret prawie zawsze prostokątem w pionie z twarzą w górnej
trzeciej — więc ślepy środkowy kadr (`extent / min(w, h)`, kotwica 0,5) dawał tors. MG wybrał
wprost: kadr jest cechą **grafiki**, ustawianą raz przy dokładaniu portretu, i obowiązuje wszędzie,
gdzie ten plik stanie na mapie.

Podział ról jest sztywny i warto go nie mieszać:

- **`shared/portrait-crop.ts`** trzyma cały rachunek — `PortraitCrop { x, y, zoom }` (punkt obrazu
  lądujący na środku kratki plus mnożnik skali pokrywającej), `clampPortraitCrop` (krążek nigdy nie
  wyjeżdża poza obraz; granice zależą od boków grafiki, więc **wymiary są argumentem**),
  `sanitizePortraitCrop` dla drutu i `portraitCropPlacement` dla rysującego. Domyślne
  `{0,5; 0,5; 1}` daje **dokładnie** to, co mapa rysowała przed 12.09 — żadna figura nie drgnęła.
- **`PortraitAsset.cropX/cropY/cropZoom`** to jedyny magazyn. Kadru **nie wypala się w plik**:
  uploady są niezmienne (kopia zapasowa trzyma je na twardych dowiązaniach), a poza mapą oryginał
  ma być widoczny w całości.
- **`TokenNode.fitImage`** wyłącznie stosuje wynik: kotwica **jest** punktem kadru, a sprite stoi
  nią na środku kratki — dzięki temu leżąca figura dalej obraca się wokół środka krążka.
- **`TokenNodeCtx.portraitCrops`** to odwzorowanie **adres pliku → kadr**, bo pyta się o obrazek,
  a nie o figurę: ten sam portret na dwóch żetonach jest ujęty tak samo, a żeton z grafiką spoza
  puli po prostu nie ma wpisu i dostaje kadr domyślny.

**Kadr musi być w podpisie figury** (`signature` w `TokenNode.update`) — inaczej przestawienie go
przez MG nie przerysuje żetonu, bo nazwa, obrazek i PW są te same. To jest jedyna pułapka tej
umowy i ma własny test.

**Kadr wolno wywieźć poza obraz (poprawka z 12.09, tego samego dnia co pierwsza wersja).**
Pierwsze granice pilnowały, żeby krążek nie wyjechał poza grafikę — i MG zgłosił to przy
pierwszym użyciu: liczyły się do **kratki**, a widoczne koło było od kratki mniejsze o obwódkę
właściciela, więc górnych pikseli portretu nie dawało się wciągnąć w krążek. Dziś
`clampPortraitCrop` pilnuje jednego: **punkt kadru ma leżeć na obrazie** (`x`, `y` w `[0, 1]`).
Pustka na brzegu krążka jest wtedy zwykłym stanem, więc `TokenNode` rysuje pod portretem krążek
tła **zawsze** — `PORTRAIT_BACKDROP`, ta sama liczba, co `--map-token-backdrop` w `theme.css`
(pilnuje tego `portrait-crop.test.ts`). Okno kadrowania rysuje ten sam krążek pod podglądem
i pod miniaturą „Tak na mapie".

Kadruje się **wyłącznie mapa** (decyzja MG z 12.09): karta, kreator, czat i panel pokazują wgrany
plik w całości — `.cp-portrait img` ma `object-fit: contain` od 27a z tego samego powodu, a małe
okrągłe awatary zostają przy środkowym `cover`, bo w kółku 1,35 rem cały prostokąt byłby paskiem.

**Pasek PW ma jedną drabinkę na całą aplikację: `tokenHpRung` (12.09).** Gracz widzi dwa paski tej
samej postaci naraz — obrączkę wokół swojej figury i pasek w panelu postaci w lewym górnym rogu —
a do 12.09 mówiły dwoma językami: mapa liczyła **trzy** stopnie z ułamka (zielone > 50 %,
pomarańczowe > 25 %, dalej czerwone), panel **cztery**, ze stanu ran. Ta sama postać bywała więc
na mapie zielona, a w panelu żółta. Teraz obie strony pytają `tokenHpRung` w `shared/figures.ts`.

Progi wychodzą z `WOUNDED_HP_RATIO`, czyli z liczby, którą rdzeń już raz stamtąd wziął, i dają
**dokładnie** to, co `woundStateFromHp` w `systems/cpred` — ale rdzeń tamtego nie woła i wołać nie
może (mapa nie importuje modułów CP RED). Przecięcie jest zapisane w dwóch testach: `figures.test.ts`
sprawdza obie funkcje punkt po punkcie dla dziewięciu maksimów, a `token-ring.test.ts` sprawdza, że
`HP_RUNG_COLORS` w `TokenNode` niesie te same kolory, co nocna paleta `theme.css`.

**Kolory obrączki są przepisane z nocnej palety, nie czytane z CSS-a** — i to nie jest skrót:
płótno mapy zostaje nocne w obu motywach (etap 27e), więc w dzień pasek w panelu przyciemnia się
razem z interfejsem, a obrączka ma zostać jasna. Zmiana `--ok`, `--hurt-light`, `--warn` albo
`--err` w `theme.css` wymaga więc ruchu w `HP_RUNG_COLORS` — inaczej test to zgłosi.

**Promienie oprawy żetonu liczy `map/token-ring.ts`, nie `TokenNode` (12.09).** Ten sam powód, co
przy `camera.ts`: czysta arytmetyka osobno od pliku, który ciągnie Pixi, więc da się ją sprawdzić
liczbami (`token-ring.test.ts`). Trzyma cztery funkcje — `hpRingWidth`, `hpRingCasing`,
`hpRingRadius` i `furnitureRadius` — i jedną decyzję MG: **obrączka PW leży poza kołem portretu**
(do 12.09 biegła wewnątrz obwódki właściciela i zasłaniała twarz). Świadoma cena, wybrana przez MG
wprost: figura wystaje poza swoją kratkę o szerokość paska, więc dwie stojące ramię w ramię
potrafią się obrączkami zetknąć; odrzucony wariant — zwężenie portretu — kosztowałby ~12 %
średnicy twarzy na **każdej** figurze, także tej bez PW.

**Od drugiej poprawki z 12.09 obwódka właściciela też leży poza portretem.** MG napisał to
wprost: zielony okrąg ma mieć znaną grubość i wysuwać się poza grafikę portretu dokładnie o tę
grubość. Stąd `portraitRadius(extent) = extent / 2` (krążek portretu **jest** kratką),
`ownerRingRadius = extent / 2 + RING_WIDTH / 2`, a obrączka PW zaczyna się dopiero za obwódką.
Cena jest ta sama, co przy pasku PW, i MG zna ją z obu decyzji: figura wystaje poza kratkę
o całą oprawę — przy kratce 47 px to ok. 10 px promienia, więc sąsiedzi potrafią się oprawami
zetknąć.

`furnitureRadius(extent, hasHp)` jest jedyną odpowiedzią na pytanie „dokąd sięga figura" i czytają
ją trzy rysunki, każdy z innego powodu: **aureola tury** musi zostać na zewnątrz paska (leży pod
nim w kolejności rysowania, więc pasek by ją zamalował), **klin kierunku** musi się za paskiem
zaczynać (leży nad nim, więc wycinałby w nim dziurę), a **podpis figury** musi zejść pod niego.
Kto dokłada cokolwiek opartego o brzeg żetonu, pyta tę funkcję — nie `extent / 2` i nie
`RING_WIDTH`. W samym `TokenNode` zostaje pole `furniture`, bo klin rysuje się też poza `update`
(ze `showFacing`, w trakcie marszu).

**Płótno mapy nadąża za gospodarzem przez `watchHostSize`, a nie przez `resizeTo` (12.09).**
`resizeTo` w Pixi v8 mierzy się elementem, ale przelicza rozmiar **wyłącznie** na `window.resize`
— elementu nie obserwuje. Mapa stoi w rzędzie z paskami, które zmieniają szerokość, nie ruszając
oknem (lewy HUD zwija się do 2,6 rem, prawy panel ma uchwyt i pamięta szerokość), więc w
`MapRenderer.init` siedzi `ResizeObserver` na gospodarzu, wołający `app.queueResize()` —
`queueResize`, nie `resize`, bo przeliczenie ma iść na następną klatkę. Dalej wszystko jedzie
starą drogą: `renderer.on('resize')` → `viewport.resize` → `applyCameraBounds`. **Nowy pasek
zmieniający szerokość mapy nie potrzebuje niczego własnego** — ma tylko nie omijać gospodarza.
Kamera przy tym zostaje na miejscu (decyzja MG, 12.09): dochodzi sam pas mapy, a jedyne, co się
poprawia samo, to dolna granica zbliżenia u gracza.

**Reguły kamery mieszkają w `map/camera.ts`, a nie w rendererze (11.09).** `MapRenderer` ma 6 tys.
wierszy i ciągnie Pixi, więc arytmetyka kadru — `coverZoom`, `startCamera`, `partyStart` i stałe
`MAP_MIN_ZOOM` / `MAP_MAX_ZOOM` — siedzi obok, w pliku, który da się przetestować bez płótna
(`camera.test.ts`). Renderer z tego korzysta w dwóch miejscach i oba są publiczne:
`setCameraLocked(locked)` (gracz: ekran nigdy nie wychodzi poza mapę — `clamp` bez marginesu
**plus** dolna granica zbliżenia równa `coverZoom`; MG: dawny `PAN_MARGIN`) oraz
`frameAround(point, squares)` — kadr startowy gracza, świadomie **osobny od `fitScene`**, bo
`fitScene` odpowiada „gdzie jest ta mapa", a `frameAround` „gdzie jesteś ty".
**Granice przykłada się ponownie przy każdej zmianie rozmiaru płótna** (`applyCameraBounds`
w obsłudze `resize`), bo `coverZoom` zależy od kształtu okna — inaczej rozciągnięte okno odsłania
czerń przy niezmienionym zoomie. Kto dokłada regułę kamery, dokłada ją tam, nie w `MapArea`.

**Kadr startowy wybiera `MapArea`, i robi to raz na scenę (11.09).** Kolejność jest wiążąca:
**własna figura gracza** na tej scenie → **miejsce startu** wyznaczone przez MG → **środek dolnej
krawędzi** mapy. Pamięć „tę scenę już kadrowałem" siedzi w `framedRef`, nie w stanie Reacta, bo
efekt kadrujący rusza także przy każdej edycji sceny przez MG — kamera odrzucana wtedy do punktu
startu wyrywałaby graczowi widok z ręki w środku walki. Jedyny dozwolony drugi kadr to poprawka
w ciągu `CAMERA_REANCHOR_MS` od wejścia: po `scene:activate` figury przyjeżdżają osobnym
`state:sync` chwilę po samej scenie, więc pierwszy kadr bywa robiony, zanim gracz „ma" tu figurę.

**Miejsce startu drużyny to pole sceny, nie obiekt na niej (11.09).** Dlatego nie ma go
w `SCENE_OBJECT_KINDS`, nie zaznacza się go, nie kasuje `Delete` i nie cofa `Ctrl+Z` — jest
**jeden na scenę** i mieszka w pięciu miejscach naraz: `Scene.spawnX/spawnY` (migracja
`scene_spawn_point`), `SceneView.spawn`, `ScenePatch.spawn` (`null` kasuje, brak pola nie mówi
nic), `SCENE_COLUMNS` w `archive.ts` (inaczej eksport sceny gubiłby punkt) i `setSpawn`
w rendererze. Stawia go narzędzie mapy `spawn` (klawisz `G`, tylko MG) **zwykłą łatką sceny**,
bez własnego zdarzenia gniazda. Chorągiewkę widzi **wyłącznie MG**, choć samo pole jedzie do
graczy — to ich kamera je czyta, więc ukrywanie go byłoby ukrywaniem przed właścicielem.

**Tło powitalne gracza jest obrazkiem, a nie sceną (11.09).** Gdy kampania nie ma aktywnej sceny,
gracz dostaje mapę (`uploads/art/welcome-map.webp`, 40 × 30 kratek) zamiast czarnego pola
z komunikatem — ale scena-atrapa z `map/welcome-map.ts` jedzie **wyłącznie** do
`MapRenderer.setScene`, a `sceneStore.effectiveScene` zostaje `null`. To jest cała bezpieczna
część pomysłu: wszystkie drogi, którymi coś wychodzi na sieć albo ląduje w bazie — stawianie
figur, rysowanie, linijka wysyłana innym, ping, efekty walki, mgła — pytają `effectiveScene`
i dostają `null`, więc odmawiają same z siebie, bez ani jednego nowego warunku. Dlatego tło nie
potrzebuje wiersza w bazie, migracji ani jednej linii na serwerze, a MG nie może go skasować.
Umowa na przyszłość: **cokolwiek ma się pokazać bez sceny, pokazuje się tą drogą** — atrapa
wpuszczona do `sceneStore` znaczy narzędzia uzbrojone nad niczym i żądania z nieistniejącym
`sceneId`. MG tła nie dostaje (`isGm` wyłącza sondę): jego „Brak sceny" to komunikat roboczy.
Kratkę atrapa liczy z **wymiarów wczytanego pliku** (`szerokość / 40`), więc podmiana mapy
40 × 30 nie wymaga kodu; nieobecność pliku (świeży klon, świeży VPS) to `null` i dawne zdanie.

**Klient nie zna `characterId` cudzej figury i nie ma poznać (06.09).** `TokenView.characterId`
jest częścią prywatną żetonu od etapu 05, więc `inventory:take` adresuje źródło **żetonem**
(`fromTokenId`), a listę kart, z których wolno brać, buduje serwer (`inventory:sources`). Lista
odbiorców to same nazwy kart drużyny (do 30.09 — wszystkich kart kampanii; #40, umowa w `ekwipunek`)
— ta sama umowa, co `payees` przy przelewie z 23b.

**Wszystko, co wisi przy naklejce żetonu, mieszka w `Token.statusData` i schodzi razem z nią (04.09).**
Kolumna trzyma `{ damage?, timer?, feared?, disabled? }` na status; `disabled` to nazwy
cyborgizacji zdjętych Impulsem EMP — **nazwy, nie id wierszy**, bo czyta je stół, a wiersz karty
może zniknąć, zanim minie minuta. Zapis idzie przez `writeSheetStatusDisabled`, odczyt przez
`readSheetStatusDisabled`, a **kasowanie jest wspólne**: `writeSheetStatusTimer(raw, id, null)`
zdejmuje cały wpis (zostawiając samo `damage`, czyli nastawienie MG). Ta jedna zasada jest
powodem, dla którego „Cofnij" w `realtime/damage.ts` musi po zdjęciu naklejki przelecieć
`statusesAdded` i wyczyścić dane — inaczej po cofniętym trafieniu zostaje zegar i następna walka
ogłasza „Minęła minuta" dla statusu, którego na żetonie już nie ma (błąd znaleziony 04.09).

**Stan figury czyta się z pozycji stołu, a nie z legendy (27j + 04.09).** Podstawka niesie kolor
stanu, naklejka — jego ikonę, ✕ zostaje trupowi, a od 04.09 **portret kładzie się na bok**
(`CONDITION_TILT_DEG` w `TokenNode.ts`) dla `down` **i** `dead`. Obraca się wyłącznie portret —
`image` i `initial`; pierścień, łuk PW, podstawka, imię i naklejki zostają pionowe, bo
przekrzywiony podpis to błąd, a przekrzywione koło to nic. Kąt jest w tabeli obok pozostałych
tabel stanu i **dobiera się go w przeglądarce, przy zoomie stołu**, nie na oko w edytorze:
dwadzieścia stopni wyglądało dobrze w kodzie i było niewidoczne na mapie.

**Co gracz może nazwać figurę, rozstrzyga serwer — od 03.09 przez `Token.publicName`.**
Trzy stany w jednej kolumnie nullable, więc żadna scena nie wymagała konwersji: `null` = gracz
widzi `name` (tak było zawsze), tekst = widzi ten tekst, `''` = nie widzi żadnej etykiety.
Podmiana siedzi **w dwóch miejscach i tylko tam**: `toTokenView` (`realtime/tokens.ts`) wpisuje
`includePrivate ? name : (publicName ?? name)` i sam alias wkłada **do gałęzi prywatnej** —
gracz nie ma się nawet dowiedzieć, że druga nazwa istnieje; `filterCombatForPlayer`
(`shared/combat.ts`) wymienia `name` w wierszu trackera, zdejmuje pole `publicName` i przy
okazji poprawia `grapple.otherName`, żeby Pochwycenie nie nazwało nikogo po prawdziwemu. Nowa
ścieżka, którą figura dociera do gracza, **filtruje nazwę u siebie** — nie w kliencie, i nie
przez trzecie miejsce, które trzeba pamiętać. **Czat wszedł do umowy 13.09, ale na innych
zasadach:** nazwa jest wpisana w **treść** zapisanej wiadomości, więc karta nie podmienia jej per
widz, tylko pisze alias **wszystkim, MG też** — patrz umowa o `tokenTableName` w sekcji `czat`.
Okno przeszukania (38b) filtruje per widz, jak `toTokenView` — do 13.09 pisało graczowi prawdziwą
nazwę.

**Nowe narzędzie mapy dopisuje się do dwóch getterów, nie do czterech list.** `MapRenderer`
pyta o narzędzia w ręku wyłącznie przez `toolSpentThisClick` (gest rozliczony na `pointerdown`
— ściany, lampy, gniazda, osłony, strefy) i `mapToolArmed` (wszystkie, pędzle włącznie).
Pominięcie ich znaczy klik płacony dwa razy: narzędziu i grze pod spodem (błąd #8 z 08.08).
Pilnuje tego `map-click.test.ts`, który czyta `MapRenderer.ts` jako tekst.

**Skróty klawiszowe mają jedno źródło i tak ma zostać.** `MAP_TOOL_KEYS` w
`packages/client/src/shortcuts.ts` czyta obsługa klawiatury w `MapArea` **i** okno pomocy —
nowe narzędzie mapy dopisuje się **tam**, nie w drabince `if`-ów. Pilnuje tego
`shortcuts.test.ts`, który czyta `MapArea.tsx` jako tekst i przewraca się na literale
`toggleTool('...')` w obsłudze klawiszy.

**Kierunek patrzenia jest stanem serwera i publiczną częścią żetonu.** `Token.facing` (stopnie,
0 = góra, zgodnie ze wskazówkami) pisze drop ruchu, strzał i gałka na pierścieniu zaznaczenia
(`token:facing` — drugie po `token:light` zdarzenie tokenu, które wykonuje **gracz**). Ręczny kąt
trzyma się do następnego **ruchu**, który go nadpisuje. Żadna reguła CP RED tego nie czyta —
to czytelność, nie mechanika.

**Efekt mapy jest przycinany na serwerze, nie w rendererze.** `fx:play` jedzie **per gniazdo**:
kto nie widzi lufy, nie dostaje ani jej, ani dźwięku; kto nie widzi żadnego końca strzału, nie
dostaje niczego. Reguła jest czystą funkcją (`trimMapFxForViewer` w `shared/src/fx.ts`) i ma
własne testy — nowy rodzaj efektu dopisuje się tam, nie w `MapFxLayer`.

**Stan figury zawsze ma naklejkę — a przekreślenie zostaje śmierci.** Od 22.08 `down`
(Nieprzytomny, Śmiertelnie ranny albo samo zero PW) nie przygasza już portretu: mówi o sobie
ikoną statusu i ciemnoczerwoną podstawką, a wielki ✕ przez twarz ma **wyłącznie** `dead`.
Ponieważ `down` bierze się także z samych punktów życia, `fallbackConditionStatusId`
(`shared/src/figures.ts`) dokłada domyślną naklejkę figurze, której żaden status tego nie mówi
— statysta bez karty na zerze PW nie może wyglądać jak zdrowy. Pilnuje tego `figures.test.ts`.

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

### Nowa próbka dźwiękowa mapy

Dźwięk mapy żyje w **czterech** miejscach i wszystkie cztery muszą się zgadzać, bo trzy z nich nie
mają typu, który by tego pilnował:

1. **plik** w `packages/client/public/sfx/` (`.wav` albo `.ogg` — paczki się różnią),
2. `MapFxSound` i `MAP_FX_SOUNDS` w `packages/shared/src/fx.ts` — rdzeń zna nazwę dźwięku, nie
   nazwę pliku,
3. `SFX_FILES` **i** `SFX_GAIN` w `packages/client/src/sfx.ts` (`Record<MapFxSound, …>`, więc te
   dwa pilnuje kompilator),
4. wiersz w `public/sfx/ATTRIBUTION.md` z paczką, autorem i licencją.

Który dźwięk gra która broń, rozstrzyga **jedna tabela** — `ICON_FX` w
`shared/src/systems/cpred/fx.ts`, indeksowana ikoną z `cpredWeaponIcon`. Nie dokładaj drugiego
rozgałęzienia „czy to strzelba" po stronie klienta: renderer ma nie wiedzieć, co to Cyberpunk.

Kompletu pilnuje `packages/client/src/sfx.test.ts` (dźwięk bez pliku i plik-sierota wywalają
test) — tak wyszedł zapomniany `bowstring.ogg` po wymianie próbki cięciwy na `bowstring.wav` 28.08.
Rządek przycisków odsłuchu w „⚙ Ustawienia" usunięto 24.09 na życzenie MG — nie przywracaj go.

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

**Klik w figurę, której ten widz nie prowadzi, opisuje ją w pasku i nic więcej (31.08).**
`MapRenderer.onTokenPreview` → `selectionStore.focus(tokenId)` rusza wyłącznie `focusTokenId`;
`tokenId` (sterowanie), ring i podgląd marszu zostają przy figurze prowadzonej. Pasek rozróżniał
opis od sterowania od 27h (`HudContext.steering`) — brakowało tylko drogi, którą cudza figura
mogła do niego trafić, i przez to publiczne rany były dla gracza nieosiągalne.

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

## czat — Rodzaje wierszy, widoczność, filtr

- **Gracz mówi postacią (01.10, #45)** — `say` i szept do bota gracza zapisują `speakerName` = imię postaci (`playerSpeakerName` w `realtime/chat.ts` → `speakingCharacter`); MG i gracz bez postaci — `null` (nazwa konta). Widok niesie wtedy `accountName` (konto w podpowiedzi autora). Po zapisie wypowiedzi `say` (gracz, MG, NPC) idzie `emitJournalPending` → `journal:pending` do pokoju MG (#43).
- **Co gracz może zobaczyć z karty czatu, przycina `redactChatMessage` — w historii I w dostarczeniu (30.09, #40)** — `deliverChatMessageTo` (karty prywatne, `chat:update`) woła ją per gniazdo od 30.09; wcześniej przycinała tylko historia i `broadcastRedactedChatMessage`, więc karta przekazania niosła graczowi na żywo id karty NPC-a. Nowe pole tajne dla gracza — gałąź w `redactChatMessage`, typ widoku z polem opcjonalnym (wzór `InventoryMoveView`).
- **Nazwa figury w karcie czatu idzie przez `tokenTableName(token, realName)`** (`shared/tokens.ts`, 13.09) — alias u wszystkich, MG też; `''` → „Nieznajomy". Rzut z samej karty (bez żetonu) pisze nazwę karty. Uczestnik kolejki: `combatantTableName`, nie `combatantName`.
- **Widoczność wyniku to RODZAJ wiersza czatu**: `rolltable` publiczny, `gmrolltable` cichy — wzorem `roll`/`gmroll`. „Pokaż stołowi” **dokłada** publiczny wiersz (treść z zapisanej karty, nie z żądania), bo `visibleTo` jest białą listą rodzajów w zapytaniu do bazy.
- **Nowy rodzaj wiersza czatu** — `chatCategoryOf` w `shared/src/chat.ts` + `toChatMessageView` + gałąź `FullMessageRow`. Pominięcie = wiersz w grupie „Stół".
- **Nowy rodzaj wiersza czatu** — `chatCategoryOf` w `shared/src/chat.ts` (grupa filtra); wiersz czekający na decyzję jest wyjęty spod filtra przez `isPending` w `ChatPanel`.
- **Nowy rodzaj wiersza czatu ma PIĘĆ miejsc, nie cztery** — do dwóch czystych funkcji, `toChatMessageView` i `FullMessageRow` dochodzi **`visibleTo` w `chat-io.ts`**: to biała lista rodzajów, a wiersz spoza niej znika z historii i widzi go tylko autor. Rodzaj publiczny dopisuje się do **obu** gałęzi (gracza i MG).

---

**Podpis wypowiedzi gracza i licznik streszczenia (01.10, #45 i #43).** `speakerName` jest
jednocześnie autorem na czacie, podpisem w historii bota i w transkrypcie kronikarza
(`speakerName ?? author.name`), więc postać wpisuje się **przy zapisie**, a nie przy odczycie
(decyzja MG: „Kowal” wszędzie, konto w podpowiedzi). Lista „przy stole” w prompcie
(`campaignParticipants`) pomija konta, które mają postać; szept bota idzie do postaci
(`whisperWith`). Nowe miejsce, które zapisuje wypowiedź `say`, woła `emitJournalPending` —
inaczej licznik „Zakończ sesję i streść (N)” u MG stoi do wejścia w zakładkę.


**Nazwa figury w karcie czatu idzie przez `tokenTableName`, nigdy wprost z `token.name` (13.09).**
Alias `Token.publicName` (03.09) zasłaniał nazwę na mapie i w kolejce, a ponad pięćdziesiąt miejsc
w `realtime/` wpisywało `token.name` w treść kart: atak, obrażenia, zwarcie, Konfrontacja, strefy,
Sieć, dziennik Akcji, „Minęła minuta". Karta jest zapisana raz i każda historia zwraca ją taką
samą, więc podmiana per widz nie wchodzi w grę — **decyzja MG: alias u wszystkich, także u MG**
(edytor figury i tak pokazuje obie nazwy). `tokenTableName(token, realName)` dostaje to, co karta
napisałaby bez aliasu — nazwę karty gracza albo żetonu figury MG — i rozstrzyga wyłącznie alias;
pusty daje „Nieznajomy" (`TOKEN_UNLABELLED_TABLE_NAME`). Uczestnika kolejki nazywa
`combatantTableName`; `combatantName` zostaje dla widoku trackera, który podmienia
`filterCombatForPlayer`. **Rzut z samej karty** (bez żetonu: cyborgizacje, ekonomia, wezwania,
Wsparcie, rzut z karty statysty) pisze nazwę karty — alias należy do żetonu (decyzja MG). Zawężony
typ `Pick<Token, …>` bez `publicName` nie przepuści aliasu — `tsc` to łapie, tak było w `netice.ts`.
Karty zapisane przed 13.09 zostają z prawdziwą nazwą. Ślad bota (`bot-combat.ts`) i dziennik decyzji
zostają przy prawdziwej — to nie są karty czatu. Pilnuje tego `ammo-effects.test.ts` (karta gazu
i „Minęła minuta" oczami gracza).

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

## serwer — Baza, protokół gniazda, pliki

- **Izolacja kampanii — macierz zdarzeń (04.10, etap 44b)** — nowe zdarzenie gniazda dostaje wpis w `CASES` w `campaign-isolation.test.ts` (`foreign` z ładunkiem z obiektami kampanii A albo `own` z powodem), inaczej wywraca test „każde zdarzenie ma przypadek”. Obiekt z ładunku szuka się **w kampanii gniazda** (`requireCampaign…`), obcy daje ten sam kod co nieistniejący (`*_NOT_FOUND`); drugi identyfikator w ładunku (karta na figurze, adresat, figury walki) też tylko z tej kampanii — przypadek do `MIXED`. Właściciel karty/figury to **członek kampanii** (`requireValidOwner`), adresaci `/w` — gracze i MG **tej** kampanii (`getRoster` → `campaignGmUser`). Kwerenda bez warunku kampanii (`findMany({})`) w eksporcie czy stanie to przeciek do innego MG.
- **Pliki kampanii (04.10, etap 44b)** — nowy plik idzie przez `campaignUploadTarget(uploadsDir, campaignId, katalog, nazwa)` (`src/campaign-uploads.ts`), adres ma kształt `/uploads/campaigns/<id>/<katalog>/<plik>` (`campaignUploadUrl`/`parseCampaignUploadUrl` w `shared/src/uploads.ts`). Strażnik w `app.ts` wydaje plik tylko MG kampanii i jej graczom (grafikę handoutu — graczom, którym go udostępniono); obcy — 404. Zdarzenie zapisujące adres obrazka woła `requireOwnUploadUrl(url, campaignId)` (odmowa `UPLOAD_NOT_FOUND`). Wspólne zostają `uploads/art/` i `/public/`. Import pliku wymiany przechodzi przez `localizeArchiveUploads` (kopiuje pliki kampanii, które importujący MG może czytać). Nowa kolumna z adresem: lista w `uploads-gc.ts` **i** w `migrateFlatUploads`.
- **Imienne linki graczy (04.10, etap 44b)** — link wystawia MG: `POST /api/campaigns/:id/invitations` `{ name }` (nowy gracz) albo `…/players/:userId/renewal` (to samo konto, inne urządzenia zostają). Link działa raz (`usedAt`), nieużyty żyje 7 dni (`INVITATION_TTL_HOURS`); użyty i wygasły — 410, nieznany i unieważniony — 404. Imię unikalne w kampanii (`playerNameTaken`: gracze, czekające linki, MG). Test dymny wchodzi graczem przez `joinUrl(built, campaignId, imię)` (`src/test-join.ts`), E2E — przez `playerLink`/`createInvitation(mg, kampania, imię)`.
- **Konta MG i właściciel (03.10, etap 44a)** — MG loguje się loginem (`User.login`, małe litery, `normalizeGmLogin`) i hasłem; reguły loginu i hasła oraz polskie zdania odmów są w `shared/src/auth.ts` (`gmLoginError`, `gmPasswordError`, `gmAccountErrorText`) — formularz i trasa sprawdzają to samo. Właściciel to flaga `User.owner` na koncie z `GM_NAME` (`ensureGmUser`), nie rola: trasa tylko dla niego — `requireOwner`, zdarzenie — `role: ROLE_GM` **plus** `ownerOnly: true` (macierz ról E2E czyta samą rolę). Kampania należy do `Campaign.gmId`: trasa o kampanii po id sprawdza `campaignRunBy` (cudza = 404 jak nieistniejąca), aktywna kampania z REST to **zawsze** `getUserActiveCampaign(prisma, user)` (globalnego `getActiveCampaign` już nie ma). Konto, którym pisze system (linie botów, „Czas”, strefy), to `campaignGmUser(prisma, campaignId)` — nigdy „pierwszy MG w bazie”. Koniec sesji konta (zmiana hasła, reset, blokada) — `endUserSessions` z powodem `password`/`blocked`.
- **Prośba o portret przy wyczerpanej puli — w pamięci procesu (03.10, #68)** — `portrait:want` (gracz; odmowa `PORTRAIT_AVAILABLE`, gdy `hasFreePlayerPortrait`), `portrait:wanted` (MG, lista przy wejściu), rozgłoszenie `portrait:wanted-sync` do `gmRoom`. Listę trzyma `portraits.ts` (`addPortraitWanted`/`clearPortraitWanted`), bo to prośba, nie stan gry. Czyści ją każdy nowy portret w puli graczy: trasa uploadu (bez `io` — klient MG czyści się sam po udanym wgraniu) i `portrait:visibility` → gracze (z rozgłoszeniem).
- **Ulotne zdarzenie „stanu chwili” z widownią po widoczności — wzór `token:aim` (03.10)** — bez zapisu, bez `seq`, bez powtórki; widownię liczy się per gniazdo z `concealmentFor`/`concealedFrom` (jak `fetchSceneTokensFor`), z pominięciem nadawcy, a stan żyjący dłużej niż jedna wiadomość (tu: kto celuje) siedzi w mapie modułu po `socket.id` i sprząta go `disconnect` w `realtime/index.ts`. Zdjęcie idzie **tylko** do tych, którzy dostali stan — nie wycieka id figury, której ktoś nie widzi. Sprawdzenie „gracz trzyma tę figurę” to `requireTokenControl` (`tokens.ts`, wspólne z `token:facing`).
- **Gniazdo żyje tyle, co sesja; limity tempa w `registerEvents` i trasach logowania (01.10, #11–#13)** — `socket.data.sessionId`/`sessionExpiresAt` z handshake'u, pokój `sessionRoom(id)`; wylogowanie woła `endSessionSockets(io, id, 'logout')`, wygaśnięcie — zegar `armSessionExpiry` i odmowa `SESSION_ENDED`. Limit per konto (`SocketRateLimiter`, 20/s z zapasem 60, bez acku 40/s po cichu) i złe hasła/zaproszenia per IP (`LoginAttemptLimiter`, 10 / 15 min, 429 z `Retry-After`) w `src/rate-limit.ts`; włącza je `config.rateLimits` (domyślnie tak, testy dymne bez). `/uploads/` tylko dla zalogowanych (zaczep `onRequest` w `app.ts`), aktywna kampania z REST przez `getUserActiveCampaign`.
- **Błąd walidacji Prismy to `BAD_REQUEST`, nie `INTERNAL` (27.09, #15)** — `registerEvents` łapie `Prisma.PrismaClientValidationError` (id `1e308`, ułamek, zły typ) i loguje go na `warn`. Pole tekstowe handler sprawdza `typeof … === 'string'` przed `.trim()`. `junk-payloads.test.ts` puszcza śmieci przez każde zdarzenie z `EVENTS` z gniazda gracza i MG.
- **Zdarzenie gniazda istnieje tylko w `EVENTS` (26.09, T2)** — `realtime/index.ts` eksportuje tę listę, a macierz ról i śmieciowe ładunki E2E (`packages/e2e/fixtures/security.ts`, `realtimeEvents()`) czytają ją stamtąd. Zdarzenie tylko dla MG stoi na `role: ROLE_GM` — **odmowa wewnątrz handlera nie wchodzi do macierzy**, więc sprawdzanie roli „ręką” zostaw dla zdarzeń, które gracz woła legalnie o własne rzeczy. Id z ładunku sprawdzaj co do typu, zanim trafi do Prismy — inaczej śmieć kończy się `INTERNAL` zamiast odmowy (#15).
- **Portret NPC — `PortraitAsset.gmOnly` (23.09)** — gracz nie dostaje portretów NPC; noszony jedzie do niego jako sam adres i kadr bez nazwy (`playerPortraitView`). Rozgłoszenia puli idą dwiema emisjami z **jednym** `seq` (`emitPortraitAsset`: `gmRoom` pełny wiersz, reszta pokoju wersję gracza albo `removedId`). Klient dociąga pulę na nieznany adres figury (`portraitStore.notice`).
- **Figury idą za portretem karty (23.09)** — `character:update` z nowym `portraitUrl` przestawia figury tej karty, które nosiły stary portret albo nie miały obrazu; grafika z biblioteki żetonów zostaje.
- **Emisja skutku rzutu nie wyprzedza jego kości (22.09)** — `defineEvent` obejmuje handler przez `withPresentation`; `performCharacterRoll` i `performAttackRoll` robią to również dla wywołań botów. Funkcje wysyłające widok wyniku używają `deferView` (karty, figury, walka, Sieć, osłony, dym, efekty i nierzutowe komunikaty czatu). Mutacje wykonują się od razu, emisje po handlerze, także przy błędzie. Numery `seq` nadaje dopiero emisja. Nie odkładaj mutacji wewnątrz funkcji udającej samą emisję.
- **Biblioteka portretów MG (14.09)** — `PortraitPicker manage` w panelu postaci dodaje wiele plików bez kadrowania. `preparePortraitImage` w serwerze egzekwuje wspólne limity i zapisuje WebP; `PortraitAsset.retired` usuwa z wyboru bez utraty kadru, `includeRetired=true` służy rendererowi i edytorowi kadru.

**Portrety po ustaleniach MG z 14.09:** pula pozostaje osobna dla każdej kampanii. Upload
przyjmuje JPG/PNG/WebP do 10 MB, minimum 256 px na każdym boku i do 20 mln pikseli;
`sharp` dekoduje cały obraz, uwzględnia EXIF, zmniejsza proporcjonalnie do 2048 px
dłuższego boku bez powiększania i zapisuje WebP z jakością 85. Nie kadruje ani nie
przepisuje wcześniej wgranych plików. Kadrowanie pozostaje przy wyborze na karcie.

**Ten zapis zastępuje starsze reguły 8 MB / 2048 px na wejściu i kasowania wiersza puli.**
Kosz ustawia `retired=true`, zachowując plik i kadr także po restarcie; backfill widzi
wycofany wiersz i nie przywraca go do wyboru. Zwykły GET pomija wycofane wpisy,
`portraitStore` pobiera je do kadrowania przez `includeRetired=true`, a galeria filtruje
je z wyboru. Własna rezerwacja szkicu pozostaje ważna; nowy wybór gracza sprawdza
`retired=false` na serwerze. Kolejka wysyła oczekiwane `campaignId`, a serwer odmawia
po zmianie kampanii; klient czyści pulę i unieważnia starsze odczyty przy przełączeniu.

- **Blokada ruchu graczy po mapie** — `Scene.playerMoveLocked` (nowa scena **zamknięta**, migracja otworzyła stare), zwykłe pole `ScenePatch` (nie własne zdarzenie, bo niczego graczom nie zabiera), odmowa `MOVE_LOCKED` w `performTokenMove` **przed** `validateTokenMove` — żeby ścinała też klatkę pośrednią. MG nie jest nią związany nigdy.
- **Przełączenie kampanii** — zdarzenie `campaign:activate` (przenosi wszystkie gniazda i odsyła `campaign:switch`), nigdy sam zapis w bazie.
- **Limity wgrywanego obrazu** — `shared/src/uploads.ts` (serwer re-eksportuje); odmowa zawsze z pełnym wymaganiem, `accept` i sprawdzenie przed wysyłką z tego samego miejsca.
- **Portret w nowym miejscu** — `PortraitPicker`: przycisk → duża galeria → kadr po potwierdzonym zapisie; pliki wgrywa wyłącznie MG. `usedPortraitUrls` liczy zajętość po stronie serwera, szkic gracza rezerwuje twarz transakcyjnie.
- **Kadr portretu** — `portrait:crop` (gniazdo, rozgłasza cały wiersz puli). Nie stoi na `role: ROLE_GM`: gracz kadruje ten jeden portret, który nosi jego własna karta, i sprawdza to serwer.
- **Kosz w bibliotece, która stoi na scenie** — zdarzenie gniazda (`token:asset-delete`), nie trasa REST: zdjęta grafika schodzi też z żetonów (`emitTokensById` → `token:upsert`), a ack mówi `clearedTokens`. REST wgrywa plik, gniazdo zmienia stan stołu.
- **Komunikat zależny od zewnętrznej usługi** niesie kod odmowy (`journalStore.fail(msg, code)`), a powrót usługi go zdejmuje (`ai:status` → `clearAiError`) — inaczej wisi do następnej akcji MG; pilnuje `journal-error.test.ts`.
- **Rozgłoszenie, które rysuje `seq`, musi go u klienta skonsumować** — `if (chat().applySeq(broadcast.seq)) { socket?.emit('state:request'); return; }`. Pominięcie robi lukę i zbędny pełny resync całemu stołowi.

---

**Sesja, limity i pliki za logowaniem (01.10, poprawki #10–#13 z T2).**

- **Sesja gniazda.** `io.use` zapisuje w `socket.data` `sessionId` i `sessionExpiresAt`, gniazdo
  wchodzi do pokoju `sessionRoom(sessionId)` (`realtime/session-guard.ts`). `POST /api/auth/logout`
  woła `endSessionSockets(io, id, 'logout')` — `auth:ended` i rozłączenie każdej karty tej sesji.
  Wygaśnięcie: `armSessionExpiry` (zegar nastawiany co ≤ 23 doby, bo `setTimeout` nie sięga roku)
  i odmowa `SESSION_ENDED` w `registerEvents`. Klient na `auth:ended` i na `connect_error`
  `UNAUTHORIZED` woła `sessionEnded(reason)` — ekran logowania z notką (`endedNote`).
  **Sesja i link zaproszenia żyją rok** (decyzja MG z 01.10; `SESSION_TTL_DAYS`, `DEFAULT_INVITATION_TTL_HOURS`).
- **Limit tempa gniazda** stoi w `registerEvents` **przed rolą i przed bazą**: `deps.rateLimiter`
  (`SocketRateLimiter`, klucz = konto, wszystkie jego gniazda razem). Zdarzenie z ackiem — 20/s,
  zapas 60, nadmiar `RATE_LIMITED`; bez acku (klatka przeciągania, miarka) — 40/s, nadmiar
  przepada po cichu. Klient: `emitSceneAck` i `chatErrorText` dają notkę „Za szybko…”.
  E2E: `emitAck` i `probe` ponawiają `RATE_LIMITED` — surowy zalew mierzy tylko 6.2.4.
- **Złe hasła i zaproszenia** liczy `ctx.loginLimiter` (`LoginAttemptLimiter`) per `request.ip`:
  10 porażek w oknie 15 min → 429 z `Retry-After` **także na dobre hasło**; inne adresy i otwarte
  sesje działają, udane wejście zeruje licznik. Nowa trasa wejścia: `refuseRateLimited` przed
  sprawdzeniem sekretu, `fail` przy porażce. Za Caddy potrzebny `TRUST_PROXY=1` (etap 28, Z11).
- **Oba limity włącza `config.rateLimits`** — pole opcjonalne: `loadConfig` daje `true`
  (`RATE_LIMITS=0` wyłącza), a konfiguracje testów dymnych go nie mają, więc tam limitów nie ma.
  Test limitu ustawia `rateLimits: true` sam (`security.test.ts`).
- **`/uploads/` za logowaniem** — zaczep `onRequest` w `app.ts` (sesja rozpoznawana też
  w `onRequest`, przed wtyczką statyczną; sprawdza trasę, nie surowy adres). Członkostwo w kampanii
  pliku i nieudostępnione handouty zostają w Z7 („Konta MG”).
- **Aktywna kampania z REST** dla gracza tylko, gdy jest członkiem: `getUserActiveCampaign`
  (`routes/helpers.ts`; `resolveSocketCampaign` woła to samo). Nowa trasa REST o kampanii gracza
  bierze kampanię stamtąd, nie z `getActiveCampaign`.


**Portrety NPC są w tej samej puli, z flagą `gmOnly` (zlecenie MG z 23.09).** Twarz i nazwa
portretu zdradzają, kogo drużyna dopiero spotka, a pula była publiczna dla każdego zalogowanego —
razem z nazwami i wycofanymi wpisami. Osobna biblioteka zdublowałaby kadr, kosz i backfill, więc
MG dostał w `PortraitPicker` dwie zakładki („Dla graczy”, „NPC — tylko MG”), wgranie idzie do
otwartej (`?gmOnly=true`), a kafelek przenosi `portrait:visibility` (tylko MG). Karta bez
właściciela otwiera galerię na zakładce NPC (`npc` w `CharacterSheet`).

Gracz **potrzebuje** kadru portretu NPC, który stoi przed nim na mapie, więc szczelność jest
kompromisem przyjętym przez MG: `GET /api/portrait-assets` oddaje graczowi wiersz `gmOnly` tylko
wtedy, gdy coś go nosi (`usedPortraitUrls`), z pustą nazwą — adres twarzy ukrytej figury da się
wydłubać z narzędzi przeglądarki, nieprzypisanych twarzy już nie. Pełna szczelność wymagałaby
kadru w widoku figury (57 miejsc `toTokenView`) — odrzucona jako zbyt droga.

Rozgłoszenie wiersza puli (`portrait:crop`, `portrait:visibility`) robi **`emitPortraitAsset`**:
`gmRoom` dostaje pełny wiersz, `campaignRoom` bez `gmRoom` — `playerPortraitView` albo
`{ removedId }` (gracz ma zapomnieć), **z tym samym numerem `seq`**. Każdy klient słyszy
dokładnie jedną z dwóch emisji, więc ciąg numerów w pokoju kampanii nie ma luki (luka to pełny
resync stołu). Nowe zdarzenie puli idzie tą funkcją, nie gołym `io.to(room).emit`.

Pula gracza nie dowie się o portrecie NPC nadanym po jej wczytaniu (wgranie niczego nie rozgłasza),
więc `pushTokens` w `MapArea` woła `portraitStore.notice(adresy figur)`: nieznany adres spod
`/uploads/portraits/` dociąga pulę **raz** (`noticed` pamięta, o co już pytano — stary plik bez
wiersza nie może wywołać pętli). Kreator odmawia graczowi nowego wyboru portretu `gmOnly`
(`PORTRAIT_NOT_AVAILABLE`), tak jak wycofanego.

**Figury idą za portretem karty (decyzja MG z 23.09).** Do tej pory portret karty trafiał na
figurę wyłącznie przy jej postawieniu (`createCharacterToken`), a obrazu stojącej figury nie
zmieniało nic w UI — nowy portret NPC-a wymagał postawienia figury od nowa. `character:update`
przestawia teraz `Token.imageUrl` figur tej karty, które nosiły **stary portret albo nie miały
obrazu**, i odsyła je `emitTokensOfCharacter`. Grafika wybrana z biblioteki żetonów zostaje: to
wybór MG dla tej jednej figury.


**Blokada ruchu graczy po mapie jest polem sceny, nie własnym zdarzeniem (zlecenie MG, 12.09).**
Powód jest z sesji, nie z reguł: drużyna, która dostanie mapę przed rozpoczęciem gry, obejdzie ją
własną figurą i pozna zanim MG cokolwiek powie — a przy widoczności dynamicznej zdejmie przy okazji
mgłę. `Scene.playerMoveLocked` jedzie więc zwykłą łatą `scene:update`, a **nie** własnym zdarzeniem
jak `visibility`, `dark` czy `explore`: tamte trzy **odbierają graczom figury** w chwili
przełączenia i muszą przefiltrować listy tokenów, a ta niczego nie zabiera i niczego nie pokazuje.
Zmienia tylko odpowiedź na pytanie „wolno mi tę figurę podnieść".

**Nowa scena wchodzi zamknięta, stare zostały otwarte.** Kolumna ma `@default(true)`, ale migracja
`20260912154000_scene_player_move_lock` robi po niej `UPDATE "Scene" SET "playerMoveLocked" = false`
— mapa dopiero budowana nie jest mapą, po której drużyna ma chodzić, ale zmiana zasad przy stole
z dnia na dzień nie była tym, o co MG prosił. **Import sceny z pliku też wchodzi zamknięty**
(`archive.ts`): mapa z archiwum jest dla stołu tak samo nieznana, jak dopiero narysowana. To samo
domyślne ustawienie kosztowało 57 czerwonych testów w dziewięciu zestawach serwera — każdy, który
każe graczowi ruszyć figurą, musi teraz **otworzyć scenę zaraz po `scene:create`**.

**Odmowa stoi w `performTokenMove`, nie w `validateTokenMove`** (`realtime/tokens.ts`), tuż za
sprawdzeniem właściciela. Tamto pyta o Turę i o ściany, więc odpowiada dopiero na upuszczeniu
(`final`) — a blokada ma odrzucić **także pojedynczą klatkę ciągnięcia**, inaczej mapę dałoby się
przejść bez ani jednego `final`. Kod odmowy to `MOVE_LOCKED`; zdanie („MG nie otworzył jeszcze tej
mapy do ruchu.") stoi u klienta w trzech miejscach naraz — `moveErrorText`, tabela `socket.ts`
i stała `MOVE_LOCKED_NOTE` w rendererze — bo kursor mówi „nie" jeszcze przed kliknięciem.

**Aktywną kampanię przełącza `campaign:activate`, nie zapis w bazie.** Zdarzenie przenosi
**wszystkie** podpięte gniazda (pokoje, scena, `state:sync`) i odsyła `campaign:switch`; trasa
REST tworząca kampanię woła je zaraz po utworzeniu, żeby „utwórz" i „aktywuj" szły jedną drogą.
Przycisk „Aktywuj" jest w Panelu MG przy każdej nieaktywnej kampanii.

**Limity wgrywanych obrazów mieszkają w `shared/src/uploads.ts` — i tylko tam.** Cztery pary
liczb (mapa 40 MB / 16384 px, token i portret 8 MB / 2048 px, handout 12 MB / 4096 px) czyta
serwer (`routes/uploads.ts` re-eksportuje je pod starymi nazwami) i klient. Zdanie odmowy
buduje `uploadRejectionText`, a nie prywatna kopia `switch`-a w panelu: **każda odmowa niesie
pełne wymaganie** (format · rozdzielczość · waga), bo „nieobsługiwany format" zostawia człowieka
z pytaniem „to jaki mam podać". Nowy `<input type="file">` bierze `accept` z
`UPLOAD_ACCEPT_ATTRIBUTE`, podpowiedź z `uploadRequirementText(kind)` i sprawdza plik przez
`fileRejectionText` **przed** wysyłką. Pilnuje tego `shared/src/uploads.test.ts` (12 testów).

**Pula portretów kampanii — pliki portretów dokłada wyłącznie MG (23.08).** `PortraitAsset`
jest bliźniakiem `TokenAsset` (model, trasy, kosz dwustopniowy), z jedną różnicą: listę
`GET /api/portrait-assets` widzi **każdy zalogowany**, bo to z niej gracz wybiera portret swojej
postaci — biblioteka żetonów zostaje przy `requireGm`. Wspólny komponent to `PortraitPicker` —
używają go i karta postaci, i kreator; nowe miejsce z portretem bierze jego, nie własnego
`<input type="file">`.

**Od 12.09 portret ma jedną trasę: `POST /api/uploads/portrait-assets`.** Stała obok niej
`POST /api/uploads/portraits` (wgranie wprost na kartę, w kreatorze i w edytorze bota) kładła sam
plik, **bez wiersza w bazie** — a portret bez wiersza nie ma gdzie trzymać kadru na mapie i nikomu
drugi raz się nie przyda. Trasa zniknęła, wszystkie trzy miejsca wgrywają do puli, a pliki wgrane
przed tą zmianą wciąga do niej `portrait-backfill.ts` przy starcie serwera (obok zbieracza sierot,
w tle, idempotentnie) — bez tego nowa funkcja nie działałaby dokładnie dla tych postaci, które
naprawdę stoją na mapie. Lista klienta mieszka w `portraitStore`, nie w komponencie: kadru
potrzebuje też renderer, a dwie kopie tej samej puli rozjechałyby się przy pierwszej zmianie.

**Kadr zmienia się gniazdem (`portrait:crop`), bo dotyka wszystkich ekranów naraz** — patrz reguła
„REST wgrywa plik, gniazdo zmienia stan stołu" niżej. Jest jednak **jedynym** zdarzeniem puli bez
`role: ROLE_GM`: portret wybiera się raz, przy tworzeniu postaci (decyzja MG z 12.09), i w trakcie
rozgrywki gracz go nie zmienia — ale kadr własnej figury zmienić może. Warunek sprawdza serwer
(`ownsPortrait`: karta tego gracza nosi ten adres albo jego szkic rezerwuje wolny portret), nie przycisk.

**Od 13.09 wybór portretu otwiera osobną dużą galerię, potem kadrowanie.** `onPick` zwraca wynik
zapisu — odmowa pozostawia galerię otwartą. `GET /api/portrait-assets` dodaje `assigned`, bez nazw
i identyfikatorów właścicieli; `usedPortraitUrls` obejmuje karty, boty, figury wszystkich scen
(także ukryte) i cudze szkice. Otwarta galeria odświeża listę co 3 s. Własny wybór jest oznaczony
osobno, zajęte portrety są czarno-białe; MG może celowo powtórzyć portret.
`creation:patch` sprawdza pulę i zajętość razem z zapisem w transakcji, `creation:finish` ponawia
sprawdzenie i atomowo przenosi przypisanie ze szkicu do karty. Zmiana/usunięcie portretu albo
odrzucenie szkicu zwalnia rezerwację; samo zamknięcie kreatora jej nie zwalnia. `character:update`
odrzuca zmianę portretu gracza także na serwerze — wcześniej zakaz był wyłącznie w UI.

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

**Komunikat o błędzie, który może przestać być prawdą, niesie kod odmowy.** Dziennik trzyma błąd
u siebie (`journalStore.error`), a nie w statusie z serwera, więc nic go sam z siebie nie
odświeża — „Brak połączenia z AI Gateway" wisiał po powrocie gatewaya do następnej akcji MG.
Od 28.08 `fail(message, code)` zapisuje też `errorCode`, a odbiór `ai:status` z
`available: true` woła `clearAiError()`, który zdejmuje **wyłącznie** `AI_UNAVAILABLE` —
„nie ma czego streścić" ma wisieć, dopóki nie ma. Dokładając komunikat, który zależy od stanu
zewnętrznej usługi, dołóż kod i sprzątanie w tym samym miejscu; pilnują tego trzy testy
w `journal-error.test.ts`.

**Rozgłoszenie, które rysuje `seq`, musi go u klienta skonsumować (05.09, poprawka).**
`deps.seqs.next(room)` na serwerze podnosi numer pokoju dla **wszystkich**, więc handler
u klienta, który go zignoruje, zostawia dziurę: następna wiadomość czatu wygląda jak luka
i cały stół idzie w zbędny `state:request`. Wzorzec jest jeden i widać go w `scene:update`:
`if (chat().applySeq(broadcast.seq)) { socket?.emit('state:request'); return; }`. Do 05.09
łamały go **cztery** zdarzenia naraz — `compendium:upsert`, `compendium:delete` (etap 13),
`shop:tier` (25c) i świeżo dopisany `time:set` (37), który wzorzec po prostu odziedziczył po
sąsiadach. Nowe rozgłoszenie z `seq` w typie zaczyna się od tych trzech linii, nie od `apply…`.

## ui — Okna, motyw, style, dostępność

- **„Czeka na MG” ma piąte źródło: `portrait` (03.10, #68)** — `portraitStore.wanted` → `gmAttentionItems`, klucz `portrait:<userId>`, wiersz z `data-attention` stoi nad „Portrety — biblioteka MG” (`PortraitPicker manage`). Gracz przy wyczerpanej puli dostaje w oknie zdanie i „Poproś MG o portret”, okno `portrait-gallery--exhausted` rośnie z treścią; nazw plików portretów gracz nie widzi (zostają w `aria-label`).
- **Pierwsze położenie okna, które nie może stać na chromie stołu, liczy się w chwili otwarcia (29.09, #34)** — `NetRunWindow` montuje ciało (`NetRunWindowBody`) dopiero z runem, a `netRunFallback` mierzy `.map-area`, `.combat-bar` i `.gm-attention-badge`, rezerwując pas kolejki i znacznik także wtedy, gdy ich jeszcze nie ma (walka przyjdzie później i zepchnie mapę). Wysokość okna bez własnego rozmiaru przycina `maxHeight` od tego położenia, inaczej `clampPlacement` podciąga je z powrotem na pas.
- **Zakładka „Walka” to portrety z ranami, a inicjatywa żyje wyłącznie na czarnym pasie (26.09, etap 43a)** — `CombatPanel` rysuje `CombatantCard` z `WoundPortrait`: odsetek ran barwi portret od dołu (kopia obrazu w szarości + `--wound-tint` przez `multiply`, przycięta `clip-path` z `--wound`), trup (`tokenCondition` = `dead`) jest czarno-biały; ikony na portrecie składa `portraitMarks` (naklejki bez stanów ran, efekty na Cechach, chwyt, wstrzymana Akcja, `owes`). Akcje grającego (`CombatActions`) stoją pod **jego** kartą, nie pod listą. Rzut/przerzut, remis, ręczny wpis (klik w liczbę żetonu, `ChipInitiative`), kubek gracza i przeciąganie kolejności są w `CombatBar` — do zakładki nie wracają. Kolory portretu mają własny blok w `theme.css` bez pary dziennej (to zdjęcie, nie chrom). Kadr portretu w dowolnej ramce: `usePortraitFrameStyle(url, aspect)`.
- **„Postacie” to karty w dwa wiersze (`character-row--card`, 26.09)** — klasy bazowe wiersza dzieli panel botów, więc nowy wygląd idzie przez modyfikator; właściciel to słowo (`OwnerPicker`), lista dopiero po kliknięciu.
- **`window.__vttE2E` istnieje tylko w buildzie `vite build --mode e2e` (26.09, T1 testów; liczniki `counts()` od 02.10, T7c)** — `e2e-hook.ts`: kamera (`worldToClient`), magazyny i liczniki Pixi/kości/DOM do odczytu; oba wejścia owinięte w `import.meta.env.MODE === 'e2e'`, więc w zwykłym buildzie to martwy kod. Test `00-baseline` pilnuje, że napisu nie ma w paczce produkcyjnej. Nowy magazyn dla testów dopisuje się do `stores` w haku (`fixtures/vtt-e2e.d.ts` ma `Record<string, …>`, więc tam nic). Od 03.10 (T8c) w `stores` są też `drawing`, `selection`, `music`, `settings`, `cover`, `light`, `table`.
- **Sprawa czekająca na MG — gałąź w `gmAttentionItems` (`gm-attention.ts`) + `data-attention` na wierszu decyzji (25.09)** — klucz wyłącznie z `gmAttentionKey`. Lista jest liczona z magazynów źródłowych, nie prowadzona osobno; kafel i dźwięk daje tylko **push** owinięty w `watchGmAttention` w `socket.ts` (odpowiedzi po synchronizacji milczą, więc F5 nie dzwoni historią). Prośba o Test nie dzwoni już z `chatNotification`.
- **Prawy górny róg mapy to kolumna `.map-corner` (25.09)** — „Czeka na MG” nad dokiem handli; nowa nakładka w tym rogu staje w kolumnie, a nie dostaje własnego `position: absolute`.
- **Portret ma dwa kadry: żetonu i banera lewego panelu (25.09)** — `PortraitAsset.bannerX/Y/Zoom` (puste = „jak żeton”), baner rysuje wyłącznie `portraitBannerFor` (`shared/portrait-crop.ts`) przez `bannerImageStyle` (`portrait-banner.ts`); okno kadru ma zakładki „Żeton” / „Baner”, a `portrait:crop` niesie `bannerCrop` (brak — bez zmian, `null` — „jak żeton”) z tymi samymi prawami co kadr żetonu: MG wszystko, gracz portret własnej postaci. Karta, kreator i czat pokazują plik w całości.
- **Tło menu kontekstowego zamyka prawym przyciskiem tylko po `pointerdown` na sobie (25.09)** — `MenuBackdrop` w `TokenContextMenu.tsx`; nowe menu z tłem bierze ten komponent, nie gołe `onContextMenu={onClose}`. Na Windows `contextmenu` gestu otwierającego przychodzi po `mouseup` i trafia w tło pod ściętym rogiem.
- **Pole bez własnej klasy dostaje papier z `:where(input[type='number'], select, textarea)` i `::file-selector-button` w `03-entry.css` (25.09)** — zerowa specyficzność, więc każda reguła klasy wygrywa; nowe pole z własnym wyglądem pisze go klasą, a nie zdejmuje bazowej. `search` stoi obok `text` w regule z paddingiem.
- **`.dialog` ma wysokość przyciętą do okna i przewija się w środku (25.09)** — `max-height: calc(100dvh - 2rem)` + `overflow-y: auto` w `05-tokens.css` dla wszystkich dialogów naraz; `clip-path` ściętego rogu i tak obcinał wszystko poza ramką, więc przewijanie niczego nie chowa. Dialog, który ma własny limit (`.creator-dialog`, `.portrait-gallery`), nadpisuje go swoją regułą — nie zdejmuj bazowej.
- **Główny ekran od 25.09: portret w lewym panelu to baner, filtry czatu — czarny pas pod zakładkami.** Imię, Rola i PW figury leżą **na** portrecie (`.hud-portrait-caption`, nocne tokeny z bloku „Belka”); nowa informacja o figurze idzie pod baner, nie na obraz. Filtry czatu to `.chat-filter-bar` na liście belek w `chrome.css` i w „Belce” — nowy filtr dostaje sylwetkę z `public/icons/hud/` przez `HudIcon`, nie emoji. Nad zakładkami stoi `PresenceList` w jednym wierszu; zakładki są szerokie według nazwy i zawijają się, zamiast ucinać.
- **Kolejka inicjatywy to czarny pas nad mapą, a „Kończę turę” gracza — góra lewego panelu (25.09).** `CombatBar` stoi w `.map-column` nad `MapArea` i istnieje tylko w trybie turowym; czerwony pasek trzyma wyłącznie `TurnModeSlot` („Włącz tryb turowy” MG). Pas bierze nocne tokeny z bloku „Belka” w `theme.css` (`.combat-bar` na liście) i czarne tło z listy belek w `chrome.css`. Przycisk gracza to `HudEndTurn` / `HudEndTurnCompact` (`HudEndTurn.tsx`), niezależny od zaznaczenia; nowy element pasa dostaje `flex: none`, a ustępuje wyłącznie kolejka i przypomnienie.
- **Audio stołu (21.09):** `cup-notification.ts` sygnalizuje tożsamość aktywnego
  kubka; wezwanie i załadowany Test dzielą klucz. `music-player.ts` ma jeden
  odtwarzacz niezależny od otwarcia okna. Dźwięki nowe mają być naturalne;
  `game-notifications.ts` adresuje nowe zdarzenia, `Scene.ambience` wybiera otoczenie.
  YouTube służy wyłącznie do importu MP3 (`music-import.ts`, `tools/audio`), bez wideo.
  Głośności powiadomień, otoczenia i muzyki nie zależą od animacji. Pełna umowa i źródła:
  `docs/assety-audio.md`.

- **`styles.css` jest spisem `@import` — 19 plików `styles/NN-obszar.css` w kolejności kaskady** (od 18.09). Nową regułę dopisuj do pliku swojego obszaru, nowy obszar to nowy plik wpięty do spisu tam, gdzie stałby w dawnym pliku; `theme.test.ts` bierze listę plików ze spisu. Nie łącz plików z powrotem i nie zmieniaj kolejności — `.small-button--primary` musi stać po `.small-button`.
- **Skóra chromu „stara kartka” mieszka w `chrome.css` + tokenach `--paper-*`, `--notch*`, `--font-ui*`** — nowa duża powierzchnia (panel, okno, dialog) dopisuje się do list w `chrome.css` (kafel, ścięty róg, belka), nie dostaje własnego `background-image`; czerwony nagłówek musi stać na **obu** listach: w `chrome.css` i w bloku „Belka” w `theme.css`. Źródła kafli i granice: `docs/assety-chrom.md`.
- **Okno, w którym klawisze należą do niego, nosi `data-owns-keys`** — nasłuch mapy w `MapArea` pomija zdarzenia z jego wnętrza (Tab, Delete, litery narzędzi, cyfry paska, Esc). Od 2b mają go kreator i karta postaci; znacznik mówi „gdzie jest fokus”, nie „czy okno jest otwarte”.
- **Pełny ekran — wyłącznie przez `fullscreen.ts`**, nigdy gołe `requestFullscreen`: nowe wejście do gry woła `enterPreferredFullscreen()` **przed** pierwszym `await` w obsłudze gestu, a automat po F5 i tłumik przytrzymanego Esc żyją w `useFullscreen` w korzeniu `App`. Kolejność pilnuje `fullscreen.test.ts`.
- **Naklejka statusu poza mapą** — wyłącznie `StatusIcon` (`HudIcon.tsx`), nigdy `<img>`: maska z `mask-mode: luminance` (`.status-icon`) gasi czarny podkład pliku i barwi sylwetkę kolorem tekstu. Rozmiar daje kontekst w CSS, nie atrybuty. Mapa rysuje te same pliki jako sprite'y **z** podkładem i tak zostaje.
- **Ekran wejścia (`.auth-screen`) stoi na plakacie** — formularz nie ma tła i kotwiczy się do ramki **narysowanej w obrazie**, nie do środka okna. Zmiana pliku tapety = przemierzenie ułamków (`docs/assety-logowanie.md`); zdjęcie kotwicy = oddanie formularzowi tła.
- **Okno otwierane znad karty postaci potrzebuje `z-index: 400`** — dopisz jego klasę do listy `.dialog-backdrop:has(…)` obok `.roll-dialog`; `.sheet-window` ma 300, a backdrop 50.
- **Nowe pływające okno** — hook `useWindowPlacement` (`window-placement.ts`) + `<WindowResizeGrip />`; uchwyt 13 px od krawędzi, bo róg jest wycięty.
- **Kolor** — wyłącznie w `packages/client/src/theme.css`; pilnuje `theme.test.ts` (literał w `styles/*.css`/`sheet.css`, token bez odbiorcy, token chromu bez pary dziennej).
- **Ikonowy przycisk** — `title` + `aria-label`, gdy treścią jest znak; ikony SVG są `aria-hidden`, więc tam wystarczy `title`. Pilnuje `a11y.test.ts`.
- **Nowy element górnego paska** — do prawej grupy tylko `flex: none`; miejsce oddają wyłącznie tytuł i nazwa kampanii (wielokropek), a środek (`.top-bar-turn`) ma `min-width: min-content`, żeby nie malować przycisków po sąsiadach.
- **Czynność, której nic nie cofa** — `confirmDestructive` (`confirm.ts`), nie gołe `window.confirm`: poza poligonem pytanie niesie nazwę kampanii. Nie kłóci się z „kasowanie nie pyta" z 23.08 — tamto dotyczy obiektów sceny, które wracają `Ctrl+Z`.
- **Zdanie „czego brakuje" w pasku postaci** — `HudContext.sheetNotMine`, renderowane **niezależnie** od `slots.length`: Akcje z katalogu nie potrzebują karty, więc pasek gracza nigdy nie jest pusty.

---

**Hak testów `window.__vttE2E` — tylko build `--mode e2e`, tylko odczyt (26.09.2026, T1 testów bety).**
Zgoda MG z 26.09 (`testy.md` 4.3). `installE2EHook()` z `main.tsx` wystawia magazyny, a `MapArea`
rejestruje renderer przez `exposeMapToE2E` (i wyrejestrowuje przy sprzątaniu); `MapRenderer.worldToClient`
przelicza punkt sceny na `clientX/Y`, żeby automat klikał w płótno z kamery, nie z pikseli zrzutu.
Każde wejście jest owinięte w `if (import.meta.env.MODE === 'e2e')` — Vite podmienia to na stałą
i minifikator wycina całość z buildu produkcyjnego; **nie** zamieniaj tego na wczesny `return`, bo
martwy kod za nim nie zawsze wypada. Hak niczego nie zmienia — stan rusza się przez UI albo gniazdo.
Kształt powtórzony w `packages/e2e/fixtures/vtt-e2e.d.ts`: zmiana w jednym = zmiana w drugim.
**Od 02.10 (T7c, zgoda MG) hak ma też `counts()`** — liczniki do szukania wycieku: `MapRenderer.e2eCounts()`
(węzły drzewa Pixi, napisy, tekstury z `renderer.texture.managedTextures` z wagą RGBA, wpisy `Cache`
`Assets`, figury), `diceE2ECounts()` z `dice3d.ts` (geometrie i tekstury three.js, ciała fizyki,
kolejka) i DOM. Obie funkcje istnieją w każdym buildzie, ale woła je wyłącznie blok `MODE === 'e2e'`;
czytają pola bez typów (`_cache`, `renderer.info`), więc po aktualizacji `pixi.js` albo
`@3d-dice/dice-box-threejs` licznik może dać `-1` — to sygnał do poprawki haka, nie aplikacji.


**„Czeka na MG” — wyraźne powiadomienie o decyzjach MG (25.09, zlecenie MG poza etapami).** Dotąd
każda sprawa miała własną cyfrę na własnej zakładce, a prośba o zgodę na nową postać nie dzwoniła
wcale. Rozstrzygnięcia MG: **cztery źródła** (zgoda na postać; szkic czekający na Rangę i karta
czekająca na „Przyjmij do gry”; prośby o Test i oględziny; propozycje botów, które rozstrzyga
tylko MG — `controllerUserId === null`), **trwały znacznik + wyskakujący kafel**, kliknięcie
**przenosi** do miejsca decyzji (zgoda na postać niesie warunki, więc decyzja zostaje w panelu),
**licznik w tytule karty** i **dźwięk `request` dla każdej nowej sprawy**; powiadomienia systemowe
Windows — odrzucone. Znacznik stoi w `.map-corner` nad dokiem handli, kafel żyje 9 s, lista
rozwija się pod znacznikiem, „Przejdź” ustawia `focus` w `gmAttentionStore`, a `SidePanel`
przełącza zakładkę i po dwóch klatkach przewija do `[data-attention]` z błyskiem
`.attention-flash`. Nowe źródło: gałąź w `gmAttentionItems`, klucz w `gmAttentionKey`, atrybut na
wierszu i — jeśli przychodzi nowym zdarzeniem — `watchGmAttention` wokół jego obsługi.

**Kadr portretu w banerze lewego panelu (25.09, zlecenie MG).** Kadr robiony pod żeton trafia też do
banera 4:3: punkt kadru na środku szerokości, a **górna krawędź krążka żetonu u góry banera** (poprawka
MG z 25.09 — pierwsza wersja stawiała punkt kadru na 40 % wysokości i ucinała czubki głów; portret
bez kadru trzyma się góry grafiki, `object-position: 50% 0%`, zamiast 22 %), skala taka,
że to, co krążek pokazuje na całej średnicy, zajmuje 2/3 wysokości banera (decyzja MG: „szerzej,
więcej postaci”) — ale nigdy mniejsza niż pokrycie ramki, więc przy wąskim portrecie bez
przybliżenia baner wychodzi tak szeroki jak sam obraz. Przy krawędzi obrazu kadr się dosuwa zamiast
odsłaniać pusty pas (na mapie zamalowuje go tło żetonu, w panelu nie ma czym).

**Własny kadr banera (25.09, zlecenie MG: „właściciel tokena sam kadruje oba wystąpienia”).** Portret
w puli ma drugi kadr — trzy puste kolumny `bannerX/Y/Zoom`, dopóki nikt go nie ustawi; wtedy baner
liczy się z kadru żetonu jak wyżej. Własny kadr ma inne znaczenie liczb niż żetonowy: punkt kadru
na **środku** ramki, `zoom` 1 = obraz dokładnie pokrywa baner, a ramka **nie** wyjeżdża poza obraz
(`clampPortraitBannerCrop`). Rozstrzygnięcia MG: **dwie zakładki w jednym oknie**, baner bez kadru
**wylicza się z żetonu** („Jak żeton” wraca do automatu), wejście **z dotychczasowych miejsc**
(przycisk przemianowany na „Kadr portretu”). Zakładka „Baner” rusza od tego, co już widać
(`portraitBannerCropOf`), więc pierwsze przeciągnięcie nie przeskakuje.

**Menu figury gasło w chwili otwarcia — `MenuBackdrop` (25.09, trzynasta sesja).** Menu otwiera się
na `pointerdown` prawego przycisku na mapie, a jego lewy górny róg stoi pod kursorem. Od skórki
z 18.09 ten róg jest ścięty (`clip-path` z listy okien w `chrome.css`), więc piksel pod kursorem
należy do tła. Na Windows `contextmenu` przychodzi dopiero po `mouseup` — trafiał w tło, a tło
zamykało menu. Automat (Playwright, Chromium i Firefox) widział to za każdym razem; syntetyczne
`PointerEvent` z pułapki 12.09 omijały problem, bo wysyłały `contextmenu` wprost na `canvas`.
Tło pamięta teraz, czy prawy przycisk wciśnięto **na nim**, i tylko wtedy zamyka menu; zabłąkany
`contextmenu` połyka. Dotyczy obu wersji menu (MG i gracza).

**Pola formularzy bez klasy — papier zamiast gołej kontrolki (25.09, decyzja MG).** Globalny styl pól
obejmował tylko `text` i `password`, więc wyszukiwarki, listy, pola liczbowe i wybór pliku bez własnej
reguły rysowały się jak kontrolki systemu — w motywie dziennym białe na kartce (zgłoszone
z oględzin Firefoksem). `search` dołączył do reguły z paddingiem; `number`, `select` i `textarea`
dostały tło, kolor i ramkę przez `:where(...)`, bez paddingu, żeby nie ruszać rozmiarów pól, które
opierały się na natywnych. Lista postaci pod wpisem Kompendium ma dodatkowo własną regułę
(`.compendium-assign select`).

**Główny ekran: baner portretu, pas filtrów czatu, zwarty nagłówek panelu (25.09, zlecenie MG
poza etapami).** MG chciał większego portretu i filtrów czatu, które nie wiszą „doczepione” przy
belce. Rozstrzygnięcia MG: **portret na całą szerokość karty w kadrze 4:3**, a imię, Rola i PW na
czarnym przejściu u dołu obrazu — to odwraca wybór z 12.09 („portret obok imienia, karta nie
rośnie w dół”), karta rośnie o ~4 rem; chipy SP/RUCH/EMP w jednym rzędzie pod banerem; bez
portretu niski pasek z inicjałem zamiast pustego kadru. **Belka „Czat” zdjęta** (powtarzała
zakładkę), **filtry to czarny pas na całą szerokość** z czterema równymi przełącznikami
(sylwetki game-icons zamiast emoji, bo emoji nie bierze `currentColor`); włączony — biały napis
i czerwona kreska jak zakładka, wyłączony — przygaszony, ale widoczny. Pas ma własny kontener
(`chat-filters`), a nie `.side-panel`: `container-type` na panelu zrobiłby z niego blok
zawierający dla `position: fixed` okienek z paneli. **Obecni w jednym wierszu** z nazwą kampanii;
**zakładki szerokie według nazwy** (`flex: 1 1 auto`) i zawijane w wąskim panelu, rząd MG na
papierze z czarnym kaflem otwartej zakładki. **Pole i „Wyślij” to jedna listwa**; pusty szkic
gasi przycisk do papieru (półprzezroczysta czerwień dawała róż). Belki BROŃ/AKCJE w lewym panelu
mają ścięty róg jak belki karty, a kreska `::after` sprzed czarnego tła zniknęła.

**Pas kolejki inicjatywy i „Kończę turę” (25.09, zlecenie MG poza etapami).** Kolejka wyszła
z czerwonego paska (tam od 01.08) do własnej czarnej belki między paskiem a mapą — **tylko nad
kolumną mapy**, panele boczne zostają pełnej wysokości. Pas pojawia się wyłącznie w trybie
turowym; Pixi mierzy `.map-area` obserwatorem, więc płótno po prostu się skraca. Powody MG:
złoto `--warn` na czerwieni było nieczytelne, a „Kończę turę” miało wagę przypomnienia.
Rozstrzygnięcia MG: paleta ta sama, role barw wolno przestawić; **tło pasa czarne**;
**„Kończę turę” tylko w lewym panelu**, zawsze w turze gracza (także bez zaznaczonej figury;
zastępuje napis „Twoja tura”, baner „Tura tej figury” został u MG); **MG prowadzi kolejkę
◀ ▶ z pasa**, bez przycisku w panelu. Wygląd: aktywny żeton w czerwieni karty z pęknięciami,
większy; ci, którzy już grali w tej rundzie, przygaszeni (`combat-chip--done`, po kolejności
w liście); portrety kwadratowe ze ściętym rogiem jak w panelu; ◀ ▶ ✕ jednym stylem, ✕ na końcu
pasa. Wąski pas (`@container`, poniżej 44 rem) chowa imiona poza aktywnym, a przypomnienie
zwija się do ⚠ wcześniej niż kolejka. Przycisk w panelu blokuje drugie kliknięcie do ruchu
kolejki albo odmowy serwera — inaczej podwójny klik oddawałby też turę drugiej figury gracza.

**`styles.css` pocięty na 19 plików w `styles/` (18.09).** Jeden plik miał 11 530 linii (242 KB)
i każde przeczytanie go w całości kosztowało ~60 k tokenów kontekstu. Podział poszedł **po granicach
sekcji i bez zmiany kolejności** — zbudowany przez Vite arkusz jest bajt w bajt ten sam, bo
`postcss-import` wkleja `@import` w kolejności spisu. Pliki: `01-base` (kroje, mapa, panel),
`02-chat-dice`, `03-entry`, `04-panels`, `05-tokens`, `06-sheet-window`, `07-ai-compendium`,
`08-readiness`, `09-turn`, `10-map-combat`, `11-actions`, `12-hud`, `13-handouts`, `14-windows`,
`15-screamsheet`, `16-creator`, `17-net`, `18-check-calls`, `19-figures-exchange`; nagłówek każdego
mówi, co zawiera. Trzy rzeczy do pilnowania:

- **Szukaj selektora `grep`-em po `styles/`**, a czytaj tylko trafiony plik — to cały sens podziału.
- **Kolejność to kaskada.** Reguła, która musi wygrać z inną, stoi w pliku o wyższym numerze albo
  niżej w tym samym; nie przenoś reguł między plikami „dla porządku”, bo `.small-button--on`
  i `.dialog-backdrop:has(…)` zależą od miejsca (pułapki w `ui` i `karta`).
- **`chrome.css` i `sheet.css` zostają osobno** i ładują się po spisie — nie wpinaj ich do niego.

**Skóra UI — wspólna z kartą postaci (20.09).** `chrome.css` używa palety
`--cp-*` przez aliasy `--bg-*`, `--border*`, `--text*`. Kafle `--paper-tile` są
przezroczystą wersją maski karty; `tools/art/chrome-paper.py` czyta kolory i krycie
z `theme.css`. Po zmianie `--cp-wear`, `--cp-wear-alpha` albo maski uruchom generator.
Skala `--paper-size` jest aliasem `--cp-wear-size`. Bez `soft-light`.

Nowe powierzchnie dopisuj do list w `chrome.css`; czerwone nagłówki okien także
do listy „Belka” w `theme.css`, która zapewnia jasny tekst w obu motywach.

**Od 24.09 każda skóra ma własną maskę wytarć** (`--cp-wear-mask`; dzień:
`paper-wear-day.jpg` z `day_mask` w `sheet-paper.py`), a `chrome-paper.py` czyta ją
z motywu. Nowa duża powierzchnia dostaje z listy w `chrome.css` także przypalony brzeg
(`box-shadow: var(--paper-edge)`, w nocy `none`). Jaśniejsza wklejka na panelu bierze
`--paper-card`, a nie `--cp-paper` wprost, bo w nocy ma zostać kartonem. Siła wytarć
nad kartą to `--cp-wear-print`, osobno od `--cp-wear-alpha` kafli.
Sekcje i zakładki mają czarne belki. Karta/kreator, mapa, Sieć, screamsheet i ekran
wejścia zachowują własne reguły. Ścięte rogi i uchwyty 13 px od brzegu bez zmian.
Szczegóły, źródła i polecenie generatora: `docs/assety-chrom.md`.

---

**Klawisze z wnętrza okna nie sterują mapą, jeśli okno ma `data-owns-keys` (16.09, naprawa 2b).**
Nasłuch klawiatury mapy (`MapArea`, `window`) omijał tylko pola tekstowe, więc fokus na
**przycisku** okna oddawał mapie wszystko: `Tab` robił `preventDefault` i przełączał figury zamiast
przejść do następnego pola, `Delete`/`Backspace` kasowały zaznaczony obiekt sceny, litery zmieniały
narzędzie. Kreator i karta postaci mają odtąd `data-owns-keys` na `<section>`, a strażnik
w `MapArea` sprawdza `closest('[data-owns-keys]')`. Znacznik dotyczy **miejsca fokusu**: klik
w mapę albo w niefokusowalne tło okna oddaje klawisze mapie, więc MG nadal przełącza narzędzia
z otwartą kartą obiektu sceny (pułapka z 24.08 w `ui`). Skutek uboczny przyjęty przez MG: cyfry paska
akcji nie działają, póki fokus stoi na przycisku karty. Nowe okno z przyciskami, po których chodzi
się klawiaturą, dostaje ten sam atrybut; bez niego `Tab` po jego przyciskach nie działa. Okno
potwierdzenia w kreatorze (`CreatorDialog`) trzyma `Tab` w sobie, zaczyna od „Anuluj” i zamyka się
`Esc` z `stopPropagation`, żeby nie odłożyć przy okazji kubka.

**Pełny ekran ma jedno miejsce: `fullscreen.ts` (12.09, zlecenie MG poza etapami).**
Życzenie leży w `settingsStore.fullscreen` (`vtt.view.fullscreen`, prywatne dla przeglądarki), ale
samo pole niczego nie włącza — robi to moduł, bo przeglądarka wpuszcza w pełny ekran wyłącznie
w odpowiedzi na gest. Wejścia są trzy: przełącznik (`setFullscreenPreference`), formularze logowania
i dołączania (`enterPreferredFullscreen()` **przed** `await` — Firefox nie uzna gestu po odpowiedzi
serwera) oraz automat po odświeżeniu strony w `useFullscreen` (korzeń `App`, bo MG ląduje też
w `/gm`). Automat działa **raz na wczytanie strony** i gaśnie po odmowie przeglądarki — kto sam
wyszedł, nie zostaje wciągnięty z powrotem; wylogowanie (`leaveFullscreenOnLogout`) wychodzi
i odnawia automat. W pełnym ekranie Esc idzie pod Keyboard Lock (Chrome, Edge, tylko HTTPS
i localhost), a powtórzenia przytrzymanego Esc tłumi nasłuch w fazie przechwytywania na `window`.
**Nowy nasłuch Esc nie musi o tym wiedzieć**, byle nie dopinał się w przechwytywaniu na `window`
przed `App`. Gołe `requestFullscreen` gdzie indziej zużyje gest i rozjedzie stan automatu.

**Naklejka statusu w interfejsie to maska z jasności — nie `<img>` i nie maska z alfy (12.09).**
Pliki z `data/public/cpred/status-icons/` mają pod białą sylwetką nieprzezroczysty czarny kwadrat:
na mapie potrzebny (biel bez podkładu ginie na jasnym żetonie), w panelu obcy motywowi. `StatusIcon`
podaje adres pliku w `--hud-icon`, jak `HudIcon`, a `.status-icon` przełącza maskę na `luminance`.
Rozmiar ustawia kontekst (`.hud-status .status-icon`, `.context-menu-status .status-icon`,
`.token-group-statuses .status-icon`) — nowe miejsce ze statusem poza mapą dopisuje tylko własny
rozmiar.

**Ekran wejścia stoi na plakacie i kotwiczy się do obrazu, nie do okna (11.09).**
`.auth-screen` (logowanie MG, dołączanie gracza, ekran startowy) ma tłem
`public/art/login-poster.webp`. Plakat ma pośrodku **narysowaną czerwoną ramkę celownika** i to
ona jest ramką formularza — dlatego formularz **nie ma własnego tła ani obwódki**, tylko napisy
wprost na papierze. Wolno tak wyłącznie dlatego, że jest kotwica: `translate` podnosi formularz
o 11,16% wysokości plakatu, bo środek tej ramki leży na 38,8% wysokości pliku, a nie na 50%.
Wyliczenie odtwarza geometrię `background-size: cover`, więc trzyma się przy każdym kształcie
okna — sprawdzone na 1907 × 1024, 430 × 880 i 1500 × 460.

Trzy rzeczy, o które trzeba tu zahaczyć:

- **Podmiana pliku tapety wymaga przemierzenia ułamków.** Współrzędne ramki, barwy i kontrasty
  siedzą w `docs/assety-logowanie.md`; nowy obraz to nowe liczby w `styles.css` i `theme.css`.
- **Zdjęcie kotwicy wymaga oddania formularzowi tła.** To kotwica gwarantuje, że pod napisami
  jest równy kremowy papier. Bez niej napisy wylądują na sylwetce punka albo na neonach.
- **Wyliczenie siedzi w miejscu, nie we własnej zmiennej CSS** — `theme.test.ts` wymaga, żeby
  każdy `var(--…)` w `styles.css` był zdefiniowany w motywie, a to geometria kadru, nie kolor.

Kolory idą w `--login-*` i **nie mają pary dziennej**: plakat jest fikcją, nie chromem aplikacji,
tak samo jak mapa, Sieć i screamsheet.

**Okno otwierane znad karty postaci potrzebuje `z-index: 400` (06.09, etap 40).**
`.sheet-window` ma 300, a `.dialog-backdrop` — 50. Okno prośby i okno wezwania dopisały się do
listy `:has()` obok `.roll-dialog`, bo obydwa otwiera się przy rozłożonym arkuszu: prośbę
Alt+klikiem w wiersz, wezwanie przyciskiem „Ustaw…" na karcie czatu. Bez tego okno **powstaje,
ale nie widać niczego** — ekran przygasa scrimem, a treść zostaje pod arkuszem.

**Pływające okno bierze się z `useWindowPlacement`, nie z własnego `dragRef`.** Nowe okno
dostaje hook (`window-placement.ts`) plus `<WindowResizeGrip />` w rogu — i tyle. Uchwyt siedzi
**13 px od krawędzi**, bo róg okna jest wycięty (`clip-path` karty z 27a, zaokrąglenie
pozostałych okien) i uchwyt dosunięty do rogu przepuszcza kliknięcie na mapę pod spodem.

**Ikonowy przycisk potrzebuje `title` i `aria-label`, ale tylko wtedy, gdy jego treścią jest
znak.** Ikony SVG (`MapIcons`, `UiIcons`) są `aria-hidden`, więc tam `title` wystarcza za nazwę
dostępną. Pilnuje tego `a11y.test.ts`.

**Kolor dokłada się tylko w `theme.css` — i pilnuje tego test.** `packages/client/src/theme.test.ts`
(pierwszy test w tym pakiecie) przewraca się, gdy w `styles.css` albo `sheet.css` pojawi się
literał koloru, gdy ktoś sięgnie po token, którego nie ma, gdy token zostanie bez odbiorcy albo
gdy tokenowi chromu zabraknie pary dziennej. Wszystkie cztery ścieżki sprawdzone celowym
psuciem plików, nie samym „przechodzi".

**Nowy element w górnym pasku ma nie kurczyć się w nieskończoność.** `.top-bar` to trzy grupy:
tytuł, `.combat-bar` i `.top-bar-right`. Miejsce oddają **tylko** te, które mogą (tytuł
i nazwa kampanii — wielokropkiem); przyciski i stan połączenia są `flex: none`, a kolejka
inicjatywy ma `min-width: min-content`, żeby nie zwinąć się do zera i nie wypuścić swoich
przycisków na sąsiadów (tak powstało nachodzenie przy ~900 px). Dokładając coś do prawej grupy,
sprawdź pasek przy ~900 px — poniżej 1000 px tytuł aplikacji znika i to jest cały zapas.

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

## kosci — Kości, Testy i wezwania

- **Notacja kości na ekranie to „k” — `displayDiceNotation` (03.10, #65)** — `shared/src/dice.ts`; karty czatu (`ChatPanel`), etykiety kubka (`DiceCup`), okno rzutu, tabele losowe. Parser i kości 3D dalej mówią „d”; nowe miejsce, które pokazuje `roll.notation` albo formułę, przepuszcza ją przez tę funkcję. Wpis rozbicia z `lookup: true` (Cecha z tabeli Roli w kreatorze) rysuje się „SW: rzut 8 → 6”, nie „+6”.
- **Modyfikator inicjatywy z karty to `cpredSheetInitiative` (03.10, #61)** — `shared/systems/cpred/initiative.ts`: REF z efektami i karą pancerza + Błyskawiczna reakcja (remis tylko REF). Czyta go `readSheetInitiative` (serwer, `combat:roll`) i kubek gracza (`CombatBar` → `initiativeModifierOf`); figura bez karty rzuca gołe 1k10.
- **Klon geometrii z wymuszonej ścianki zwalnia `installGeometryRelease` (02.10, #51)** — `dice3d.ts` owija na instancji kubka `swapDiceFace` (zwalnia klon wyparty drugą podmianą tej samej kości) i `clearDice` (zwalnia klony kości zdejmowanych ze stołu); geometrie `DiceFactory.geometries` są wspólne dla typu kości i zostają. Nowa łatka biblioteki, która podmienia kości `geometry` albo `material`, zwalnia to, co wypiera. Strażnik: `dice3d.test.ts` › „#51”, próg w `t7c-pamiec` (`ROLL_LEAK_GEOMETRIES`).
- **Rzut, który czekał w kolejce prezentacji > 3 s, wychodzi kartą bez animacji (02.10, #48)** — `CATCH_UP_LAG_MS` w `socket.ts`, opóźnienie mierzy `rollPresentation.lagMs()` (czas od przyjścia z gniazda do obsługi). Pauza 2,5 s przed kartą urywa się, gdy za rzutem czeka następny (`untilRollWaiting`); rzut znakuje trzeci argument `onPresented`. Reszta ruchu dalej czeka za kośćmi (umowa z 22.09 bez zmian), ale stół jest najwyżej kilka sekund za serwerem.
- **Skrypt kości E2E — `VTT_DICE_SCRIPT` czyta WYŁĄCZNIE `createMixedRng` (26.09, T1 testów)** — `realtime/dice-script.ts`: plik z kolejką ścianek, każda kość serwera zdejmuje pierwszą; pusta kolejka = zwykłe losowanie. `NODE_ENV=production` wyłącza go bez wyjątku. Nowe losowanie na serwerze idzie przez `createMixedRng`, inaczej scenariusz E2E go nie wymusi.
- **Wynik czeka na animację we wszystkich widokach (22.09)** — `rollPresentation` w `socket.ts` zachowuje kolejność komunikatów, odpowiedzi kreatora i odczytów stanu. Nowy odbiornik widoku rejestruj przez `onPresented`, a odpowiedź z wynikiem przez `rollPresentation.deliver`. `playRollAnimation` kończy obie fale; timeout najpierw zatrzymuje i usuwa kości. Chwyt kubka nie przerywa prawdziwego rzutu.
- **Kara za rany w rozbiciu rzutu składa się w JEDNYM miejscu — `cpredWoundPenaltyRows(cpredSheetWoundCondition(sheet))`** (`rolls.ts`); woła ją `finishCheck` i atak, a rachunki ręczne (kubek Ustabilizowania i Leczenia, targowanie, napis na karcie) biorą `cpredSheetWoundCheckPenalty`. Zawieszenie (Stym, Edytor bólu) to **własny wiersz obok kary**, nie brak kary; `woundCheckPenalty(woundState(hp, stats))` na karcie to regres z 38a.
- **Wezwanie do Testu powstaje w JEDNYM miejscu — `createCheckCall`** (`realtime/checks.ts`); wołają je `check:call` i zgoda na prośbę z 40, a ramę MG (próg, modyfikator, widoczność) czyta wspólne `parseCheckFrame`. Druga kopia rozjedzie się przy pierwszej zmianie wezwania.
- **Prośba o Test nie zna progu ani widoczności** — `CheckRequestPayload` to `CheckCallPayload` bez tego, co należy do MG. Przy zgodzie Umiejętność idzie z **zapisanej prośby**; podmienić ją da się wyłącznie przez „Ustaw…”, czyli `check:call` z `requestMessageId`.
- **Prawo do prośby czytaj z bazy, nie z karty czatu** — `askedById` służy do rysowania; `check:request` sprawdza `character.ownerId`, a `check:request-cancel` — `authorId` zapisanej wiadomości. Postaci, której już nie ma, odpowiada **odmowa ze śladem na karcie**, nie cisza.
- **Kubek nie woła na prośbę, i rozstrzyga to RODZAJ wiersza** — `openCheckCallFor` pomija `kind !== 'check'` wprost; przy prośbie progu jeszcze nie ma. Strażnik źródłowy: `check-request-cup.test.ts`.
- **Prośba o Test zamyka okno rzutu — naraz stoi jedno okno** — `askForCheck` gasi `rollStore` przed otwarciem prośby, w jednym miejscu dla obu wejść. Strażnik: `check-request-dialogs.test.ts`.
- **Losowanie z tabeli nie dotyka `rollStore`** — „Losuj” i `/tab` idą przez `table:roll`/`chat:send`, jak `/r` od etapu 03; kubek ma jeden slot i każdy `load…Cup` czyści resztę. Pilnuje tego strażnik źródłowy `tables-cup.test.ts`.
- **Rzut z tabeli idzie z `checkRule: false` i `plain: true`** (`rollRandomTable`) — `1d10` jest formułą Testu, więc bez tego dziesiątka eksploduje dorzutem i tabela dziesięciowierszowa daje 11. `plain` gasi malowanie skrajnych oczek na karcie.
- **Zakresy i graf podrzutów sprawdza się przy ZAPISIE, na całej kampanii** (`randomTableCoverageIssues`, `randomTableNestingIssue`) — ta sama funkcja w formularzu i w handlerze; limit trzech poziomów łamie też tabela, której nikt w tej chwili nie edytuje.
- **Rzut przeciwstawny z fikcją po drugiej stronie** bierze od MG **jedną liczbę** (`opponentBonus`) i sam losuje jej 1k10 obok kości gracza; remis wygrywa druga strona.
- **Rzut, który nie jest Testem** (Rzut na Śmierć, Test Rzetelności), omija `finishCheck`: bez Cechy, Umiejętności, kary za rany i eksplozji, `checkRule: false`. Wszystko, co Testem **jest**, przez `finishCheck` przechodzi — także Efekt Charyzmy z samą rangą w rozbiciu.
- **Podgląd rzutu** bierze z karty to, co z niej widać (kary z ran przez `cpredInjuryModifiers`); serwerowi zostaje to, co wie tylko świat (Zwarcie).
- **Rzut na wezwanie MG** — `payloadFromCall` podmienia **cały** payload na zapisaną kartę wezwania (postać, Umiejętność, modyfikator MG, widoczność); z żądania klienta zostaje Szczęście i gest. Wezwanie zamyka `resolveAnsweredCall` + `emitCheckCallUpdate`, werdykt liczy `cpredCheckOutcome` (remis nie zdaje).
- **Kubek wołający wezwaniem** — `openCheckCallFor` czyta feed czatu (nie drugi magazyn stanu), a widzi je **tylko właściciel karty**; chwyt kubka otwiera okno rzutu, nie potrząsanie.

---

**Dogonienie rzutów: najwyżej kilka sekund za serwerem (02.10, poprawka #48 z T7b, decyzja MG).**
Klient odtwarza rzuty po jednym (lot ~3,5 s + 2,5 s pauzy przed kartą), a od 22.09 cały ruch
gniazda czeka za nimi. Pięć osób rzucających co kilka sekund wyprzedzało animacje: w T7b stół
zgadzał się z bazą po 14–19 min, mowa innego gracza dochodziła z medianą ~6 min. MG wybrał
„dogonienie” (nie rzuty naraz ani przyspieszanie) i zostawił czekanie reszty ruchu za kośćmi.
Dwie reguły w obsłudze `chat:message`: (1) rzut obsługiwany po ponad `CATCH_UP_LAG_MS` = 3 s od
przyjścia nie dostaje animacji — karta od razu, efekty mapy od razu; (2) pauza po wylądowaniu
kości to wyścig `CARD_REVEAL_DELAY_MS` z `rollPresentation.untilRollWaiting()`. Przy zwykłym tempie
nic się nie zmienia; przy rzucie inicjatywy kubkiem naraz animuje się pierwszy rzut (czasem dwa),
reszta wychodzi kartami. Testy: `socket-roll-presentation.test.ts` › „#48”, E2E `t7b-obciazenie`
(zgodność stołu po końcu obciążenia < 60 s).


**Skrypt kości E2E tylko przez `createMixedRng` i nigdy w produkcji (26.09.2026, T1 testów bety).**
Zgoda MG z 26.09 (`testy.md` 4.2). `VTT_DICE_SCRIPT` wskazuje plik z liczbami (spacje, przecinki,
nowe wiersze, `#` komentarz); `takeScriptedDie` zdejmuje pierwszą przy każdej kości i zapisuje
resztę, więc test dopisuje kolejkę do pliku przy żywym serwerze (`scriptDice` w `packages/e2e`).
Kolejność to kolejność losowania: dopisek Krytyka po 10 na k10 jest następną kością. Ścianka
większa od liczby ścian wysadza rzut — cichy powrót do losowania dałby test przechodzący przez
inną gałąź. Start serwera loguje ostrzeżenie w obu przypadkach („dice are forced from …” albo
„ignored in production”). Testy: `dice-script.test.ts`; losowanie z pominięciem `createMixedRng`
byłoby jedynym miejscem, którego scenariusz nie wymusi.


**Kara za rany składa się w JEDNYM miejscu: `cpredWoundPenaltyRows` (12.09).**
Do 12.09 wiersz „Poważnie ranny −2" dopisywały osobno `finishCheck` i `planCpredAttack`, a trzy
miejsca liczyły karę ręcznie — `haggle.ts`, podgląd kubka Ustabilizowania i Leczenia w `rollStore.ts`
i napis na karcie — **i każde z BC i SW**, choć umowa 38a mówi o maksimum karty. Statysta
z wydrukowanymi PW dostawał więc −2 w ataku i zero w Teście. Od teraz stan i to, co karę zawiesza,
podróżują razem (`CpredWoundCondition` z `cpredSheetWoundCondition`), wiersze składa
`cpredWoundPenaltyRows`, a liczbę dla rachunku ręcznego — `cpredSheetWoundCheckPenalty`. **Nowe
źródło zawieszenia dopisuje się w `cpredWoundSuspensionSource` (`woundsuspension.ts`) i nigdzie
indziej.** Zawieszana jest wyłącznie kara Poważnie Rannego; stan (PT Ustabilizowania, naklejka,
próg) zostaje, a −4 Śmiertelnie Rannego nie schodzi.

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

**Zakresy i graf podrzutów sprawdza się przy ZAPISIE, na całej kampanii.** Pokrycie liczy
`randomTableCoverageIssues` — **ta sama funkcja** w formularzu (podpowiedź po każdym znaku)
i w handlerze (odmowa), więc oba mówią to samo zdanie; klient nie zgaduje, co się uda. Graf
podrzutów sprawdza `randomTableNestingIssue` na **wszystkich** tabelach kampanii z tą jedną
podmienioną, bo dopisanie podrzutu w „broni" potrafi przekroczyć limit „łupu", którego nikt
w tej chwili nie edytuje — i odmowa musi paść tam, gdzie ktoś naprawdę klika zapis. Limit to
`RANDOM_TABLE_NESTING_MAX` = 3; czwarty poziom zamieniłby jedno kliknięcie w cztery karty naraz.
Losowanie ma **drugi** bezpiecznik w `rollRandomTable` (zbiór odwiedzonych plus licznik kroków),
bo baza może nieść graf sprzed tej reguły — import wchodzi do niej z boku.

**Rzut przeciwstawny z fikcją po drugiej stronie** bierze **jedną liczbę od MG**, a kość rzuca
sam: `character:haggle` dostaje `opponentBonus` (CHA + Handel + Znajomości drugiej strony)
i losuje jej 1k10 obok kości Fixera. Sprzedawca nie ma karty, więc pytanie o trzy składniki
osobno byłoby pytaniem trzy razy o jedno. Remis wygrywa druga strona — jak w każdym rzucie
przeciwstawnym w tym projekcie.

**Rzut, który nie jest Testem**, planuje się z pominięciem `finishCheck`: bez Cechy, bez
Umiejętności, bez kary za rany, bez eksplodującej dziesiątki i z `checkRule: false`. Tak jedzie
Rzut na Śmierć i tak jedzie Test Rzetelności z 30d (`plan.reliability` niesie szansę, pod którą
ma się zmieścić goła kość). Wszystko, co **jest** Testem, przechodzi przez `finishCheck` — także
Efekt Charyzmy, który ma w rozbiciu **samą rangę** zamiast pary Cecha + Umiejętność.

**Podgląd rzutu bierze tę część kontekstu, którą widać na karcie.** `RollDialog` woła
`planCpredRoll` z `modifiers: cpredInjuryModifiers(...)`, bo płaskie kary z ran są policzalne
z samej karty — bez tego okno obiecywało sumę, którą serwer po cichu obniżał (znalezione
w przeglądarce 30.08 przy ranie za −1). Serwerowi zostaje to, czego karta nie wie: Zwarcie jest
faktem o scenie, nie o postaci.

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

**Prośba o Test zamyka okno rzutu — naraz stoi jedno okno (06.09, poprawka do etapu 40).**
`askForCheck` gasi `rollStore` **zanim** otworzy prośbę, i robi to w jednym miejscu dla obu
wejść (Alt+klik w wiersz karty i przycisk „Poproś MG" w oknie rzutu). Bez tego okno rzutu
zostawało **pod** oknem prośby i po jej wysłaniu wracało na wierzch z guzikiem „Weź kubek",
czyli z przyciskiem znaczącym „rzuć bez zgody MG" — stojącym tam przez cały czas oczekiwania
i po zgodzie także. To ta sama zasada, którą `openRequest` i `openCall` trzymają między sobą
od 40; okno rzutu jest jej trzecim uczestnikiem. Strażnik źródłowy w `check-request-dialogs.test.ts`
pilnuje, że `RollDialog` prosi **wyłącznie** przez `askForCheck` — `openRequest` wołane wprost
przywróciłoby usterkę tą samą drogą, którą przyszła.

## tura — Tura, akcje, ruch w walce

- **Wydana Akcja to nie koniec ataków — `attackOpen` w wejściu paska (03.10, #62)** — `cpredTurnRefusalInput` czyta z budżetu `attacks` (`used > 0 && used < max`), a `hotbarSlotsFor` zostawia wtedy żywą broń o SS ≥ 2, gdy jedyną odmową jest wydany budżet (`ACTION_SPENT_REFUSAL`); status i rana dalej mówią „nie”, przeładowanie dalej kosztuje Akcję. Ta sama reguła co `spendAttack` na serwerze. Boty nadal biorą tylko pierwszy atak (`POMYSLY.md`).
- **Przed pierwszą rundą odmowa mówi „walka jeszcze się nie zaczęła” (03.10, #63)** — `hudTurnRefusal` przy `combat.round === 0`; pasek pod odmową tury pisze samo „W ręku: X.” bez „kliknij cel”.
- **Ustabilizowanie poza walką (01.10, #42)** — `form === 'stabilize' && !combat` rysuje `StabilizeNearbyPicker` (`CombatForms.tsx`): medyk i widoczne figury w zasięgu ramienia (`reachMetresBetweenTokens` ≤ `CPRED_MELEE_REACH_M`), bez kosztu Akcji (serwer: `spendStabilizeAction` bez walki nic nie pobiera). W walce bez zmian — `StabilizePicker` z uczestników. Oba rysują tę samą `StabilizeTargetList`.
- **Widok walki w odpowiedzi (ack) idzie przez `emitReloadedFor(…, user)` (26.09, #19)** — ack trafia do jednego gniazda z pominięciem filtra pokoi, więc handler zwracający `CombatView` oddaje widok **pytającego** (`filterCombatForPlayer` dla gracza), nigdy pełny widok MG. `emitReloaded` tylko rozgłasza i zwraca `void` — nowy handler nie ma czego zwrócić przez pomyłkę.
- **Powód odmowy Akcji ma JEDNO źródło** — `cpredActionRefusal(actionId, { statuses, turn, isGm })` w `hotbar.ts`; wołają je **oba** wejścia (pasek mapy i zakładka „Walka"). Akcja o koszcie `move` odmawia z budżetu ruchu, nie Akcji. Budżet tury czyta `cpredTurnRefusalInput(turn)`, nie ręczne `resources.find`.
- **Ruch przez przeszkodę** — `refuseWalkThroughSolid` w `realtime/movement.ts`; nowe nieprzenikalne coś dokłada segmenty w `movementSegments`/`coverMovementSegments`, nie nową gałąź walidacji. Sprawdzana jest **cała figura**, nie jej środek. Pod ręczną mgłą **przed nim** stoi `refuseWalkIntoFog` (14.09) — nowa odmowa, która mogłaby zdradzić coś schowanego w czerni, idzie za mgłą, nie przed nią (umowa w `mapa`).
- **Powód odmowy Akcji** — jedzie na `TurnResourceView.blocked`, nie w prozie obok; kolejność: status → rana zapisana na turze → budżet.
- **Akcja tylko dla części figur** — `CPRED_HOTBAR_NETRUNNER_ACTION_IDS` (nie lista dla każdego); slot z własnym zdarzeniem obsługuje się w `activateSlot` **bez** `spendCombatAction`.
- **Drugi pas zasięgu tury** — `TurnDistanceView.extra` (`{ label, max }`) wystawia system (`cpredRunMetres`), mapa maluje bursztyn i nie zna słowa „Bieg".
- **Podgląd trasy** — same ślady butów: kolor = pas, odstęp = metr. Żadnych liczb, kresek granicznych ani ✖; rozmiar śladu liczony szerokością tokenu, nie `overlayScale()`.
- **„Pierwsze w tej Rundzie"** stempluje `CpredTurnLedger` (`Combatant.turnEffects`) przez `claimRoundOnce` — jedyną drogę, bo pyta i księguje naraz; `turnState` jest wydawany na nowo przy każdym starcie tury. „Cofnij" oddaje stempel przez `releaseRoundOnce`.
- **Stan gry dotyczący całej walki** (nie uczestnika) mieszka w `Combat.systemState` — nieprzezroczystej kolumnie jak `turnState`; tłumaczy ją `reinforcementsOf` na `ReinforcementView`. Umiera razem z walką i to jest jej sens.

---

**Ustabilizowanie poza walką (01.10, #42, decyzja MG).** Bez kolejki nie ma listy uczestników,
więc pacjentami są medyk („w tym siebie”, s. 222) i widoczne figury sceny w zasięgu ramienia —
tym samym, który mierzy `requireStabilizeReach`. Slot paska otwiera formularz jak w walce, a
`CombatHud` wybiera `StabilizeNearbyPicker`, gdy walki nie ma; odmowa „wymaga trwającej walki”
nie dotyczy tej akcji. Nowa akcja, która ma działać i w walce, i poza nią, idzie tym wzorem
(formularz przed blokiem wymagającym `context.combatant`), jak Zmysł Walki i radio.


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

**Odmowa Akcji ma jedno źródło i dwoje drzwi (12.09).** `cpredActionRefusal(actionId, input)`
w `systems/cpred/hotbar.ts` jest jedyną odpowiedzią na pytanie „czemu ten guzik jest szary", a woła
ją **i** pasek na mapie (`hotbarSlotsFor`), **i** zakładka „Walka" (`CombatActions.tsx`). Do 12.09
zakładka pytała o jedno (`action.cost === 'action' && actionSpent`), a pasek szedł przez prywatne
`actionSlotRefusal`, więc Bieg bywał w zakładce klikalny, a na pasku wyszarzony — i odwrotnie:
formularze („Wstrzymanie Akcji…", „Ustabilizowanie…") zostawały żywe po zużytej Akcji. Zasady były
bezpieczne, bo serwer odmawiał w obu przypadkach; psuła się **obietnica interfejsu**.

Dwie rzeczy, o które trzeba tu zahaczyć:

- **Akcja o koszcie `move` odmawia z drugiego zasobu.** Zakładka ma przycisk „Akcja Ruchu",
  którego pasek nie ma (na mapie ruch robi się ciągnięciem figury) — wspólna odmowa bez gałęzi
  o koszcie gasiłaby go zdaniem o wykorzystanej Akcji, czyli o zasobie, którego ten przycisk
  nie dotyka.
- **Budżet tury czyta się `cpredTurnRefusalInput(turn)`**, nie własnym `resources.find('action')`.
  Dwa odręczne odczyty tego samego widoku to dokładnie sposób, w jaki oba wejścia się rozjechały.

**Powód odmowy jedzie na zasobie tury, nie w prozie obok niej.** `TurnResourceView.blocked`
niesie zdanie, którym rana albo status zabrały Akcję (14e), a `hotbarSlotsFor` stawia je
**przed** „Akcja w tej turze już wykorzystana". Kolejność prawdy jest trzystopniowa: status,
potem rana zapisana na turze, dopiero na końcu budżet — jedyne z tych zdań, które naprawdę
mówi o wydawaniu. Nowy powód odmowy dopisuje się tam, nie w komponencie.

**Akcja, którą ma tylko część figur, dopisuje się do `CPRED_HOTBAR_NETRUNNER_ACTION_IDS`**
(26b: Skaner) — nie do `CPRED_HOTBAR_ACTION_IDS`, którą dostaje każdy. Warunek liczy `shared`
z karty, a klient tylko go podaje (`netrunner` w `CpredHotbarInput`); slot z własnym zdarzeniem
obsługuje się w `activateSlot`, **bez** `spendCombatAction` — serwer księguje swoją Akcję sam.

**„Pierwsze w tej Rundzie" mieszka w `CpredTurnLedger`, nie w `turnState`.** Redukcja obrażeń
i Wykrycie słabości (30a) stemplują `Combatant.turnEffects` numerem Rundy przez
`claimRoundOnce` (`realtime/round-once.ts`) — jedyną drogą, bo pyta i księguje w jednym wywołaniu.
Budżet tury jest wydawany na nowo przy każdym starcie tury (a „start" obejmuje cofanie kolejki
przez MG), więc ledger w nim zostałby wytarty dokładnie przez to, co ma przetrwać. Stempel jest
numerem Rundy, nie flagą: stary wpis sam przestaje obowiązywać. „Cofnij" na karcie obrażeń oddaje
stempel przez `releaseRoundOnce`.

**Stan gry dotyczący całej walki, a nie uczestnika**, mieszka w `Combat.systemState` — kolumnie
nieprzezroczystej dla trackera, bliźniaku `Combatant.turnState` z 14b. Rdzeń przechowuje string
i nie czyta z niego pola; tłumaczy go `reinforcementsOf` w `sheets.ts` na `ReinforcementView`
(etykieta, liczba figur, runda, opcjonalne pytanie do MG). Kolumna **umiera razem z walką**, i to
jest jej sens: „za 4 Rundy" mierzy w jednostce, która poza walką nie istnieje. Poza walką nic się
nie zapisuje — grupa staje od razu.

## atak — Broń, atak, obrażenia, rany

- **Obrażenia za kartę ataku rozliczają się same, raz na trafienie, po Uniku (03.10, decyzja MG po T8b, #56)** — rzut z `attackMessageId` niesie go w `RollDamageMeta.attackMessageId`, a `performCharacterRoll` po karcie rzutu znakuje kartę ataku (`RollAttackMeta.damageRollId`, `rewriteAttackCard`) i woła `settleDamageRoll` (`damage.ts`): cel, osłona albo każdy niezasłonięty z obszaru, jedną drogą z „Zastosuj” (`applyDamageRollTo`), z `afterMessageId` = rzut obrażeń, więc iskra i liczba czekają na kości. Drugi rzut → `DAMAGE_ALREADY_ROLLED` (także dwa naraz: `damageRollsInFlight`); znacznik zdejmuje dopiero „Cofnij” **wszystkich** rozliczeń tego rzutu (`reopenAttackAfterUndo`). Kto jeszcze może uniknąć, stoi w `evasionPending` (`evasionPendingOf` w `attacks.ts`: obszar — wiersze `canEvade`; pojedynczy cel — figura z kartą, REF 8+ przy dystansowym, zawsze wręcz, bez odmów `attack:evade`); rzut obrażeń odmawia `AWAITING_EVASION`, aż Unik albo `attack:no-evade` (cel albo MG) zdejmie figurę z listy. Panel „Zastosuj” u MG znika, gdy na czacie jest żywe rozliczenie tego rzutu — wraca po „Cofnij”. Rzut bez karty ataku (przycisk „OBR.” na karcie postaci) dalej czeka na „Zastosuj”.
- **Strzelca karty ataku wskazuje `attackerTokenId`, nigdy id wiersza broni (27.09, #23/#27)** — `statist-weapon` powtarza się na każdym statyście. Klient (`AttackRow`) bierze kartę z żetonu strzelca: karta gracza rzuca obrażenia po `characterId`, karta NPC-a po `attackerTokenId` (alias i `statBlock`); po wierszu szuka tylko na kartach bez żetonu (sprzed 16b). Serwer (`requireAttackShooter`, `character-rolls.ts`) odmawia `NOT_THE_SHOOTER`, gdy karta rzutu nie jest kartą figury z karty ataku.
- **Karta obrażeń trafia jeden cel raz (27.09, #26)** — `damage:apply` odmawia `DAMAGE_ALREADY_APPLIED`, gdy istnieje niecofnięty wpis `damage` z tym `sourceMessageId` i tym celem (`requireNotApplied`); dwa kliknięcia naraz rozdziela `appliesInFlight`. Kto chce rozliczyć kartę od nowa, najpierw ją cofa.
- **Zasięg ręki mierzy `reachMetresBetweenTokens` (27.09, #24)** — po polach ze skosami (sąsiad po skosie = 2 m), osobno od `metresBetweenTokens`, które zostaje dla przedziałów zasięgu. Planer czyta `CpredAttackTarget.reachMetres` przy ataku wręcz; Pochwycenie, Ustabilizowanie, zastrzyk, przekazanie i handel (`metresBetweenPlaced`) mierzą tą samą funkcją. Nowe „sięgam ręką” też.
- **Arkusz do rzutu ≠ karta w bazie — `AttackSource.data` i `AttackSource.stored` (26.09, #16)** — strzał statysty rzuca się z `sheetForRoll` (poziom broni z `statBlock.weaponSkill`, Wartość bojowa zeruje Cechy) **na obu ścieżkach**: po żetonie (`buildFigureSource`) i po `characterId` (`buildCharacterSource`, tak strzelają klient i boty). Amunicja, Szczęście i zacięcie zapisują się na `stored`, nigdy na `data` — zapis arkusza do rzutu utrwalał podstawiony poziom w `skills` i edytor przestawał działać po pierwszym strzale.
- **Kursor paska trzyma tylko broń w rękach — `outOfHand` na slocie broni (25.09)** — `cpredHotbarSlots` znaczy broń schowaną lub wypchniętą z rąk (`notDrawn`) osobno od przejściowych odmów; efekt auto-uzbrojenia w `CombatHud.tsx` wybiera na nowo tylko wtedy, gdy uzbrojony slot ma `outOfHand` albo zniknął. Pole jest w `hudSignature`.
- **Wybór Celowania (`AimMenu`) stoi nad kursorem, dymek celownika (`TargetTooltip`) pod nim (25.09)** — dymek niesie „Głowa bez ochrony”, czyli to, na co patrzy się przy strzale w głowę; pod kursor okienko schodzi tylko przy górnej krawędzi ekranu. Nowy element przy kursorze celownika nie może siadać na żadnym z nich.
- **Zastrzyk siłą (s. 150) nie idzie przez planer ataku (25.09, decyzja MG)** — `character:use-dose` z `hostile: true`: `rollHostileDose` (`realtime/recovery.ts`) rzuca ZW + Broń biała przeciw **prawdziwemu** rzutowi ZW + Unik celu (bierne PT, gdy cel nie może unikać; PT 13 dla figury bez karty), karta czatu to zwykły rzut. Strzykawkę w ekwipunku sprawdza `cpredHasAirhypo` **po nazwie**. Pudło płaci Akcję, dawka zostaje. Gdyby strzykawka miała kiedyś wejść na pasek i pod celownik, to nowa droga ataku, nie rozbudowa tej.
- **Kara bariery (42c)** — `barrierConcealPenaltyAlong` wybiera najgorszą przeciętą zasłonę, `cpredBarrierModifiers` daje nazwany wiersz `situational`, którego optyka nie usuwa. Dostępność celu sprawdza `fetchSceneTokensFor` przed linią strzału: niewidoczny i nieistniejący cel dają `TOKEN_NOT_FOUND` w każdym trybie.

- **OB bariery na trafieniu** — trzy źródła i jedna kolejka zaufania w `barrierSpOfHit` (`realtime/damage.ts`): wiersz obszaru (`RollAreaTarget.barrierArmor`), karta strzału dla celu, który atak nazwał (`CpredAttackMeta.barrierSp` → `readAttackContext` → `RollDamageMeta.system`), a dla każdego innego celu pomiar na żywo od `barrierFrom`. Do silnika wchodzi jako `SheetDamageRequest.barrierSp` → `resolveCpredDamage`, **przed** pancerzem. Nowa droga obrażeń z mapy podaje je tą samą funkcją.
- **Zasięg ręki przez przeszkodę** — `isBodyBlocked` (`realtime/walls-io.ts`, lista `movementSegments`). Atak wręcz podaje planerowi `reachBlocked` (odmowa `MELEE_BLOCKED` **po** `NO_LINE_OF_FIRE`, **przed** zasięgiem; rzucona broń jej nie dostaje), Pochwycenie odmawia `GRAPPLE_BLOCKED`. Nowe „sięgam ręką" pyta tę samą funkcję.
- **Odmowa broni spoza rąk ma dwa zdania** — `WEAPON_HOLSTERED` („dobądź ją") i `WEAPON_NOT_DRAWN` („schowaj tamto"); wybiera `cpredDrawFits`, to samo porównanie, którym `weapon:draw` odmawia `HANDS_FULL`. Zajęte ręce planer dostaje jako `handsHeld` od wołającego — nowe wejście do `planCpredAttack` musi je podać.
- **Co postać trzyma w rękach, to `drawnWeaponRowIds`** — lista id wierszy; **brak pola** znaczy „nikt nie pytał" (oględziny pokazują pierwszą broń, planer **nie odmawia niczego**), `[]` znaczy puste ręce. Czyta się przez `cpredDrawnWeapons`, `cpredHandsAreDeclared` i `cpredWeaponInHands`, nigdy wprost.
- **Ręce zmienia wyłącznie `weapon:draw`** (dobycie za darmo, schowanie za Akcję `CPRED_ACTION_HOLSTER`, upuszczenie za darmo); `character:update` z tym polem odpada `FORBIDDEN` **dla wszystkich, także MG** — jak `combatAwareness`.
- **Guzik „Obrażenia" na karcie ataku** rysuje się z `attack.damageNotation !== undefined`, nigdy z „trafił albo obszar" — o tym, czy jest co rzucać, rozstrzyga serwer (`ammoDealsDamage`). Amunicja bez obrażeń z 16h dostawała guzik z pustą kością.
- **Tożsamość broni na pasku to wiersz + dodatek** — `weaponOptionKey(rowId, attachmentId)` w `hotbar.ts`; kluczują na niej id slotu, id przeładowania, grupowanie panelu i `fireModeKey` u klienta. Katalog dodatków wchodzi opcjonalnie — bez niego pasek jest ten sprzed 01.09 (tura bota).
- **Zdanie o tym, co się komuś stało** — nie nosi id z pliku danych; etykiety są parametrem obowiązkowym (`describeAmmoFailure`), nazwy ran daje `criticalInjuryNames` w `shared`.
- **Nowy punkt Celowania** — `CPRED_AIM_POINTS` w `shared/.../locations.ts` (+ `hitLocationForAim`); skutek dokłada się w `applyDamageToSheet` **i** `applyDamageToTokenHp`, a rana nadana z celowania idzie w `injuryAimed`, nie w `injury`. `CpredHitLocation` zostaje przy dwóch wartościach.
- **Rana nadana z nazwy** szuka się przez `criticalInjuryAt(pool, tabela, wynik)`, nigdy po id — id powstaje z polskiej nazwy przy imporcie i ginie, gdy MG przepisze wiersz.
- **Cecha ataku czytana dopiero przy obrażeniach** (`ammo`, `aimedAt`, `halvesArmor`) jedzie kartą ataku: `CpredAttackMeta` → `RollAttackMeta.system` → `readAttackContext` → `RollDamageMeta.system` → `SheetDamageRequest`. Nigdy żądaniem klienta.
- **Skutek rany dotykający cudzego rachunku** to liczba na wierszu rany (`headDamageMultiplier`, `conditionalPenalty`), nie stała w silniku; dopisuje się w czterech miejscach: wpis kompendium, wiersz karty, `toCriticalInjuryRow` i `parse-manual.py`.
- **Kara, której VTT nie umie sprawdzić**, nie jest odejmowana — `conditionalPenalty` stoi jako chip przy ranie i guzik w oknie rzutu; do sumy wchodzi tylko `actionPenalty`.
- **Zdanie z tabeli ran o leczeniu** (`quickFix`/`treatment`) jedzie **na wierszu rany** jak każdy inny jej skutek; czyta je `cpredParseCare`. Nowa droga leczenia = jeden wpis w `CARE_SKILLS`, nigdy nowe pole kompendium.
- **Skutek rany** czyta się przez `cpredActiveInjuries` (filtr siedzi **w** funkcjach liczących skutek, nie u wołających); lista na karcie zostaje niefiltrowana, bo załatana rana wciąż jest raną.
- **Droga leczenia to tryb, nie ścieżka** — `CpredCareMode` w żądaniu (`treatMode`) i planie; kolumnę tabeli wybiera `cpredCareOptions`, trwałość `cpredCarePermanent`, a `treatPermanent` wypełnia serwer. Łatać można siebie, leczyć nie (`SELF_TREATMENT`).
- **Nowa droga ataku** kończy się w `loadAttackFor` — i tylko stamtąd wychodzi wybór Celowania przy kursorze (`AimMenu`, warunek `mayAimShot`). Wybór nie jest lepki: przeładowuje kubek tym samym `AttackIntent` z dopisanym `aimedAt`.
- **Broń na karcie** powstaje z wpisu katalogu przez `purchasedSheetRow` — nigdy z wolnego tekstu i **nigdy z dopasowania po nazwie**. Wiersz bez `compendiumId` nie strzela i mówi to chipem, nie dopiero odmową planera.
- **Rana nazwana, nie wyrzucona** (gaz, granat hukowy, strefa, Celowanie w nogę, ręka MG) idzie przez `namedCriticalInjuryRow`: bez `rolled`, z `assigned` → chip „nadana".
- **Nowy dodatek do broni** — wiersz kompendium (`AttachmentEntry`: `fit` + flagi skutku), nie gałąź w kodzie; każdą flagę przepisuje się **ręcznie** w `toAttachmentProfile`, pominięta ginie po cichu.
- **Kolumny tabeli magazynków** (`magazineExtended`/`magazineDrum`) siedzą na **typie broni**, nie na dodatku — jeden bęben, dziesięć odpowiedzi; obie idą też na białą listę `schema_fields`.
- **Druga broń doczepiona do wiersza** to **id typu broni** (`CpredAttachmentWeapon`), nigdy kopia jego liczb; planer podmienia broń raz i dalej działa każda reguła o broni.
- **Magazynek broni podwieszanej** jest jej własny (`CpredWeaponRow.attachmentAmmo`); `weapon:reload` z `attachmentId` napełnia ten licznik, demontaż go zabiera.
- **Reguły montażu dodatku** stoją po stronie **odczytu** (`fittedAttachmentsFor` sądzi listę przy każdym czytaniu), bo `attachmentIds` jedzie zwykłą łatą karty; zdarzenie `weapon:attachment` zostaje dla `ammoMax`, przycięcia naboi i odmowy zdaniem.
- **Bonus warunkowany chromem** pyta kartę przez `hasRequiredCyberware` — po **nazwach**, nie id; tą jedną funkcją idą +1 smartguna i odmowa `AMMO_NEEDS_CYBERWARE` naboju inteligentnego.
- **Kara „nie widzę celu"** nosi `CPRED_OBSCUREMENT_KIND`, nie `situational` — noktowizor kasuje ujemne wiersze tego rodzaju, nie kompensuje ich plusem.
- **Atak drugą bronią** jedzie `attachmentId` przez żądanie → intencję → celownik; obie strony rozwiązują go `resolveAttachmentWeapon` z tego samego katalogu.
- **Nabój broni podwieszanej** — `attachmentAmmoId` na wierszu **plus** wejście planera `secondaryAmmo` (bez obu naraz nie działa nic: planer zerował profil dla każdego strzału dodatkiem); `weapon:reload` pasuje nabój do **broni podwieszanej**, nie do tej, która ją niesie.
- **Intencja uzbrojonego celownika** — jedna funkcja `intentFromTargeting` na obie drogi (klik ładujący kubek i dymek wyceniający strzał); nowe pole `AttackTargeting` dopisuje się tam, nie u wołających.
- **Kara z pancerza** — `cpredArmorPenalty` (RUCH) i `cpredArmorStatPenalty` (REF/ZW) w `character.ts`, bo czytają je i `rolls.ts`, i `attacks.ts`; bierze **jedną najgorszą sztukę**, nie schodzi poniżej zera i wchodzi **nazwanym wierszem** wszędzie, gdzie jest rozbicie (w Inicjatywie i biernym PT Uniku — w sumie i w etykiecie).
- **Jakość broni** — `quality` jedzie z **wpisu** kompendium, nie z typu; `poor` po Krytycznej Porażce zapala `CpredWeaponRow.jammed`, a usterkę zdejmuje **własna Akcja** (`weapon:clear-jam`), nie `weapon:reload`. Nie zacina się dodatek podwieszany, statysta ani porażka pominięta przez „Wyjście z opresji".

---

**Kursor paska trzyma tylko broń w rękach (25.09, zaległości).** Slot broni niesie `outOfHand`
(`option.notDrawn !== undefined`) obok `disabled`. Rozróżnienie jest celowe: pusty magazynek,
wydana Akcja czy blokada tury też szarzeją slot, ale wtedy gracz ma przeładować albo poczekać, więc
kursor zostaje przy jego broni. Schowanie albo dobycie czegoś, co wypycha broń z rąk, zdejmuje ją
z kursora i efekt w `CombatHud.tsx` bierze pierwszą użyteczną. Przed poprawką pasek pisał „W ręku:
Nóż testowy” pod wyszarzonym nożem, gdy w rękach był już karabin. Pole jest w `hudSignature`, bo
przy wydanej Akcji schowanie broni nie zmienia zdania odmowy.


**OB bariery jedzie kartą, a przestawione „Zastosuj" mierzy od nowa (13.09, etap 42b).** Zasada
domowa MG (`decyzje-i-uproszczenia.md`): siatka odejmuje swoje OB od obrażeń, zanim dotrą do
pancerza celu. Liczba powstaje **na serwerze w chwili strzału** — `realtime/attacks.ts` mierzy linię
do środka figury albo do bliższego brzegu samochodu i podaje ją planerowi w
`CpredAttackContext.barrierSp`, a planer wpisuje ją do karty tylko strzałowi z jednym celem (cios
przez barierę nie sięga, ogień zaporowy nie rani, a wybuch i stożek mierzą linię **per figura**
w `areaTargets` → `RollAreaTarget.barrierArmor`). Dalej ta sama szyna co `halvesArmor`:
`readAttackContext` → `RollDamageMeta.system.barrierSp`. **Decyzja MG, która tę szynę łamie
celowo:** „Zastosuj" przestawione na figurę, której atak nie nazwał, nie bierze liczby z karty,
tylko mierzy linię na żywo od `barrierFrom` — krateru wybuchu albo **żetonu** strzelca, czyli
miejsca, w którym stoi teraz. Kolejność (wiersz obszaru → karta dla nazwanego celu → pomiar) jest
w jednej funkcji, `barrierSpOfHit`, i tylko tam. Silnik odejmuje OB bariery przed pancerzem, nigdy
go nie zużywa, nie połowi, a przy `ignoreArmor` pomija razem z pancerzem. Karta obrażeń mówi
„− bariera OB n"; **karta ataku milczy** (decyzja MG).

**Ręka nie sięga tam, gdzie nie przejdą nogi (13.09, etap 42a).** Atak wręcz i Pochwycenie pytają
o przeszkodę **listą ruchu**, nie listą strzału: `isBodyBlocked(prisma, sceneId, from, to)` bierze
`movementSegments`, więc zatrzymuje je bariera, zamknięta brama, zamknięte drzwi **i zamknięte
okno** — także z odległości ramienia, z której szyba nie jest już „firanką" dla wzroku i kuli. Do
13.09 przez takie okno dało się uderzyć, a Pochwycenie w ogóle nie patrzyło na ściany (dało się
pochwycić przez mur). W planerze `reachBlocked` stoi za `NO_LINE_OF_FIRE` — mur zachowuje własną
odmowę — i przed `MELEE_OUT_OF_REACH`, bo przeszkoda jest ważniejszą prawdą niż odległość. Flaga
jest serwerowa jak `lineOfFire`: podgląd u klienta jej nie zna i niczego nie odmawia. Rzucony nóż
jej nie dostaje, bo `melee` jest już wtedy fałszem (s. 177). **Strzał przez barierę przechodzi bez
zmian** — jej OB to etap 42b.

**Ręce postaci: `drawnWeaponRowIds`, trzy stany i jedna decyzja MG (10.09, etap 41).**
Pole jest **trójstanowe** i to jest cała jego treść: brak pola znaczy „nikt tej figury nigdy nie
pytał", `[]` znaczy „puste ręce", lista znaczy „te bronie". Rozróżnienia pierwszego od drugiego
nie da się ściągnąć do jednego, bo służą do czego innego. **Domysł pokazuje, deklaracja zabrania:**
karta bez pola pokazuje w oględzinach i na pasku pierwszą broń z listy, ale `planCpredAttack`
**nie odmawia jej niczego** — zakaz z domysłu byłby regułą, której nie ustalił nikt przy stole.
Decyzja zapadła po zmierzeniu skutków wariantu twardego: egzekwowanie domysłu wywracało
**39 testów serwera**, i to nie dlatego, że dane testowe były złe, tylko dlatego, że karta
z pistoletem, karabinem i nożem mogłaby strzelać wyłącznie z pierwszego wiersza, dopóki ktoś
ręcznie nie przełoży broni. Od pierwszego `weapon:draw` pole istnieje i odmowa jest pełna.

**Ręce są dwie (`CPRED_HANDS`), a ile zajmuje broń, wie katalog.** Katalog czyta **wołający**
(`resolved.hands`), nie silnik zasad: kompendium należy do serwera, a planer dostaje fakty — ta sama
umowa, co przy `ResolvedWeapon`. Porównanie z liczbą rąk jest od 13.09 jedno, `cpredDrawFits`
(`character.ts`): pistolet i nóż mieszczą się naraz, karabin zajmuje obie ręce i wtedy
`weapon:draw` odmawia `HANDS_FULL`. Odmowa mówi **co zrobić**, bo obie drogi są jednym kliknięciem
i różnią się ceną: schowanie kosztuje Akcję (s. 168), upuszczenie nie kosztuje nic.

**`WEAPON_NOT_DRAWN` i `WEAPON_HOLSTERED` sprawdzają się na wierszu NOSICIELA**, dokładnie jak
`WEAPON_JAMMED` obok: bagnet i granatnik podwieszany są częścią broni, którą figura trzyma, więc
trzymanie karabinu jest trzymaniem obu. **Zdania są dwa (13.09, decyzja MG)** i wybiera je to samo
`cpredDrawFits`, którym `weapon:draw` odmawia dobycia: broń mieszcząca się w wolnych rękach dostaje
`CPRED_HOLSTERED_REFUSAL` („dobądź ją (bez Akcji)"), reszta `CPRED_NOT_DRAWN_REFUSAL` („schowaj
tamto"). Do 13.09 zdanie było jedno i postać z pustymi rękami słyszała „schowaj tamto (Akcja)".
Zajęte ręce planer dostaje jako `handsHeld` od wołającego — serwer liczy je `handsInUse`, dymek
u klienta `cpredHandsHeld` z tego samego katalogu. Bez tej liczby, przy czymkolwiek w rękach, planer
daje zdanie ostrożniejsze, więc **nowe wejście do `planCpredAttack` musi ją podać**, inaczej gracz
z wolną ręką usłyszy „schowaj tamto". Zdanie pada w dwóch ustach — planer i slot paska
(`option.notDrawn`: `holstered` / `handsFull`); wiersz karty ma własne guziki „Dobądź" i „Schowaj
(Akcja)".

**O tym, czy karta ataku ma guzik „Obrażenia", rozstrzyga serwer — klient tylko go rysuje (04.09).**
Serwer liczy `damages = (trafienie || obszar) && ammoDealsDamage(ammo)` i **nie wysyła
`damageNotation`**, gdy odpowiedź brzmi „nie" — komentarz przy tej linii mówi wprost
„no button, no notation, nothing to apply". Klient ma więc jeden warunek:
`attack.damageNotation !== undefined`. Warunek „trafił albo obszar" powtórzony po jego
stronie kosztował guzik z pustą kością na każdej karcie amunicji bez obrażeń z 16h (dym, gaz
łzawiący, hukbłyskowa, EMP, usypiająca). Nowa cecha ataku, która ma coś **odebrać** karcie,
odbiera to samo w tym jednym miejscu na serwerze, nie drugą gałęzią w `AttackControls.tsx`.

**Zdanie o tym, co się komuś stało, nie nosi id z pliku danych.** `describeAmmoFailure` wymaga
teraz etykiet (parametr obowiązkowy), a nazwy ran daje `criticalInjuryNames` w `shared`. Nowy
wołający, który zapomni podać nazw, zobaczy brak członu — nigdy `injury.head-uraz-oka`.

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

**Zdanie z tabeli ran o leczeniu** (`quickFix`, `treatment`) jedzie **na wierszu rany**, jak
każdy inny jej skutek: kopiuje je `toCriticalInjuryRow`, przepuszcza walidacja wiersza, a czyta
`cpredParseCare`/`cpredTreatmentOptions` w `treatment.ts`. Nowa droga leczenia (nowa Umiejętność
w zdaniu) dopisuje się **do jednej listy** `CARE_SKILLS` razem z odmianami, których podręcznik
używa; nigdzie indziej. Nie ma pola strukturalnego w kompendium — parser czyta prozę, żeby rana
wpisana ręką MG działała jak drukowana.

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

## statysta — Figura ostatystykowana i jej karta

- **Rzut figury bez karty** — `RollSource` w `character-rolls.ts` (bliźniak `AttackSource`); statysta wchodzi przez `sheetFromCombatProfile`, o gałąź pyta **tylko to, co pisze**, a adres strzelca niesie `CpredAttackMeta.attackerTokenId` wypełniane na serwerze. Przez `character:roll` statysta rzuca wyłącznie na obrażenia.
- **Statysta nosi rany** w `CpredCombatProfile.criticalInjuries` (pole opcjonalne); `combatProfileSheet` podaje je syntetycznej karcie, więc reguły działają bez gałęzi „czy to statysta". Żeton bez profilu dostaje samo zdanie.
- **Umiejętność figury bez karty** — `CpredCombatProfile.skills` (id → poziom), wpisana liczba to **cały** modyfikator (Cechy idą do zera), rzucać wolno tylko tym, co na liście (`combatProfileRollableSkills`). Sufit to `STATIST_SKILL_LEVEL_MAX`, nie limit karty.
- **Znacznik o cudzych ranach orzeka o WIEDZY, nie o jej braku** — `observedWoundState({ hp, statuses })` w `damage.ts` ma trzy wartości (`healthy` / `wounded` / `unknown`), bo cudze PW nie opuszczają serwera. „Bez ran" wolno napisać **tylko** przy `healthy`; naklejki ran są dowodem rany, ale ich brak nie jest dowodem zdrowia (Lekko ranny naklejki nie ma).
- **Rany figury bez karty** jadą publicznie (`TokenView.injuries`, most `readSheetTokenInjuries`), reszta profilu zostaje prywatna; klient czyta je **tylko** z tego pola.
- **Figura ostatystykowana MA KARTĘ** — `Token.combatProfile` nie istnieje od 38a, a w silniku zasad nie ma gałęzi „to statysta". Kółko z paskiem PW i bez karty ma własny, chudy tor: same PW, żadnego pancerza, żadnych ran.
- **Wartość bojowa, zakaz uniku, wydrukowane PW i poziom broni to `statBlock`** — cztery liczby, których karta sama by nie utrzymała. **Nie jest to kategoria karty**: nazwanemu NPC-owi wolno je mieć tak samo.
- **Maksimum PW karty to `cpredSheetHpMax(data)`**, stan ran to `cpredSheetWoundState(sheet)`, próg na karcie `cpredSheetSeriousWoundThreshold`; `hpMax(data.stats)` i `woundState(hp, stats)` zostają **wyłącznie** kreatorowi, który karty jeszcze nie ma. Do 12.09 łamały to Testy, PT Ustabilizowania, targowanie, kubek i karta (patrz `kosci`).
- **Wartość bojowa wchodzi do liczb w jednym miejscu: `sheetForRoll`** — tam, gdzie do 38a wołało się `sheetFromCombatProfile`, i nigdzie indziej. Umiejętność wpisana na karcie wygrywa z poziomem broni.
- **Sześć pól menu figury pisze `token:stat`**, nie `token:update`: karta i podpięcie powstają jednym zdarzeniem. `applyStatistQuick` nie rusza niczego poza tymi polami.
- **Karta ginie z figurą tylko na pytanie** i tylko gdy nie ma właściciela ani innej figury pod sobą; kopia figury MG dostaje **własną** kartę, kopia figury gracza zostaje bez podpięcia.
- **Karta jedzie też do właściciela FIGURY**, nie tylko karty — inaczej gracz sterowałby gangerem, którego statystyk nie widzi.
- **Cecha zero jest legalna na karcie (`CPRED_SHEET_STAT_MIN`), ale nie w kreatorze** — figura z Wartością bojową ma wyzerowane REF, ZW i SW, żeby rozbicie rzutu nie doliczyło Cechy dwa razy.

---

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

**Znacznik o cudzych ranach mówi o wiedzy, nie o zdrowiu (12.09).** `tokenStore` kasuje `hp`
każdego żetonu, którego gracz nie jest właścicielem — i słusznie, bo serwer tych liczb nie wysyła.
Brak danych łatwo jednak zamienia się w twierdzenie: `hp === null` dawało w `StabilizePicker`
`wounded === false`, czyli znacznik **„bez ran"** przy każdej cudzej figurze, także przy konającej.
Lista, która istnieje po to, żeby wybrać konającego, ogłaszała graczowi, że nikt nie jest ranny.

`observedWoundState({ hp, statuses })` (`systems/cpred/damage.ts`) zwraca **trzy** wartości, i to
jest cała poprawka: PW wygrywają, gdy są; bez nich czyta się publiczne naklejki ran
(`CPRED_MANAGED_WOUND_STATUS_IDS`), a gdy i one milczą — `unknown`, przy którym nie pisze się nic.
Naklejki pokrywają tylko dwa dolne progi, więc ich brak **niczego nie dowodzi**: Lekko ranny
naklejki nie ma. Nowy widok, który chce powiedzieć coś o cudzych ranach, pyta tę funkcję.

**Statysta nosi rany krytyczne od 29.08 — profil bojowy to nie „karta uboga w pola".** Etap 16b
świadomie zostawił rany poza `CpredCombatProfile` („to opisuje osobę z historią"); powód przestał
być prawdziwy, gdy 16h i 26f zaczęły rany **nadawać z zasady**. Rany siedzą w
`CpredCombatProfile.criticalInjuries` (pole opcjonalne — nietknięty profil ma się serializować
bajt w bajt tak, jak w 16b), a `combatProfileSheet` podaje je syntetycznej karcie, więc
`cpredInjuryDodgeBlock` i `cpredInjuryModifiers` działają bez jednej gałęzi „czy to statysta".
Żeton **bez** profilu nadal dostaje samo zdanie na czacie: nie ma gdzie zapisać.

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

## karta — Karta postaci: układ, panele, pola

- **Widok karty niesie `revision`; starszy od posiadanego klient odrzuca (02.10, #49)** — kolumnę `Character.revision` podbija **rozszerzenie klienta Prismy w `db.ts`** przy każdym `update`/`updateMany`/`upsert`, więc handler nic nie dopisuje (i nie może zapomnieć). `characterStore` sprawdza numer w `applyUpsert`, w acku (`endSave` bierze nowszy z acku i cienia) i w `applySync` — poza pierwszą synchronizacją po połączeniu, która bierze bazę w całości (kopia przywrócona przy zatrzymanym serwerze ma mniejsze numery). Nowy sposób zapisu karty z pominięciem klienta Prismy (surowy SQL) musi podbić numer sam.
- **Karta czekająca na MG jest u właściciela wyłączona jednym `<fieldset disabled>` (`.sheet-lock`, 25.09)** — owija treść wszystkich czterech stron wewnątrz `.sheet-body`; zakładki i ✕ są poza nim. Nowa kontrolka karty musi być `<button>`/`<input>`/`<select>`, żeby blokada ją objęła — `onClick` na `<span>` przeszedłby obok. Warunek (`!isGm && !playReady && właściciel`) jest lustrem `refuseAwaitingGm` na serwerze.
- **Panel karty, do którego da się skoczyć z zewnątrz, nosi `data-sheet-panel`** — `characterStore.focusPanel(id, zakładka, panel)` otwiera kartę, przełącza zakładkę i podświetla go; okno kasuje żądanie po obsłużeniu, inaczej wracałoby przy każdym otwarciu karty. Pas „Po kreatorze zostało” (`.cp-readiness`) stoi pierwszy w siatce strony pierwszej i znika, gdy nie ma czego powiedzieć.
- **Okno „na papierze” to klasa `sheet-window--paper`** (karta postaci i kreator; edytor botów i okna Sieci celowo nie) — przestawia chrom na papier (`theme.css`), kładzie wytarcia jako `::after` jedynego dziecka `.sheet-body`, a pęknięcia jako tło czerwieni na końcu `sheet.css`. Nowy przyklejony albo stały element nad przewijaną treścią dostaje własne `::after` i `z-index` wyżej; nic ciemniejszego od papieru (decyzja MG).
- **Wielkość liczby na karcie ustawia się z prefiksem `.sheet-window`** — skóra przełącznika (`.sheet-window .cp-step`, 0-2-0) niesie `font: inherit`, więc goła klasa pola (0-1-0) przegrywa kaskadę i liczba zostaje przy 16 px. Cechy: `.cp-stats { align-self: stretch }` + `.cp-stat { flex: 1 }` ciągną kolumnę na całą stronę, a wąskie okno ma **własny** blok `@container` **pod** regułami bazowymi.
- **Lista czytana z serwera odświeża się na STEMPEL karty, nie na liczbę, która ją opisuje** — rejestry (awansów z 29a, eurodolców z 23b) czyta `useEffect` na `[characterId, open, savedAt]`, gdzie `savedAt` to `character.updatedAt`. Saldo wyprzedza żądanie (optymistyczna łata), a warunek `history === null` gubi wiersze dopisane przez MG. Strażnik: `advancement-history.test.ts`.
- **Liczbę na karcie i w oknach gry zmienia się strzałkami, nie wpisywaniem** — `NumberStepper` (wartość jako napis, strzałki w pionie przy niej, przytrzymanie powtarza); skóra z kontekstu: pole z ramką w oknie, płaski napis na karcie. Wpisywane zostają liczby >99 (PD, ILOŚĆ, PW tokenu, eurodolce, edytory) **oraz pola, w których puste znaczy coś innego niż zero** (OB celu, inicjatywa, generator sieci, sztuk w ekwipunku).
- **Nowy panel Zdolności Roli dopisuje się do `ROLE_ABILITY_PANEL_IDS`** — pas „Zdolność Specjalna” idzie przez całą szerokość siatki strony pierwszej (`grid-column: 1 / -1`), jak „Broń i pancerz”; w kolumnie tożsamości (15 rem, nierozciągalna) panele stać nie mogą.
- **Panel Zdolności Roli mieszka w kolumnie 15 rem** (`.cp-identity`) i w pasku akcji (`.hud-form`) — obie wąskie i obu nie da się rozciągnąć. Nazwa idzie własną linią (`.awareness-name { flex: 1 0 100% }`), a guzik z napisem ma `min-width`, nie `width`.
- **Odmowa zapisu karty** — `characterStore.serverViews` (cień widoku serwera) przywraca kartę, gdy nic nie jest w locie, a `saveErrors` + `characterSaveErrorText` piszą powód w pasku „issues"; zdania kodów silnika mieszkają w `shared` obok typu problemu.

---

**Numer zapisu karty: `revision` (02.10, poprawka #49 z T7b).** Rozgłoszenia czekają za animacją
rzutu (`rollPresentation`), a acki nie — echo zapisu A przychodziło po acku zapisu B, gdy nic nie
było już w locie, i `applyUpsert` cofał kartę do A; następny autozapis wysyłał pole z A + C i B
ginęło w bazie (pod obciążeniem T7b u trzech z czterech graczy). Odtąd `CharacterView.revision`
rośnie przy każdym zapisie wiersza, a klient traktuje mniejszy numer jak historię: echo, ack
i ponowna synchronizacja na żywym połączeniu nie cofają karty. Równy numer przechodzi (echo tego
samego zapisu). Wyjątek: pierwszy `state:sync` po (ponownym) połączeniu — `socket.ts` przekazuje
`fresh`, bo po `restore` przy zatrzymanym serwerze numery w bazie są mniejsze niż w pamięci klienta.
Licznik siedzi w `createPrisma` (rozszerzenie `query.character`), nie w handlerach — tych jest
ponad dwadzieścia plików. Testy: `character-revision.test.ts` (klient), `characters.test.ts` › „#49”
(serwer), E2E `t7b-zapis-karty`.


**Okno na papierze: `sheet-window--paper` (16.09, naprawa kreatora 2c).** Karta postaci i kreator
wyglądają jak wydruk na starej kartce. Trzy rzeczy obowiązują dalej:

- **Kolory przez tokeny.** Klasa przestawia w oknie chrom aplikacji (`--bg-*`, `--border*`,
  `--text*`) na `--cp-paper`, `--cp-back`, `--cp-inset*`, `--cp-line*` i tusz (blok
  `.sheet-window--paper` w `theme.css`). Przyciski, pola i opisy w środku stają na papierze bez
  osobnych reguł. `.sheet-window` bez tej klasy (edytor botów, okna Sieci) zostaje przy chromie.
- **Wytarcia leżą nad treścią.** Nośnikiem jest jedyne dziecko `.sheet-body` (`position:
relative`, `flex: 1 0 auto`, `::after` z `inset: -0.7rem`), a nie samo `.sheet-body`: warstwa
  absolutna w przewijanym kontenerze ma wymiar okna przewijania. Element, który stoi w miejscu
  nad przewijaną treścią (`.creator-sticky`), ma własne `::after` i `z-index: 4`, inaczej
  wytarcia przesuwałyby się po nim jak po szybie. Zdjęcia (portret) mają `z-index: 4`.
- **Pęknięcia to obraz tła** czerwonych nośników (`--cp-cracks`), dopisany na KOŃCU `sheet.css`,
  bo `background` wyżej zeruje obraz. Nie na czarnych belkach ani przy drobnym białym napisie.
  Pliki niosą kolor papieru: zmiana `--cp-paper` = zmiana `PAPER_DAY`/`PAPER_NIGHT`
  w `tools/art/sheet-paper.py` i przebudowa (pilnuje `theme.test.ts`).

MG odrzucił wszystko, co ciemniejsze od papieru (drobinki, kropki, miękkie plamy — „zabrudzenia”).
Nowa tekstura w tym oknie może tylko rozjaśniać albo pękać. Źródła, obróbka i przyjęty koszt
kontrastu: `docs/assety-karta-postaci.md`.

**Liczby na karcie mają wypełniać swoje pola, a ustawia się je z prefiksem `.sheet-window`
(zlecenie MG, 12.09).** Zgłoszenie brzmiało: „liczba określająca wartość INT, mimo że ma w polu
dużo miejsca, jest niewspółmiernie mała". Pomiar to potwierdził — pudełko Cechy miało 77 × 39 px,
liczba stała w 16 px, czyli **mniej niż etykieta pola obok**, a cała kolumna Cech kończyła się
w połowie karty, zostawiając pod sobą pół tysiąca pikseli czerwieni.

Trzy rzeczy z tej naprawy obowiązują dalej:

- **Kolumna Cech ciągnie się na całą wysokość strony.** `.cp-stats { align-self: stretch }` łamie
  `align-items: start` siatki `.sheet-page` **tylko dla tej jednej kolumny**, a `.cp-stat
{ flex: 1 1 auto }` rozdziela zysk po równo. Pudełko ma dziś ~94 px, liczba 2,6 rem.
- **Wąskie okno ma własny blok `@container (max-width: 700px)` — i musi stać POD regułami
  bazowymi.** Cechy schodzą tam w rząd z zawijaniem (kafel ~4,2 rem) i liczba schodzi do 1,5 rem,
  bo 2,6 rem nie zmieściłoby się obok strzałek, a pole ma `overflow: hidden`, więc obcięłoby ją
  bez śladu. Blok z góry pliku przegrywał z bazą przy równej wadze selektora.
- **Liczba w polu = `.sheet-window .cp-nazwa`, nigdy samo `.cp-nazwa`.** Patrz pułapka obok:
  skóra przełącznika liczbowego niesie `font: inherit` i wygrywa kaskadę.

Przy okazji poszły w górę pozostałe liczby, które stały w polu z zapasem: pule
(`.cp-pool-value` 1,15 → 1,7 rem, szerokość pola w `em`, żeby rosła razem z krojem), progi
(`.cp-pool--flat` 1 → 1,35 rem), komórki Umiejętności (0,8 → 0,95 rem, BAZA 0,85 → 1,05 rem),
pola tekstowe arkusza (0,85 → 0,95 rem), tabele (0,82 → 0,88 rem), belki i zakładki.
**Nazwy Umiejętności zostały przy 0,8 rem** i to jest decyzja: wypełniają swoje pole na szerokość,
a większy krój kończyłby „Odporność na tortury/narkotyki" wielokropkiem.

**Lista czytana z serwera odświeża się na stempel karty, nie na liczbę, która ją opisuje (09.09, oględziny 29a).**
Rejestr awansów z 29a i rejestr eurodolców z 23b są tą samą rzeczą: krótką listą, którą serwer
zwraca na żądanie, wyświetlaną obok licznika, który zmienia się **z trzech różnych stron**.
Wzorzec jest jeden i wygląda tak: `useEffect` na `[characterId, open, savedAt]`, gdzie `open`
mówi, czy `<details>` jest rozwinięte, a `savedAt` to **`character.updatedAt` — stempel
serwera**.

Dwie rzeczy w tym zdaniu są nieprzypadkowe i obie kosztowały już błąd.

Po pierwsze **stempel, nie saldo**. Własna łata karty ląduje w składzie optymistycznie
(`localPatch`), więc licznik zna nową liczbę, **zanim żądanie wyjdzie** — lista czytana na
saldzie poszłaby do serwera o moment za wcześnie i wróciłaby bez wiersza, który dopiero
powstaje. Komentarz przy rejestrze eurodolców mówi to wprost od 23b i tam trzeba było to
odkryć raz.

Po drugie **wyzwalaczem jest cokolwiek, co ruszy kartę** — nie tylko własny zakup. PD dopisuje
przede wszystkim nie ta karta: pulę po sesji wpisuje MG (`character:xp-award`), korektę też
(`character:update`). Etap 29a dał rejestrowi jedno wywołanie, w `buy()`, i przez to otwarty
u gracza rejestr zostawał przy liście sprzed przyznania, a warunek `history === null` sprawiał,
że zamknięcie i ponowne otwarcie **nic nie dawało**. Jedyną drogą do prawdy było przeładowanie
strony — akurat wtedy, gdy gracz patrzy na rejestr najczęściej.

Stąd trzecia część umowy: **ręcznego wywołania po własnej akcji się nie dopisuje.** Jedna droga
obsługuje wiersz własny i ten od MG; druga droga znaczy, że jeden przypadek działa, a drugi cicho
nie. Strażnikiem jest `advancement-history.test.ts` (test źródłowy, bo klient nie ma DOM-u
w testach) i pilnuje wszystkich trzech rzeczy naraz.

**Nowy panel Zdolności Roli dopisuje się do `ROLE_ABILITY_PANEL_IDS` (06.09).**
Lista w `CharacterSheet.tsx` mówi paskowi „Zdolność Specjalna", czy ma co pokazać, jednym
warunkiem zamiast dziewięciu; dziesiąty panel dopisuje się w niej **i** w gałęzi niżej. Sam pas
idzie przez całą szerokość siatki strony pierwszej (`grid-column: 1 / -1`), jak „Broń i pancerz"
z 27b — w kolumnie tożsamości panele stać nie mogą, bo ta ma 15 rem i rozciągnąć się nie da
(umowa z 30a), więc ciągnęły ją dwa razy niżej niż Cechy i Umiejętności.

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

**Liczbę na karcie postaci zmienia się strzałkami, nie wpisywaniem (06.09, decyzja MG).**
Nowe pole liczbowe na karcie to `NumberStepper`, a nie `<input type="number">`: wartość jest
**napisem**, a jedyną drogą do jej zmiany są dwie strzałki w pionie, tuż na prawo od liczby.
Powód jest z gry, nie z estetyki — kartę się **gra**, a nie wypełnia: PW spadają o kilka,
amunicja o jeden, OB o jeden przy każdym przebiciu, i przy każdej takiej zmianie wpisywanie
znaczyło zaznacz–skasuj–wpisz. Przy okazji znika cała klasa sprzątania: pole `type="number"`
przyjmuje puste i „7e3", więc każdy `onChange` miał własny `parseNumberInput` i własne klamry;
przełącznik pilnuje zakresu sam i nie ma stanu pośredniego.

**Ta sama reguła obowiązuje w oknach gry (rozszerzone 06.09 na prośbę MG):** okno rzutu
(modyfikator, Szczęście), okno wezwania MG (PT, przeciwnik, modyfikator), statysta z menu tokena
(Cechy, poziom broni, Unik, OB, Wartość bojowa, amunicja, poziomy Umiejętności) i wirus
w netrunie (PT, Akcji Sieciowych). Skórę przełącznik bierze z kontekstu: baza w `styles.css`
rysuje **pole z ramką**, a `.sheet-window .cp-step` spłaszcza je do napisu — tak samo, jak
`.cp-field input` spłaszcza pola na karcie.

**Wyjątek pierwszy: liczby, które przekraczają 99.** Wpisywanymi polami zostają **Punkty
Doświadczenia** (do 99 999), **Człowieczeństwo** (EMP 10 × 10 = 100), **ILOŚĆ** w wyposażeniu
(do 999), **PW tokenu** (do 999), **eurodolce** (wyłączone ze zlecenia wprost) oraz wszystko
w edytorach: ceny w ed, zasięgi w metrach, wymiary scen, zakresy tabel 1–100.

**Wyjątek drugi, mniej oczywisty: pola, w których PUSTE znaczy coś innego niż zero.**
Przełącznik zawsze ma liczbę, więc odebrałby im ten stan. Dotyczy to OB celu bez karty w oknie
obrażeń („puste = OB z karty postaci", a 0 to „bez pancerza" — dwie różne rzeczy), inicjatywy
akcji przygotowanej („puste = czeka na zdarzenie, nie na inicjatywę"), pięter i odgałęzień
generatora sieci („puste = losuje serwer 3k6") oraz sztuk i gotówki w ekwipunku („puste =
wszystkie"). Zanim zamienisz pole na przełącznik, sprawdź, czy jego `placeholder` albo zdanie
obok nie opisuje właśnie pustego stanu.

Pole tylko do odczytu (poziom Umiejętności i ranga Zdolności u gracza — kupuje się je PD)
dostaje `readOnly` i pokazuje **samą liczbę bez strzałek**; pole, w które klik nic nie robi,
jest gorsze niż napis.

**Przytrzymanie powtarza i liczy od WŁASNEJ liczby.** Bez wpisywania OB 18 to osiemnaście
kliknięć, więc `startHold` po 400 ms uruchamia powtarzanie co 70 ms — ale kolejne kroki liczą
się od wartości zapamiętanej w domknięciu, a nie od `value` z propsów. Karta jest duża, jej
render potrafi nie nadążyć za tikiem, a wtedy dwa tiki z rzędu policzyłyby tę samą liczbę
i przytrzymanie stanęłoby w miejscu.

## postac — Kreator, PD, Role, cyborgizacje

- **Wpis zespołu Korpo niesie imię pracownika (03.10, #74)** — `CpredTeamMember.name` (opcjonalne, `readCpredTeam` przycina do 64), zapisane przy `character:team-hire` i odświeżane przez `syncTeamMemberName` przy zmianie nazwy karty NPC (`character:update`). Karta pracownika dalej jedzie tylko do MG; `TeamPanel` czyta `sheet?.name ?? member.name`, a guziki Lojalności pokazuje wyłącznie MG (#75). Stare wpisy bez imienia dostaną je przy pierwszej zmianie nazwy karty.
- **Braki kreatora liczą się po sprawie, nie po polu (03.10, #71)** — `summaryLines` zwija nieustalone Cechy i umiejętności podstawowe poniżej minimum w po jednej linii; licznik w stopce i plakietki kroków liczą linie, więc nowa grupa braków dopisuje się tam, nie w `creationIssues`.
- **Operacja u Medyka innego gracza to prośba, nie montaż (30.09, #41)** — `cyberware:surgeons` / `cyberware:request` / `cyberware:respond` w `realtime/surgery.ts`, stan na karcie czatu `surgery` (`SurgeryRequestEntry`, reguły w `shared/src/surgery.ts`). Pacjent prosi, Medyk podaje cenę (od domyślnej z guzika, zero dozwolone), wyższą zatwierdza pacjent; cała kwota na kartę Medyka (`CyberwareBill.payee`). Sam montaż — **wyłącznie** `performInstall` z `cyberware.ts`, Chirurgię czyta `surgeonRollFor`. `character:cyberware` z cudzym Medykiem zostaje `CHARACTER_NOT_FOUND`; MG montuje wprost i prośby nie składa (`FORBIDDEN`).
- **Warunki zgody MG: metoda, ranga, pula umiejętności (25.09)** — `CreationTerms` w `CampaignMember.creationTerms` (JSON, czyta `readTerms`); `creation:start` zakłada szkic z `method` + `methodFixed`, rangą w kolumnie szkicu (od razu zatwierdzoną) i `skillPool`. Pulę umiejętności czytaj **wyłącznie** przez `creationSkillPool(data, draft)` — `data.skillPoints` to tylko podręcznikowe 86. Zmiana w trakcie: `creation:terms` (MG), push `creation:terms-changed`.
- **Nowa postać gracza = zgoda MG, zasady, zatwierdzenie (24.09)** — zgoda w `CampaignMember.creationPermit` (`requested`/`granted`) + `creationRulesAcceptedAt`; `creation:start` zakłada szkic graczowi tylko przy obu (istniejący szkic zawsze się otwiera). Zgodę zużywa `creation:finish`, a zdejmuje ją razem ze szkicem wyłącznie `creation:discard-player` (MG) — gracz `creation:discard` dostaje `FORBIDDEN`. Lista MG: `creation:permits-sync`.
- **Karta gracza przed „Przyjmij do gry” jest tylko do podglądu (24.09)** — `refuseAwaitingGm` (`character-io.ts`) odmawia `CHARACTER_AWAITING_GM`; **nowy handler, który pisze do karty gracza albo z niej rzuca, woła go** (odczyty — historia PD i portfela — nie). Żeton z kreatora staje przy przyjęciu (`placeApprovedCreationToken`), a postać zrobiona ręką MG jest gotowa od razu.
- **Żeton z kreatora to dług: `playReady && !creationTokenDone && creationDraftId` (26.09, #9)** — bez aktywnej sceny spłaca go `placeOwedCreationTokens` przy **każdym** `scene:activate`, a ręczny `token:create` z tą kartą stempluje `creationTokenDone`. Figura staje przy `Scene.spawn` (gdy jest), inaczej na środku. Nowa droga stawiania figury postaci gracza też spłaca dług, inaczej aktywacja postawi drugą. Ekran końcowy kreatora czyta `playReady` i figurę **na żywo** ze sklepów (#8).
- **Rzut kreatora to jedna kość na pozycję, przez kubek (24.09)** — `PendingCreation.roll` mówi, co kubek rzuca (Cecha, tabela Ścieżki, „ilu”), `chain` każe po rzucie wziąć następną pozycję (`nextCreationCup`). Gracz rzuca Cechę **raz** (`STAT_ALREADY_ROLLED`), przerzut daje tylko MG (`creation:reroll`); **`statRolls` przeżywają zmianę Roli i metody**, a Cechy Krawędziarza liczy z nich `creationRolledStats`. Zbiorcze rzuty (bez `statId`, wiele tabel) są wyłącznie skrótem MG.
- **Szkic widoczny poza kreatorem idzie z `creation:peek` (naprawa 3d)** — nagłówek własnego szkicu (ksywa, Rola, metoda, krok), pytany po każdym `state:sync`; `creationStore.peek` ustępuje `draft`, gdy okno go wczyta, a zakończenie i „Wyrzuć szkic” czyszczą oba. Etykietę składa `creationResumeLabel` (`CharacterPanel.tsx`). Kreator po „Przejdź”/„Pokaż kartę” z ekranu końcowego **schodzi pod karty** (`behind` → z-index 290) zamiast się zamykać.
- **Co zostaje po kreatorze, mówi `cpredRoleChores` (naprawa 3c)** — liczone **z karty**, nie z zapisanego stanu: nowa decyzja Roli dokłada gałąź tam i `data-sheet-panel` w karcie, a nie checkbox w bazie. Gotowość do gry to osobna kolumna `Character.playReady` i osobne zdarzenie `character:play-ready` (tylko MG), które **niczego nie blokuje**.
- **Podsumowanie kreatora czyta `creationOutcome` (naprawa 3a)** — kartę, którą zapisze `creation:finish`: wiersze zakupów, resztę, Poziom życia (`creationLifestyle`). Nowa rzecz, którą zakończenie dopisuje na kartę, wchodzi do `creationToCharacterData` albo `creationOutcome`, a test serwera „writes exactly the sheet the summary computed” pilnuje zgodności.
- **To, czego kreator świadomie nie wydaje, mówi jedna lista `creationLeftOutside`** — krok Wyposażenie, podsumowanie i ekran końcowy renderują ją tym samym `CreatorLeftOutside`. Nowe uproszczenie wyposażenia dopisuje tam wiersz, nie zdanie w komponencie.
- **Nowy wszczep kosztuje samą cenę (17.09)** — `installBill` dolicza `CYBERWARE_INSTALL_COST` wyłącznie przy `installOnly` (znaleziony wszczep, s. 375); operacja jest w cenie (s. 111).
- **Co zabiera zmiana Roli albo metody, mówi `creationChangeEffect` (naprawa 2b)** — liczy stratę z tego samego `mergeCreationDraft`, który stosuje serwer; kreator pyta oknem tylko przy niepustym `lost`. Nowe pole kasowane w `mergeCreationDraft` dokłada tam swój wiersz, inaczej zniknie bez pytania.
- **Lista rang MG jedzie `creation:ranks-sync` do `gmRoom`** — `broadcastCreationRanks` po każdej operacji, która zmienia metodę, ksywę, rangę albo istnienie szkicu gracza; tylko szkice graczy w Kompletnym Pakiecie i tylko metadane. Nowe zdarzenie o takim skutku woła ją samo.
- **Pole kreatora pisane co klawisz idzie przez `useDraftFieldText(…, pole).write`** — kolejka łączy zapisy tego samego pola (`patch(…, { field })`), a pole nie słucha serwera, dopóki jego zapisy są w drodze albo czeka odrzucona łata.
- **Minima podstawowych w szkicu (naprawa 2a)** — pole `skillMinimaAuto` (w `mergeCreationDraft` **i** `parseCreationDraft`); `mergeCreationDraft` kończy się `creationWithSkillMinima` **po** filtrze listy Roli. Szkic bez pola jest stary i zmienia go tylko łata `{ skillMinimaAuto: true }` po bilansie `creationMissingSkillMinima`.
- **Wiersz umiejętności kreatora liczy `creationSkillRow`** — poziom, minimum, wymóg czy lista Roli, koszt, brakujące punkty, Cecha + poziom i następny poziom „+”/„−” (przeskok przez 1). Komponent niczego z tego nie liczy sam, a przycisk czyta wiersz z najnowszego szkicu w kolejce.
- **Brak z `creationIssues` ma krok i pole** — krok daje `creationIssueStep(field)`, pole atrybut `data-creation-field`; nowe pole walidacji dokłada gałąź i atrybut. Zakładki, stopka i podsumowanie liczą tę samą zwiniętą listę (`summaryLines`).
- **Cechy Kompletnego Pakietu czekają na rangę** — `creation:patch` z `stats` odmawia graczowi `CREATION_RANK_PENDING`, dopóki MG nie zatwierdzi rangi; MG nie dotyczy, zapisane wcześniej Cechy zostają.
- **Pole kreatora zapisywane co klawisz** trzyma tekst przez `useDraftFieldText` (`CharacterCreator.tsx`), nigdy `value` prosto ze szkicu serwera — inaczej React cofa znak do czasu odpowiedzi i przy opóźnieniu giną litery. Od 2b pisze też przez jego `write` z nazwą pola.
- **Punkty umiejętności kreatora liczy `creationSkillPointsSpent`** — razem z opłatą za minimum slangu we wspólnym wierszu języka (`creationFreeLanguageCharge`); licznik, walidacja i testy nie dodają jej osobno.
- **Szkic kreatora od 15.09:** aktualizację zależną od innych pól buduj funkcją w kolejce `creationStore.patch`; `draftId` + `revision` chronią inne okna, `requestId` rozpoznaje ponowienie. Ranga pochodzi z kolumny zatwierdzanej przez MG (jej zmiana **nie** podbija `revision`), a zakończenie i naprawa żetonu używają tego samego `draftId`.
- **Notka o skutku `character:cyberware` czeka na odpowiedź serwera** — `sendCyberwareAction` zwraca obietnicę zdania odmowy albo `null`; guzik piszący „Instaluję…" przed nią kłamie przy każdej odmowie montażu.
- **Sprzęt pakietu BN-a, bez którego karta nie działa, jest polem pakietu, nie zdaniem w `gear`** — jak `cyberdeck` netrunnera Korpo; składa go czysta funkcja z kompendium po **nazwie**, a czego katalog nie zna, wraca w `missing` do notatek.
- **Kto operuje przy montażu** — `CharacterCyberwarePayload.surgeon` w trzech wariantach: `none` (bez Testu), `gm` (ripperdoc bez karty, jedna liczba od MG), `character` (Medyk z kampanii, Chirurgia czytana z karty). PT zawsze z `CYBERWARE_INSTALL_DV`, porażka **niszczy wszczep** (s. 226).
- **Odmowa montażu** — jedna czysta funkcja `cyberwareInstallRefusal` (brak podstawy / brak gniazda / limit 7) i jedna tabela zdań `CYBERWARE_INSTALL_REFUSAL_MESSAGES`; liczy **na rodzinie, nie na pudełku sylwetki**, wpisu bez rodziny nie odmawia, a Borgizacji nie liczy do rodzin z podstawą. MG przechodzi, karta czatu zapisuje.
- **Sakiewka Zdolności bez Zdolności** — `cpredDropOrphanedRolePurses` zdejmuje `medicine`/`fabrication`/`fleet`, gdy scalona karta straciła Zdolność; woła się **przed** walidacjami w `character:update`. Nowa sakiewka zależna od rangi dopisuje się tam, nie w walidatorze.
- **Nowe pole w szkicu kreatora** — dopisz je do **obu** funkcji w `creation.ts`: `applyCreationPatch` (zapis) i `parseCreationDraft` (odczyt). Pominięte w odczycie wraca puste bez żadnego błędu — tak zginęły `skillSpecialties`. Walidacja to jedna funkcja wołana przez obie strony.
- **Zdolność Specjalna Roli** poznaje się po **nazwie** (`cpredRoleAbilityRank`), nie po id Roli — id przychodzą z `roles.json`; brak Zdolności to `null`, nie zero. Nowa Zdolność = nowa sekcja w `roleability.ts`, nie gałąź w istniejącej.
- **Efekt Zdolności liczony z samej karty** wchodzi wprost do planera (`planCpredAttack`, `skillBreakdown`), nie kontekstem: podgląd klienta i werdykt serwera dochodzą do tej samej liczby. Kontekst zostaje dla tego, co wie świat.
- **Zdolność, której zapis coś kosztuje**, ma własne zdarzenie i wypada z `character:update` (`FORBIDDEN`) — jak `eddies` od 23b. Kody odmowy są kodami silnika, żeby klient tłumaczył je tą samą tabelą, którą wyszarza guziki.
- **Nowa Zdolność Roli z punktami do rozdzielenia** — sekcja Specjalizacji w `roleability.ts`: lista `CpredSpecialtyDefinition` + dwie liczby `CpredSpecialtyRules` (`perRank`, `across`). Żadnej własnej walidacji; `SpecialtyPanel.tsx` obsłuży ją bez zmian.
- **Przydział Specjalizacji** jedzie **zwykłą łatą karty** (awans nie ma czym zapłacić Akcji), ale rozmiar sakiewki sprawdza `cpredSpecialtiesProblem` **na scalonej karcie** w `character:update` — dzięki temu awans i wydanie punktów mieszczą się w jednej łacie.
- **Umiejętność dostępna tylko przez Zdolność Roli** (Chirurgia, Technologia Medyczna) **nie trafia do `skills.json`** — mieszka w `CPRED_MEDICINE_SKILLS`, poziom liczy `cpredMedicineSkillLevel`, a rzut nią rozstrzyga gałąź `isCpredMedicineSkillId` w planerze.
- **Zdolność stawiająca cudze figury** (Wsparcie) idzie przez trzy warstwy: dane `CpredBackupTier`, czysty `cpredBackupCall`, serwerowy `backup.ts`. **Broń szuka się po nazwie w kompendium**, nigdy po id — jak rany przez `criticalInjuryAt`.
- **Zespół Korpo to karty postaci** (`ownerId: null`), a **Lojalność siedzi na karcie pracodawcy** (`CpredCharacterData.team`): to cecha układu, nie osoby. Kasowanie karty sprząta wiersz przez `dropFromTeams` — JSON nie kaskaduje.
- **Cyborgizacje pakietu BN-a z gotowymi Cechami zostają prozą** — prawdziwe wiersze chromu policzyłyby Człowieczeństwo drugi raz („Wzięto to już pod uwagę", s. 155).
- **Drabina rang Zdolności** — `CpredAbilityTier` (`id`, `min`, `max`, `page`) plus `cpredAbilityTierAt`/`cpredAbilityTiersUpTo`; podręcznik paruje poziomy do dziewiątki, więc szczeblem jest przedział, nie liczba. Nowa Zdolność z drabiną dokłada tabelę, nie własną funkcję szukającą.
- **Zdolność Roli, która zmienia cenę**, pisze na kartę wyłącznie z własnego zdarzenia i wypada z `character:update` (`FORBIDDEN`) — jak `eddies` z 23b. Dobity targ (`haggle`) zapisuje `character:haggle`, zdejmuje `economy:buy` albo ręka Fixera.
- **Lista wpisów kupowanych awansem** (Tabor 30d, Specjalizacje 30b) jedzie zwykłą łatą, a pulę sprawdza `cpredFleetSheetProblem`/`cpredSpecialtiesProblem` na **scalonej** karcie — `applyCharacterPatch` nie widzi rangi, którą ta sama łata podnosi.
- **Cena poziomu** — trzy drabinki z s. 411 i `planCpredAdvance` w `advancement.ts`; przez tę jedną funkcję idzie panel (wyszarza guzik) i serwer (odmawia). Poziom docelowy jedzie w żądaniu, bo dwa kliknięcia w wyścigu kupiłyby dwa poziomy za jedną cenę.
- **Pole karty, którego zmiana ma cenę**, wypada z `character:update` **u gracza**, a u MG zostaje polem: od 29a `improvementPoints`, `skills`, `roleAbilityRank` i `roleId` (ten razem z rangą — Rola pod zachowaną rangą to darmowa Zdolność), **od 26.09 (#2) także `stats`** — Cechę rzuca się w kreatorze raz, przerzut daje MG; `luckCurrent` zostaje u gracza. Na karcie gracza pole jest `readOnly`. Ręczna zmiana MG ląduje jako wiersz `adjust`.
- **Drugi audyt przy karcie** (rejestr awansów) to osobna tabela, nie nowy `kind` w `LedgerEntry`; `applyImprovementPoints` przesuwa licznik i zmienia kartę **jednym zapisem** (pole `sheet`).
- **Zdolność Roli czyta się przez `CpredRoleSheet`** (`roleId` + `roleAbilityRank` + `formerRoles`), nigdy przez `roleId` wprost: `cpredRoleAbilityRank` pyta o **każdą** Rolę z listy, a bieżąca — pierwsza w `cpredRoleRanks` — jest tą, przez którą widzi cię Ulica.
- **Zmiana Roli** to `character:role-change` + `planCpredRoleChange`: bramka na Zdolności **bieżącej** Roli ≥ 4, nowa Rola 60 PD od poziomu 1, powrót darmowy, ale **bramki nie omija**. Rejestr ma własny rodzaj `role`; `formerRoles` wypada z `character:update` u gracza, a `cpredRolesProblem` sądzi **scaloną** kartę.
- **Półkę sklepu kreatora rozstrzyga `creationShopVerdict` (naprawa 3b)** — poziom 1 dla wszystkich plus narzędzia własnej Roli do `CREATION_ROLE_TOOL_TIER`; listy narzędzi są danymi (`roleTools` w `shop-tiers.json`), nie kodem. Ta sama funkcja filtruje półkę, odmawia `creation:buy` (`CREATION_SHOP_LOCKED:poziom:czyNarzędzie`), sądzi koszyk w `creationIssues` i czyści go przy zmianie Roli (`creationBasketForRole`).
- **Nazwa Roli z `roles.json` wchodzi do zdania tylko w mianowniku** — po dwukropku albo na końcu. Odmiany nazwy z pliku danych nie da się zgadnąć („zostań Nomada").

---

**Warunki zgody MG: metoda, ranga, pula umiejętności (25.09, decyzje MG).**
MG udziela zgody **na warunkach** (`CreationTerms`): metoda (Krawędziarz / Kompletny Pakiet),
Ranga Postaci (pula Cech Kompletnego Pakietu, 50–80) i pula umiejętności — **zasada domowa**:
podręcznik daje zawsze 86, MG wpisuje dowolną liczbę 1–300 (`isCreationSkillPool`), dla obu
metod. Zgoda bez poprawnych warunków → `BAD_TERMS`; ponowna zgoda na niewykorzystaną zgodę
nadpisuje warunki. `creation:start` przenosi je na szkic: `method` z `methodFixed: true` (łata
gracza zmieniająca metodę → `mergeCreationDraft` zwraca `null`), ranga w kolumnie
`CharacterDraft.statRankId` (więc `rankApproved` od razu), `skillPool` (null = 86). Pola
`skillPool` i `methodFixed` nie przychodzą z łaty nigdy. MG zmienia warunki w trakcie
(`creation:terms`): zmiana metody idzie przez `mergeCreationDraft` z chwilowo zdjętym
`methodFixed` (odpada to, czego nowa metoda nie opłaci; kości zostają), `revision` rośnie, a
gracz dostaje `creation:terms-changed` i kreator wczytuje szkic od nowa. Rozdzielone punkty nie
przepadają — kreator pokazuje nadwyżkę albo brak. Szkice sprzed zmiany nie mają warunków do
pierwszego „Zapisz warunki” w panelu (i do tego czasu metodę wybiera gracz). Panel MG
(`CreationRankPanel`) ma jeden edytor warunków (`TermsEditor`) dla próśb i szkiców; osobne
„Zatwierdź” rangi zniknęło z UI (zdarzenie `creation:set-rank` zostaje w protokole).

**Nowa postać gracza: zgoda MG, zasady, zatwierdzenie (24.09, decyzje MG).**
Gracz bez szkicu nie otwiera kreatora sam. W zakładce „Postacie” ma „✋ Poproś MG o stworzenie
postaci” (`creation:request`, z `cancel` — wycofanie); MG widzi prośbę w „Szkicach postaci
graczy” (`creation:permits` / push `creation:permits-sync`, plakietka zakładki liczy prośby) i
odpowiada `creation:permit` — zgoda albo odmowa; odmowę gracz dostaje jednorazowo
(`creation:permit-state` z `refused`). Po zgodzie pierwszy klik pokazuje okno zasad
(`CreationGate.tsx`: Cechy raz, szkicu nie wyrzucisz, gotową postać zatwierdza MG), a dopiero
„Rozumiem, zaczynam” (`creation:accept-rules`) pozwala `creation:start` założyć szkic. Stan
siedzi w dwóch kolumnach `CampaignMember` (`creationPermit`, `creationRulesAcceptedAt`) — jedna
zgoda na gracza w kampanii, tak jak jeden szkic. **Szkic, który już istnieje, otwiera się bez
pytania** (szkice sprzed zmiany, m.in. Mary w „Test2”, nie utknęły). Zgodę zużywa
`creation:finish`; zgodę niewykorzystaną MG cofa `creation:permit` z `grant: false`, a zgodę
w użyciu kończy tylko wyrzucenie szkicu przez MG (`creation:discard-player`, push
`creation:discarded` zamyka kreator u gracza). Gracz nie wyrzuci własnego szkicu
(`creation:discard` → `FORBIDDEN`; w kreatorze zamiast przycisku napis „Szkic wyrzuca tylko MG”).
**Zatwierdzenie odwraca decyzję z 17.09:** `playReady` przestał być samym znacznikiem. Do
„Przyjmij do gry” karta gracza z kreatora jest tylko do podglądu — `refuseAwaitingGm` stoi
w `requireRollableCharacter`, obu `requireOwnCharacter`, `character:update`,
`combat-awareness`, `field-repair`, `backup-call`, `haggle`, `team-hire`, `check:request`,
`character:advance`, `role-change`, `economy:buy` i `economy:transfer` — a żeton, o który
prosił kreator, staje na aktywnej scenie dopiero przy przyjęciu (`tokenStatus: 'awaiting-gm'`,
potem `placeApprovedCreationToken` w `character:play-ready`). Postać skończona ręką MG (także
dla gracza) wychodzi gotowa — MG zatwierdził ją, robiąc ją. Klient tłumaczy odmowę jednym
zdaniem `CHARACTER_AWAITING_GM_TEXT` we wszystkich `*ErrorText`.

**Rzut kreatora: jedna kość na pozycję, przez kubek (24.09, zlecenie MG z 17.09).**
Do 24.09 `creation:roll` rzucał komplet 10k10 jedną kartą, a Ścieżka Życia miała „🎲 Rzuć całą
Ścieżkę” i kostki przy wierszach bez kubka. Teraz każda pozycja to osobny rzut z gestem kubka:
`creation:roll` z `statId`, `creation:lifepath-roll` z **jedną** tabelą, `creation:lifepath-count`
— wszystkie trzy przyjmują `gesture`. Slot kubka `PendingCreation` niesie opis rzutu
(`CreationCupRoll`) i notację; rzut wykonuje `rollCreationFromCup` (`creationStore.ts`), nie
`DiceCup`. „Weź kubek” w nagłówku kroku ładuje kubek z `chain`, więc po odpowiedzi serwera kubek
sam czeka z następną Cechą albo tabelą bez odpowiedzi (`nextCreationCup`, `lifepathUnanswered`) —
chyba że okno zamknięto albo ręka wzięła coś innego. Kubek przy wierszu rzuca tylko ten wiersz.
**Decyzje MG z 24.09:** gracz rzuca każdą Cechę **raz** — serwer odmawia `STAT_ALREADY_ROLLED`,
a przerzut (jednej Cechy albo wszystkich) daje wyłącznie MG zdarzeniem `creation:reroll` z panelu
„Szkice postaci graczy” (`CreationRankPanel`; lista od 24.09 obejmuje też Krawędziarzy, z
`method` i `rolledStats`, a `rankApproved` Krawędziarza jest zawsze `true`, żeby nie liczył się do
plakietki). Właściciel dostaje `creation:rerolled` i zdejmuje te Cechy u siebie. Żeby przerzutu
nie dało się wymusić zmianą Roli tam i z powrotem, **`statRolls` przeżywają zmianę Roli i metody**
(`mergeCreationDraft`), a Cechy Krawędziarza są czystą funkcją Roli i rzutów
(`creationRolledStats`); okno strat (`creationChangeEffect`) mówi o tym w `notes`, nie w `lost`.
MG zachował skróty bez kubka: „🎲 Rzuć brakujące” przy Cechach (`creation:roll` bez `statId`)
i przy Ścieżce (wiele tabel naraz) — gracz dostaje na nie `FORBIDDEN`. Tabele Ścieżki wolno
przerzucać każdemu, bo podręcznik i tak pozwala wynik zmienić ręcznie.

**Szkic widoczny poza kreatorem i kreator ustępujący karcie (naprawa 3d, 18.09).** Po F5 zakładka
„Postacie” pokazywała gołe „Kreator postaci…”, bo klient dowiadywał się o szkicu dopiero z odpowiedzi
`creation:start` — czyli po otwarciu okna. Nowe zdarzenie `creation:peek` oddaje sam **nagłówek**
własnego szkicu (`CreationDraftPeek`: ksywa, nazwa Roli, metoda, krok, `updatedAt`) i **niczego nie
zakłada** — w odróżnieniu od `creation:start`, które tworzy szkic, gdy go nie ma (test na serwerze).
Klient pyta o niego po każdym `state:sync` tą samą kolejką co MG o listę rang, więc odpowiedź nie
wyprzedzi pushy. `creationStore.peek` jest źródłem etykiety tylko wtedy, gdy `draft` jest pusty;
udane `creation:finish` czyści `peek` **i** `draft` od razu (ekran końcowy czyta `finished.draft`),
a `discard` czyści oba. Etykietę „Medyk „Igła” · Wyposażenie” składa wyłącznie `creationResumeLabel`
(eksport z `CharacterPanel.tsx`, test w `creation-resume.test.ts`) — nowe pole nagłówka dopisuje się
tam, nie w JSX. Osobna decyzja z tej samej sesji: „Przejdź” i „Pokaż kartę” na ekranie końcowym
otwierały kartę **pod** kreatorem (karty stoją na `300 + stackIndex`, kreator na 320), więc przy
oknie 1456 px CSS obiecany panel był zasłonięty. Kreator dostał stan `behind` (z-index 290) zamiast
zamykania — na ekranie końcowym zostaje ponowienie żetonu — i wraca na wierzch przy pierwszym
`pointerdown` w siebie; `RoleChoresList` woła `onGo` **po** `focusPanel`, więc lista MG i pasek karty
(bez `onGo`) niczego nie zmieniają.

---

**Co zostaje po kreatorze i gotowość do gry (naprawa 3c, 17.09).** Kreator stawia rangę Zdolności
Specjalnej na 4 i tam kończy — punktów Zmysłu Walki nie rozdziela, zespołu Korpo nie obsadza, Taboru
Nomady nie wybiera, a Netrunner wychodzi bez wskazanego deku. Mówi o tym jedna czysta funkcja
`cpredRoleChores(data, registry)` w `shared/systems/cpred/readiness.ts`, a **liczy ją z samej karty**:
rozdzielone punkty zdejmują wiersz same, więc nie ma stanu, który mógłby się z kartą rozjechać, i nie
ma czego odhaczać (decyzja MG). Wiersz niesie zakładkę karty (`tab`) i nazwę panelu (`panel`); po
drugiej stronie panel nosi `data-sheet-panel` o tej samej nazwie, a `characterStore.focusPanel`
otwiera kartę, przełącza zakładkę i podświetla go (`cp-panel--flash`). **Nowa decyzja wynikająca
z Roli dokłada gałąź w `cpredRoleChores` i atrybut w karcie** — nie własną listę i nie pole w bazie;
strażnik `role-chores.test.ts` u klienta pilnuje, że każda nazwa panelu z listy naprawdę w karcie
stoi. Jeden komponent `RoleChoresList` renderuje ją w czterech miejscach: zapowiedź w podsumowaniu
kreatora, ekran końcowy, pas „Po kreatorze zostało” na stronie pierwszej karty i lista MG
w zakładce „Postacie”.

Gotowość do gry jest **kolumną, nie polem arkusza**: `Character.playReady` (domyślnie `true`,
migracja `20260917210000`) i zdarzenie `character:play-ready` tylko dla MG — ta sama umowa, co
`eddies` z 23b: decyzja MG nie jedzie autozapisem karty. `false` niesie wyłącznie karta z
`creation:finish`, która ma właściciela (`playReady: ownerId === null`); karta ręczna, z importu,
z pliku kampanii i statysta są gotowe od razu, żeby MG nie dostał listy całej kampanii. Znacznik
**niczego nie blokuje** (decyzja MG z 17.09) — nie dotyka inicjatywy, żetonu ani rzutów. Gotowość
cofa się z samej karty, bo lista MG pokazuje tylko czekających. Znaczek na zakładce „Postacie” to
jedna plakietka o dwóch powodach: szkice bez rangi z 2b plus postaci czekające na gotowość, liczone
u klienta wprost z magazynu postaci (MG widzi wszystkie karty kampanii, więc drugi tor
synchronizacji tylko by się rozjeżdżał).

Zdanie z liczbą składa **jedna** funkcja `leftPhrase`, razem z czasownikiem: „Został 1 wpis”,
„Zostały 4 wpisy”, „Zostało 9 punktów”. Pierwsza wersja sklejała stałe „Zostało” z odmienianym
rzeczownikiem i napisała „Zostało 4 wpisy” (wyszło przy oględzinach 17.09).

**Dostępność wyposażenia po części 3b naprawy (17.09).** Poziom mówi, **jak legalna** jest rzecz,
a nie ile kosztuje: `kindTier` czyta typ broni (`WEAPON_TYPE_TIERS`, doskonała jakość +1), OB
pancerza, rodzinę wszczepu, klasę Programu i sprzęt cyberdeku, a cena wyłącznie **podnosi** wynik
(1000 ed → min. 2, 5000 ed → 4). Kto dokłada nową kategorię wpisu, dokłada jej gałąź w `kindTier` —
bez niej wpis spada na starą drabinę cenową, co jest świadomym zapasem dla własnych wpisów MG.
Wyjątek MG siedzi w `Campaign.shopTierOverrides` (JSON `{ id: 1–4 }`, czytany `readShopTierOverrides`),
jedzie `state:sync` i rozgłoszeniem `shop:entry-tier`, a eksport kampanii zabiera kolumnę. W kreatorze
poziom 1 ma każdy, a narzędzia własnej Roli do poziomu 2 — `creationShopVerdict`; serwer liczy to
z `creationShopRules` (`deps.ctx.shopRules.roleTools` + wyjątki kampanii) i tą samą funkcją odmawia,
waliduje koszyk i czyści go przy zmianie Roli.

**Kreator po części 3a naprawy (17.09).** Podsumowanie nie opisuje szkicu, tylko pokazuje kartę,
którą zapisze serwer: `creationOutcome(draft, data, registry, lookup, { weaponTypeById }, owned)`
składa ją z `creationToCharacterData` (z Poziomem życia z `creationLifestyle`), wierszy
`purchasedSheetRow` dla każdej sztuki koszyka i reszty eurodolców, przepuszczając wynik przez
`mergeCharacterData`. Serwer liczy to samo krokami (wiersz rejestru na linię koszyka), ale z tych
samych klocków — test w `creation.test.ts` porównuje obie karty bez identyfikatorów wierszy. Kto
dokłada coś do zakończenia (np. znacznik gotowości z 3b), dopisuje to w `creationToCharacterData`,
inaczej podsumowanie znów zacznie obiecywać inną kartę. `owned` rozstrzyga rachunki: gracz zawsze
jest właścicielem, MG zależnie od listy „Właściciel”, a NPC zostaje z `lifestyle: null`.
Uproszczenia wyposażenia z 25c (pakiet Krawędziarza, Moda, cyborgizacje, amunicja) mówi
`creationLeftOutside` — jedna lista dla sklepu (zwinięta), podsumowania i ekranu końcowego.
Po udanym `creation:finish` okno zostaje na ekranie końcowym (`CreatorFinishedScreen`) z wynikiem
żetonu i ponowieniem tym samym `draftId`; szkic w magazynie czyści dopiero „Zamknij kreator”.

**Opłata za montaż wszczepu (17.09).** `installBill` w `realtime/cyberware.ts`: `full` = cena wpisu,
`installOnly` = `CYBERWARE_INSTALL_COST`, `none` = zero (MG). Do 17.09 `full` pobierał cenę i opłatę
za montaż naraz, choć „koszt operacji chirurgicznej […] jest wliczony w cenę” (s. 111), a pozycja
cennika „Montaż znalezionej cyborgizacji” (s. 375) dotyczy wyłącznie wszczepu, który postać już ma.

**Kreator po części 2b naprawy (16.09).** Zmiana Roli albo metody, która coś zabiera, pyta oknem
w samym kreatorze (`CreatorDialog`), a treść pytania liczy `creationChangeEffect` w `shared`:
przepuszcza szkic przez `mergeCreationDraft` i porównuje przed i po — Cechy (wylosowane albo
rozdzielone), obniżone i zdjęte umiejętności, koszyk z cenami, odpowiedzi Ścieżki Życia Roli; obok
w `notes` nowe minima, poziomy 1 niedozwolone w Krawędziarzu, zmiana puli i pieniędzy. Dzięki temu
okno nie obieca mniej, niż zrobi zapis — **pole, które `mergeCreationDraft` zacznie kiedyś kasować,
dopisuje wiersz w `creationChangeEffect`**. Bez strat zmiana idzie od razu. To samo okno pyta
o „Wyrzuć szkic” i „Wczytaj zapis serwera”; `window.confirm` w kreatorze już nie ma.
Zmiana Roli w Kompletnym Pakiecie **nadal kasuje Cechy** — decyzja MG z 16.09, okno o tym mówi.

Rangi szkiców MG ustala w zakładce „Postacie” (`CreationRankPanel`), bez otwierania kreatora.
Serwer rozsyła całą listę `creation:ranks-sync` do `gmRoom` (`broadcastCreationRanks`) po starcie
szkicu gracza, zmianie metody lub ksywy, `creation:set-rank`, zakończeniu i wyrzuceniu; klient MG
pyta `creation:ranks` przy każdym `state:sync`. Lista ma wyłącznie szkice **graczy** w Kompletnym
Pakiecie, oczekujące pierwsze, i pole `rankApproved`, które liczy znaczek na zakładce. Rangę
zatwierdza przycisk, nie `change` listy — strzałki na zamkniętym `select` zatwierdzałyby po drodze
każdą pulę.

Pole kreatora pisane co klawisz (imię, Cechy Kompletnego Pakietu, dziedzina) wysyła przez
`useDraftFieldText(tekst, szkic, 'nazwa.pola').write`. Kolejka `creationStore.patch(łata, { field })`
podmienia zapis tego pola, który jeszcze nie wyszedł (także odłożony za odrzuconą łatą — na jego
dawnym miejscu), więc szybkie pisanie przy opóźnieniu wysyła dwie ramki zamiast dwudziestu.
Hook liczy swoje zapisy w drodze i nie idzie za serwerem, dopóki nie wrócił ostatni albo czeka
`pendingPatch` — inaczej po wyjściu z pola odtwarzał pośrednie stany.

**Kreator po części 2a naprawy (16.09).** Minima podstawowych umiejętności są zwykłymi poziomami
w `skills`, a nie wyliczeniem w locie: dzięki temu koszt jest na rachunku raz i ponowne otwarcie
szkicu niczego nie dolicza. Pilnuje ich flaga `skillMinimaAuto` — nowy szkic ma `true`,
a `mergeCreationDraft` po każdej łacie podnosi do minimum każdą podstawową, którą metoda pozwala
kupić (Krawędziarz dostaje je dopiero z listą Roli). Szkic sprzed 2a czyta się z `false`
i zostaje nietknięty, dopóki gracz nie przyjmie bilansu (`creationMissingSkillMinima` → łata
`{ skillMinimaAuto: true }`); wyłączyć flagi się nie da. Darmowy język nie wchodzi na listę:
jego minimum slangu jest już opłatą `creationFreeLanguageCharge`.

Wszystko, co pokazuje wiersz umiejętności, pochodzi z `creationSkillRow` — także następny poziom
dla „+” i „−”. Poziom 1 umiejętności z minimum 2 nie jest legalnym przystankiem, więc przyciski go
przeskakują, a podstawowej nie da się zejść poniżej minimum. Przycisk buduje łatę funkcją w kolejce,
która liczy wiersz od nowa na najnowszym szkicu (dwa szybkie kliknięcia = dwa kroki).

Każdy brak z `creationIssues` ma krok (`creationIssueStep`) i element z `data-creation-field`
o tej samej nazwie. „Przejdź” w podsumowaniu woła `goToField`, a okno po wyrenderowaniu kroku
skupia pole przez `focusCreationField`, skracając nazwę po kropkach, gdy dokładnego elementu nie ma
(`stats.body` u Krawędziarza → `stats`). Zakładki kroków oceniają tylko kroki odwiedzone
(`visited` w magazynie, bez zapisu w szkicu).

**Kreator po domknięciu etapu 1 naprawy (16.09).** Pola Cech, dziedziny umiejętności i imienia
wysyłają łatę co zmianę, ale wyświetlają własny tekst z `useDraftFieldText`: podczas edycji
pole nie słucha serwera, poza nią idzie za każdym szkicem, który przyszedł (wczytanie zapisu,
drugie okno, ponowienie). Nowe pole tekstowe albo liczbowe w kreatorze idzie tą samą drogą.
`creation:set-rank` nie zmienia `revision` — ranga ma własną kolumnę, a podbicie odrzucało zapis
gracza w drodze jako `DRAFT_CHANGED` bez wyjścia poza utratą zmiany. `retry()` wysyła odrzuconą
łatę i wszystkie wstrzymane intencje w **jednej** turze kolejki (`sendPatch` działa tylko w niej).
Minimum slangu ulicznego (podstawowa) dzieli wiersz z darmowym językiem kultury i kosztuje 2 pkt
w `creationSkillPointsSpent` (decyzja w `decyzje-i-uproszczenia.md`).

**Niezawodność kreatora (15–16.09).** `defineCreationEvent` szereguje wszystkie jego
operacje w kampanii (jeden proces serwera). Nowy zapis szkicu zwiększa `revision`;
`lastPatchId` pozwala oddać wynik powtórzonej łaty bez ponownego zastosowania.
Nie buduj zestawu Cech, umiejętności ani Ścieżki Życia ze starych propsów: przekaż
funkcję czytającą bieżący szkic dopiero wewnątrz kolejki. Odmowa zachowuje łatę i późniejsze
intencje; jawne ponowienie używa tych samych identyfikatorów. Konflikt drugiego okna
wymaga świadomego wczytania stanu serwera. Zakupu lub rzutu po timeout nie powtarza się
automatycznie — najpierw odczyt szkicu.

`CharacterDraft.statRankId` to wybór MG; JSON nie jest autorytetem puli. Stare szkice
graczy czekają na zatwierdzenie, ich rozdzielone punkty zostają. `creation:finish`
obejmuje kartę, `applyBalance` z klientem transakcyjnym, wyposażenie, rejestr i usunięcie
szkicu jedną transakcją. `Character.creationDraftId` (unikalne) i `creationUserId`
identyfikują wynik ponowienia; status żetonu jest oddzielny. Wstawienie żetonu zapisuje
`creationTokenDone` w tej samej transakcji co figurę, przed rozgłoszeniem.

**Zdanie o skutku montażu pisze się dopiero po odpowiedzi serwera (13.09).** `sendCyberwareAction`
(`socket.ts`) zwraca `Promise<string | null>`: zdanie odmowy — to samo, które ląduje notatką na
czacie — albo `null`, gdy serwer przyjął intencję. Obie drogi instalacji w kompendium („Zainstaluj"
w `CompendiumPanel.tsx` i „Dodaj za darmo" w `compendium-items.ts`) czekają na nią i przy odmowie
wpisują pod guzikiem tamto zdanie. Do 13.09 notka „Instaluję…" stała przed odpowiedzią, więc
`MISSING_FOUNDATION` zostawiało kartę wpisu i czat w sprzeczności. Wołający, którzy żadnej notki
nie piszą (usunięcie wszczepu i terapia na karcie), mogą obietnicę pominąć. Ta sama zasada, co
`InventoryGiveResult.pending` w `ekwipunek`: o skutku mówi się dopiero wtedy, gdy serwer go potwierdzi.

**Sprzęt pakietu, bez którego karta nie spełnia swojej funkcji, jest polem pakietu (13.09).**
Pakiety zespołu Korpo trzymają osprzęt jako prozę (`CpredTeamProfession.gear`), a na wiersze karty
zamieniają tylko to, co bez wiersza nie działa: pancerz, pistolet i od 13.09 **cyberdek netrunnera**
(`cyberdeck: CpredTeamCyberdeck | null` — nazwa, wydrukowana liczba gniazd, Programy po nazwie).
Czysta funkcja `cpredTeamCyberdeck` w `roleability.ts` szuka w kompendium **po nazwie** (jak
pistolet, bo grupa może zmienić slugi), kopiuje Programy tym samym `netProgramProfileOf`, którym
karta wkłada je ręcznie, i **niczego nie zgaduje**: nazwa bez wpisu albo Program, który się już nie
mieści, wraca w `missing`, a `team.ts` pisze ją w notatkach karty. Przepełniony deck oblałby
`validateCyberdeck` i zniknąłby po cichu przy następnym odczycie — dlatego funkcja pilnuje gniazd
sama. Kolejny taki przedmiot (np. pojazd Szofera, jeśli kiedyś stanie się danymi) dopisuje się jako
kolejne pole pakietu i kolejna funkcja obok, a to, co zostaje wierszem, **schodzi z `gear`**.

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

### Nowe pole w szkicu kreatora postaci

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

**Lista wpisów kupowanych awansem** (Tabor Rodziny z 30d, Specjalizacje z 30b) jedzie **zwykłą
łatą karty**, a rozmiar puli sprawdza się na **scalonej** karcie w `character:update`
(`cpredFleetSheetProblem` obok `cpredSpecialtiesProblem`) — bo `applyCharacterPatch` nie widzi
rangi, którą ta sama łata może właśnie podnosić. Niezmiennik zamiast historii awansów: wpisów
najwyżej tyle, ile poziomów, i żaden nie z kategorii wyższej niż poziom.

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

## ekwipunek — Ekwipunek i przedmioty między kartami

- **Gracz wskazuje po id wyłącznie drużynę (30.09, #40)** — karty graczy i towarzyszy-botów (profil `companion`, nie w archiwum). Listę buduje `teamCardsWhere`, odbiorcę sprawdza `requireTeamCard` (`realtime/team-cards.ts`) — przelew, przekazanie i każda nowa lista „komu” gracza idą przez nie. NPC-a spoza drużyny gracz wskazuje **figurą**; id karty ciała przy łupie (`InventorySourceView.characterId`) i id kart w karcie czatu przekazania (`InventoryMoveView`) dostaje tylko MG.
- **Id `statist-weapon` nie jedzie z łupem (27.09, #27)** — `landedRow` nadaje wierszowi z `STATIST_WEAPON_ROW_ID` nowe id zawsze, także bez kolizji; inaczej gracz z pistoletem zdobytym na statyście „był” strzelcem ataków wszystkich statystów.
- **Miniatura rodzaju przedmiotu na liście to `cpredEntryIcon` / `cpredItemRowIcon` (`systems/cpred/itemicons.ts`)**, a w kliencie `ItemIcon` / `useEntryIcon` / `useRowIcon` z `ItemIcons.tsx` — nowe miejsce z listą przedmiotów nie składa sylwetki samo. Rodzaj czyta się z pól maszyny (typ broni, `patterns`, efekt dodatku, lokacja pancerza), nigdy z nazwy ani id; model, któremu typ kłamie (rewolwer), dostaje `WeaponEntry.icon` z `cpred/weapon-icons.json` albo z edytora MG. Listy broni sortuje `cpredSortWeapons`, filtruje `WeaponTypeFilter`.
- **Handel (38c) to stan w pamięci serwera (`realtime/trade.ts`) + czyste reguły w `shared/src/trade.ts`** — wymianę wykonuje wyłącznie `cpredSwapItems` w jednej transakcji z `applyBalance({ tx, emit: false })`; każda zmiana pola kasuje obie zgody (`setTradeOffer`), zgoda niesie `version`, a oferta sprawdza się z kartą jeszcze raz przy wykonaniu (`OFFER_STALE`). Stronę NPC-a prowadzi MG, strony gracza — tylko gracz.
- **Poziom dostępności liczy `shopTierVerdict` (naprawa 3b)** — kolejno: wyjątek MG na kampanii, `tier` wpisu, reguła rodzaju (typ broni, OB, rodzina wszczepu, klasa Programu, sprzęt deku) podniesiona ceną, na końcu stara drabina cenowa. Każde miejsce pokazujące poziom woła ją z `ShopTierContext` (wyjątki MG + nazwy typów broni), inaczej lista i serwer rozjadą się o to, co zablokowane.
- **Rzecz, której poziomu nie wyczyta rodzaj, przypisuje się po id w `shop-tiers.json`** — nie gałęzią w kodzie: sprzęt, amunicja, dodatki, bojowy chrom i broń egzotyczna. Publiczna próbka w `data/public/cpred`, prawdziwa lista w `data/private/cpred` (wygrywa po id i po Roli); strażnik licencji pilnuje, żeby w repo stały wyłącznie wymyślone identyfikatory.
- **Co widać na cudzej figurze, składa `cpredSighting`** (`systems/cpred/sighting.ts`, moduł czysty) — dwie warstwy w **jednym kształcie**: rzut oka bez liczb, oględziny z liczbami. Nazwę typu broni podaje wołający, moduł nie chodzi do katalogu.
- **Rzut oka jedzie `sighting:look`, nie na `TokenView`** — składa się go z kompendium, a synchronizacja sceny nie ma po co na to czekać. Warstwę szczegółową dowozi **karta czatu** rodzaju `sighting` po zdanym Teście; żądanie nie ma pola, którym dałoby się o nią poprosić.
- **Widoczność figury rozstrzyga `concealedFrom`**, ta sama, którą mapa decyduje o rysowaniu żetonu — oględziny nie mają własnej definicji „widzę". Odmowa to `TOKEN_NOT_FOUND`, nie `FORBIDDEN`.
- **Chrom widać rodziną, nie flagą wpisu** — `CPRED_VISIBLE_CYBERWARE_TYPES` (sześć z ośmiu); wiersz bez rodziny jest **niewidoczny**. Pancerz liczy się wyłącznie założony (`equipped !== false`), jak w etapie 15.
- **Przedmiot z karty na kartę to `cpredMoveItems(from, to, refs)`** (`systems/cpred/inventory.ts`) — zwraca **obie** karty naraz; wiersz jedzie w całości (magazynek, dodatki, zużyte OB). Cyborgizacje nie jadą nigdzie.
- **Przeniesiony pancerz przychodzi ZDJĘTY** (`equipped: false`) — jedyne pole, które przenoszenie zmienia po drodze; inaczej łup po cichu zmieniałby OB odbiorcy.
- **Wyposażenie skleja się po `compendiumId`, nigdy po nazwie** (`stacksWith` — plus nazwa, uwagi, `consumable`, `upgrade`); dwa ręcznie wpisane „Notatnik" mogą być czymkolwiek.
- **Id wiersza ekwipunku jest unikalne w obrębie KARTY, nie kampanii** — kopia figury z 35 niesie ten sam `rowId`; kolizję rozstrzyga `landedRow` nowym id, nie nadpisaniem.
- **Przekazanie na kartę Z WŁAŚCICIELEM to propozycja** (`inventory:give` → karta czatu bez `resolution`, ruch dopiero w `inventory:respond`); wiersze czyta się z **zapisanej karty**, nie z żądania. Karta bez właściciela idzie od ręki, a ack mówi `pending: false`.
- **Zasięg przenoszenia to `CPRED_MELEE_REACH_M`, mierzony wszystkim — MG włącznie** (jak Ustabilizowanie z 14e). Brak wspólnej sceny znosi warunek przy `give`; przy `take` nie znosi nic (`NOT_ON_SCENE`).
- **Gracz przeszukuje tylko kartę BEZ właściciela, leżącą albo martwą i w zasięgu** — trzy warunki razem, w `inventory:take` i w `inventory:sources`. Z karty gracza przenosi wyłącznie MG.
- **Przedmiot zużywalny** — `CpredGearRow.consumable` + `qty` na wierszu ekwipunku, katalog w `systems/cpred/pharma.ts` (moduł **bez importów**). Nowy środek = wpis w `CPRED_PHARMACEUTICALS` + gałąź w `applyDose`.

---

**Gracz wskazuje po id wyłącznie drużynę (30.09.2026, #40, decyzja MG).** Do 30.09 lista odbiorców
przelewu (`economy:history`, „lista nie kurczy się o nikogo” z 12.09) i lista celów przekazania
(`inventory:sources`) niosły graczowi **wszystkie** karty kampanii — z id i prawdziwymi nazwami, więc
umowa handlu („id karty NPC-a gracz nie poznaje”) nie ukrywała niczego. Teraz gracz dostaje drużynę:
karty z właścicielem i karty towarzyszy-botów (`BotProfile` typu `companion`, niezarchiwizowany —
mówi na czacie pod swoim imieniem, przy grze solo stoi obok gracza). NPC z głosem bota (Paser, typ
`npc`) drużyną **nie jest**. `economy:transfer` i `inventory:give` odmawiają karty spoza drużyny
tym samym `CHARACTER_NOT_FOUND`, co karty spoza kampanii — NPC-owi płaci się i daje przez okno
handlu z figurą. MG widzi wszystko (filtr pusty). Karta czatu przekazania i łupu traci u gracza oba
id (`redactChatMessage`), a `deliverChatMessageTo` przycina per widz tak samo jak historia (umowa
w `czat`).

**Miniatura rodzaju: jedna odpowiedź w całym VTT (24.09.2026).** Sylwetka broni na liście
sklepu, na karcie, w wymianie i na pasku broni panelu postaci pochodzi z tego samego
`cpredWeaponIcon` — `cpredEntryIcon` tylko rozszerza go o amunicję (kształt naboju; kilka
kształtów to skrzynka, a nie pierwszy z brzegu), dodatki (doczepiona broń swoją sylwetką,
ostrze bagnetem, reszta po efekcie) i pancerz (tarcza albo kamizelka). **Rewolwer nie jest
typem broni** w podręczniku, więc nie wynika z żadnego pola: mówi go `WeaponEntry.icon`,
wpisywany z `cpred/weapon-icons.json` (jak `shop-tiers.json`: publiczna próbka z wymyślonymi
id, prywatny plik wygrywa; strażnik w `licensing.test.ts`) albo polem „Miniatura na listach”
w edytorze wpisu MG. `ResolvedWeapon.icon` wygrywa z typem, więc pasek broni i dźwięk strzału
idą za modelem. Widok wymiany (`CpredItemView`) niesie `compendiumId` i `armorLocation`, bo
klient nie ma cudzej karty; oględziny niosą gotowe `icon`. Nowa sylwetka = nazwa w
`CPRED_WEAPON_ICONS` albo `CPRED_GEAR_ICONS`, plik w `public/icons/hud/` (pilnuje
`item-icons.test.ts`), wiersz w `ATTRIBUTION.md`; nowa sylwetka broni także w `ICON_FX`.

**Handel: negocjacje w pamięci, wymiana w jednej transakcji (23.09, etap 38c).** Otwarty handel nie jest faktem świata, więc nie ma tabeli: `trades` w `realtime/trade.ts` znika z restartem, a klient odtwarza listę `trade:list` po każdym `state:sync`. Reguły — kto prowadzi stronę, wersja, zgody, widok per widz — to czyste funkcje w `shared/src/trade.ts`; serwer tylko je woła. **Wymianę robi `cpredSwapItems`, nigdy dwa `cpredMoveItems` po kolei** (stos po drodze połknąłby cudze sztuki, a limit wierszy liczyłby się na stanie pośrednim). Obie karty i wszystkie wpisy historii zapisuje **jedna** `$transaction` (`applyBalance` z `tx` i `emit: false`, emisje dopiero po niej). Oferta przechowuje adresy z **jawną** ilością i gotowe widoki; przy wykonaniu `cpredOfferViews` liczy je z bazy od nowa, a różnica zdejmuje zgody (`OFFER_STALE`) zamiast wysłać rzecz w innym stanie. Gracz nie dostaje `characterId` karty NPC-a ani w liście partnerów, ani w widoku handlu — tą samą umową, co `inventory:sources`.

**Oględziny: dwie warstwy, jeden kształt (10.09, etap 41).** `cpredSighting` zwraca ten sam typ
w obu warstwach, a różni je to, czy pola liczbowe są wypełnione. To jest decyzja, nie skrót:
klient rysuje **jedną** listę, więc „hełm" i „hełm bojowy OB 7/11" nie mogą się rozjechać w dwa
widoki trzymane potem w zgodzie. O tym, **czy** wolno pokazać warstwę szczegółową, rozstrzyga
wołający, a wołających jest dokładnie dwóch: `sighting:look` (zawsze `false`) i zdany Test
Percepcji w `character-rolls.ts` (`true`). Trzeciego być nie powinno.

**Warstwa szczegółowa jedzie kartą czatu, nie odpowiedzią na zapytanie**, i to z dwóch powodów
naraz. Pierwszy: rzut bywa jawny, a **treść** oględzin należy do postaci, która ją zdobyła —
doklejona do wyniku pojechałaby całemu stołowi tą samą drogą, co liczba na kości. Drugi: karta
zostaje, więc po przeładowaniu strony gracz nadal ma to, co wypatrzył, bez rzucania po raz drugi.
Okno oględzin czyta ją z czatu po `targetTokenId` i przedkłada nad rzut oka.

**Rany czyta się z żetonu, nie z oględzin** — jadą publicznie w `TokenView.injuries` od 31.08,
a drugi dom dla jednego faktu byłby drugim miejscem do poprawienia.

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

**Przedmiot, który da się zużyć, jest wierszem ekwipunku — nie tabelą obok niego (03.09).**
`CpredGearRow.consumable` niesie id z `systems/cpred/pharma.ts`, a `qty` liczy sztuki tak samo,
jak liczyło je zawsze. Dawka **jest** przedmiotem: waży, kupuje się ją, oddaje i gubi razem
z plecakiem, więc osobna lista rozjechałaby się z ekwipunkiem przy pierwszym „daję Rico dwie
fiolki". Nowy rodzaj środka dopisuje się **wyłącznie** do `CPRED_PHARMACEUTICALS` (nazwa, zdanie
z podręcznika, `applies`, ewentualne „raz dziennie") i do jednej gałęzi `applyDose`
w `realtime/recovery.ts`. `pharma.ts` **nie importuje niczego** — to warunek, nie przypadek:
walidacja karty (`character.ts`) sprawdza przeciw tym id, a `roleability.ts` bierze z karty typy.

## czas — Czas świata, kalendarz, efekty czasowe

- **Data startu kampanii to `time:set` z `minutes` i `start: true` (26.09, #3)** — jedyna droga poza `economy:settle`, która przestawia `settledMonth` (na miesiąc startu, także wstecz); karta czatu „Początek kampanii”, `days: 0`, bez `backwards`. Z `step` → `BAD_REQUEST`. W oknie zegara to pole „Data startu kampanii” przy „Ustaw”.
- **Stym to pole karty `woundSuspension`, nie wiersz `statEffects`** — terminy z `cpredStatEffectDeadlines`, nakłada `applyWoundSuspension` (z `character:use-dose`), zdejmuje `character:stat-effect` po `effectId`, wygasza `expireSheetStatEffects` obydwoma przemiataniami; `character:update` odmawia **u wszystkich**. Druga dawka nadpisuje termin.
- **Cecha „jak teraz" to `cpredEffectiveStats(sheet)`** (`stateffects.ts`), nigdy `data.stats[...]` — tamto jest liczbą **wydrukowaną**. Wyjątkiem są **pule** (maks. PW, SZ, sufit Człowieczeństwa) i tempo leczenia: te czytają bazową.
- **Efekt na Cesze w rozbiciu rzutu to własny wiersz** (`cpredStatEffectRows`), jak kara z pancerza — a gdy podłoga przycina sumę, wiersze zwijają się w jeden zbiorczy. Nie składaj ich u wołającego.
- **`statEffects` pisze wyłącznie `character:stat-effect`** — wypada z `character:update` (`FORBIDDEN`) **u wszystkich, także u MG**: nałożenie ma cenę (rzut 1k6 + dwa terminy), a łata nie ma czym zapłacić.
- **Efekt niesie DWA terminy, a światowy stawia się ZAWSZE** (`cpredStatEffectDeadlines`); wygasa **alternatywa**, nie koniunkcja. Bez terminu świata efekt przeżyłby koniec walki i wisiał do tej samej rundy następnej.
- **Liczba efektu pada RAZ, przy nałożeniu** — `value` + `rolled` (sam napis). `value` i `formula` naraz to `BAD_VALUE`, nie cichy wybór jednego.
- **Wygaszanie ma DWA przemiatania**: rundowe po **żetonach sceny** (`timed-effects.ts`, `minutes: null`), światowe po **kartach kampanii** (`stat-effects.ts` z `gametime.ts`).
- **Zegar świata zdejmuje efekty — jedyny wyjątek od „zegar podpowiada, nie rządzi"**, bo nie ma tu czego wybierać. Nowa rzecz wołana z `gametime.ts` musi przejść to samo pytanie.
- **Powrót do zdrowia liczy serwer** — `cpredRestDay` w `systems/cpred/recovery.ts` jest jedynym źródłem tempa; klient wysyła samo „minął dzień". Nowe źródło = wiersz w `cpredHealRate`. `recovery.stabilized` pisze **wyłącznie** udane Ustabilizowanie.
- **Czas świata to jedna liczba: minuty od epoki, liczone w UTC** (`Campaign.gameTime`, `shared/src/gametime.ts`) — nie `DateTime` i nie tekst. Cała arytmetyka przez `getUTC*`/`Date.UTC`; `new Date('2045-03-15T08:00')` to czas **lokalny** i przesunąłby granicę doby. `GAME_TIME_DEFAULT` i `@default` kolumny muszą być tą samą liczbą.
- **Skok zegara jedzie identyfikatorem, nie liczbą minut** — `time:set` bierze albo `step` z `GAME_TIME_STEPS`, albo `minutes`, nigdy oba. Nowy skok = wiersz w katalogu + gałąź w `applyGameTimeStep`. Ustawienie daty wprost to jedyne wejście z liczbą i jedyna droga cofnięcia.
- **Monit rozliczenia to różnica dwóch kluczy miesiąca**, nie licznik dni (`settleDue`) — stempluje go wyłącznie prawdziwe `economy:settle` przez `markMonthSettled` (i data startu, wpis wyżej), nigdy podgląd. `settledMonth === null` znaczy „nie pytaj", dlatego nowa kampania stempluje miesiąc startowy.
- **Zegar podpowiada, nie rządzi** — `realtime/gametime.ts` nie ma ani jednego wywołania ekonomii ani leczenia i nie wie, czym są PW. Listę rannych składa okno zegara u klienta, leczy `character:rest`.
- **`JournalEntry.worldDate` stempluje serwer przy powstaniu wpisu** i edycja jej nie rusza; stoi **obok** `sessionDate`, nie zamiast. Data świata w łacie klienta pozwoliłaby przedatować kronikę.
- **Polska liczba mnoga ma trzy formy** — `gameDaysLabel`/`gameDaysPassed` w rdzeniu (1 → „doba", końcówka 2–4 **poza 12–14** → „doby", reszta → „dób"). Ternary w komponencie daje „13 doby".
- **Zegar świata: gracz widzi dobę i porę dnia, MG godzinę** (`formatGameDayTime` / `formatGameClock`). To **nie filtr** — minuta jedzie do wszystkich; to szczerość etykiety, bo zegar rusza się tylko na kliknięcie MG. Karta czatu jest bez minut **dla wszystkich**.

---

**Stym jest polem karty z terminami efektu, a nie efektem na Cesze (12.09).**
`CpredCharacterData.woundSuspension` — jedno na kartę, `null` bez zastrzyku. Osobne pole, bo
`CpredStatEffect` wymaga Cechy, a Stym żadnej nie przesuwa; wspólne z efektem jest **wszystko, co
liczy czas**: terminy daje ta sama `cpredStatEffectDeadlines`, wygaszanie ta sama
`cpredStatEffectExpired` (parametr poszerzony do samych terminów), a zdejmuje go to samo
`expireSheetStatEffects`. Dzięki temu oba przemiatania — rundowe z `timed-effects.ts` i światowe
z `gametime.ts` — działają bez jednej nowej linii, a wiersz „Efekty wygasły" wymienia Stym z nazwy.
Guzik MG to ten sam `character:stat-effect` z `effectId`: handler szuka najpierw efektu, potem
zawieszenia. Druga dawka **nadpisuje** zapis (termin liczy się od nowego zastrzyku). **Edytor bólu
nie mieszka w tym polu** — działa z wiersza cyborgizacji po nazwie (`cpredWoundSuspensionSource`).

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

**Powrót do zdrowia liczy serwer, a karta deklaruje tylko „minął dzień" (03.09).** `cpredRestDay`
w `shared/systems/cpred/recovery.ts` jest jedynym miejscem, które wie, ile PW wraca; klient wysyła
`character:rest` z samym `strained` i dostaje kartę czatu z **rozbiciem** (`rate.sources`), bo
liczba bez powodu nie da się sprawdzić przy stole. Nowe źródło tempa (chrom, środek, warunki)
dokłada wiersz w `cpredHealRate`, nie mnożnik w wywołaniu. Warunek „po udanej stabilizacji"
mieszka w `CpredCharacterData.recovery.stabilized` i **pisze go wyłącznie udane Ustabilizowanie**
(`applyStabilization`) — na każdym progu ran, nie tylko przy zerze.

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

## siec — Sieć (netrunning)

- **Wiersz dziennika Sieci z zawartością Architektury idzie przez `logNetLineWithSecret` (29.09, #37)** — `netrun-io.ts`: stół dostaje skrót (`logNetLine`, „węzeł kontrolny”, urządzenie jako `publicDeviceName` — nazwa figury z mapy albo rodzaj), MG i netrunner dodatkowo pełny wiersz `gmaction` z `recipientId` = `runnerOwnerOf(row)` (znaczek „poufne” w czacie). Etykieta piętra, nazwa urządzenia z edytora i nazwa Pliku nigdy nie idą przez gołe `logNetLine`.
- **Obrażenia za strzał z urządzenia rzuca operator z karty (29.09, #38)** — `performAttackRoll` z `device.operator` stempluje `operatorUserId` w `attack.system`; `resolveRollSource` (`operatedThisShot`) wpuszcza to konto tylko do rzutu `damage` za tę kartę i tę figurę, klient pokazuje „Obrażenia” w `AttackControls` (`operatedTurret`: adres wprost z karty, bo netrunner zwykle nie widzi figury wieżyczki). Strzał Demona i strefy go nie ma — rzuca MG.
- **System strefy odpala się kontem MG, nie konta, które ruszyło figurą (29.09, #39)** — `systemHand` (`zone-effects.ts`) w `runZonesAfterMove` i `runZonesAtTurnEnd`: strzał, karta obrażeń i wiersz strefy idą pierwszym kontem MG. Percepcja na ukrytą strefę zostaje rzutem gracza.
- **Nazwa Architektury jedzie tylko do MG (27.09, #32)** — `netRunView` wkłada `architectureName` wyłącznie przy `gm: true` (pole opcjonalne); okno runu gracza pisze „SIEĆ”. Tak samo `toAccessPointView`.
- **Hasło, na którym netrunner stoi, blokuje zjazd niżej (27.09, #31)** — `netCanMove` dokłada pozycję startową do sprawdzanych pięter, gdy cel leży pod nią (`ancestry(to)` zawiera start); wspinaczka w górę z niezłamanego hasła jest wolna.
- **Strefę bronioną wiąże się z urządzeniem węzła kontrolnego polem „Węzeł kontrolny” na karcie strefy (27.09, #33)** — `SceneCardZone.tsx` dociąga pełne Architektury (`net:get`) i wysyła `architectureId/floorId/deviceId` naraz; rozbrojenie przez netrunnera liczy `zoneDisarmedByNetrunner`.
- **Hak Programu, którego silnik nie rozlicza, idzie do `NET_PROGRAM_HOOKS_MANUAL`** — lista jest od 39 **pusta**, ale ani jej, ani gałęzi `netHookIsManual` nie kasuj.

---

**Hak Programu, którego silnik nie umie rozliczyć, idzie do `NET_PROGRAM_HOOKS_MANUAL` (05.09).**
Lista jest od etapu 39 **pusta** — `statDrain` i `moveDrain` przeszły na automat — i pusta ma
zostać, dopóki nie dojdzie Program, którego skutku VTT nie umie policzyć. Nie kasuj jej i nie
kasuj gałęzi `netHookIsManual` w `netice.ts`: to jest to jedno miejsce, dzięki któremu dołożenie
takiego Programu jest zmianą jednej linijki, a nie nową gałęzią w pętli efektów.

## boty — Boty, AI Gateway, RAG

- **Własny limit `AI_REQUEST_TIMEOUT_MS` to zdarzenie `AI_TIMEOUT`, nie wyjątek (01.10, #46)** — `streamChat` bez sygnału wołającego (dziś „Graj turę”) oddaje `{ type: 'error', code: 'AI_TIMEOUT', detail: '120 s' }`, także gdy nagłówki nie przyszły w limicie; `botFailureText` mówi „Model nie odpowiedział w 120 s — zagraj tę turę ręką albo kliknij „Graj turę” jeszcze raz.”. Wołający z **własnym** sygnałem (rozmowa bota, dziennik, screamsheet) dostaje przerwanie dalej wyjątkiem i rozpoznaje je po `signal.aborted`.
- **Zerwany strumień SSE to zdarzenie `AI_UNREACHABLE`, nie wyjątek (29.09, #35)** — `AiGateway.streamChat` łapie błąd pętli `parseSse`; wyjątek leci dalej tylko przy przerwanym sygnale (stop MG, limit czasu — wołający rozpoznają je po `signal.aborted`). Kod odmowy „Graj turę” zamienia na zdanie `botTurnErrorText` (`socket.ts`); nowy przycisk bota, który pokazuje odmowę gniazda, bierze zdanie stamtąd, nie gołe `ack.error`.
- **Odpowiedź na kartę propozycji bota bierze blokadę przed pierwszym `await` (26.09, #20)** — `proposalsInFlight` w `realtime/bot-actions.ts`: drugi klik w trakcie zatwierdzania dostaje `PROPOSAL_ALREADY_RESOLVED`, zanim przeczyta kartę. Nowe zdarzenie, które wykonuje coś i dopiero potem zapisuje „zrobione", trzyma tę samą kolejność.
- **Zdanie o nieudanym pytaniu do modelu daje `botFailureText(kod, powód)` (26.09, #21)** — `realtime/bot-runtime.ts`: `AI_UNREACHABLE` = brak połączenia, `AI_UNAVAILABLE` (503: pełna kolejka, model się ładuje) = „zajęty, spróbuj za chwilę" z powodem od gatewaya (`fastApiDetail` wyjmuje go z `{"detail": …}`). Nie wpisuj jednego zdania na oba kody.
- **Bot mówi do postaci, nie do konta (01.10, #45; zastępuje umowę z 24.09)** — wiersze gracza nosi imię postaci (umowa w `czat`), więc `relationForSpeaker` nie oddaje już `speakerName`, a `relationPromptLines` nie dokleja „na czacie podpisuje się…” (`BOT_PROMPT_VERSION` 5). Lista „przy stole” pomija konta z postacią, szept bota idzie do postaci. Notatkę relacji MG pisze do bota w drugiej osobie.
- **Reindeks RAG-u** — `knowledge:reindex`/`journal:reindex` rozsyłają **odświeżone wpisy** (`*:upsert` do pokoju MG), nie sam status: chip „nieaktualny" siedzi na wierszu. Status licz raz, wpisy czytaj z bazy **po** `markIndexed`.

---

### Relacja: postać, konto i ton (24.09) — cofnięte 30.09, #45

**MG cofnął tę decyzję 30.09 (sesja T6b), poprawka #45 weszła 01.10:** wypowiedź gracza jest podpisana postacią, którą mówi — na czacie, w historii bota i w transkrypcie kronikarza; dopisek „na czacie podpisuje się…” zniknął z promptu. Opis niżej to historia (stan kodu 24.09–30.09).

Historia czatu podpisuje gracza nazwą **konta** („Tester”), a relacja zna imię **postaci**
(„Oględziny Stym”). Bez połączenia 27B mówił do gracza o jego własnej postaci jak o kimś obok.
`relationForSpeaker` zwraca więc `speakerName`, a `relationPromptLines` dokleja „(na czacie
podpisuje się „X” — to ta sama osoba)”, gdy podpis różni się od imienia. Kotwica
(`buildRoleAnchor`) mówi „Twoje nastawienie do postaci X: <etykieta> — okazujesz jej
życzliwość / niechęć”: etykiety ±3 są rzeczownikami, więc stoją po dwukropku, a kierunek tonu
jest dopisany, bo sama etykieta „oddany przyjaciel” przegrywała z wrogą historią czatu.

### Reindeks RAG-u (dziennik, baza wiedzy)

`knowledge:reindex` i `journal:reindex` **rozsyłają odświeżone wpisy**, nie tylko status indeksu.
Chip „⟳ nieaktualny" siedzi na **wierszu**, a nie w nagłówku, więc sam `KnowledgeIndexStatus`
w acku zdejmuje licznik „czeka na indeks" i zostawia czerwone chipy aż do przeładowania strony.
Klient obsługuje `knowledge:upsert`/`journal:upsert` od 19b, więc wystarczy je wysłać do pokoju
MG. Dwie rzeczy, które łatwo zrobić źle: status licz **raz** dla całej paczki (`emitUpsert`
liczyłby go per wpis, czyli N zapytań pod rząd), a wpisy czytaj z bazy **po** `markIndexed` —
doklejenie `stale: false` do kopii sprzed zapisu wysyła wiersz z `indexedAt: null`.

## dane — Kompendium, parsery, dane podręcznika

- **Zrzut podręcznika odzyskuje inicjały nagłówków (03.10, #78)** — `dropLetterSpaced` (`tools/rulebook/build-manual.mjs`) zostawia wielkie litery z końca rozstrzelonego ciągu małych liter, gdy z wyrazem za nimi tworzą wyraz (`capsJoinable`: korpus albo odmiana, a reszta nie pada w żadnym zdaniu małymi literami — `LOWER_VOCAB`). Po każdej zmianie skryptu: przebudowa do katalogu tymczasowego, `diff -r` z obecnym zrzutem, wszystkie parsery na nowym zrzucie z porównaniem `data/private/cpred` i reindeks RAG („Zasady” → „Zaindeksuj ponownie”). Śródtytuły w parserach szukaj z `\s*` między inicjałem a resztą („A GRESORZY” → „AGRESORZY”).
- **Typ broni bez wiersza w tabeli podręcznika też ma wpis (27.09, #17/#18)** — `base_weapon_entries` (`parse-manual.py`) daje Bijatyce i Sztukom walki wpis za 0 ed (`UNARMED_TYPES`), a typom z `weaponTypesExtra` wpis, gdy override podaje `cost`; broń rzucana bez magazynka dostaje `magazine: 1` (granat kupuje się na sztuki). Cena granatu stoi w prywatnym `manual-overrides.json`.
- **Kompendium to `data/private` ALBO próbka, nigdy obie (26.09, #5)** — `loadCompendium` czyta `data/private/cpred/compendium`, a `sample.json` z `data/public` tylko wtedy, gdy prywatny katalog nie dał ani jednego pliku danych. Testy serwera jadą na próbce (`fixtures/no-private-data`); coś, co ma działać przy stole, nie może zakładać wpisów próbki. Zjazd na próbkę loguje się **raz przy starcie** (Z1): nowy plik, który pisze import podręcznika, ładuje się w `loadCpredRegistry` przez `load(nazwa, true)`, inaczej jego brak przejdzie po cichu.
- **Nowe pole typu broni idzie w TRZY miejsca**: `CpredWeaponTypeInput`, `manual-overrides.json` **i** biała lista `schema_fields` w `parse-manual.py`. Pominięta lista wycina pole po cichu (tak zginęły `explosive`, `ammoPatterns`, a potem `thrown`, `maxRangeM`, `ammoIds`); od 04.09 parser ostrzega o każdym wyciętym polu.
- **Nowe pole typu broni** — dopisz je **razem** do `CpredWeaponTypeInput` i do białej listy `schema_fields` w `tools/import/parse-manual.py`; pominięta lista wycina pole po cichu (tak zginęły `explosive` i `ammoPatterns`).

---

**Nowe pole typu broni dopisuje się w TRZECH miejscach, nie w dwóch (04.09).** Do
`CpredWeaponTypeInput`, do wpisu w `manual-overrides.json` — **i do białej listy `schema_fields`
w `tools/import/parse-manual.py`**. Ta lista tnie przy zapisie wszystko, czego na niej nie ma,
i robi to po cichu: tak zginęły najpierw `explosive` i `ammoPatterns`, a potem `thrown`,
`maxRangeM` oraz `ammoIds` — granat przestał być „rzucany" i latał bez zasięgu
maksymalnego, a miotacz ognia przyjmował cudzy śrut. Od 04.09 parser **mówi o tym na głos**:
każde pole spoza listy (poza `cost`, `costCategory` i `features`, które jadą do wpisu
kupowalnego) wychodzi jako ostrzeżenie importu. Ostrzeżenia czyta się przy każdym
`python tools/import/parse-manual.py`.

**Pole typu broni musi trafić na białą listę importera.** `tools/import/parse-manual.py`
zapisuje `weapon-types.json` przez filtr `schema_fields` — zbiór nazw pól, które przechodzą.
Pole spoza zbioru ginie **po cichu**, także wtedy, gdy dopisał je `manual-overrides.json`.
Kosztowało to całą mechanikę obszaru: `explosive` (Granatnik, Wyrzutnia rakiet) i `ammoPatterns`
(dobór naboi do broni) były w overrides od początku, a filtr wycinał je przy każdym imporcie,
więc w kampanii nic nie wybuchało i żaden nabój nie pasował do żadnej broni — mimo gotowego
kodu z etapów 16d i 16g i mimo testów, które przechodziły na **publicznej** próbce
(`data/public/.../sample.json` ma `explosive`). Dokładając pole do `CpredWeaponTypeInput`
w `shared/src/systems/cpred/compendium.ts`, dołóż je **w tej samej zmianie** do `schema_fields`.

## kopie — Kopie zapasowe, eksport i import

- **„Backup" znaczy Wsparcie (30c), nie kopię zapasową** — kopie to `snapshot` (`snapshots.ts`, `archive:list`/`archive:snapshot`), pliki wymiany to `archive` (`shared/src/archive.ts`, `ArchivePanel.tsx`). Słowa „backup" nie używa się na nic poza Zdolnością Roli.
- **Kopia bazy to `VACUUM INTO`, nigdy `copyFile`** — WAL trzyma świeży stan obok `.db`. `vacuumInto` otwiera bazę drugim, tylko-do-odczytu połączeniem; ten sam kod chodzi przy działającym serwerze i przy zatrzymanym.
- **`uploads/` w kopii to twarde dowiązania** (`linkTree`, z ucieczką do `copyFile`) — bezpieczne **wyłącznie** dlatego, że plik uploadu jest niezmienny. Zapis w miejscu = zamiana dowiązań na kopie.
- **Rotacja liczy się z NAZW katalogów**, nie z czasu pliku (`planSnapshotRotation`); **nazwa spoza schematu nie ginie nigdy** — to furtka na kopię „na zawsze" i dla `przed-przywroceniem-*`.
- **Eksport = wiersze z wypisanymi kolumnami, nie widoki** (widok gubi prawdziwą nazwę żetonu); kolumny JSON-owe jadą jako prawdziwy JSON. **Import normalizuje przez `parseCharacterData`, więc round-trip NIE jest bajt w bajt** — nic nie ginie, dochodzą domyślne pola.
- **Import nigdy nie odtwarza cudzych id**, ale swoje utrzymuje: `ownerId`/`characterId` przeżywają po sprawdzeniu w bazie (`survivingIds`), reszta → `null` plus zdanie w `note`. `MapDrawing.authorId` przejmuje ten, kto stawia scenę.
- **Nazwa pliku w `Content-Disposition` musi być ASCII** — `archiveContentDisposition` składa ogonki i dokłada `filename*=UTF-8''…`. Polski znak wprost w `filename` to 500, nie brzydka nazwa.
- **`ServerConfig.backups` jest opcjonalne i to jest wyłącznik kopii** — brak sekcji znaczy „ten proces kopii nie robi"; tak stoją wszystkie 54 zestawy testów dymnych, bez zmian w ich konfiguracjach.

---

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
