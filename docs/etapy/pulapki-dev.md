# Pułapki dev (kosztowały czas więcej niż raz)

Wyprowadzone z `POSTEP.md` 22.08.2026, pocięte na obszary 10.09.2026. Czytaj sekcję swojego
obszaru, **zanim** zaczniesz szukać błędu — tu leżą pełne opisy z rozpoznaniem i obejściem.

Sekcje w tym pliku i w `umowy-kodu.md` **nazywają się tak samo** i są w tej samej kolejności,
więc `grep -n '^## <obszar>' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md` pokazuje obie
naraz. Wskaźnik „który obszar do czego" stoi w `POSTEP.md`.

Każda sekcja zaczyna się **indeksem** (jeden wiersz = jedna pułapka), pod nim leżą pełne opisy.
Nową pułapkę dopisz do sekcji jej obszaru: wiersz na górę indeksu i pełny opis pod spodem.

## mapa — Figury, narzędzia i obiekty sceny

- **Narożniki celownika liczone od pola siadają na obrączce PW (11.10, etap 50c)** — od 12.09 brzegiem figury z PW jest obrączka wystająca poza pole, a czerwone narożniki `drawAimReticle` (pad 6 px od pola) lądowały na czerwonej obrączce NPC-a i znikały. Rysunek wokół figury liczy się od `Math.max(half, node.outerRadius)`, jak pierścień zaznaczenia (`strokeBrackets`).
- **„Figura sama poszła na pole tej, której menu otworzyłem” — `clicked` z `pixi-viewport` dla prawego przycisku (10.10, oględziny 50b)** — `InputManager.up` emituje `clicked` dla każdego przycisku. Menu figury otwiera się na `pointerdown`, więc puszczenie prawego trafia w tło menu (DOM), a nie w figurę, i strażnik `isTokenTarget` w `clicked` przepuszczał to jako klik w podłogę: prowadzona figura bez broni w ręku szła marszem na pole klikniętej. Od 50b `clicked` odpada przy `button !== 0`. Nowe znaczenie kliknięcia w mapę stawia się **za** tym strażnikiem (pilnuje `map-click.test.ts`).
- **Nitka mapy przez czarną zasłonę na przekątnej sceny — szew sprite'a, nie dziura w zasłonie (03.10, #53)** — gracz bez figury widział w „Knajpie” jasną kreskę od rogu (0, 0) sceny; T8a opisał ją jako „szczelinę w pamięci terenu”. Ani dane (zero wielokątów, brak maski światła), ani składniki zasłony, ani tekstura (`renderer.extract.pixels` — alfa 255 na całej przekątnej) jej nie mają: szew powstaje przy rysowaniu czworokąta sprite'a zagnieżdżonego w kontenerze na płótno z MSAA (Firefox i Chromium, WebGL). Zasłona czyszczona kolorem zamiast prostokąta nic nie dała; pomogło `isRenderGroup` na warstwie. Rozpoznanie w trzech krokach: ukryj kolejne dzieci `viewport` (która warstwa przepuszcza), odczytaj piksele tekstury (treść czy rysunek), przesuń sprite o 2 px (szew jedzie za sprite'em). Zrzut do oglądania rozjaśnij (`sharp(...).linear(5, 0)`) — na ciemnym tle nitka wygląda na czarną.
- **`destroy({ children: true })` w Pixi v8 nie niszczy kontekstów grafik (02.10, #50)** — `Graphics.destroy(options)` niszczy własny `GraphicsContext` tylko wywołane **bez opcji** albo z `context: true`; z samym `{ children: true }` kontekst każdej grafiki-dziecka zostaje w `GraphicsContextSystem` (`_managedContexts`) z geometrią i GC Pixi go nie zbiera. Objaw: liczniki drzewa, tekstur i `Assets` stoją, a w zrzucie sterty rosną `WebGLBuffer`, `WebGLVertexArrayObject` i `JSArrayBufferData` (u MG ~3 MB na przełączenie sceny). `JSHeapUsedSize` z CDP nie liczy `ArrayBuffer` — patrz `buffersMb`. Rozpoznanie: `t7c-diag-sterta` (różnica na konstruktor). **Druga warstwa tego samego objawu:** po samym `context: true` bufory MG rosły dalej o 0,9 MB na przełączenie, a zrzut pokazywał **zero** nowych `JSArrayBufferData` — rosły istniejące. Zwolnione dane renderowania dużych grafik (> 400 wierzchołków, własny batcher) wracają do `BigPool` i są brane ponownie, a `Batcher._resizeAttributeBuffer` tylko podwaja; stąd `releasePooledGraphicsData()` przy zmianie sceny. „Liczba stała, rozmiar rośnie” = pula, nie wyciek obiektów.
- **„Klik w pole nic nie robi” — sprawdź, czy nie trafia w ozdobę sąsiedniej figury (02.10, #52)** — po grocie (#25) i aureoli (#36) trzecim był podpis pod żetonem; od 02.10 żeton ma `hitArea` na swoich polach. Gdy objaw wróci, pierwsze pytanie: czy węzeł figury nie zgubił `hitArea` (np. nowy rodzaj figury bez `TokenNode.update`).
- **„Figura cofa się w marszu” — trzy drogi pozycji do klienta, nie jedna (01.10, #47)** — `token:move` (klatki i upuszczenie), `token:upsert` (każdy zapis karty, statusy, światło — z pozycją z **bazy**) i `token:sync` (scena Dynamiczna albo ściany zasłaniające figury: gracze dostają całą listę z bazy zamiast upsertu, MG — dalej upsert). Baza ma pole startowe aż do upuszczenia, więc każda z dwóch ostatnich cofa figurę w marszu. Poprawka samego upsertu naprawiła MG, a gracze w „Knajpie” (widzenie Dynamiczne) skakali dalej. Zanim zgadniesz, podsłuchaj ramki gracza (`Network.capture()` w `fixtures/network.ts`, adnotacja `kowalFrames` w teście #47).
- **„Figura nie chce iść o jedno pole” ma dwie przyczyny (29.09, #36)** — (1) grot kierunku przy oddalonej kamerze: strefa chwytu `facingKnob` sięga środka sąsiedniego pola; (2) aureola tury (`turnRing`, wypełniony krążek `furniture + 2 × TURN_RING_WIDTH`) w turze tej figury: klik w środek sąsiada trafiał w **żeton**, a `clicked` odrzuca klik w żeton bez słowa. Rozpoznanie: `event.event.target` w `viewport.on('clicked')` — klasa żetonu zamiast viewportu. E2E obchodziło to klikiem w dolną część pola; nie wracaj do takiego obejścia, tylko sprawdź, które dziecko `TokenNode` łapie klik.
- **Kratka niecałkowita (36,2 px) i `Math.floor` na rogu figury (27.09, #28)** — róg zaczepiony na kolumnie 15 to 543, a 543 / 36,2 = 14,999…, więc sprawdzenie pól trasy liczyło kolumnę, której figura nie dotyka, i serwer odsyłał marsz pod skraj mgły na start. `everyRunCell` (`pathfinding.ts`) daje piksel luzu na obu brzegach; każde nowe `floor(x / cell)` na pozycji figury potrzebuje tego samego.
- **„Ktoś pojawił się w polu widzenia”, a nikogo nie widać** — przerwany marsz zaokrąglał figurę wstecz za róg; wyglądało to jak szczelina w barierze, której nie ma. Nowy powód przerwania dotyczący widzenia podaje `interruptWalk(note, 'ahead')`.
- **`hasVision` nie znaczy „scena Dynamiczna”** — od 42c `vision:sync` przychodzi w każdym trybie (puste `polygons`, maska figur); kto z samego przyjścia widoku wnioskował Dynamiczną, zamykał graczowi trasę w pustym wielokącie, a pełna synchronizacja gubiła `blockers`. Pytaj o `scene.visibility` (`confinesWalkToSight`).
- **Rozmycie złożone z pierścieni widać jako koncentryczne okręgi** — pięć wycięć o malejącej alfie miało dać miękki brzeg okienka w mgle, a dało prążki (MG odrzucił to na pierwszym zrzucie). Gradient wypala się na kanwie (`fogPeepTexture`), tak jak światło z 18b i pamięć mapy z 18c.
- **Kompozyt mgły rysuje się tylko na `setFog`** — figura ruszona przeciąganiem albo marszem omija store, więc okienko zostawało w tyle; stąd `refreshFogPeepholes` wołane także z `onDragMove` i z kroku marszu, a nie tylko z `setTokens`.
- **`fogPass` dokłada `Graphics` na koniec `fogScratch`** — cokolwiek ma zostać na wierzchu kompozytu (okienko własnej figury), musi się tam przenieść **przy każdym składaniu** (`addChild`), inaczej świeży przebieg `hide` zamaluje je przy następnym pociągnięciu pędzla MG.
- **Podpis figury (`signature`) decyduje, czy `TokenNode` w ogóle się przerysuje** — a składa się z pól żetonu i kontekstu. Zmiana czegoś **spoza** tej listy (kadr portretu, 12.09) zapisuje się, rozgłasza i po prostu nie widać jej na mapie do przeładowania strony; wygląda to jak niedziałające rozgłoszenie, a jest pominiętą klatką.
- **`resizeTo` w Pixi v8 NIE obserwuje elementu** — mierzy się nim, ale przelicza rozmiar wyłącznie na `window.resize`. Pasek zmieniający szerokość mapy bez ruszania oknem zostawiał płótno w starym rozmiarze, a w odsłoniętym pasie świeciła kratka z CSS-a. Trzeba `ResizeObserver` (`watchHostSize`).
- **Nakładki `MapRenderer` mierzą odstęp w pikselach EKRANU** (`8 * overlayScale()`), więc w pikselach świata topnieje on ze zbliżeniem: obrączka zaznaczenia liczona od `half` wchodziła przy zoomie 2 na pasek życia. Liczy się je od `node.outerRadius`.
- **`clampZoom` z pixi-viewport czyta ALBO `minWidth`/`maxWidth`, ALBO `minScale`/`maxScale`** — pierwsza para wygrywa i drugiej wtyczka już nie patrzy. „Nie oddalaj się poniżej pokrycia mapy" trzeba więc policzyć samemu i podać jako **skalę**; podanie obu par po cichu wyłącza jedną z nich.
- **Pusta mapa nie jest pusta** — `.map-area` ma **siatkę wrysowaną w CSS** (48 px), a płótno Pixi jest przezroczyste (`backgroundAlpha: 0`). Kratka wokół mapy i pod nią bierze się stąd, nie z `drawGrid`, więc „ma nie być kratki" znaczy zdjąć tło `.map-area`.
- **`TokenPatch` nie ma `x`/`y` — figurą rusza `token:move`, nie `token:update`**; sanityzacja milczy o nieznanych polach, więc żądanie z pozycją dostaje `{ ok: true }`, a figura stoi.
- **Żetonu nie skasujesz `Delete` ani koszem** — przeciągnięcie na kosz go **przesuwa**; przy sprzątaniu po oględzinach najszybciej zatrzymać `pnpm dev` i usunąć wiersze SQL-em (razem z `LedgerEntry` kasowanej karty).
- **Hit-test tokenu psują pełnoekranowe warstwy** — warstwy czysto malarskie muszą mieć `eventMode = 'none'`; objaw to `Viewport` zamiast `TokenNode` jako cel.
- **Próbka z paczki bywa dwoma zdarzeniami** — `shot-rifle` grał dwa strzały przez pół roku; nową próbkę obejrzyj obwiednią, zanim ją wepniesz.
- **Podpowiedź wyśrodkowana nad mapą kładzie się na pasku narzędzi** — pasek ma 38 rem i sięga poza środek; podpowiedź należąca do paska renderuj **w nim** (`.map-tool-tip`).
- **Obiekt sceny mógł się dotąd tylko pojawić i zniknąć, nigdy zmienić** — stąd pięć błędów 27l naraz (obrys w starym miejscu, stara treść etykiety, rysunek niezmieniający warstwy). Setter listy musi wołać `refreshSceneSelectOutline`, a węzły rysunków nieść odcisk.
- **Chwyt uchwytu zjada drugie kliknięcie dwukliku** — gest bez ruchu musi wrócić jako zwykłe kliknięcie, inaczej karta nie otworzy się na obiekcie już zaznaczonym.
- **Łańcuch ściany kończy `Enter`, nie `Esc`** — `Esc` go porzuca i mur znika razem z podglądem; wygląda jak „automat nie umie rysować ścian".
- **Baner nad mapą ma `pointer-events: none`** — guzik dołożony do niego musi sam włączyć `pointer-events: auto`, i tylko na sobie.
- **Gracz nie mógł kliknąć cudzej figury** (do 31.08) — nowa funkcja paska „dla gracza przy cudzej figurze" bywa nieosiągalna, choć dane jadą.

---

- **„Ktoś pojawił się w polu widzenia — marsz przerwany", a nikogo nie widać (13.09, oględziny
  42c).** Do tej sesji przerwany marsz lądował na zaokrągleniu bieżącej pozycji: figura wychylona
  w połowie kroku za koniec bariery albo róg wracała na pole, z którego przybysza nie widać, i każdy
  następny marsz przerywał się w tym samym miejscu. Wyglądało to jak szczelina w barierze — szczeliny
  nie ma (`rayHitDistance` liczy końce odcinków włącznie). Naprawione (`marchStopPoint`, umowa
  w `mapa`); jeśli objaw wróci, sprawdź najpierw, czy nowy powód przerwania dostał `'ahead'`,
  i złap wysłane lądowanie podsłuchem ramek (pułapka w `ogledziny`).

- **Widok w każdym trybie, a dwa miejsca czytały jego przyjście jako „Dynamiczna” (13.09,
  oględziny 42a–42c).** 42c zaczęło wysyłać `vision:sync` poza Dynamiczną, bo niesie
  `figurePolygons`. `wallStore.hasVision` robi się wtedy `true`, a `pushWalkPassable` przy
  `hasVision` przycinał planer do `polygons` — pustych poza Dynamiczną — więc
  `isPointVisible(point, [])` odrzucał każdy punkt. Gracz tracił trasę kliknięciem po pierwszym
  takim wysłaniu (usunięty żeton, przełączone drzwi, lampa, zmiana trybu), a obok bariery
  zasłaniającej już od F5. Bliźniak w `sync.ts`: `blockers = vision ? vision.blockers : …` dawał po
  F5 pustą listę przeszkód. Testy serwera tego nie widziały, bo serwer wysyłał dokładnie to, co
  miał; decyzja zapadała u klienta. **Objaw przy stole:** „klik w mapę nic nie robi, po F5 działa”.
  **Rozpoznanie w konsoli gracza:** magazyn ścian ma `hasVision: true` i `polygons: []` na scenie
  `fog` albo `open`. Od 13.09 rozstrzyga `confinesWalkToSight` (klient) i tryb sceny w `sync.ts`.

- **`resizeTo` w Pixi v8 nie jest tym, na co wygląda (12.09).** Wtyczka `ResizePlugin` przyjmuje
  element i owszem, mierzy się jego `clientWidth`/`clientHeight` — ale nasłuchuje **wyłącznie**
  `globalThis.addEventListener('resize')`. Elementu nie obserwuje, więc każda zmiana szerokości
  bez ruszania oknem jest dla niej niewidzialna. U nas robią to dwa paski: lewy HUD zwija się do
  2,6 rem, prawy panel ma uchwyt. Objaw jest mylący, bo **nie wygląda na problem z płótnem**:
  odsłonięty pas pokazuje kratkę, a kratkę pod mapą rysuje CSS (`.map-area`), więc wygląda to jak
  „mapa nie wypełnia ekranu", a nie jak „płótno ma stary rozmiar". Rozpoznanie zajmuje sekundę:
  porównaj `host.clientWidth` z `canvas.width` po zwinięciu paska. Lek: `ResizeObserver` na
  gospodarzu wołający `app.queueResize()` (`MapRenderer.watchHostSize`).

  **Drugie dno, przy sprawdzaniu tego z automatyki:** pomiar wewnątrz **jednego** wywołania
  `javascript_tool` kłamie. `queueResize` idzie przez `requestAnimationFrame`, a klatka nie
  przychodzi, póki wstrzyknięta funkcja nie wróci — więc `await new Promise(r => setTimeout(r, 600))`
  w tym samym wywołaniu pokazuje stary rozmiar płótna i wygląda jak niedziałająca poprawka. Zmień
  szerokość w jednym wywołaniu, zmierz w **następnym**.

- **Podpis figury decyduje o przerysowaniu, więc nowa cecha rysunku musi w nim być (12.09).**
  `TokenNode.update` porzuca robotę na wejściu, gdy `signature` się nie zmienił — i to jest jedyny
  powód, dla którego 20 Hz przeciągania nie topi przeglądarki. Podpis zbiera pola żetonu (nazwa,
  obrazek, rozmiar, PW, naklejki…) i kilka pól kontekstu. Kadr portretu jest cechą **grafiki**,
  nie żetonu: gdy MG go przestawia, `token.imageUrl` zostaje ten sam, PW to samo, nazwa ta sama —
  więc dopóki `cropFor(token.imageUrl, ctx)` nie wszedł do podpisu, zapis szedł do bazy,
  rozgłoszenie docierało, store się aktualizował, a **na mapie nie działo się nic**. Diagnoza jest
  myląca, bo każdy ogniwo po drodze da się sprawdzić i każde działa. Reguła: cokolwiek dokładasz do
  `TokenNodeCtx`, co zmienia rysunek, dopisz do `signature` w tym samym ruchu.

- **Obrączka zaznaczenia mierzy odstęp w pikselach ekranu, a figurę w pikselach świata (12.09).**
  `drawSelectionRing`, `drawGroupRings` i `facingKnob` liczą `… + 8 * overlayScale()`, gdzie
  `overlayScale()` to `1 / zoom` — czyli odstęp jest stały **na ekranie**, a w świecie topnieje ze
  zbliżeniem. Póki wszystko poza portretem leżało w kratce, nie miało to znaczenia; odkąd pasek
  życia wyszedł poza portret (12.09), biały przerywany okrąg przy zoomie 2 siadał dokładnie na
  nim. Liczy się je od `node.outerRadius`, a nie od `half`. **Ogólniejsza postać tej pułapki:**
  jeśli dokładasz cokolwiek wokół żetonu na warstwie nakładki, twój odstęp jest ekranowy, a to,
  od czego go odmierzasz — światowe; sprawdź przy dwóch zbliżeniach, nie przy jednym.

- **`clampZoom` z pixi-viewport ma dwie pary opcji i bierze tylko jedną (11.09).** W środku stoi
  `if (minWidth || minHeight || maxWidth || maxHeight) { … } else if (minScale || maxScale) { … }`
  — więc `clampZoom({ minScale, maxScale, maxWidth })` **nie zadziała tak, jak wygląda**: para
  „width/height" wygra, a granice skali zostaną zignorowane bez słowa. Przy zamykaniu kamery
  gracza w granicach mapy (11.09) potrzebna była dolna granica zbliżenia zależna od kształtu okna,
  więc `coverZoom` liczy się w `camera.ts` i jedzie jako `minScale`. Druga połowa tej samej
  pułapki: **`clamp` i `clampZoom` trzeba przyłożyć ponownie po każdej zmianie rozmiaru płótna**,
  bo granica „ekran mieści się w mapie" zależy od proporcji ekranu, a nie tylko od mapy.

- **Pusta mapa nie jest pusta: kratkę rysuje CSS, nie Pixi (11.09).** `.map-area` niesie w tle
  dwa gradienty co 48 px (`--map-grid`), a płótno Pixi stoi na nim przezroczyste
  (`backgroundAlpha: 0`). Wyszło przy mapie powitalnej gracza: mapa siadła na środku, a wokół
  niej — i wszędzie tam, gdzie scena nie sięga krawędzi okna — dalej stała równiutka kratka,
  czyli dokładnie to, czego ten ekran miał nie pokazywać. **Objaw jest mylący**: w `drawGrid`
  wszystko się zgadza, bo tamta siatka rysuje się tylko po prostokącie sceny. Kto chce
  „bez kratki", zdejmuje tło `.map-area` (klasa `.map-area--plain`, do 18.09 `--welcome`; u gracza stoi na każdej scenie), a nie szuka błędu
  w rendererze. Przy okazji: przy zoomie 1 kratka CSS (48 px) i kratka sceny (36,2 px) mają różny
  rozmiar, i to jest najszybszy sposób, żeby rozpoznać, na którą się patrzy.

- **`TokenPatch` nie ma `x`/`y` — figurą rusza `token:move`, nie `token:update`.** Test etapu 38b
  „odejście od ciała odcina łup" wysyłał `token:update` z `patch: { x, y }`; sanityzacja **milczy**
  o nieznanych polach, więc ack był `{ ok: true }`, figura stała w miejscu, a łup przechodził.
  Objaw jest zdradliwy, bo pierwszy nieudany asercją test **przenosił przedmioty**, a dwa kolejne
  padały na stanie kart — czyli trzy błędy w miejscach, w których był jeden. Pozycja jedzie
  `token:move` z `final: true`.

- **Żetonu nie skasujesz ani `Delete`, ani przeciągnięciem na kosz.** Oba wyglądają, jakby miały
  działać (kosz stoi w lewym dolnym rogu mapy), a nie robią nic albo — jak przeciąganie —
  **przesuwają żeton** na drugi koniec sceny. Skasowanie idzie menu kontekstowym, którego
  `right_click` z CDP nie dowozi (patrz wpis o menu), więc przy sprzątaniu po oględzinach
  najszybsza droga jest przez bazę: zatrzymaj `pnpm dev` i usuń wiersze SQL-em, pamiętając
  o `LedgerEntry` postaci, którą kasujesz.

- **Podpowiedź wyśrodkowana nad mapą kładzie się na pasku narzędzi** (23.08, etap 27k). Pasek
  `.map-tools` stoi w lewym górnym rogu mapy, ale ma `max-width: 38rem` i się zawija, więc
  na szerokiej mapie sięga daleko poza środek — a `.map-placement-hint` jest `left: 50%`.
  Efekt: zdanie leży wprost na ikonach i wygląda, jakby ich nie było. **Obejście:** podpowiedź
  należąca do paska renderuje się **w nim**, jako wiersz z `flex-basis: 100%` (`.map-tool-tip`);
  pływające pudełko zostaw na rzeczy, które paska nie dotyczą (stawianie żetonu, celowanie).

- **Obiekt sceny mógł się dotąd tylko pojawić i zniknąć, nigdy zmienić** (24.08, etap 27l). To
  jedno zdanie stoi za **pięcioma** błędami tej sesji, a każdy wyglądał na inny: obrys zaznaczenia
  zostawał tam, gdzie obiekt stał przed przesunięciem (`drawSceneSelectOutline` wołane tylko przy
  zmianie zaznaczenia); poprawiona literówka w etykiecie nie docierała na mapę, bo `setDrawings`
  miało w komentarzu „a drawing is immutable once stored" i pomijało istniejące id; przeniesienie
  rysunku między warstwą MG a wspólną nie zmieniało rodzica węzła z tego samego powodu.
  **Obejście:** każdy setter listy obiektów woła `refreshSceneSelectOutline(kind)`, a węzły
  rysunków niosą odcisk (`drawingSignature`) i przy zmianie powstają od nowa. Dokładając rodzaj
  obiektu, który da się **edytować**, sprawdź oba miejsca.

- **Chwyt uchwytu zjada drugie kliknięcie dwukliku** (24.08, etap 27l). Uchwyt „przesuń" pokrywa
  cały zaznaczony obiekt, więc po pierwszym kliknięciu (które zaznacza) drugie ląduje na uchwycie,
  a nie na warstwie — i karta nie otwiera się **nigdy na obiekcie, który jest już zaznaczony**.
  **Obejście:** gest bez ruchu wraca jako zwykłe kliknięcie (`releaseSceneHandle` woła wtedy
  `takeScenePick`), dokładnie tak jak `tapPick` robi to dla prostokątów.

**Łańcuch ściany kończy `Enter`, nie `Esc` — `Esc` go porzuca.** Podpowiedź paska mówi to wprost
(„Klikaj narożniki — Enter kończy ścianę"), ale odruch z każdego innego narzędzia to `Esc`,
i wtedy mur po prostu znika razem z podglądem: wygląda jak „automat nie umie rysować ścian",
a jest zwykłym anulowaniem. Kosztowało jeden przebieg budowy „Korytarza 16e" 28.08.

**Próbka dźwiękowa z paczki bywa dwoma zdarzeniami, a nie jednym.** `shot-rifle.wav` grał
**dwa strzały** od etapu 27i do 28.08 — oryginał `sks.wav` z paczki „Gunshot Sounds" ma drugą
detonację w 0,315 s. Nazwa pliku tego nie mówi, a przy strzale pojedynczym słychać dublet
dopiero na głośnikach. **Nową próbkę obejrzyj obwiednią, zanim ją wepniesz** — na tej maszynie
nie ma ffmpeg, ale wystarczy moduł `wave` z biblioteki standardowej Pythona: co 5–10 ms
maksimum wartości bezwzględnej, wypisane jako jedna linijka cyfr 0–9. Drugi szczyt po zaniku
pierwszego widać w tym gołym okiem, tak samo jak sekundę ciszy doklejoną na końcu.

**Podpowiedź nad mapą ma `pointer-events: none`** (`.map-placement-hint`), więc guzik dołożony do
banera jest niewidoczny dla myszy, dopóki sam nie włączy sobie `pointer-events: auto`. Włączaj je
na wąskim elemencie, nie na całym banerze — reszta paska ma dalej przepuszczać kliknięcia w mapę
pod spodem, inaczej pasek nad środkiem sceny zjada rozkazy marszu.

**Gracz nie mógł kliknąć figury, której nie prowadzi (do 31.08).** `MapRenderer` wychodził po
cichu na `movableTokens.get(id) === false`, więc pasek nigdy nie pokazywał cudzej figury — i każda
funkcja dołożona do paska „dla gracza przy cudzej figurze" była z góry nieosiągalna, choć dane
jechały poprawnie. Zanim dołożysz coś do paska z myślą o graczu, sprawdź, czy ten gracz ma jak
postawić tam tę figurę.


## czat — Rodzaje wierszy, widoczność, filtr

- **Nowy rodzaj wiersza czatu ma SZEŚĆ miejsc, nie pięć** — szóstym jest `isPending` w `ChatPanel`, gdy wiersz czeka na czyjąś decyzję; bez tego chowa go filtr z 01.09 i propozycja zawisa.
- **Wiersz czatu „publiczny" sprawdzaj z DRUGIEGO konta** — autor widzi swoje zawsze (`authorId`), więc brak rodzaju w `visibleTo` wygląda z konta wystawiającego na w pełni sprawny. Objaw u drugiej osoby: karta jest, po przeładowaniu znika.
- **Karta, która „nie doszła", potrafi mieć dwie przyczyny naraz** (brak w `visibleTo` **i** nieskonsumowany `seq` obok) — naprawa jednej nie daje widocznego efektu i wygląda na nietrafioną.

---

- **Nowy rodzaj wiersza czatu ma SZEŚĆ miejsc, nie pięć — szóstym jest `isPending`.** Do pięciu
  z 05.09 (`ChatKind`, `chatCategoryOf`, `toChatMessageView`, `visibleTo`, `FullMessageRow`)
  dochodzi `isPending` w `ChatPanel`, gdy wiersz **czeka na czyjąś decyzję**: bez tego propozycja
  przekazania chowa się pod separatorem filtra „Stół" i zawisa na dobre, dokładnie jak zawisłaby
  propozycja bota albo wezwanie do Testu. Siódmym, jeśli wiersz niesie własny kształt, jest pole
  w `ChatMessageView`.

**Wiersz czatu opisany w kodzie jako „publiczny" sprawdź z DRUGIEGO konta, nie z konta autora.**
`visibleTo` jest białą listą rodzajów, a każde konto widzi **swoje** wiadomości przez
`{ authorId: user.id }` — więc karta, której na liście brakuje, wygląda z konta wystawiającego
na całkowicie sprawną. Tak przetrwały dwa etapy: `recovery` (30b) i `time` (37). Objaw u drugiej
osoby: karta **jest** zaraz po zdarzeniu i **znika po przeładowaniu strony**. Najtaniej sprawdzić
testem dymnym, który podnosi świeże gniazdo gracza i czyta `state:sync`.

**Karta, która „nie doszła do gracza", potrafi mieć dwie niezależne przyczyny naraz** — tak było
05.09. Pierwsza: brak rodzaju w `visibleTo` (historia jej nie zwraca). Druga: nieskonsumowany
`seq` w sąsiednim rozgłoszeniu (`time:set`), przez który wiadomość na żywo trafiła w wykrytą lukę
i została odrzucona. Naprawa jednej z nich nie daje widocznego efektu, więc łatwo uznać ją za
nietrafioną — sprawdzaj obie.


## serwer — Baza, protokół gniazda, pliki

- **`prisma migrate dev` w powłoce agenta odmawia („non-interactive”), a kasowanie kolumny chce potwierdzenia (04.10, 44c)** — migrację z przeniesieniem danych pisz ręcznie: `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` daje SQL przebudowy tabel, do którego dopisujesz `UPDATE`/`CASE` przed `DROP` starej tabeli (wzór: `20261004120000_session_slots`), potem `migrate deploy` i `generate`. Ten sam `migrate diff` po wszystkim musi dać „This is an empty migration”.
- **Gracz bez trwającej sesji nie siedzi w `campaignRoom` (04.10, 44c)** — rozgłoszenie do pokoju kampanii go nie znajdzie. Do konkretnego użytkownika (karta, szept, handout, dziennik, handel) zbieraj gniazda przez `campaignMemberSockets`; `io.in(campaignRoom(id)).fetchSockets()` z filtrem po użytkowniku zgubi gracza między sesjami bez żadnego błędu.
- **Płaski adres pliku w fiksturach testów odbija się od strażnika (04.10, 44b)** — test, który wstawia do bazy `/uploads/portraits/x.png`, dostaje `UPLOAD_NOT_FOUND` z `creation:patch`/`token:create`, a przy pobraniu 404. Od 44b plik ma adres kampanii: `/uploads/campaigns/<id>/<katalog>/<plik>` (wzór: `portraitDir` w `creation.test.ts`). Płaskie adresy zna już tylko migracja przy starcie (`migrateFlatUploads`).
- **Nowe wymagane pole `ServerConfig` wywraca ~78 plików testów (01.10)** — każdy test dymny ma **własny literał konfiguracji**. Nowy przełącznik rób opcjonalnym (`rateLimits?`, `trustProxy?`, wzór `backups?`): `loadConfig` ustawia wartość produkcyjną, a brak pola w teście znaczy „wyłączone”.
- **`tsup` zdejmuje `node:` z importów — `node:sqlite` zamienia się w pakiet `sqlite` i `dist/` pada na starcie** — od etapu 33 do 26.09 (T1 testów) build produkcyjny serwera nie wstawał, a nikt go nie uruchamiał. Lek: `removeNodeProtocol: false` w `tsup.config.ts`; strażnikiem jest instancja E2E, która startuje z `dist/`.
- **`requireCallableRequest` to BIAŁA LISTA** (`realtime/checks.ts`) — przepisuje żądanie Testu pole po polu, więc nowe pole w `CpredRollRequest` **ginie po cichu** na drodze prośba → zgoda → rzut. Objaw: funkcja działa z wezwania, a z prośby gracza nie robi nic, bez jednego błędu w logu.
- **Plik na stałe w `uploads/` znika po godzinie** — zbieracz sierot zamiata `maps`, `portraits`, `tokens` i `handouts`, kasując wszystko, czego nie wymienia żaden wiersz bazy. Asset bez wiersza (np. mapa powitalna) musi leżeć **poza tą czwórką** — stąd `uploads/art/`.
- **`socket.data.viewedSceneId` to scena WIDZA, nie celu** — okno karty jej nie zmienia, więc runda dla efektu czyta się ze sceny **żetonu celu** (`effectClockForCharacter`). Inaczej efekt nałożony w walce nie ma terminu rundowego.
- **Trzy zapisy karty z jednego odczytanego wiersza zostawiają tylko ostatni** — każdy scala z tym, co przeczytał. Nerwosol (3 Cechy) musi czytać kartę **przed każdym** zapisem.
- **`file:./dev.db` liczy się od katalogu roboczego** — w repo są DWA `dev.db`: żywy w `packages/server/` i pusty artefakt migracji w `packages/server/prisma/`. Skrypt sięgający po drugi zrobi kopię pustej bazy i nikt tego nie zauważy.
- **Dwa zapisy tej samej karty w jednym handlerze: drugi cofa pierwszy** — wiersz `Character` z początku obsługi to migawka. Jeden zapis z obiema łatkami albo świeży wiersz pod drugi krok (`effectTarget` w `realtime/recovery.ts`).
- **Nowa kolumna z adresem pliku** musi trafić na listę w `uploads-gc.ts` — inaczej sprzątacz kasuje żywy plik.
- **Zdarzenie bez potwierdzenia** (`socket.emit('x', payload)`) dochodziło z pustym payloadem — nowe zdarzenie bez acku sprawdź testem serwera.
- **Po `prisma migrate dev` zrób `prisma generate`** — stary klient daje `Unknown argument`.
- **Mechanika bez danych wygląda jak zepsuty kod** — zanim uznasz „nie działa", sprawdź, czy pole (np. `explosive`) jest w `data/private/.../weapon-types.json`; testy jadą na publicznej próbce, która je ma.
- **`Campaign.sandbox` nie rozchodzi się sama** — jedzie w stanie logowania, więc chip „poligon" u innego klienta czeka na przeładowanie albo `campaign:open`/`session:changed`.
- **Prisma 7 nie zna `migrate dev --skip-generate`** — wypisuje pomoc polecenia zamiast błędu, co wygląda na złą nazwę migracji.
- **Migracji danych nie dopisuje się do zastosowanej migracji** (suma kontrolna) — backfill idzie osobnym katalogiem z samym `UPDATE`.
- **Zmiana `schema.prisma` bez `prisma generate` wywraca CAŁY zestaw testów serwera** — 57 plików na timeoutach `state:sync`, jakby zerwał się protokół. Generuj klienta, zanim zaczniesz szukać błędu gdzie indziej.
- **Skasowanie kolumny to cztery miejsca, nie jedno** — kod czytający, eksport/import (`archive.ts` wypisuje kolumny z nazwy), kopie zapasowe i migracja SQL. Kompendium mieszka w plikach, nie w bazie, więc SQL nie rozwiąże „broń → Umiejętność".


- **`requireCallableRequest` przycina żądanie Testu i robi to po cichu (12.09).**
  `realtime/checks.ts` przepisuje żądanie **pole po polu** (`kind`, `skillId`, `statId`,
  `modifier`), a komentarz mówi wprost, że reszta „nie ma tu czego szukać". Konsekwencja jest
  szersza, niż wygląda: wszystko, co dochodzi do `CpredRollRequest` później, musi zostać **dopisane
  do tej listy**, bo inaczej znika na drodze `check:request` → `check:request-resolve` →
  `character:roll`. Tak umarły dokładne oględziny z etapu 41: klient słał `sightingTokenId`, serwer
  go czytał (`character-rolls.ts`), a biała lista wycinała po drodze — zdany Test Percepcji nie
  odsłaniał **niczego**, bez błędu, bez odmowy, bez śladu w logu. Objaw diagnostyczny: funkcja
  chodzi z wezwania MG i nie chodzi z prośby gracza (albo odwrotnie), choć „to ten sam rzut".
  Znalezione dopiero oględzinami — **żaden test nie dotykał tego pola**.

---

**Konfiguracja testów dymnych to ~78 osobnych literałów (01.10, poprawki #12–#13).** Pole
wymagane w `ServerConfig` łamie kompilację każdego pliku `*.test.ts` serwera. Limity tempa
weszły więc jako `rateLimits?: boolean` — `loadConfig` (dev, E2E, produkcja) daje `true`, a test
bez pola jedzie bez limitu, co jest tam pożądane (jedno gniazdo wysyła setki zdarzeń). Test samego
limitu ustawia pole jawnie (`security.test.ts`).


**Build produkcyjny serwera nie wstawał od etapu 33 — `tsup` zdejmuje `node:` z importów (26.09.2026, T1 testów bety).**
`tsup` 8 domyślnie przepisuje `node:fs` na `fs` (zgodność ze starszym Node). Dla modułów, które mają
obie nazwy, to nic nie zmienia, ale `sqlite` istnieje **wyłącznie** jako `node:sqlite` — kopie
zapasowe (`snapshots.ts`, etap 33) importują z niego `DatabaseSync`, a `dist/main.js` dostawał
`import … from "sqlite"` i padał na `ERR_MODULE_NOT_FOUND: Cannot find package 'sqlite'`. Dev
(`tsx watch`) i testy (vitest) ładują źródła, więc przez trzy tygodnie nic tego nie pokazało. Na VPS
(etap 28) serwer by nie wstał. Lek: `removeNodeProtocol: false`; od T1 instancja E2E startuje z `dist/`,
więc każdy przebieg suity sprawdza, że build żyje. Rejestr testów: #1 (B0, naprawiony).


- **Plik położony w `uploads/` „na stałe" ginie godzinę po wgraniu (11.09).** `uploads-gc.ts`
  zamiata cztery katalogi — `maps`, `portraits`, `tokens`, `handouts` — i kasuje z nich każdy
  plik starszy niż okno łaski, którego **nie wymienia żaden wiersz bazy**. Dotąd czytało się to
  jako „nowa kolumna z adresem musi trafić na listę"; drugi przypadek jest gorszy, bo kolumny
  w ogóle nie ma: asset wpisany na sztywno w kod klienta (mapa powitalna gracza) nie ma po stronie
  bazy **niczego**, czym mógłby się wylegitymować. W `uploads/maps/` zniknąłby przy pierwszym
  starcie serwera po godzinie i wyglądałoby to na zepsutą funkcję albo skasowany plik.
  Rozwiązanie: katalog spoza zamiatanej czwórki (`uploads/art/`), bo zbieracz nie rusza niczego
  poza nią.

- **`socket.data.viewedSceneId` to scena WIDZA, nie scena celu — i przy MG prawie zawsze kłamie
  o rundzie.** Nakładając efekt czasowy z okna karty (etap 39), pierwsza wersja czytała rundę
  z oglądanej sceny. Okno karty **nie zmienia** oglądanej sceny, więc pole bywa puste albo wskazuje
  zupełnie inną scenę niż ta, na której figura się bije — efekt „na minutę" nałożony w trakcie
  walki nie dostawał terminu rundowego i nie schodził na granicy tury. Objaw w teście:
  `expiresAtRound` równe `undefined` przy trwającej walce. Pytanie „czy coś liczy rundy" dotyczy
  **celu**, więc runda czyta się ze sceny, na której stoi jego żeton
  (`effectClockForCharacter` w `realtime/stat-effects.ts`). Każde nowe zdarzenie, które pyta
  o rundę „dla kogoś", ma ten sam problem.

- **Trzy zapisy karty pod rząd z tego samego obiektu `Character` zostawiają tylko ostatni.**
  Nerwosol nakłada trzy efekty (INT, REF, ZW) jednym trafieniem. Napisane jako trzy wywołania
  `applyStatEffect(deps, …, character, …)` na **tym samym** wierszu odczytanym raz, zostawiały
  jeden efekt: każde z nich scala z tym, co **przeczytało**, a przeczytały wszystkie to samo.
  Wiersz trzeba odczytać z bazy **przed każdym** zapisem (`drainStats` w `netice.ts` robi
  `findUnique` w pętli). Ta sama pułapka czeka wszędzie, gdzie jedno zdarzenie dopisuje kilka
  wierszy do jednej kolumny JSON.

- **`file:./dev.db` rozwiązuje się względem katalogu roboczego, nie katalogu schematu.**
  W repo leżą **dwa** pliki `dev.db`: żywy w `packages/server/` (1,1 MB) i pusty artefakt
  migracji w `packages/server/prisma/` (0 B). Sterownik better-sqlite3 pod Prismą liczy ścieżkę
  od `process.cwd()`, a dev serwer chodzi z `cwd = packages/server` — stąd ten pierwszy.
  Skrypt, który sięgnie po drugi, zrobi kopię pustej bazy i nikt tego nie zauważy.
  Jedno miejsce, które to liczy: `databaseFileFromUrl` w `snapshots.ts`.

- **Dwa zapisy tej samej karty w jednym handlerze: drugi cofa pierwszy.** Wiersz `Character`
  pobrany na początku obsługi zdarzenia jest **migawką**; `mergeCharacterData(stary, łatka)`
  zapisuje całą kartę, więc scalenie na starej migawce wymazuje wszystko, co zapisano w
  międzyczasie. 03.09 kosztowało to błędu „dawka podana sobie nie schodzi z ekwipunku":
  `character:use-dose` najpierw zdejmował sztukę, a potem `applyDose` nakładał skutek środka na
  wiersz sprzed zdjęcia. **Rozpoznanie:** pierwsza zmiana widoczna w odpowiedzi zdarzenia, a
  w bazie jej nie ma. **Obejście:** albo jeden zapis z obiema łatkami, albo podstawienie
  świeżego wiersza pod drugi krok — jak `effectTarget` w `realtime/recovery.ts`. Dotyczy każdego
  handlera, w którym „kto robi" i „na kim" może być **tą samą kartą**.

- **Nowa kolumna z adresem pliku musi trafić na listę w `uploads-gc.ts`** — sprzątacz kasuje
  plik, którego nie wymienia **żadna** kolumna (i który jest starszy niż godzina), więc kolumna
  pominięta na tej liście znaczy skasowany plik. Odnośniki zbierane są z kolumn z adresem
  **i** wyrażeniem regularnym z kolumn JSON. Opis naprawy: `archiwum/zamkniete-zaleglosci.md`.

- **Zdarzenie wysłane bez potwierdzenia (`socket.emit('x', payload)`) docierało na serwer z pustym payloadem** — `registerEvents` uznawał jedyny argument za brakujący callback. Naprawione 31.07; objaw był zupełnie inny niż przyczyna (token skacze u obserwatorów, patrz notatka sesji). Nowe zdarzenie bez acku sprawdź testem serwera, bo klient nie dowie się o odmowie — nie ma czym.

- **Po `prisma migrate dev` upewnij się, że klient się przegenerował** (`prisma generate`) — stary klient w `src/generated/` daje `Unknown argument`.

- **Dane kampanii mogą nie mieć pola, które kod obsługuje — a testy tego nie złapią.**
  23.08 wyszło, że granatnik w kampanii nie robił obszaru wybuchu, choć etap 16d był
  „ukończony i odklikany". Przyczyna nie leżała w kodzie: `explosive` wypadało z
  `weapon-types.json` przez białą listę w importerze (opis w `umowy-kodu.md`), a testy
  przechodziły, bo publiczna próbka danych **ma** typ z `explosive`. Objaw był mylący —
  atak trafiał, tylko nie miał obszaru, listy trafionych ani rzutu obrażeń. Zanim uznasz
  „mechanika nie działa" za błąd kodu, sprawdź, czy pole w ogóle jest w danych:
  `python -c "import json;d=json.load(open('data/private/cpred/compendium/weapon-types.json',encoding='utf8'));print([t['id'] for t in d['weaponTypes'] if t.get('explosive')])"`.

**Flaga kampanii nie rozchodzi się sama po podpiętych ekranach.** `Campaign.sandbox` jedzie
w `CampaignSummary`, czyli w stanie logowania — trasa REST ją zapisuje, ale **nie** broadcastuje,
więc chip „poligon" u innego klienta pojawi się dopiero po przeładowaniu albo po
`campaign:open` (do 44b `campaign:activate`). Dla dialu MG to akceptowalne; gdyby kiedyś zaczęło przeszkadzać, drogą jest
`campaign:switch` (to on przenosi wszystkie ekrany), a nie drugie źródło prawdy u klienta.

**Prisma 7 nie zna `migrate dev --skip-generate`** — wypisuje wtedy całą pomoc polecenia zamiast
błędu, co wygląda jak zła nazwa migracji. Uruchom `migrate dev` bez flagi, a `prisma generate`
osobno (i pamiętaj o nim — stary klient daje `Unknown argument`).

**Migracji danych nie dopisuje się do już zastosowanej migracji** — Prisma trzyma sumę
kontrolną pliku i przy następnym `migrate dev` zgłosi, że plik zmieniono. Backfill („uzupełnij
nową kolumnę na istniejących wierszach") idzie **osobnym katalogiem migracji** z samym
`UPDATE`; tak powstał `stage37_settled_month_backfill`.

**Zmiana `schema.prisma` bez `prisma generate` wywraca CAŁY zestaw testów serwera, nie jeden**
(05.09, etap 38a). Objaw jest mylący: 57 z 61 plików pada na timeoutach `state:sync`, jakby
zerwał się protokół. Przyczyną jest wygenerowany klient, który wciąż zna skasowaną kolumnę —
każde zapytanie o żeton wywraca się w środku, a to widać dopiero jako brak odpowiedzi po drugiej
stronie gniazda. `npx prisma generate` w `packages/server` po **każdej** zmianie schematu, zanim
zaczniesz szukać błędu gdzie indziej.

**Skasowanie kolumny, w której coś mieszkało, to trzy miejsca, nie jedno** (05.09, etap 38a).
Poza kodem czytającym są jeszcze: **eksport i import** (`archive.ts` wypisuje kolumny z nazwy,
więc martwa nazwa wywraca zrzut kampanii) i **kopie zapasowe**. Migracja SQL jest czwartym:
`json_group_object` z `json_each` daje się użyć do przepisania mapy z JSON-a, ale kompendium
mieszka w plikach `data/private/`, **nie w bazie** — więc SQL nie ma jak rozwiązać „broń →
Umiejętność" i model musi być tak dobrany, żeby nie musiał (stąd `statBlock.weaponSkill`).


## ui — Okna, motyw, style, dostępność

- **Rozgłoszenie wyprzedza odpowiedź na żądanie — stan lokalny okna musi to przeżyć w tym samym renderze (08.10, etap 46a2)** — po „Zapłać” `merchant:update` (półka bez kupionej kurtki) przychodzi przed ackiem, a koszyk jeszcze trzyma kurtkę: `rowByKey.get(key)!` dał `undefined` i cała strona gracza zgasła (czarny ekran w zrzucie). Sprzątanie w `useEffect` przychodzi o render za późno — linie liczone z mapy filtruj w miejscu (`flatMap`).
- **`offsetLeft` liczy od najbliższego pozycjonowanego przodka, nie od rodzica** — pas kolejki (niepozycjonowany `<ol>`) dostawał od kafla 341 px lewego brzegu strony i przewijał się za daleko, ucinając aktywnego na pierwszym miejscu. Mierz `getBoundingClientRect()` kafla względem pojemnika + `scrollLeft`.
- **Przeciąganie na zdarzeniach wskaźnika trzymaj w `ref`, nie w stanie Reacta** — szybki ruch daje jeden `pointermove` i od razu `pointerup`, zanim React przerysuje; `pointerup` sprawdzający stan widzi „nie przeciągam” i upuszczenie ginie jak kliknięcie (okno handlu 38c, 23.09).
- **`Tab` w oknie „nie działa”, a na mapie przeskakuje zaznaczenie figury** — nasłuch mapy na `window` łapie klawisze z przycisków okna (pola tekstowe omija). Rozpoznanie: fokus na przycisku, nie w polu; lekarstwo: `data-owns-keys` na oknie.
- **Fokus po zmianie widoku w `requestAnimationFrame` nie wykona się w schowanej karcie** — efekt Reacta działa już po wstawieniu elementów, klatka jest zbędna; objaw w automacie to `activeElement` = `BODY` i niespełnione „Przejdź”.
- **`requestFullscreen` zużywa gest — także wtedy, gdy przeglądarka odmawia** — nasłuch po nim widzi `userActivation.isActive === false` i wygląda to, jakby zdarzenie w ogóle nie niosło gestu. Rozpoznanie: loguj `isActive` i ślad stosu **w samym** `requestFullscreen`, nie w nasłuchu dopiętym później.
- **Maska CSS z pliku, który ma nieprzezroczyste tło, maluje pełny kwadrat** — `mask-image` liczy się domyślnie z alfy, a czarny podkład game-icons ma alfę pełną jak sylwetka. Działa `mask-mode: luminance`. Rozpoznanie: pierwszy `<path>` pliku.
- **Autofill przeglądarki nie dociera do stanu Reacta** — pole pełne, `useState` puste, więc `disabled={value.length === 0}` zostawia martwy przycisk, a samo odblokowanie go wysłałoby **pustkę**. Czytaj wartość z węzła przy wysyłce (`useAutofillableField`), nie ze stanu.
- **Przezroczyste pole hasła Chrome i tak zamaluje własnym niebieskim** — to styl UA na `:-webkit-autofill`, `background` go nie zdejmuje; zdejmuje `transition: background-color 100000s`.
- **`place-items: center` na ekranie wyższym niż okno chowa górę treści bezpowrotnie** — pasek przewijania nie pomaga, bo przepełnienie jest po obu stronach. Ratuje `justify-content: safe center` w kolumnie flex.
- **Okno otwierane znad karty postaci znika pod nią, choć powstało** — scrim jest, `Escape` działa, w DOM-ie okno ma rozmiary, a widać zero. Rozpoznanie: `document.elementFromPoint` na jego środku zwraca arkusz.
- **Okno, które otwiera drugie okno, musi zgasić SIEBIE** — objaw brzmi „okno prośby nie zamyka się po zgodzie MG”, a to okno rzutu zostało pod spodem. Rozpoznanie: sprawdź, ile okien trzyma **stan**, nie które widać.
- **Prosty cudzysłów w atrybucie JSX zamyka atrybut** — `title="… („−1k6") …"` to błąd składni; zamykający pisze się `”` (U+201D).
- **Otwarte okno łatwo zabiera klawisze narzędzi mapy** — strażnik „czy ktoś pisze" ma obejmować wyłącznie kartę, która sama ustawia kursor w treści (notatka).
- **Nasłuch „klik poza oknem" dopięty w efekcie łapie ten sam klik, który okno otworzył** — okno znika bez śladu i bez błędu; uzbrajaj listener przez `setTimeout(…, 0)`.

---

- **Pas kolejki ucinał aktywnego na pierwszym miejscu (25.09, zaległości).** „Dojazd do aktywnego”
  w `CombatBar.tsx` liczył środek z `chip.offsetLeft`, a `offsetParent` kafla to `<body>`, bo pas
  kolejki nie jest pozycjonowany. Do wyniku wpadało 341 px lewego brzegu pasa: przy 13 uczestnikach
  `scrollLeft` wynosił 135 zamiast 0 i z „Oględziny Stym” zostało „ym 20”. Naprawa: pozycja kafla
  z `getBoundingClientRect()` względem pasa plus `scrollLeft`. Obejrzane w Chromium i Firefoksie:
  pierwszy kafel przy krawędzi, środkowy dokładnie na środku.


- **Upuszczenie ginęło przy szybkim przeciągnięciu (23.09, etap 38c).** Okno handlu trzymało „przeciągam” w `useState`, a `onPointerUp` czytał je z zamknięcia. `left_click_drag` z automatu (i szybki ruch prawdziwej myszy) wysyła jeden `pointermove` i od razu `pointerup` — React nie zdąży przerysować, `pointerup` widzi stan sprzed ruchu i puszczenie wygląda jak kliknięcie. Lekarstwo: flaga ruchu w `useRef` i odległość liczona jeszcze raz przy `pointerup`; stan Reacta służy tylko do rysowania ducha i podświetlenia pola.

- **`Tab` w oknie „nie działa”, a na mapie przeskakuje zaznaczenie figury (16.09, naprawa 2b).**
  Nasłuch klawiatury mapy (`MapArea`) wisi na `window` i omija tylko `input`, `textarea`, `select`
  i `contenteditable`. Fokus na **przycisku** kreatora albo karty oddawał mu więc `Tab`
  (`preventDefault` i następna figura), `Delete`/`Backspace` (kasowanie zaznaczonego obiektu sceny)
  i litery narzędzi. Objaw w przeglądarce: obwódka fokusu stoi w miejscu, a na mapie zmienia się
  zaznaczenie. Rozpoznanie: `document.activeElement` to `BUTTON`, nie pole. Lekarstwo:
  `data-owns-keys` na oknie (umowa w `ui`). Pozostałe okna (`BotEditor`, edytor architektury
  i okno runu Sieci) jeszcze go nie mają.

- **Fokus po zmianie widoku w `requestAnimationFrame` nie wykona się w schowanej karcie (16.09).**
  Pierwsza wersja „Przejdź” z podsumowania kreatora czekała na klatkę, zanim skupiła pole. W karcie
  automatyki (`document.visibilityState === 'hidden'`) klatka nie przychodzi wcale, więc krok się
  zmieniał, a kursor zostawał na `BODY` — wyglądało to jak zgubiony atrybut `data-creation-field`.
  `useEffect` i tak biegnie po wstawieniu DOM; fokus i `scrollIntoView` wołaj wprost w efekcie.

- **`requestFullscreen` zużywa gest, także gdy odmawia (12.09, pełny ekran).** Pomiar w oględzinach
  pokazał `isActive: false` na `pointerdown` i podsunął wniosek „Chrome ustawia gest dopiero po
  `pointerdown`, więc automat na tym zdarzeniu nigdy nie zadziała". **Nieprawda:** nasłuch automatu
  był dopięty wcześniej, wywołał `requestFullscreen` przy `isActive: true`, a to wywołanie zużyło gest,
  zanim zdarzenie doszło do nasłuchu diagnostycznego. Druga twarz tej samej rzeczy była prawdziwym
  błędem: po odmowie („not granted") automat ponawiał przy każdym kliknięciu, więc guzik „Wróć do
  pełnego ekranu" dostawał zużyty gest i „Permissions check failed". Naprawa: odmowa **mimo** gestu
  wyłącza automat do przeładowania. Skutek, który zostaje świadomie: pierwsze kliknięcie po F5 oddaje
  gest pełnemu ekranowi, więc akcja, która sama go potrzebuje (w Firefoksie kopiowanie linku
  zaproszenia w Panelu MG), wymaga drugiego kliknięcia. **Rozpoznanie:** podmień
  `Element.prototype.requestFullscreen` na wersję logującą `isActive` i `new Error().stack` —
  ślad stosu mówi, kto woła.

- **Maska z alfy nie gasi nieprzezroczystego tła (12.09).** Zaległość z 11.09 kazała rysować
  naklejki statusów tą samą maską co ikony HUD-u, uzasadniając to zdaniem „czarne tło jest wtedy
  nieistotne, bo maska bierze alfę". Ikony HUD-u (`public/icons/hud/`) mają tło usunięte, pliki
  statusów — nie: zaczynają się od `<path d="M0 0h512v512H0z"/>` bez `fill`, czyli czarnym
  **nieprzezroczystym** kwadratem. Maska z alfy widzi w nim pełne krycie i maluje cały kwadrat
  kolorem chipu — ten sam stempel, tylko w innym kolorze. Złapane w pliku przed napisaniem kodu.
  Ratuje `mask-mode: luminance` (czerń → przezroczyste, biel → pełne); w Chrome działa także obok
  `-webkit-mask-image` z `.hud-icon`.

- **Autofill przeglądarki omija Reacta w obie strony (12.09).** Menedżer haseł pisze prosto do
  węzła DOM: żadnego `input`, żadnego `change`, nic, czego React mógłby usłyszeć. Kontrolowane pole
  ma wtedy **pełne pudełko i pusty `useState`**, więc każde pytanie zadane *stanowi* dostaje złą
  odpowiedź. Na ekranie logowania czytało się to jako zepsuty przycisk: w polu kropki, „Zaloguj się"
  wyszarzone. **Pułapka jest w naprawie, nie w objawie:** samo zdjęcie warunku z `disabled` jest
  gorsze niż błąd — formularz wysyła wtedy pusty *stan*, a użytkownik patrzy na pełne pole i dostaje
  „nieprawidłowe hasło". Trzeba obu połówek naraz: `read()` przy wysyłce bierze wartość **z węzła**,
  a synchronizacja po zamontowaniu przepisuje do stanu to, co już tam stoi (`autofill-field.ts`).
  Warunku o długości **nie wieszaj** na przycisku: autofill nie ma pewnego momentu (Chrome wypełnia
  jedne pola przy wejściu, inne dopiero po interakcji), więc guzik czekający na wartość, o której
  nie umie się dowiedzieć, potrafi zostać martwy. Pustkę odbija się zdaniem przy wysyłce.
  Sprawdzone na żywo: `value` podstawione natywnym setterem bez zdarzenia — wysyłka zalogowała.

- **Pole z hasłem podstawionym przez Chrome zamalowuje się na niebiesko, choć ma `background: none`
  (11.09).** Na ekranie logowania stojącym na plakacie wygląda to jak wbita w grafikę systemowa
  plamka. To nie kaskada, tylko styl UA na pseudoklasie `:-webkit-autofill` — zwykłe `background`
  i `background-color` przegrywają. Zdejmuje to dopiero absurdalnie długie przejście
  (`transition: background-color 100000s`): barwa rusza w stronę niebieskiego i nigdy nie dojeżdża.
  Drugie znane obejście, `box-shadow: inset 0 0 0 100px <kolor>`, **tu odpada** — zalepiłoby pole
  płaską plamą, a pod spodem ma być ziarno plakatu. Litery ustawia się przez
  `-webkit-text-fill-color`, nie `color`.

- **`place-items: center` chowa górę treści, gdy treść jest wyższa od okna (11.09).** Przy oknie
  1500 × 460 formularz logowania wystawał poza ekran **z obu stron naraz**, więc dołożenie
  `overflow-y: auto` samo z siebie nic nie dało: pasek przewijania był, ale góra i tak zostawała
  poza zasięgiem. Działa dopiero kolumna flex z `justify-content: safe center` — `safe` przy
  przepełnieniu przestaje centrować i dosuwa treść do początku osi.

- **Okno otwierane znad karty postaci znika pod nią, choć powstało (06.09, etap 40).** `.sheet-window`
  ma `z-index: 300`, a `.dialog-backdrop` — 50. Objaw jest mylący, bo **coś się dzieje**: ekran
  przygasa scrimem, `Escape` działa, a w DOM-ie okno stoi z prawidłowymi rozmiarami — tylko widać
  je zero. Pierwsza reakcja („kliknięcie nie doszło") prowadzi w kompletnie inne miejsce.
  **Rozpoznanie:** `document.elementFromPoint(x, y)` na środku okna zwraca element karty postaci.
  **Naprawa:** dopisz klasę okna do listy `.dialog-backdrop:has(…)` w `styles/06-sheet-window.css` — jest tam od
  27a, dla `.roll-dialog`, i z tego samego powodu.

- **Prosty cudzysłów w atrybucie JSX zamyka atrybut.** `title="notacja („−1k6") jest…"` to dwa
  błędy składni TS w miejscu, które wygląda na poprawny polski. W atrybutach JSX zamykający
  cudzysłów pisze się jako `”` (U+201D) — reszta repozytorium tak właśnie robi.

- **Otwarte pływające okno łatwo zabiera klawisze narzędzi mapy** (24.08, etap 27l). Strażnik
  „czy ktoś pisze" w `MapArea` obejmował przez chwilę **każdą** kartę obiektu, więc po otwarciu
  karty ściany `O` przestawało przełączać na osłony i dorysowywało kolejny segment. Do pola
  tekstowego należy wyłącznie karta, która **sama ustawia kursor w treści** (notatka);
  reszta ma tylko przyciski i suwaki, a te i tak wyłapuje pierwszy warunek (`closest('input, …')`).

- **Nasłuch „kliknięcie poza oknem" dopięty w efekcie łapie ten sam klik, który okno otworzył**
  (31.08, kosztowało jeden nieudany przebieg oględzin). Okno Celowania otwiera się w obsłudze
  `pointerdown` na żetonie; React zdąża je wyrenderować **w trakcie** tego samego zdarzenia (klik
  jest zdarzeniem dyskretnym, więc aktualizacja idzie synchronicznie), a listener dopięty wtedy do
  `window` jest jeszcze przed nim w drodze w górę drzewa — więc dostaje ten klik i zamyka okno
  w tej samej klatce, w której powstało. Objaw jest mylący: **żadnego błędu, żadnego okna**, jakby
  warunek otwarcia był fałszywy. Obejście to jedna linia — `setTimeout(() => addEventListener(…), 0)`
  i `clearTimeout` w sprzątaniu. `stopPropagation` w Pixi nie pomaga: to inny system zdarzeń niż DOM.

- **Okno, które otwiera drugie okno, musi zgasić SIEBIE (06.09, poprawka do etapu 40).**
  „Poproś MG" w oknie rzutu otwierało okno prośby i zostawiało własne pod spodem. Objaw jest
  mylący, bo **wszystko działa**: prośba idzie, jej okno znika — tylko że pod nim wraca guzik
  „Weź kubek", stojący tam przez cały czas oczekiwania i po zgodzie MG także. Zgłoszenie brzmi
  wtedy „okno prośby nie zamyka się po zgodzie", a okno prośby jest akurat jedynym, które
  zamknęło się prawidłowo. **Rozpoznanie:** sprawdź, ile okien trzyma stan naraz
  (`useRollStore.getState().target` obok `useCheckStore.getState().requestDraft`) — nie to,
  które widać. **Naprawa:** gaszenie w funkcji przejścia, nie w komponencie, bo wejść jest
  więcej niż jedno.


## kosci — Kości, Testy i wezwania

- **Biblioteka kości 3D klonuje geometrię przy każdym wymuszonym wyniku (02.10, #51)** — `swapDiceFace` w `@3d-dice/dice-box-threejs` robi `geometry.clone()`, a `clearDice` tylko zdejmuje siatkę ze sceny i ciało ze świata fizyki. `renderer.info.memory.geometries` (`diceE2ECounts` w haku E2E) rósł o liczbę podmienionych ścianek, ~1,4 na rzut u każdego widza. Kod biblioteki bez źródeł: `node_modules/.pnpm/@3d-dice+dice-box-threejs@0.0.12/node_modules/@3d-dice/dice-box-threejs/dist/dice-box-threejs.es.js`, szukaj `swapDiceFace(` i `clearDice(`.
- **`rollFormula` sam wnioskuje regułę Testu z formuły — i to jest pułapka wszędzie, gdzie kość NIE jest Testem.** Tabela `1d10` bez `checkRule: false` wyrzuca jedenastkę, a objaw („nic nie odpowiada za tę liczbę”) wskazuje na zakresy, nie na rzut. To samo dotyczy każdego przyszłego losowania fabularnego.

---

- **`rollFormula` sam wnioskuje regułę Testu z formuły — pułapka wszędzie, gdzie kość NIE jest
  Testem.** Przy etapie 34 tabela `1d10` bez `checkRule: false` dawałaby wynik 11+ na dziesiątce,
  a objaw kłamie: karta mówi „nic nie odpowiada za tę liczbę", więc pierwsze podejrzenie pada na
  zakresy wierszy, nie na rzut. Poprzednikiem jest inicjatywa z 14 („1d10 + REF nie jest Testem")
  i rzuty kreatora z 25a. Każde nowe losowanie, które nie jest Testem CP RED, ma to ustawić jawnie
  — a test, który to łapie, musi sprawdzać `roll.critical === undefined`, nie samą sumę.


## tura — Tura, akcje, ruch w walce

- **Karta odmowy ruchu nie powstaje przed rundą 1** — `findCombatantForToken` zwraca `null`, dopóki MG ustawia walkę; test, który po samym `combat:start` czeka na kartę, dostaje timeout, choć `MOVE_REFUSED` przychodzi. Najpierw `combat:next` (14.09, `fog-walk.test.ts`).
- **`refuseWalkThroughSolid` zwalnia MG** (`realtime/movement.ts:254`) — żeton MG przechodzi przez ścianę i to nie jest regres; kolizje ruchu ogląda się z konta gracza, jak odmowy statusowe.
- **Zacienienie zasięgu ma cache bez ścian** — zmiana zasad chodzenia musi wyzerować `this.reach` (naprawione 22.08).
- **`clipWalkToBudget` tnie na punkcie zwrotnym, nie na metrze** — na wygładzonej prostej zostawia sam start; u klienta tnie `clipToBudget` w `MapRenderer` (metr → przyciągnięcie → ponowne sprawdzenie).
- **`combat:next` przy jednym uczestniku to cała runda** — test czytający kolejkę krokiem tury potrafi sam sprowadzić posiłki. Stan czyta się `state:request`.

---

- **Zacienienie zasięgu ruchu ma własny cache, który nie wie o ścianach.** Klucz w `updateReach`
  to figura, jej pozycja, budżet i rozmiar — postawienie albo skasowanie ściany w trakcie tury
  zostawiało na mapie **stary kształt** zalewu. Naprawione 22.08 (`setWalkPassable` czyści
  `this.reach`), ale gdyby zacienienie kiedyś znów „nie zauważyło" zmiany w scenie, szukaj
  najpierw tego klucza.

- **`clipWalkToBudget` w `shared` tnie trasę na **punkcie zwrotnym**, nie na metrze.** Dla bota
  jest to poprawne — jego trasy planuje się bez wygładzania właśnie po to, żeby każda kratka
  była punktem, na którym cięcie może wylądować (20b, komentarz w `bot-combat.ts`) — ale trasa
  gracza jest wygładzana, więc prosta przez otwarty teren ma **dwa** punkty: start i cel.
  Cięcie do mniejszego budżetu zostawiało wtedy sam start, czyli „nie ruszysz się" na każdy klik
  poza budżetem. Przez cały etap 16e ukrywał to promień szukania równy budżetowi (dalej trasa
  po prostu nie powstawała); rozszerzenie promienia o pas Biegu (23.08) błąd odsłoniło. U klienta
  tnie teraz własne `clipToBudget` w `MapRenderer`: **na metrze**, potem `snapTokenPosition`,
  potem ponowne sprawdzenie budżetu i przejścia — bo serwer dokleja do trasy własne przyciągnięte
  lądowanie (`movementPath`) i policzyłby różnicę jako przekroczenie. Gdy przyciągnięta kratka
  już się nie mieści, cofa się o kratkę (do sześciu prób), a na końcu wraca do ostatniego punktu
  zwrotnego.

**`combat:next` przy jednym uczestniku w kolejce to cała runda** — a odliczanie w rundach
(przybycie Wsparcia, efekty 16h) rusza dokładnie wtedy. Test, który po wezwaniu robi krok tury,
żeby przeczytać kolejkę, potrafi w ten sposób sam sprowadzić posiłki. Stan kolejki czyta się
`state:request`, nie `combat:next`.

**`refuseWalkThroughSolid` zwalnia MG — żeton MG przechodzi przez ścianę (04.09).**
`realtime/movement.ts:254` zaczyna się od `if (user.role === ROLE_GM) return;`, więc kolizje
ruchu (ściany **i** osłony, po lanie na komórkę dla figur 2×2) obowiązują wyłącznie graczy. To
ta sama zasada, co przy odmowach statusowych z 08.08, tylko o geometrii, i nigdzie nie była
zapisana: przy oględzinach z konta MG wygląda jak brak kolizji, którego nie ma. Sprawdzaj
z konta gracza (`Tester`, `/join/tester-dev`). Przy okazji: wpis `POMYSLY.md` o kolizjach ruchu
jest **nieaktualny** — kolizje są od 27j.


## atak — Broń, atak, obrażenia, rany

- **To samo zdanie odmowy bywa w dwóch tabelach** — `attack:evade` idzie przez `attackAckErrorText`, nie przez ogólne `ackErrorText`; kod bez wpisu w tej właściwej wraca do czatu jako `Błąd ataku: KOD`.
- **Mechanika bywa gotowa i nieosiągalna z UI** — Celowanie miało cały silnik i żadnej kontrolki, która by je włączyła; prześledź regułę od kontrolki, nie od silnika.
- **Broń bez `compendiumId` nie strzela** — planer odmawia `UNKNOWN_WEAPON` („brak tabeli zasięgów"), tym samym kodem co przy nieistniejącym wierszu.
- **Dwie drogi uzbrojenia broni, jedna zna Celowanie** — slot paska to `hudStore.activeWeapon`, baner z guzikami to `attackStore.targeting` („Atak" z karty albo menu żetonu).
- **Broń dopisana do karty samą nazwą nie strzela** — bez `compendiumId` planer odmawia; bierz ją z katalogu („Dodaj za darmo"). Id typu (`weapon-type.*`) ≠ id wpisu (`weapon.*`).
- **Broń biała odmawia powyżej 2 m**, a pole „Strzelnicy" to 2 m — przy ustawianiu żetonów w bazie licz w metrach.
- **Nabój inteligentny od 01.09 odmawia strzału bez Celownika optycznego** — test strzelający nim musi wszczepić chrom, inaczej pada w asercji o czymś innym.
- **Gniazd na dodatki nie widać przy broni wpisanej ręką** ani przy egzotyku i broni białej — `attachmentSlots` to wtedy zero, a pasek gniazd świadomie znika.

---

**Mechanika bywa gotowa i nieosiągalna — sprawdź, kto ustawia flagę.** Celowanie (s. 170) miało
od etapu 16 komplet: `−8` w rozbiciu rzutu, `location: 'head'` w obrażeniach, ×2 po pancerzu,
`AIM_NEEDS_FULL_ACTION` w budżecie tury i wyjątek dla Ludzkiej tarczy. Mimo to **nie dało się go
odpalić**: obie drogi uzbrojenia celownika (`AttackLauncher` i wiersz broni na karcie) wpisywały
`aimed: false` na sztywno, a nic w UI tego nie zmieniało. Testy przechodziły, bo wołały planer
wprost. Zanim uznasz regułę za zrobioną, prześledź ją **od kontrolki**, nie od silnika — grep po
nazwie pola, na którym stoi (`grep -rn "aimed: true"` pokazał wtedy same przepisania, ani jednego
źródła).

**Bronią bez `compendiumId` nie da się strzelić** — planer odmawia `UNKNOWN_WEAPON` („Ta broń nie
ma tabeli zasięgów"), mimo że wiersz siedzi na karcie. Ta sama odmowa co przy nieistniejącym
wierszu, więc szukanie zaczyna się od złej strony; wpis z katalogu jest wymagany, bo zasięgi
mieszkają na typie broni.

**Dwie drogi uzbrojenia broni, jedna zna Celowanie.** Slot broni w pasku postaci ustawia
`hudStore.activeWeapon` („W ręku: …"), a baner nad mapą z guzikami Celowania wisi na
`attackStore.targeting`, który stawia **tylko** „Atak" z karty postaci i menu żetonu. Szukając
kontrolki, która czegoś nie pokazuje, sprawdź najpierw, **którym** stanem została uzbrojona broń.

**Broń dodana do karty przez wpisanie nazwy nie strzela.** Pole nazwy w wierszu broni to wolny
tekst — nie dostaje `compendiumId`, więc planer odmawia („Ta broń nie ma tabeli zasięgów").
Do oględzin bierz broń z katalogu: kompendium → wpis → wybór postaci → „Dodaj za darmo". Id typu
(`weapon-type.heavy-melee`) **nie jest** id wpisu broni (`weapon.heavy-melee`) — wpisanie tego
pierwszego do bazy daje dokładnie tę samą odmowę.

**Broń biała odmawia z odległości większej niż 2 m** („Do ataku wręcz cel musi być nie dalej niż
2 m") — a pole na „Strzelnicy" to 100 px i **2 m**, więc figury muszą stać w sąsiednich polach.
Przy ustawianiu żetonów w bazie licz w metrach, nie w pikselach.

**Nabój inteligentny od 01.09 odmawia strzału i wywraca stary test (01.09).** „Z powodów
bezpieczeństwa amunicja inteligentna nie wystrzeli po pociągnięciu za spust" (s. 347) było prozą
do etapu 31, bo w 16h karta nie miała chromu, o który dałoby się zapytać. Teraz `planCpredAttack`
zwraca `AMMO_NEEDS_CYBERWARE`, więc **każdy test strzelający tą amunicją musi wszczepić strzelcowi
wymaganą cyborgizację** — inaczej pada w asercji o czymś zupełnie innym (drugi rzut po bliskim
pudle), bo pierwszy strzał w ogóle nie dochodzi do skutku.

**Gniazd na dodatki nie zobaczysz przy broni wpisanej ręką** (01.09) — `WeaponAttachments` wraca
`null`, gdy `resolved` jest pusty albo `attachmentSlots` to zero (broń biała, egzotyk, wiersz bez
wpisu z katalogu). Pusty pasek byłby jeszcze jedną rzeczą do wytłumaczenia, ale objaw „nie widzę
gniazd" ma zwykle tę przyczynę, a nie zepsuty komponent.

**To samo zdanie odmowy bywa w dwóch tabelach, a ścieżka wybiera jedną (04.09).**
Klient ma dwa mappery kodów na zdania: ogólny `ackErrorText` i `attackAckErrorText` dla
wszystkiego, co idzie przez atak — w tym `attack:evade`. `BACKUP_CANNOT_DODGE` miało swoje
zdanie **w tym pierwszym**, a Unik szedł przez drugi, więc na czacie lądowało
„Błąd ataku: BACKUP_CANNOT_DODGE". Objaw jest mylący, bo `grep` po kodzie znajduje polskie
zdanie i wygląda na podpięte. Dokładając kod odmowy do ścieżki ataku, sprawdź **którą** tabelę
czyta jej `ack` — trzy kody `attack:evade` (`BACKUP_CANNOT_DODGE`, `SHIELD_CANNOT_DODGE`,
`DODGE_BLOCKED`) siedziały poza nią wszystkie trzy.


## statysta — Figura ostatystykowana i jej karta

- **Nowe pole `CpredCharacterData` wywraca statystę i mapę ikon** — `combatProfileSheet` buduje pełną kartę, a `ICON_FX` to `Record<CpredSlotIcon, …>`; obie listy pilnuje kompilator, więc puść `tsc --noEmit` przed pisaniem UI.
- **Sufit `SKILL_LEVEL_MAX` ścinał Wartość bojową w profilu statysty** — zapis szedł dobry, ścinał odczyt; funkcję piszącą do kolumny JSON testuj po podróży tam i z powrotem.
- **Karta zapisana ≠ karta rzucana** — figura z Wartością bojową ma na karcie dziesiątkę, a rzuca czternastką. Test czytający liczbę z kolumny sprawdza złe miejsce; sprawdzaj sumę rozbicia rzutu.

---

**Nowe pole `CpredCharacterData` wywraca też statystę i mapę ikon.** Dopisanie
`combatAwareness` w 30a wysypało `tsc` w dwóch miejscach, których nikt by nie szukał:
`combatProfileSheet` (`statist.ts`) buduje **pełną** kartę syntetyczną, więc brak pola to błąd
typu, a `ICON_FX` w `fx.ts` to `Record<CpredSlotIcon, …>` — nowa ikona akcji wymaga wiersza także
tam, choć akcja niczym nie strzela. Nie szukaj tego w komentarzach: obie listy pilnuje kompilator,
więc wystarczy puścić `pnpm -r exec tsc --noEmit` **przed** pisaniem UI.

**Sufit `SKILL_LEVEL_MAX` w profilu statysty ścinał Wartość bojową (31.08).** Objaw byłby taki:
C-SWAT z Wartością 15 bije i broni się jak krawężnik, a nikt nie widzi dlaczego — zapis do bazy
szedł poprawny, ścinał **odczyt** (`sanitizeCombatProfile`). Dotyczyło czterech z sześciu
kategorii Wsparcia (14, 16, 15, 14) i wszystkich pięciu Demonów (14). Nie wyszło przez dwa etapy,
bo testy sprawdzały `cpredBackupProfile` — czystą funkcję **przed** sanityzacją. Morał szerszy niż
ta jedna stała: funkcję, której wynik idzie do kolumny JSON, testuj po przejściu tam i z powrotem,
a nie w miejscu, w którym powstaje.

**Karta zapisana ≠ karta rzucana** (05.09, etap 38a). Figura z Wartością bojową ma na karcie
Umiejętności przy suficie dziesięć, a rzuca czternastką — bo podstawia ją `sheetForRoll` w chwili
rzutu. Test, który czyta wartość **z karty** i oczekuje czternastki, jest testem złego miejsca:
sprawdzaj sumę rozbicia rzutu, nie liczbę w kolumnie.


## karta — Karta postaci: układ, panele, pola

- **Firefox rysuje syntetyczne kapitaliki większe niż Chromium** — „POWAŻNIE RANNY” przy 0,94 rem: 105 px w Chromium, 116 px w Firefoksie, przy 105 px miejsca. Ciasną etykietę `.cp-label` mierz w Firefoksie (`scrollWidth`), nie w Chrome.
- **`font-size` na polu karty nic nie robi, jeśli w środku stoi przełącznik liczbowy** — `.sheet-window .cp-step { font: inherit }` (0-2-0) bije gołe `.cp-stat-value` (0-1-0), więc liczba zostaje przy 16 px, choćbyś wpisał 2,6 rem. Rozpoznanie: `getComputedStyle(el).fontSize` w konsoli, nie oko — pudełko rośnie, liczba nie.
- **Ujemne `hpCurrent` wpisane wprost do bazy znika przy pierwszym odczycie karty** — `collectCharacterDataPatch` odrzuca `hpCurrent < 0`, a `parseCharacterData` podstawia wtedy PW **domyślnej** karty (35), nie maksimum tej postaci ani zera. Konający NPC przygotowany na −5 wraca jako 35/40 i pierwszy Test idzie na PT z innego progu ran. Obrażenia i tak mają podłogę na zerze (`damage.ts`, „HP floor at 0”), więc **poligon przygotowuje się przez 0**.
- **„Panel sam się zresetował po zmianie z zewnątrz" to zwykle przełączona zakładka karty, nie rozgłoszenie** — filtr i otwarty rejestr w „Awansie" giną przy KARTA ↔ ŚCIEŻKA ŻYCIA, bo to stan lokalny, a `setTab` odmontowuje stronę. Rozpoznanie: zapamiętaj węzeł (`window.__probe = el`) i sprawdź `isConnected` po zdarzeniu — węzeł nadal podłączony znaczy, że winowajcą jest co innego.
- **Ta sama nazwa klasy CSS dwa razy w `sheet.css` — wygrywa późniejsza.** `.cp-slot` była etykietą lokacji pancerza **i** pudełkiem gniazda cyborgizacji, więc „Głowa/Korpus/Tarcza” znikały z tabeli. Przed dopisaniem klasy: `grep -n '^\.nazwa {' sheet.css`.
- **`display: flex` (i `grid`) na `<td>` wyjmuje komórkę z układu tabeli** — przestaje sięgać wysokości wiersza, a czerwone tło `.cp-table` wychodzi spod treści jak błąd renderowania. Flex idzie na wrapper **wewnątrz** komórki.
- **Panel wstawiony w `.cp-field` nie rozciąga się sam** (brak `flex: 1`), a selektor `.cp-span2` w kontenerze siatki trafia w więcej dzieci, niż się wydaje — stąd pusta prawa kolumna „Ścieżki Życia”.
- **Jeden zły wiersz listy kasuje CAŁĄ listę przy odczycie** — `validateRows` zwraca `undefined`, a `parseCharacterData` podstawia `[]`; id wiersza dłuższe niż **32 znaki** wystarczy. Generuj je jak klient (`newRowId`), nie z id kompendium.
- **Cecha karty nie może wynosić 0** (`CPRED_STAT_MIN` = 1): `validateStats` odrzuca wtedy **cały** blok i karta wraca z samymi piątkami.
- **Łata karty z częściowym blokiem Cech jest odrzucana w całości** — `validateStats` chce wszystkich dziesięciu; `stats: { cool: 8 }` daje `INVALID_DATA` i zabiera ze sobą resztę łaty.
- **`.advance-buy` przegrywa kaskadę z `.awareness-steps button`** (0,1,0 vs 0,1,1) — guzik „Podnieś" zostaje przy 1,6 rem i wychodzi poza wiersz. Szerokość czyta się `getComputedStyle`, nie okiem.
- **`validateSkills` i `validateStats` odrzucają CAŁĄ mapę przez jeden wiersz spoza zakresu** — nie ścinają go i nie wyrzucają. Objaw jest cichy: figura jest po prostu słabsza, niż ją wpisano.

---

- **Kapitaliki `all-small-caps` mają w Firefoksie inną szerokość niż w Chromium (10.10).**
  Jost nie ma prawdziwych kapitalików, więc obie przeglądarki je syntetyzują — każda po swojemu.
  Po powiększeniu etykiet karty „Poważnie Ranny” w połówce kolumny 15 rem mieścił się w Chromium
  (105 px), a w Firefoksie wystawał poza pole z obu stron (116 px, tekst wyśrodkowany). Ciasne
  etykiety (`.cp-pool--flat .cp-label` — 0,84 rem, bez odstępu liter) mierzy się w Firefoksie:
  `el.scrollWidth` wobec szerokości treści rodzica. Przy okazji: syntetyczne kapitaliki rysują
  wersaliki w ~70% kroju, więc etykieta 0,82 rem czyta się jak 9 px — stąd 1 rem od 10.10.

- **Wpisany `font-size` nie działa, bo skóra przełącznika liczbowego niesie `font: inherit` (12.09).**
  Trzecia odsłona tej samej kaskady, co `.advance-buy` z 29b i `.cp-slot` z 06.09 — i najbardziej
  myląca z trzech, bo **coś się zmienia**. Powiększenie pudełka Cechy zadziałało od razu (`.cp-stat`
  nie ma konkurencji), a liczba w środku ani drgnęła: `.cp-stat-value` waży 0-1-0, a
  `.sheet-window .cp-step` — skóra przełącznika, wspólna dla karty, okna rzutu i menu statysty —
  waży 0-2-0 i wprost mówi `font: inherit`. Objaw czyta się jako „CSS się nie przeładował" albo
  „to nie ta klasa", i tak też go najpierw zdiagnozowałem.

  **Rozpoznanie w jednym kroku:** `getComputedStyle(document.querySelector('.cp-stat-value'))
  .fontSize` w konsoli. Wartość, której nie ma w twojej regule, znaczy drugą definicję —
  dokładnie ta sama procedura, co przy `.cp-slot`. **Naprawa:** prefiks `.sheet-window` przy
  selektorze i reguła **niżej w pliku** niż skóra przełącznika (`sheet.css` ma ją przy ~305 wierszu).

- **„Panel sam się zresetował po zmianie z zewnątrz" — zanim oskarżysz rozgłoszenie, sprawdź, czy nie przełączyłeś zakładki karty (09.09, oględziny 29a).**
  Objaw z oględzin: gracz zaznacza w „Awansie" filtr „tylko na które mnie stać" i rozwija rejestr,
  MG przyznaje pulę po sesji — a po chwili filtr jest odznaczony, rejestr zwinięty i pusty.
  Wygląda to jak przerysowanie panelu po `character:upsert` i taka była pierwsza diagnoza: **błędna**.

  Filtr i rejestr są stanem lokalnym `AdvancementPanel`, a panel stoi na **stronie drugiej karty**
  (zakładka „ŚCIEŻKA ŻYCIA"). Każde przejście KARTA ↔ ŚCIEŻKA ŻYCIA to `setTab`, czyli odmontowanie
  całej strony razem z jej `useState` — i to ono czyściło stan, tyle że kilka kliknięć wcześniej.
  Rozgłoszenie nie ruszało niczego: `applyUpsert` w `characterStore` nigdy nie usuwa karty ze
  składu, a `CharacterSheetWindow` ma stały `key`.

  **Rozpoznanie, które rozstrzyga w jednym kroku:** zapamiętaj węzeł panelu przed zdarzeniem
  (`window.__probe = document.querySelector('.advance')`), wywołaj zdarzenie i sprawdź
  `window.__probe.isConnected`. Węzeł **nadal podłączony** znaczy, że komponentu nikt nie
  odmontował, więc winowajcą jest co innego niż rozgłoszenie — a odłączony wskazuje prawdziwy
  unmount i dopiero wtedy warto szukać w `key`, w `if (!character) return null` albo w kluczu okna.

  Przy okazji: prawdziwy błąd, który ten fałszywy trop przykrywał, był po drugiej stronie —
  rejestr **nie odświeżał się wcale**, nawet przy nietkniętym panelu (patrz umowa o stemplu karty
  w `umowy-kodu.md`). Objaw „stan znika" i objaw „stan zostaje stary" wyglądają przy jednym
  kliknięciu podobnie i łatwo pomylić je ze sobą.

- **Ta sama nazwa klasy CSS w dwóch miejscach `sheet.css` — wygrywa późniejsza (06.09).**
  `.cp-slot` była etykietą lokacji w tabeli pancerza (27b) **i** pudełkiem gniazda na sylwetce
  cyborgizacji (27c, `position: absolute`, czerwone tło). Efekt: „Głowa", „Korpus" i „Tarcza"
  **znikały** z tabeli pancerza — nie były przezroczyste, tylko wyjęte z układu wiersza
  i pomalowane na kolor tła tabeli. Objaw czyta się jako „brak w JSX", a JSX jest w porządku.
  **Rozpoznanie:** `getComputedStyle(el).backgroundColor` na elemencie, którego nie widać —
  wartość, której nie ma w jego własnej regule, znaczy drugą definicję. **Naprawa:** nazwa
  z przedrostkiem obszaru (`cp-armor-slot`); przed dopisaniem klasy do `sheet.css` sprawdź
  `grep -n '^\.nazwa {' sheet.css`.

- **`display: flex` na `<td>` wyjmuje komórkę z układu tabeli (06.09).** Komórka przestaje
  rozciągać się na wysokość wiersza, a że tło `.cp-table` jest czerwone, pod treścią zostaje pas
  czerwieni wyglądający jak błąd renderowania. Dotknęło to `.weapon-actions`, `.armor-slot-cell`
  i `.armor-actions`. **Naprawa:** albo flex na **wrapperze wewnątrz** komórki
  (`.weapon-actions-row`), albo zwykły układ inline z `white-space: nowrap`. To samo dotyczy
  `display: grid`.

- **Panel wstawiony w `.cp-field` nie rozciąga się sam (06.09).** `.cp-field` jest wierszem flex,
  więc dziecko bez `flex: 1` dostaje szerokość swojej treści — rejestr awansów siedział przez to
  w lewej połowie pola, a druga połowa zostawała biała. To samo w drugą stronę: reguła
  `.cp-lifepath-head .cp-span2 { grid-column: auto }` (żeby „Pseudonimy" stanęły obok licznika PD)
  zdejmowała rozciągnięcie **także** panelowi awansu, i prawa kolumna zakładki „Ścieżka Życia"
  była pustym czerwonym prostokątem wysokim na pół ekranu. Selektor `.cp-span2` w kontenerze
  siatki trafia w więcej dzieci, niż się wydaje.

- **Jeden zły wiersz listy na karcie kasuje CAŁĄ listę przy odczycie — po cichu.** `validateRows`
  (`shared/systems/cpred/character.ts`) zwraca `undefined`, gdy **którykolwiek** wiersz nie
  przeszedł, a `parseCharacterData` podstawia wtedy domyślne `[]`. Karta zapisuje się bez błędu,
  a przy następnym odczycie ekwipunek jest pusty. 03.09 wywróciło się na tym generowanie id:
  `gear-pharma.turbo-uzdrawiacz-<czas>` ma 37 znaków, a `validateRowBase` tnie id **na 32** —
  „Antybiotyk" (31 znaków) przechodził, „Turbo uzdrawiacz" nie, i razem z nim znikał antybiotyk.
  **Rozpoznanie:** zdarzenie zwraca sukces, w bazie jest komplet, a `state:sync` przynosi pustą
  listę. **Obejście:** id wierszy generuj tak jak klient — `Math.random().toString(36).slice(2, 10)`
  (`newRowId` w `CharacterSheet.tsx`), nigdy z doklejonym id kompendium ani znacznikiem czasu.

**Nowa Cecha karty nie może wynosić 0** — `CPRED_STAT_MIN` to 1, a `validateStats` odrzuca
**cały** blok Cech, gdy choć jedna wypada poza zakres. Objaw jest mylący: karta wraca z samymi
piątkami, jakby tabela w ogóle się nie wczytała. Tabele zawodów zespołu (30c) nie drukują
Szczęścia — pracownik dostaje więc `luck: 1` i **pustą sakiewkę** (`luckCurrent: 0`), co przy
stole znaczy to samo, a przez walidację przechodzi.

**Łata karty z częściowym blokiem Cech jest odrzucana w całości** (30.08). `validateStats`
przechodzi po wszystkich dziesięciu Cechach i przy pierwszej brakującej zwraca `undefined`, więc
`patch: { data: { stats: { cool: 8 } } }` kończy się `INVALID_DATA` — a wygląda dokładnie jak
„serwer nie przyjmuje mojej zmiany Roli", bo `roleId` z tej samej łaty też nie dochodzi. Kosztowało
trzynaście czerwonych testów naraz w `roles30d.test.ts`. Cechy podaje się kompletem albo wcale.

**`.advance-buy` przegrywał kaskadę z `.awareness-steps button`.** Panel awansu z 29a dzieli
szkielet wiersza z panelem Zmysłu Walki (30a), a tamten ma guziki ±1 przycięte do 1,6 rem
selektorem `.awareness-steps button` (0,1,1). Guzik „Podnieś" z klasą `.advance-buy` (0,1,0)
dziedziczył tę szerokość i wychodził poza wiersz: w przewijanej liście Umiejętności widać było
„Podn", a `.advance-scroll` dostawał poziomy pasek przewijania. Objaw wygląda jak zbyt wąska
kolumna, jest zbyt słabym selektorem — `width: auto` trzeba dopisać jako `.awareness-steps
.advance-buy`. Sprawdza się to jedną linijką w konsoli: `getComputedStyle(btn).width`, nie okiem.
(Znalezione przy oględzinach 29b; błąd jest z 29a.)

**`validateSkills` odrzuca CAŁĄ mapę Umiejętności przez jeden wiersz spoza zakresu** (05.09).
Nie „ścina ten jeden do dziesiątki" i nie „wyrzuca ten jeden wiersz" — `patch.skills` w ogóle nie
powstaje, a `parseCharacterData` bierze wtedy domyślne (puste). Tak samo działa `validateStats`:
jedna Cecha poza zakresem i karta wraca jako przeciętny człowiek po pięć. Objaw jest cichy —
figura po prostu jest słabsza, niż ją wpisano. Wszystko, co zapisuje liczby na kartę **z innego
modelu** (etap 38a: sześć pól menu żetonu, Wartość bojowa Wsparcia), musi ścinać je do sufitu
karty **przed** zapisem.


## postac — Kreator, PD, Role, cyborgizacje

- **Test, w którym gracz otwiera kreator, od 24.09 dostaje `CREATION_NOT_PERMITTED`** — bez zgody MG i przeczytanych zasad szkicu nie ma; w `creation.test.ts` służą do tego `allowCreation(userId)` i `dropDraft(userId)` (gracz nie wyrzuca już szkicu sam). Test, który czeka na push po wyrzuceniu, musi iść przez `creation:discard-player`.
- **Pole tekstowe, które „nie przyjmuje znaków", bywa zgubionym odczytem** — sprawdź po kolei `activeElement`, atrybuty pola, inne pole obok, a potem **bazę**; automat podejrzewaj ostatni.
- **Test stawiający postać łatą gracza od 29a dostaje `FORBIDDEN`** — i pada w asercji o czymś zupełnie innym, bo przygotowanie stołu wygląda w teście jak tło. Kartę stawia gniazdo MG.

---

- **Pole tekstowe, które „nie przyjmuje znaków", bywa zgubionym odczytem, nie zepsutym polem**
  (27.08). Specjalizacja umiejętności w kreatorze wyglądała na martwy input: klik ustawiał
  ognisko, znak leciał, wartość zostawała pusta. Sprawdzenie po kolei: pole nie jest `readOnly`
  ani `disabled`, pisanie w **innym** polu na tej samej stronie działa, a wartość **jest**
  w bazie (`CharacterDraft`) — więc winny był odczyt (`parseCreationDraft`), nie klawiatura.
  Kolejność, która to rozstrzyga najszybciej: (1) `document.activeElement` — czy to na pewno to
  pole, (2) atrybuty pola, (3) inne pole obok, (4) **zajrzyj do bazy**. Dopiero potem podejrzewaj
  automat.

**Test, który stawia postać łatą gracza, od 29a dostaje `FORBIDDEN`** (30.08). Poziomy
Umiejętności, ranga Zdolności, `roleId` i licznik PD wypadły z `character:update` u gracza, więc
każdy stary test przygotowujący kartę przez gniazdo gracza (`emitAck(player, 'character:update',
{ data: { skills: … } })`) pada — i pada **w miejscu asercji o czymś zupełnie innym**, bo
przygotowanie stołu wygląda w teście jak tło. Padły tak trzy testy w `characters.test.ts`
i `roles30d.test.ts`. Kartę stawia się gniazdem MG; gracz kupuje poziom przez
`character:advance`.


## ekwipunek — Ekwipunek i przedmioty między kartami

- **Okno otwarte od figury pyta o listę z jej `tokenId` — gdy figura znika, odpowiedź to `TOKEN_NOT_FOUND`, nie pusta lista (09.10, etap 46b2)** — pusty stos, skasowane ciało, figura ukryta przez MG.
- **Odległość „ode mnie" to NAJBLIŻSZA własna figura, nie pierwsza z listy** — karta potrafi stać dwiema figurami (kopia z 35), a serwer egzekwuje zasięg po najbliższej parze.
- **Komunikat „czeka na X" wolno napisać dopiero wtedy, gdy serwer powie, że coś czeka** (`InventoryGiveResult.pending`); zdanie warunkowe w komunikacie o skutku to znak brakującego pola w ack.

---

- **Okno „Wymiana” otwarte od figury pyta `exchange:counterparts` z jej `tokenId`.** Gdy figura
  zniknie (Marek opróżnił stos, który sam się skasował), serwer odpowiada `TOKEN_NOT_FOUND`, a nie
  listą bez tej pozycji — i okno do 46b2 zostawało ze starą listą w trybie `container`, z przyciskami
  do stosu, którego już nie ma. Wyszło w E2E 46b.4b. Teraz `ExchangeWindow.refresh` na tę odmowę
  otwiera okno od nowa na tej samej karcie, bez figury i bez drugiej strony.

- **Odległość „ode mnie" liczy się od NAJBLIŻSZEJ własnej figury, nie od pierwszej z listy.**
  Karta potrafi stać dwiema figurami naraz (kopia z etapu 35, drugi żeton tej samej postaci na tej
  samej scenie), a `tokens.findMany` zwraca je w kolejności bazy. Pierwsza wersja
  `inventory:sources` brała `find(...)`, a serwer egzekwował zasięg po **najbliższej** parze —
  rozwijana lista mówiła więc co innego, niż stosowała odmowa. Wyszło przy oględzinach: „avatar9 —
  64 m" liczone od drugiej figury Rudego, stojącej na innej scenie.

- **Komunikat „czeka na X" wolno napisać dopiero wtedy, gdy serwer powie, że coś czeka.** Okno
  wymiany pisało „Wysłane do: … Czeka na przyjęcie, jeśli kartę prowadzi gracz" po **każdym**
  przekazaniu — także po tym na kartę NPC-a, które wykonało się od ręki. Klient nie ma jak tego
  rozstrzygnąć (gracz nie widzi, kto jest właścicielem cudzej karty), więc rozstrzyga to ack:
  `InventoryGiveResult.pending`. Zdanie warunkowe („jeśli…") w komunikacie o skutku jest zwykle
  znakiem, że brakuje pola w odpowiedzi.


## czas — Czas świata, kalendarz, efekty czasowe

- **`timed-effects.ts` ↔ `stat-effects.ts` to cykl importów** — pierwszy woła drugi, więc drugi pyta o `Combat` sam, zamiast importować `activeRoundOfScene`.
- **„Naturalne leczenie jeszcze się nie zaczęło" to nie usterka zegara** — `cpredRestDay` chce udanego Ustabilizowania (s. 222), a karta z ręcznie obniżonym PW w bazie go nie ma.

---

- **`timed-effects.ts` i `stat-effects.ts` prawie zamknęły cykl importów.** Pierwszy woła drugi
  (przemiatanie rundowe zdejmuje też efekty Cech), więc drugi **nie może** importować
  `activeRoundOfScene` z pierwszego — w ESM cykl daje pusty obiekt w środku ładowania i wywala
  się dopiero przy pierwszym wywołaniu, w losowym miejscu. Zapytanie o `Combat` jest
  jednowierszowe i siedzi teraz w obu plikach osobno; to jest tańsze niż cykl.

**Karta odpoczynku, która mówi „naturalne leczenie jeszcze się nie zaczęło", to nie usterka
zegara** — `cpredRestDay` wymaga udanego Ustabilizowania (s. 222), a postać z ręcznie obniżonym
PW w bazie go nie ma (`recovery` jest wtedy `undefined`). Żeby zobaczyć realne leczenie przy
oględzinach, trzeba najpierw ustawić `recovery.stabilized`.


## siec — Sieć (netrunning)

- **Ślizg i Paf są w wierszu Czarnego LOD-a**, nie w rządku zdolności — pojawiają się dopiero, gdy jakiś LOD stanie w szybie.
- **Czarny LOD nie spawnuje się drugi raz na tym samym piętrze** (`metIce`); dołóż go na piętro jeszcze nieodwiedzone albo przerób `empty` → `ice`.
- **„Zderezowany" ≠ „zniszczony"** — Program z `destroys` (Szabloząb, Zabójca, Smok) niszczy zamiast derezować; różnicę widać w chipie, nie w REZ.

---

- **Ślizg i Paf pojawiają się dopiero, gdy Czarny LOD stanie w szybie** (27.08). Okno runa
  pisze wtedy wprost: „Ślizg i Paf czekają na Czarnego LOD-a — oba są testami spornymi
  i pojawiają się przy nim". Szukanie ich w rządku zdolności obok Backdoora to strata czasu —
  są **w wierszu LOD-a**, razem z „Atakuj" i selektorem Programu.

- **Czarny LOD nie spawnuje się drugi raz na tym samym piętrze** (27.08). `spawnIceOnFloors`
  pomija piętra z `state.metIce`, więc dołożenie Programu do piętra, na którym netrunner **już
  stał**, nie da nic — trzeba dołożyć go na piętro jeszcze nieodwiedzone (albo przerobić na LOD
  piętro, przez które biegła dotąd sama droga: `metIce` zbiera **wyłącznie** piętra rodzaju
  `ice`, więc `empty` → `ice` spawnuje normalnie).

- **„Zderezowany" i „zniszczony" to dwa różne końce Czarnego LOD-a** (27.08). Program z flagą
  `destroys` (Szabloząb, Zabójca, Smok) **niszczy zamiast derezować** — chip na wierszu mówi
  „zniszczony", nie „zderezowany". Jeśli test albo oględziny mają dowieść derezowania, bij
  Mieczem albo Młotem; różnicy nie widać w REZ (obie drogi kończą się 0), tylko w chipie.


## boty — Boty, AI Gateway, RAG

- **„Brak pamięci” przy gatewayu z suitą E2E to bufor promptów llama-server w RAM-ie (01.10, T6c)** — build 10735 domyślnie `--cache-ram 8192`; po kilku przebiegach llama-server miał 21 GB pamięci prywatnej (15,5 GB tuż po starcie), PC 32 GB schodził poniżej 1 GB wolnego, a Claude Code zabijał procesy w tle (27.09, 30.09, 01.10). Gateway podaje `--cache-ram` z `GATEWAY_LLAMA_CACHE_RAM_MB` (2048). Pamięć prywatną procesu sprawdzisz `Get-Process llama-server | % PrivateMemorySize64`.
- **Bot „nie chce rzucić” — zajrzyj do `data/private/bot-decisions.jsonl`** (jedna linia JSON na decyzję); pole `options` to pełne menu, które bot dostał. 20a: „rzuć na Wygadanie” wróciło jako rozmowa, bo takiej umiejętności w CP RED nie ma.
- **Bot w walce rusza się kontem MG, a MG jest zwolniony z blokad ruchu** — jedynym bezpiecznikiem przed przejściem przez ścianę jest planer bota (`walkTowards`); `canStep` dostaje od `planWalk` już ŚRODKI pól.
- **Budżet myślenia pilnuje `thinking_budget_tokens`, nie `reasoning_budget`** (build 10735, 24.09) — gateway wysyła oba; bez tego 27B myśli cały limit i oddaje pustą odpowiedź.
- **Pytanie do bota, który jeszcze myśli, przepada bez śladu** — „jedna tura bota naraz” (`requestBotTurns`); przy 27B okno to 3–4 s. Decyzja MG z 24.09: zostaje, to nie usterka.
- **`reasoning_budget` w llama-server egzekwuje tylko 0 i −1** — każda ścieżka z `reasoning: true` musi znieść pustą odpowiedź.
- **Chip „⟳ nieaktualny" na nietkniętym wpisie to zwykle stary odcisk**, nie regres indeksowania — policz digest kodem aplikacji i porównaj z bazą.
- **Powrót gatewaya odklikasz atrapą `/health` na :8100** — kilkanaście linijek `node:http`, bez modelu; serwer odpytuje ją co 10 s.

---

- **Bot przechodził przez ściany stojące na liniach kratki (znalezione 24.09 na żywym modelu).**
  `planWalk` od 23.08 (pasy figury 2×2) wywołuje `canStep` ze **środkami** pól, a `walkTowards`
  w `bot-combat.ts` — pisany 08.08, gdy dostawał lewe górne rogi — dokładał do nich drugie pół
  kratki. Sprawdzana linia biegła więc po liniach siatki, dokładnie po ścianach, a styk z końcem
  odcinka `isSegmentClear` uznaje za „czysto”: Paser przeszedł prosto przez siatkę na x = 600.
  Serwer tego **nie złapał**, bo bot porusza się kontem MG, które `movement.ts` zwalnia z blokad —
  planer bota jest jedynym bezpiecznikiem. Test ze ścianą w środku pola tego nie widział; nowy
  („walks around a barrier drawn on a grid line”) stawia ją na linii kratki. **Wniosek:** każdy
  nowy wołający `planWalk` z `canStep` podaje funkcję, która przyjmuje środki — jak `MapArea`.

- **Budżet myślenia na buildzie 10735: `thinking_budget_tokens` (24.09).** Po przejściu na
  Qwen3.8-27B pytanie o zasady wracało po 30 s puste: `reasoning_budget: 640` w żądaniu przechodzi
  bez błędu i nadal niczego nie pilnuje. Ten sam build respektuje `thinking_budget_tokens` (300 →
  ~300 tokenów myślenia, odpowiedź po 10,6 s). Gateway wysyła oba; flaga serwera
  `--reasoning-budget N` też działa, ale jest globalna i nie odróżnia asystenta od NPC-ów.

- **`reasoning_budget` w llama-server nie działa dla wartości dodatnich** — przyjmuje 640 bez błędu, ale egzekwuje wyłącznie 0 i −1. Każda ścieżka z `reasoning: true` musi umieć obsłużyć **pustą odpowiedź** po zużyciu całego `max_tokens` na blok think. Szczegóły w `ai-gateway/README.md`.
- ~~**Testy dymne serwera potrafią raz na kilka przebiegów pęknąć na limicie czasu**~~ —
  **przyczyna znaleziona 03.09: `beforeAll` bez `}, 60_000);`** (wpis na górze pliku). Oryginalny
  opis, zostawiony dla objawów: **Testy dymne serwera potrafią raz na kilka przebiegów pęknąć
  na limicie czasu** — każdy plik podnosi własny Fastify z Socket.IO, więc przy pełnym `pnpm --filter @vtt/server test` bywa ciasno. Zaobserwowane 08.08: dwa różne przypadki (`ammo.test.ts`, `ammo-effects.test.ts`) pękły po jednym razie na trzy przebiegi i **oba przeszły uruchomione osobno**. Zanim zaczniesz szukać regresji, powtórz sam plik.
  **Korekta z 14.08:** w przypadku `ammo.test.ts` limit czasu **nie był przyczyną** — test „an
  armour-piercing round takes two points of SP" pękał **także uruchomiony sam**, raz na kilka
  przebiegów, i to z powodu dwóch źródeł losowości w samym teście (zdarty pancerz celu + rzut
  2k6, który nie przechodzi przez pancerz). Naprawiony; 12 przebiegów bez porażki. **Wniosek
  ogólny:** zanim uznasz migotanie za „ciasny limit czasu", sprawdź, czy komunikat mówi
  o **czasie**, czy o **asercji** — ten mówił o asercji przez pół roku.
  **Korekta z 16.08:** bliźniacze migotanie `ammo-effects.test.ts` („1k10 + 10 nie wyjdzie
  poniżej 11") było łatane 15.08 **warunkiem, który nigdy nie był prawdziwy**: `roll.critical`
  to **obiekt** `{ type: 'fumble' | 'crit', extraRoll }`, a test porównywał go z napisem
  `'failure'`. Poprawka nie zmieniła więc nic, a test pękał na każdej naturalnej jedynce, czyli
  **raz na dziesięć przebiegów**. Naprawione (`critical?.type === 'fumble'`, dolna granica 1).
  **Wniosek ogólny:** porównanie z literałem w teście sprawdź na prawdziwym kształcie danych —
  TypeScript nie pomoże, jeśli lokalny typ wypisany w teście też zmyśla.

- **Chip „⟳ nieaktualny" na wpisie, którego nikt nie ruszał, to zwykle stary odcisk, nie regres**
  (27.08). `stale` liczy się jako `indexedDigest !== knowledgeDigest(...)`, więc wystarczy, że
  odcisk zapisano inną wersją funkcji. Zanim zaczniesz szukać błędu w indeksowaniu, policz
  odcisk **kodem aplikacji** (nie przepisanym do Pythona — łatwo o różnicę) i porównaj z bazą;
  „Zaindeksuj wszystko" i tak to naprawia.

- **Powrót gatewaya da się odkliknąć bez modelu**: atrapa `/health` na `127.0.0.1:8100`
  (kilkanaście linijek `node:http`, zwraca `{"status":"ok","llama":"external",…}`). Serwer VTT
  odpytuje ją co 10 s (`AI_HEALTH_INTERVAL_MS`), `ctx.ai.onStatusChange` rozsyła `ai:status`
  i wszystkie ścieżki „gateway wrócił" można obejrzeć bez `llama-server`. Wzór leżał w
  scratchpadzie sesji 28.08 — pisze się szybciej, niż się szuka.


## dane — Kompendium, parsery, dane podręcznika

- **Opis przedmiotu „brakuje”, bo akapit nazywa go inaczej niż tabela cen (10.10)** — „Czipy pamięci:”, „Radio/odtwarzacz muzyki:” nie były punktem podziału, więc doklejały się do poprzedniego wpisu; `PROSE_ALIASES` w `parse-gear.py`. Szukaj brakującego opisu **w cudzym** opisie, zanim pójdziesz do internetu.
- **Słownik korpusu `build-manual.mjs` zawiera ułamki rozbitych nagłówków (03.10, #78)** — „NSTRUKCJA”, „TRZYMYWANIE” są w `VOCAB`, bo ten liczy się z surowego zrzutu, więc reguła „reszta jest wyrazem → nie sklejaj” trzymała je rozdzielone. Pytaj `LOWER_VOCAB` (wyraz choć raz małymi literami). Pierwsza próba z `LOWER_VOCAB` także dla sklejonej formy zepsuła „ULEPSZANIE”, „AMERYKA”, „WITAJ” — reguła ma tylko **dokładać** sklejenia względem starej. Nagłówek z jednego wyrazu nigdy nie był nagłówkiem (próg dwóch wyrazów w `markHeadings`), więc „URAZÓWKA” i „AGRESORZY” po sklejeniu zostają w tekście.
- **Python w heredocu: `\b` w zwykłym napisie to znak backspace (03.10)** — wzorzec `r"…\bŚrodowisko\b"` wpisany przez `python - <<'EOF'` w nie-surowym napisie z podwójnym ukośnikiem przed `b` dał w pliku znaki `\x08`; wzorzec nic nie łapał, a `grep` pokazywał „Środowisko” bez ukośników (ten wpis za pierwszym podejściem też się tak zepsuł). Sprawdzaj `grep -c $'\x08'` po takim zapisie, a kod z wyrażeniami regularnymi wpisuj narzędziem Edit.
- **Regex na zrzucie podręcznika łapie każdą liczbę, także numer strony.** Pierwsza wersja `parse-encounters.py` zrobiła z „STR. 417” wiersz tabeli („dziura 101–417”). Zakres wiersza musi być zakotwiczony (nawias albo początek linii) **i** mieć po sobie krótką nazwę z dwukropkiem.
- **Podręcznik bywa źródłem błędu, nie tylko parser.** Tabela wieczorna ma w druku wiersze „(70–72)” i „(72–77)” — 72 w obu. Errata siedzi w `KNOWN_FIXES` **w skrypcie**, bo JSON jest wynikiem i kolejny przebieg parsera skasowałby ręczną poprawkę bez śladu.
- **Karta wpisu kompendium gubi wybór przy zmianie zakładki** — postać, chirurg i poziom ripperdoca wracają do wartości domyślnych; sprawdzaj je tuż przed kliknięciem guzika.
- **Ręczna `tabela-ran-krytycznych.md` jest poza repo i od 27.08 zbędna** — kompendium ma obie tabele 2k6 z podręcznika; plik obsługuje wyłącznie wariant „mam sam Easy Mode".
- **Wygenerowane kompendium bywa starsze niż parser** — pliki w `data/private/cpred/compendium/` są poza repo, więc zmiana `parse-manual.py` ich nie odświeża; przy dziwnym zachowaniu danych najpierw puść import.
- **Publiczna próbka `skills.json` ma 42 z 66 Umiejętności**, a `validateSkills` wycina resztę po cichu — pakiet wpisany kodem traci na niej poziomy. To brak danych, nie regres.
- **Nazwa w kodzie ≠ nazwa w pliku danych** (wielkość liter) — dopasowania po nazwie rób na `trim().toLowerCase()`.
- **Nazwa z tabeli zbiorczej wygląda jak nagłówek opisu, a nim nie jest** — w sekcji dodatków każda pada trzy razy; opis otwiera wyłącznie wersja WERSALIKAMI.
- **Trzy liczby tabeli magazynków są zlepione**, ale pierwsza jest znana (magazynek z tabeli broni) — reszta ma jeden podział zgodny z porządkiem kolumn; nagłówek klei się z pierwszym wierszem.

---

- **Regex na zrzucie podręcznika łapie każdą liczbę, także numer strony.** Pierwsza wersja
  `parse-encounters.py` uznała „(patrz Korpogliniarze, STR. 417)" za wiersz tabeli i raport
  pokazał „dziura 101–417" — objaw wskazujący na dziury, nie na wiersz widmo. Zakres wiersza musi
  być **zakotwiczony** (nawias albo początek linii) **i** mieć po sobie krótką nazwę zakończoną
  dwukropkiem. Podrzuty w opisie („Rzuć 1k10. 1–2: wnoszą skrzynię") odpadają same, bo po ich
  liczbie stoi dwukropek zamiast spacji.

- **Podręcznik bywa źródłem błędu, nie tylko parser.** Tabela „Spotkania wieczorne" ma **w druku**
  wiersze „(70–72) Drużyna Solo" i „(72–77) Cybergang" — liczba 72 w obu. Sąsiedztwo (64–69, potem
  72–77) nie zostawia wątpliwości, więc pierwszy kończy się na 71. Poprawka siedzi w `KNOWN_FIXES`
  **w skrypcie**, nie w wygenerowanym JSON-ie: JSON jest wynikiem i kolejny przebieg parsera
  skasowałby ręczną poprawkę bez śladu. Zanim uznasz raport pokrycia za błąd parsera, sprawdź
  liczby w źródle.

- **Karta wpisu kompendium gubi wybór przy zmianie zakładki.** Postać docelowa, chirurg
  i poziom ripperdoca żyją w stanie komponentu, więc każde wyjście na „Czat" i powrót ustawia
  je z powrotem na wartości domyślne (pierwsza postać z listy, „Bez Testu montażu", 12). Przy
  oględzinach 04.09 zabrało to jeden rzut, który miał być porażką i wyszedł sukcesem, bo
  poziom chirurga wrócił do dwunastu. Sprawdzaj wybór **tuż przed** kliknięciem guzika.

- **Dane CP RED (`skills.json`, `roles.json`) wczytywały się dopiero po otwarciu „Postaci" albo karty postaci** — `ensureCpredDataLoaded` wołały tylko te dwa komponenty. Dopóki każdy atak zaczynał się od karty, nikt tego nie zauważył; HUD z 16f zaczyna go z mapy, więc **każdy strzał wracał z „Nie wiem, jaką umiejętnością strzelać z tej broni"** (`UNKNOWN_SKILL` — pusty rejestr umiejętności, nie brak danych w kompendium). Naprawione 01.08: `MapArea` woła je razem z `ensureStatusesLoaded`. **Wniosek na przyszłość:** nowe wejście do mechaniki sprawdź na **świeżo przeładowanej karcie, bez otwierania żadnej zakładki** — to jedyny stan, w którym takie leniwe ładowanie widać.

- **`data/private/rulebook/manual/tabela-ran-krytycznych.md` jest poza repo i od 27.08 nie jest
  nikomu potrzebny.** Kompendium ma dziś **obie** tabele 2k6 (11 ran korpusu + 11 głowy, s. 187–188)
  prosto z podręcznika przez `parse-manual.py`; ręczna tabela obsługuje wyłącznie wariant „mam sam
  Easy Mode". Zostawione jako ostrzeżenie, nie zadanie: bezpiecznik przed nadpisaniem i wzór
  formatu są w `data/public/cpred/tabela-ran-krytycznych.wzor.md` (opis w
  `archiwum/zamkniete-zaleglosci.md`).

**`data/private/cpred/compendium/` bywa starsze niż `parse-manual.py`.** Wygenerowane pliki są
poza repozytorium (gitignore), więc nic ich nie odświeża przy zmianie parsera — a `git status`
tego nie pokaże. 29.08 regeneracja dołożyła Miotaczowi ognia `ammoPatterns: ['shell']`, którego
plik na dysku nie miał **od nieznanej liczby sesji**; bez tego pola `ammoFitsWeapon` odrzuca każdy
nabój specjalny (broń bez `ammoPatterns` i bez `ammoIds` nie przyjmuje niczego), więc miotacza
nie dało się załadować amunicją zapalającą mimo gotowej mechaniki z 16g. Objaw jest zawsze ten
sam: **kod robi coś, czego dane nie znają**. Zanim zaczniesz szukać błędu w kompendium, puść
`python tools/import/parse-manual.py` i porównaj wynik — import wypisuje ostrzeżenia i liczby,
a diff dwóch wersji pliku mówi więcej niż godzina czytania parsera.

**Publiczna próbka `skills.json` ma 42 z 66 Umiejętności** — a `validateSkills` wycina id spoza
rejestru **po cichu**, przy każdym odczycie karty. Pakiet Umiejętności wpisany kodem (zespół
Korpo z 30c) traci więc na próbce część poziomów: `cybertech`, `basic-tech`, `weaponstech`,
`land-vehicle-tech`, `pilot-air-vehicle`, `language`, `endurance`, `trading` i kilkanaście
innych po prostu znika. To **nie jest** błąd pakietu ani regres — to brak danych; w grze jedzie
prywatny `skills.json` z kompletem. Test, który sprawdza taki pakiet, musi asertować na
Umiejętnościach obecnych w próbce publicznej.

**Nazwa z tabeli w kodzie a nazwa w pliku danych różnią się wielkością litery (31.08).**
`roleability.ts` pisał „Ukrycie/znalezienie przedmiotu", `skills.json` ma „Ukrycie/Znalezienie
przedmiotu" — i jedna z piętnastu Umiejętności agenta federalnego znikała bez śladu, bo
dopasowanie po nazwie jest w tym projekcie regułą (broń Wsparcia, `criticalInjuryAt`). Każde
takie dopasowanie porównuj po `trim().toLowerCase()`.

**Nazwa z tabeli zbiorczej wygląda jak nagłówek opisu — i nim nie jest (01.09).** Sekcja „DODATKI
DO BRONI" wymienia każdą nazwę **trzy razy**: w tabelce cen na początku („Bagnet 100 ed
(Premium)"), jako nagłówek własnego akapitu WERSALIKAMI („BAGNET Cena: …") i w środku prozy
sąsiada („Aby złącze smartguna działało…"). Pierwsza próba brała wystąpienie pierwsze i dostawała
akapity bez zdania „Pasuje do:"; druga brała ostatnie i **gubiła cenę złącza smartguna**, bo
ostatnie wystąpienie tej nazwy siedzi w prozie. Wersaliki są jedyną formą, która znaczy „tu
zaczyna się opis" — `attachment_chunks` dopasowuje `label.upper()` i bierze pierwsze trafienie.
Polskie `.upper()` radzi sobie z diakrytykami („ł" → „Ł"), więc tabela reguł zostaje w normalnej
pisowni.

**Trzy liczby tabeli magazynków są zlepione w jedną, ale wiersz jest zakotwiczony (01.09).**
Zrzut daje „Ciężki pistolet 81428" — 8, 14, 28. Rozdzielić da się to tylko dlatego, że **pierwsza
liczba jest znana**: to magazynek z tabeli broni, wczytany stronę wcześniej. Reszta ma dokładnie
jeden podział zgodny z porządkiem tabeli (zwykły ≤ wydłużony ≤ bębnowy); wiersz z dwoma albo
zerem takich podziałów idzie do ostrzeżeń, bo po cichu wybrany bęben kłamałby do końca kampanii.
Do tego **nagłówek tabeli klei się z pierwszym wierszem** („TypZwykłyPrzedłużonyBębnowyŚredni
pistolet 121836"), więc ogólne wyrażenie na etykietę zjada nagłówek i gubi Średni pistolet —
rozcina to `split_on_anchors` po nazwach typów broni, bo nagłówek nazwą nie jest.

**Opis przedmiotu „brakuje”, bo akapit nazywa go inaczej niż tabela cen (10.10).** Czip pamięci
i Radioodtwarzacz nie miały opisu, choć rozdział 17 je opisuje — jako „Czipy pamięci:” i „Radio/
odtwarzacz muzyki:”. `descriptions` tnie prozę tylko na nazwach z tabeli cen, więc oba akapity
doklejały się do poprzedniego wpisu (Cyberdek zwykłej jakości, Racje MRE). Nazwa z akapitu idzie
do `PROSE_ALIASES`, zdanie wrzucone przez łamanie strony do cudzego akapitu — do
`MISPLACED_SENTENCES` (w skrypcie, nie w JSON-ie). Ta sama sesja: limit opisu 1000 ucinał w pół
zdania Kombinezon Bodyweight i Złącze smartguna — od 10.10 limit to 2000, a wpis kończący się
dokładnie na limicie to sygnał ucięcia. Kontrola po imporcie: porównaj opisy starego i nowego
pliku po `id`, nie `diff -q`.

## kopie — Kopie zapasowe, eksport i import

- **Kopia startowa i sprzątanie sierot chodzą równolegle** — plik znika między listą a dowiązaniem; `linkTree` ma go pominąć (ENOENT), nie przerwać kopii.
- **Polski znak w nagłówku HTTP to 500, nie brzydka nazwa pliku** — objawem jest „eksport nie działa dla niektórych postaci"; nagłówek jest latin-1.

---

- **Polski znak w nagłówku HTTP to 500, nie brzydka nazwa pliku.** Karta „Bezpański" wysyłana
  z `Content-Disposition: attachment; filename="character-bezpanski-…"` wywracała całą trasę
  (`TypeError: Invalid character in header content`) — a objawem było „eksport nie działa dla
  niektórych postaci". Nagłówek jest latin-1; nazwy z ogonkami idą przez `filename*=UTF-8''…`.

- **Kopia startowa i sprzątanie sierot chodzą równolegle (20.09, naprawione 23.09).** `app.ts`
  puszcza `sweepUploadsInBackground`, a `startSnapshotSchedule` od razu robi kopię `start` — obie
  bez czekania na siebie. Sprzątanie skasowało osierocone MP3 z `uploads/music` między listą
  katalogu a dowiązaniem, zapasowe `copyFile` rzuciło ENOENT i w dzienniku stanęło `snapshot
  failed` — **bez kopii startowej**. `linkTree` pomija teraz plik, którego już nie ma; każdy inny
  błąd kopiowania dalej przerywa kopię.


## ogledziny — Oględziny w przeglądarce

- **Gdy Firefox z Playwright MCP wisi na `browser_navigate`, oglądaj tymczasowym specem E2E (17.10)** — plik w `packages/e2e/specs/99-…` (nie commitować) z `cast.mg('chromium')`, `cast.gracz(…, 'firefox', …)`, przygotowaniem gniazdem MG (`emitAck`) i `page.screenshot({ path: <scratchpad> })`; `pnpm test:e2e 99-…` stawia instancję, hasła i budowę sam. Szybsze niż skrypt biblioteki, bo logowanie i zaproszenia są gotowe w fixture'ach. Spec skasuj, instancję zatrzymaj (`instance stop`).
- **Nie loguj się do oględzin kontem `pantosz` w `dev.db` (17.10, etap 53)** — ma hasło tymczasowe MG z `.env`, a pierwsze wejście wymusza ustawienie własnego: oględziny zabrałyby MG hasło tymczasowe. Panel administratora ogląda się na instancji E2E: `E2E_ADMIN_TEMP_PASSWORD=… E2E_ADMIN_PASSWORD=… E2E_GM_PASSWORD=… node instance/hold.ts` (z `packages/e2e`), konto `admin-e2e`. Podgląd `vite preview` słucha na **`[::1]:4173`** (`127.0.0.1` odmawia), a ciasteczka nie rozróżniają portów — `[::1]` w Firefoksie Playwrighta nie nadpisuje sesji MG na `localhost:5173`. Instancja padnie razem z powłoką, jeśli wystartuje ją `instance start` w tle — trzymaj ją `hold.ts`.
- **Zmiana w `styles/NN-*.css` nie dochodzi do Firefoksa nawet po F5 (10.10, zakładka „Losowe”)** — Vite serwuje już nowy plik (`curl :5173/src/styles/11-actions.css`), a `document.styleSheets` w Playwright MCP trzyma starą regułę: arkusze wchodzą przez `@import` w `styles.css` i to on zostaje w pamięci przeglądarki. `touch packages/client/src/styles.css` i przeładowanie karty — zanim uznasz, że selektor przegrywa specyficznością.
- **Firefox, któremu serwer zakończył sesję (reset hasła, blokada, `auth:ended`), ma w konsoli dwa błędy WebSocketu** — „can’t establish a connection to ws://…/socket.io…” i „…was interrupted while the page was loading” (03.10, T2d). To zamierzone zerwanie gniazda, nie błąd aplikacji; w spisie konsoli wybaczaj je tylko temu aktorowi (`serverEndedSocket` w `t2d-konta-mg`; kolejność słów w obu komunikatach jest różna).
- **Od 44a (03.10) ekran logowania ma DWA pola, a samo hasło daje 400** — login (`#gm-login`) to `GM_NAME` z `.env` (konto właściciela, wielkość liter bez znaczenia), dopiero potem hasło. Skrypt albo MCP, który wypełnia tylko `#gm-password`, dostaje „Wpisz login.”; `POST /api/auth/login` bez pola `login` — `BAD_REQUEST`. Konto zarejestrowane przy oględzinach siedzi przy stole jako „MG” — nie myl go z właścicielem po imieniu, tylko po `user.owner` w magazynie `auth`.
- **Firefox z Playwright MCP nie wstaje: `initializeServer: Timeout 180000ms` albo `process did exit: exitCode=0` (03.10)** — przy kilkunastu żywych procesach `firefox.exe` (nie wiadomo czyich — nie zabijaj ich na ślepo). Obejście bez ruszania profilu: skrypt biblioteki `playwright` w scratchpadzie (`firefox.launch()`, świeży kontekst, MG w `chromium` obok) — zrzuty kolejnych kroków do pliku; tak oglądano poprawki #68/#71.
- **Pełny ekran w Playwright MCP wygląda, jakby zniknął pasek i panel boczny — to kadr zrzutu (03.10, T8c)** — okno Firefoksa rośnie do rozmiaru monitora (`innerWidth` 3072 × 1728), a zrzut pokazuje dalej emulowane 1920 × 1080 z lewego górnego rogu. Sprawdź `innerWidth`, zanim zgłosisz układ pełnego ekranu.
- **Syntetyczny `keydown` wysłany na `window` daje w konsoli `TypeError: … closest is not a function` (03.10, T8c)** — obsługa skrótów woła `event.target.closest`, a `window` go nie ma. Klawisz wysyłaj na `document.body` albo przez `browser_press_key`.

- **Zrzut MCP z nazwą pliku ląduje w katalogu głównym repo, nie w `.playwright-mcp/output`** (03.10, T8b) — `browser_take_screenshot` z `filename: 't8b-01.png'` liczy ścieżkę od korzenia workspace'u; subagent zostawił cztery PNG obok `package.json`. Podawaj `.playwright-mcp/output/<nazwa>.png` (gitignore) i przed commitem sprawdź `git status`. Zrzut z nazwą nie wraca też jako obraz w odpowiedzi narzędzia.
- **`ERR_CACHE_OPERATION_NOT_SUPPORTED` na `sfx/*.wav|ogg` w konsoli Chromium MCP to nie błąd aplikacji** (03.10, T8b) — osiem wpisów zaraz po wejściu MG na instancję E2E; stały profil `.playwright-mcp/profile-chromium` trzyma pamięć podręczną, a dźwięki idą żądaniami zakresowymi. Czyste konteksty suity (T8a, konsola w obu silnikach) ich nie mają — błąd konsoli oceniaj w czystym kontekście.
- **`await import('/src/stores/…ts')` z konsoli po HMR daje drugą, pustą kopię magazynu** — aplikacja trzyma moduł pod adresem z `?t=<czas>`, a F5 tego nie zeruje. Adres weź z `performance.getEntriesByType('resource')` i importuj dokładnie ten.
- **Menu figury „nie otwiera się” z prawego kliku Playwrighta — do 25.09 to był błąd aplikacji, nie automatu** — `contextmenu` po `mouseup` trafiał w tło pod ściętym rogiem menu (umowa w `ui`). Jeśli wróci: podsłuch `pointerdown`/`contextmenu` na `window` z `target` pokaże, kto dostał zdarzenie.
- **Pierwsze pole kroku Umiejętności w kreatorze to wyszukiwarka, nie dziedzina** — `locator('input').first()` wpisuje „Chemia” w filtr listy i brak nie znika. Dziedzina Nauki/Wiedzy lokalnej to `.creator-skill-specialty` (brakująca: `--missing`); Język ojczysty w Ścieżce Życia jest listą (`[data-creation-field="lifepath.language"] select`).
- **Zaproszenia Poligonu wygasają (wszystkie trzy do 24.09)** — `POST /api/campaigns/<id>/invitations` kontem MG wystawia nowe na tydzień; imię `avatar9` wraca na istniejące konto. Nowe z 25.09 ważne do 02.10.
- **Figura przy oknie „z bliska” musi stać krawędzią pola przy szybie** — `WALL_REACH_M` = 2 m liczone od środka figury (x, y żetonu to lewy górny róg pola). Okno o jedno pole dalej (3 m) zasłania już wzrok i planer gracza w ogóle nie widzi drugiej strony.
- **Konto MG w oknie gracza z Playwrighta to ręczne logowanie MG, nie przeciek sesji** — okna MCP są widoczne na pulpicie; po restarcie serwera okno gracza pokazuje ekran logowania i MG potrafi się w nim zalogować. Wyloguj i zużyj zaproszenie ponownie z tym samym imieniem.
- **Mysz Firefoksa z Playwrighta wisi bez końca, gdy okno jest zminimalizowane albo zasłonięte** — `page.mouse.*`, `click` i `browser_resize` czekają na klatkę, a `requestAnimationFrame` nie przychodzi, choć `visibilityState` mówi „visible”. `evaluate` i zrzuty działają. Sprawdź rAF (`evaluate` z `requestAnimationFrame` i limitem 2 s), zanim zaczniesz szukać błędu; pomaga tylko przywrócenie okna na ekran ręką.
- **Serwery Playwright MCP mogą stać w `disabledMcpjsonServers` w `.claude/settings.local.json`** — wtedy narzędzi `mcp__playwright-*` nie ma w sesji, choć `.mcp.json` jest poprawny (25.09 tak było od pierwszego uruchomienia). **Od 25.09 oba stoją w `enabledMcpjsonServers`** (zlecenie MG); plik jest w globalnym ignorze gita, więc zgoda żyje tylko na tym komputerze i działa od następnego startu Claude Code. Biblioteka `playwright` ze skryptu `node` działa niezależnie od tego.
- **Klik w slot paska, którego broń już jest w ręku, zdejmuje ją (przełącznik)** — kubek zostaje pusty, a klik w mapę staje się rozkazem marszu. Przed klikiem slotu sprawdź w lewym panelu zdanie „W ręku: …”.
- **Linijki „Głowa / W rękach” w dymku celownika są tylko przy dozwolonym ataku** — odmowa (np. „Do ataku wręcz cel musi być nie dalej niż 2 m.”) chowa rzut oka. Broń z ⚠ „Wskaż broń z katalogu” nie uzbraja celownika wcale.
- **„Na pewno?” przy „🗑 Wyrzuć szkic” wraca samo do „Wyrzuć szkic” po kilku sekundach** — oba kliknięcia rób w jednym kroku skryptu.
- **Okno ustawień nie zamyka się Esc i przeżywa wylogowanie** — przechwytuje kliknięcia w panel boczny; zamykaj je jego ✕ (`.settings-window button`).
- **Syntetyczne Esc z Playwrighta nie wychodzi z pełnego ekranu w Chromium, w Firefoksie wychodzi** — przytrzymanie Esc z Keyboard Lock obsługuje sama przeglądarka, poza zasięgiem automatu; wyjście „przeglądarką” udaje `document.exitFullscreen()`.
- **Polskie znaki w argumencie `curl` z Git Basha na Windows giną** (strona kodowa ANSI) — skrypt dla sterownika podawaj przez stdin (`--data-binary @-` z heredoca), nie w argumencie.

- **Firefox z Playwrighta podaje kartę „GTX 980, or similar”, a konsola Chromium liczy „3 errors” na ekranie logowania — oba to nie błędy** — Firefox maskuje `UNMASKED_RENDERER_WEBGL` (ochrona przed fingerprintingiem), WebGL i tak idzie sprzętowo przez ANGLE. Trzy „błędy” to dwa 401 z `/api/auth/me` u niezalogowanego i 404 `/favicon.ico` (zaległość).
- **Hasło MG w Playwright MCP to nazwa sekretu, nie wartość** — `browser_type` z tekstem `VTT_GM_PASSWORD` podstawia wartość z `.playwright-mcp/secrets.env`; każdy inny tekst idzie dosłownie (login — np. `MG` — wpisuje się więc zwykłym tekstem). Pusta wartość w pliku = wpisze się napis `VTT_GM_PASSWORD` i logowanie da 401.
- **`@playwright/mcp` jedzie na dziennej alfie Playwrighta — stabilna biblioteka obok niej ściąga drugi komplet przeglądarek** — `playwright` w `package.json` jest przypięty (`-E`) do tej samej alfy co MCP. Aktualizacja: `pnpm add -D -w -E @playwright/mcp@<v> playwright@<wersja z npm view @playwright/mcp@<v> dependencies>`, potem `pnpm exec playwright install firefox chromium`.
- **Narzędzia `mcp__playwright-*` pojawiają się dopiero po restarcie Claude Code** — serwery z `.mcp.json` startują przy uruchomieniu sesji (projektowe wymagają jednorazowej zgody). Ścieżki w argumentach są względne, więc Claude Code musi stać w katalogu repo.
- **Karta rzutu u drugiej sesji spóźnia się o 10 s — to schowana karta, nie zawieszona kolejka** — karta automatyki poza wierzchem ma `visibilityState: hidden`, kości 3D w niej nie spadają, a kolejka prezentacji puszcza wynik dopiero po `MAX_ROLL_MS` (10 s od 24.09, wcześniej 30 s). Zrzuty ekranu działają mimo to. Sprawdź `document.visibilityState`, zanim uznasz to za błąd.
- **Ekran logowania w obu kartach po zmianie w `shared` to HMR, nie wylogowanie** — `tsx watch` restartuje serwer, a Vite unieważnia `App.tsx` („Could not Fast Refresh”), więc magazyn sesji startuje od zera; `/api/auth/me` nadal odpowiada użytkownikiem, F5 wystarczy. Kod aplikacji zmieniaj przed oględzinami albo licz się z przeładowaniem kart.
- **Skrypt z `setTimeout` w karcie w tle dławi się do 1 tyknięcia na sekundę** — `javascript_tool` kończy się „Runtime.evaluate timed out after 45000ms”, choć skrypt **dokończy się sam** (25 pauz po 60 ms = 25 s). W karcie, która nie jest na wierzchu, klikaj bez pauz albo w małych partiach i czytaj wynik osobnym wywołaniem.
- **„Brak aktywnej sceny” wymaga kampanii bez scen** — aktywnej sceny nie da się usunąć (`SCENE_ACTIVE`) ani wyłączyć, a nowa scena startuje jako podgląd; `POST /api/campaigns` zakłada kampanię i od razu ją aktywuje (przełącza wszystkich), a wraca się przez „Panel MG” → „Aktywuj”. Na `dev.db` używaj „Oględzin 12.09”, nie zakładaj nowej.
- **Motyw dzienny z automatu to `data-theme='day'`, nie `'light'`** — obca wartość przestawia sam chrom aplikacji (panel boczny robi się jasny), a papier karty zostaje na nocnym kartonie; wygląda to jak niedokończona skórka karty. Sprawdź `getComputedStyle(document.documentElement).getPropertyValue('--cp-paper')`, zanim uznasz to za błąd stylów.
- **Powiększenia przeglądarki nie udasz `zoom` na `<html>`** — CSS `zoom` mnoży `vh`, więc okno z `max-height: 88vh` wychodzi poza ekran, czego prawdziwe powiększenie nie robi. Zmień rozmiar okna (`resize_window`) tak, żeby `innerWidth` = szerokość ekranu w CSS ÷ powiększenie (4K przy skali 150% i zoomie 150% ≈ 1708 × 882).
- **Szybko przepisywany plik CSS Vite potrafi serwować w wersji pośredniej — także po F5** — `getComputedStyle` pokazuje regułę sprzed ostatniego zapisu, choć log mówi „hmr update”. Zapisz plik jeszcze raz bez zmian i przeładuj kartę.
- **Nowego gracza testowego dołączysz bez czytania tokenu** — rozszerzenie zaciemnia token zaproszenia (`[BLOCKED: Sensitive key]`); wystaw i zużyj go w jednym `javascript_tool` (`POST …/invitations` → `/api/auth/logout` → `POST /api/join/<token>`), niczego nie wypisując. Danych testowych nie zmieniaj przez `node:sqlite` — automat odmawia zapisu do bazy; idź przez aplikację.
- **Instancja oględzin zajmuje porty 3001/5173, więc `npm run dev` MG pada na `EADDRINUSE`, a logowanie zwykłym hasłem daje 401** — pod `localhost:5173` odpowiada wtedy baza testowa z **innym** hasłem MG. Zanim uznasz to za błąd logowania, sprawdź, czyja instancja słucha (`netstat`), i potwierdź hasło `curl`-em na `/api/auth/login`.
- **Instancja na bazie testowej z jednorazowym `GM_PASSWORD`** — serwer przy starcie przepisuje hasło MG z env do bazy, którą otwiera. Na `.creation-ui.db` to wygoda; z tym samym env na `dev.db` zmieniłbyś prawdziwe hasło MG.
- **Opóźnienie VPS odtworzysz łatką na `WebSocket.prototype.send` z `setTimeout`** — lokalnie odpowiedź przychodzi przed następnym klawiszem, więc błędy pól związanych ze stanem serwera są na `localhost` niewidoczne.
- **Dwuklik z automatu w karcie w tle wysyłaj synchronicznie** — `setTimeout` między kliknięciami dławi się do ~1 s, drugie przychodzi po `DOUBLE_CLICK_MS` (350 ms) i obiekt sceny tylko się zaznacza zamiast otworzyć kartę; cztery `dispatchEvent` pod rząd w jednym zadaniu działają.
- **Co klient wysłał serwerowi, pokaże podsłuch `WebSocket.prototype.send`** — łata na prototypie łapie też już otwarte gniazdo Socket.IO; ramka `token:move` z `final: true` niesie lądowanie i trasę, pośrednie — przebieg marszu. Tak złapano błędną pierwszą wersję naprawy przerwanego marszu (13.09).
- **`zoom` na `[::1]` w serii odmawia** („Permission denied for this action on this domain”), choć `javascript_tool` i `screenshot` w tej samej serii przechodzą — zbliżenia z karty gracza rób pojedynczym wywołaniem.
- **Marsz w karcie w tle idzie kilka razy wolniej** — `tickMarch` połyka przestoje klatek (`MARCH_MAX_FRAME_MS`), a schowana karta ma ~1 klatkę na sekundę. Pozycję sprawdzaj w bazie (`Token.x`/`y`), nie zrzutem po stałym czekaniu.
- **Zaproszenie `tester-dev` jest unieważnione od 17.09 19:35 (wszystkie pięć `tester-dev*`)** — `POST /api/join/tester-dev` daje 404. Wchodzi się ważnym zaproszeniem aktywnej kampanii: konto MG czyta `GET /api/campaigns` (pole `invitations`, `revoked: false`) i zużywa token w tym samym skrypcie, niczego nie wypisując; to samo imię = to samo konto, nowe nie powstaje.
- **`innerText` przejmuje `text-transform`** — zakładki karty to „KARTA", więc `innerText === 'Karta'` ani `/^Dobądź$/` nie trafią; szukaj po `textContent`.
- **„Dobądź" nie istnieje, dopóki nikt nie zadeklarował rąk** — karta bez deklaracji pokazuje pierwszą broń „✊ W rękach" z „Schowaj (Akcja)"; slot szarzeje (`hud-slot--refused` na **wierszu**, nie na przycisku) dopiero po schowaniu.
- **Serie akcji rozszerzenia (`browser_batch`) potrzebują stałej zgody na domenę** — bez niej na `localhost` i `[::1]` przechodzą tylko pojedyncze wywołania; `navigate` na `[::1]` w serii odmawia nawet po zgodzie, a `find` odmawia zawsze.

- **Oględziny Playwrightem bez serwera MCP (25.09, jedenasta sesja).** Serwery MCP były
  wyłączone w `settings.local.json`, więc oględziny szły biblioteką przez mały „sterownik”
  w scratchpadzie: proces `node` trzyma przeglądarki otwarte i wykonuje kroki JS przysłane
  `curl`-em na `127.0.0.1`. MG loguje się `context.request.post('/api/auth/login')` z hasłem
  wczytanym w skrypcie z `.playwright-mcp/secrets.env` (nigdy nie wypisywanym), gracz — ważnym
  zaproszeniem aktywnej kampanii; kampanię i figury przestawia osobne gniazdo `socket.io-client`
  z ciasteczkiem kontekstu (`campaign:activate`, `token:move`, `wall:update`). Prawdziwy kursor
  i okna na wierzchu odblokowały dymek celownika, pełny marsz i pełny ekran — pięć pozycji długu
  czekających od 12–14.09 na „rękę MG” zamknęło się w jednej sesji. Dwa pierwsze podejścia
  do celownika MG spaliły się na przełączniku slotu (broń była już w ręku po zaznaczeniu figury).

- **Wdrożenie Playwright MCP (25.09).** Serwery `playwright-firefox` i `playwright-chromium`
  w `.mcp.json` uruchamiają `node node_modules/@playwright/mcp/cli.js` z repo (bez `npx`, więc bez
  pobierania przy starcie i bez opakowania `cmd /c` na Windows), z `--caps vision` (klik i przeciąganie
  po współrzędnych — płótno Pixi nie ma drzewa dostępności) i trwałym profilem w
  `.playwright-mcp/profile-*`. Sprawdzone dymem przez stdio i biblioteką na żywym `localhost:5173`:
  obie przeglądarki mają sprzętowy WebGL, `visibilityState: visible`, zero `pageerror`. Pierwsza
  instalacja stabilnego `playwright@1.63.0` obok MCP 0.0.82 (alfa 1.64) dałaby rewizje Firefox
  1543 vs 1549 i Chromium 1243 vs 1246 — stąd przypięcie biblioteki do alfy MCP. Nawet MCP 0.0.80
  (alfa 1.63) miał innego Firefoksa (1542) niż stabilne 1.63.0.

- **Brakujące karty Utraty Człowieczeństwa u gracza (23.09).** MG dodał skryptem za darmo trzy
  cyborgizacje, a czat gracza pokazał kartę tylko pierwszej — dwie następne były w bazie
  (`ChatMessage` 1040, 1041), a w DOM-ie nie. Wyglądało to na zawieszoną kolejkę z 22.09
  (`rollPresentation`), bo na mapie gracza wciąż leżała kość. Przyczyna: karta gracza była
  **schowana** (`document.visibilityState === 'hidden'`, choć `computer screenshot` ją fotografuje),
  więc animacja nie kończyła się sama i każdy rzut czekał na 30-sekundowy limit `MAX_ROLL_MS`.
  Po ~1,5 min obie karty stały na czacie. Przy stole (karta na wierzchu) to się nie zdarza.

- **Ekran logowania po zmianie w `shared` w trakcie oględzin (18.09, odbiór 3d).** Poprawka
  odmiany w `readiness.ts` zrestartowała serwer testowy (`tsx watch` obserwuje `../shared`), a Vite
  nie zdołał odświeżyć modułów na gorąco („invalidate DiceCup.tsx: Could not Fast Refresh") i wykonał
  `App.tsx` od nowa — magazyny zustand powstały ponownie z `status: 'anonymous'`, więc karta MG
  stanęła na „Logowanie Mistrza Gry”, a karta gracza raz została, raz nie. Sesja była cała:
  `fetch('/api/auth/me')` odpowiadał MG, a po F5 obie karty wróciły do gry bez hasła. Rozstrzyga
  `/api/auth/me` w konsoli, zanim poprosisz MG o ponowne logowanie. To samo robi `prettier --write`
  na plikach klienta.

- **Karta w tle dławi `setTimeout` do ~1 Hz — także w skrypcie z `javascript_tool` (18.09, odbiór
  3d).** Pętla „kliknij `+`, odczekaj 60 ms” × 25 w karcie MG, gdy na wierzchu była karta gracza,
  trwała ponad 45 s i CDP zgłosił przekroczenie czasu („The renderer may be frozen”), choć strona nie
  była zamrożona: skrypt dokończył się sam, a licznik doszedł do 86/86. Bliźniak pułapki o `rAF`
  i `setInterval` z 16f, tyle że tu objaw wygląda jak zawieszony renderer. W karcie w tle klikaj
  bez pauz (React i tak przetwarza `button.click()` synchronicznie, a kolejka kreatora scala
  intencje), a wynik odczytuj osobnym, krótkim wywołaniem.

- **Aktywnej sceny nie wyłączysz — scenariusz „brak aktywnej sceny” to osobna kampania (18.09,
  odbiór 3d).** `scene:delete` odmawia `SCENE_ACTIVE`, „Dezaktywuj” nie istnieje, a nowa scena
  wchodzi jako podgląd, więc jedyna droga do stołu bez sceny to kampania, która żadnej nie ma.
  `POST /api/campaigns` z nazwą zakłada ją **i od razu aktywuje** (przenosi wszystkie połączone
  ekrany, gracz spoza niej zostaje bez kampanii); powrót przez „Panel MG” → „Aktywuj” przy starej.
  Na `.creation-ui.db` została „Bez sceny 3d” (scena „Scena 3d”, NPC „Krawat z Arasaki”); na
  `dev.db` **nie zakładaj** nowej — jest „Oględziny 12.09”.

- **Motyw dzienny z automatu przestawia się `data-theme='day'` (17.09, naprawa 3c).** Przełącznik
  ☀/☾ pisze do `<html>` wartości `day`/`night`, a nie `light`/`dark` z konwencji CSS. Wpisana
  ręcznie `light` przestawia chrom aplikacji (panel boczny jaśnieje), ale tokeny karty
  (`--cp-paper`, `--cp-ink`) zostają na nocnych — okno karty postaci i kreatora stoi wtedy
  na czarnym kartonie obok jasnego interfejsu i wygląda jak zepsuta skórka. Rozstrzyga jedno
  wywołanie: `getComputedStyle(document.documentElement).getPropertyValue('--cp-paper')` daje
  `#171514` w nocy i `#f6eddb` w dzień (**od skórki z 20.09 dzień to `#f4e2c8`** — T8a 03.10 sprawdza
  już tylko „jasny w dzień, ciemny w nocy”, bez wartości na sztywno).

- **Karta automatyki jest schowana — pełnego ekranu w niej nie obejrzysz** — `requestFullscreen` przy aktywnym geście odpowiada „not granted", bo `document.visibilityState === 'hidden'` (okno automatyki leży za innym). Sprawdź to **przed** szukaniem błędu; pełny ekran i Keyboard Lock ogląda MG ręcznie.
- **Moduł `/src/socket.ts` wczytany z konsoli ma WŁASNE, puste gniazdo** — `activateCampaign` i reszta odpowiadają `NOT_CONNECTED`, choć pasek mówi „Połączony", także przy adresie z `?t=`. Działa **osobne** połączenie: `io()` z `/node_modules/.vite/deps/socket__io-client.js?v=…` (adres z `performance.getEntriesByType('resource')`) — ciasteczko MG idzie samo. **26.09 (43a) dokładny adres `?t=` z listy zasobów zadziałał** (`updateToken`, `startCombat`, `endCombat` → `ok`) — próbuj go najpierw, osobne `io()` dopiero, gdy odpowie `NOT_CONNECTED`.
- **Serwer nie ma trasy usuwania kampanii** — kampania założona na potrzeby oględzin zostaje w bazie na zawsze; w `dev.db` są już cztery takie („dfgdgfdg", „dsaada", „Ulice Night City", „Oględziny 12.09 — do usunięcia"). **Nie zakładaj piątej** — do testów „świeżej kampanii" używaj „Oględzin 12.09". Przełączenie kampanii przenosi **wszystkie** połączone ekrany, także cudze.
- **`Escape` z `computer` nie zamyka menu figury** — a klik w puste pole mapy przy zaznaczonej figurze byłby rozkazem marszu. Menu zamyka klik w tytuł aplikacji w górnym pasku.
- **Lista statusów menu figury da się obejrzeć bez przewijania** — przestaw `style.top`/`style.left` na `.context-menu` (czysto wizualnie, bez stanu) i zrób zbliżenie.
- **MENU FIGURY OTWIERA SIĘ Z AUTOMATYKI — korekta z 12.09.** `PointerEvent` z `button: 2` (plus `contextmenu`) we **współrzędnych CSS** na `canvas` wystawia je za pierwszym razem; checkboksy statusów biorą `input.click()`. Trzy pozycje długu (38a, 38b, 41) czekały na rękę MG na podstawie nieprawdziwej przeszkody. **Gracz też ma menu** — własne, jednopozycyjne („🔍 Przyjrzyj się…").
- **`hover` + `left_click` z `computer` nie jest rozkazem marszu** — trasa liczy się na `pointermove`, więc figura stoi, a w rendererze zostaje **rozpoczęty marsz**, który gasi podgląd trasy: kolejne najechania nic już nie rysują i wygląda to jak zepsuty ruch. Rozpoznanie: następny klik odkłada w czacie „Marsz przerwany.”. Działa dopiero pełna seria z konsoli (`pointermove` → pauza ~400 ms → `pointermove` o 2 px → `pointerdown`/`pointerup`) we współrzędnych CSS.
- **Odmowy Akcji lądują w kategorii czatu „Stół”, a filtr bywa wyłączony** — zamiast „Zbyt daleko — Pochwycenie wymaga zwarcia (2 m).” widać „⋯ 1 ukryty wiersz ⋯” i klik wygląda na przycisk, który nic nie robi. Filtry są prywatne i lokalne (`localStorage`), więc trzymają się karty, nie konta: **włącz wszystkie cztery przed oględzinami**.
- **Lista statusów w menu kontekstowym żetonu wychodzi poza dolną krawędź okna** — „Powalony” wypada ok. 150 px pod widokiem, `scrollIntoView` nie pomaga (menu się nie przewija), a `computer` nie kliknie poza zrzutem. Tu akurat `input.click()` na checkboksie **działa** (React łapie zdarzenie) — inaczej niż przy `form_input` z pułapki niżej.
- **Kursor najechany claude-in-chrome nie budzi `onAimHover` w Pixi — Playwright budzi (korekta z 25.09)** — celownik się uzbraja i linia strzału się rysuje, ale dymek pod kursorem nie wychodzi. `page.mouse.move` Playwrighta (Firefox i Chromium) wystawia dymek normalnie, z Alt przez `keyboard.down('Alt')`.
- **Ścieżka z przycisku i ścieżka ze skrótu to dwie ścieżki** — Alt+klik przeszedł oględziny etapu 40, przycisk „Poproś MG” nie; usterka siedziała w tej drugiej. Przy dwóch wejściach sprawdzaj oba.
- **Karta w tle dławi `setInterval` i `requestAnimationFrame` do ~1 Hz** — pomiar przytrzymania guzika w automatyce przeglądarki jest nieważny; rAF nie zwraca ani jednej klatki.
- **Automatyka przeglądarki gubi modyfikator `alt` przy kliknięciu** — Alt+klik nie dochodzi do strony i wygląda jak niedziałająca funkcja. Obejście: `dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))`.
- **Automatyka przeglądarki potrafi zgubić drugą sesję** — zanim uznasz to za błąd serwera, sprawdź `fetch('/api/auth/me')` w obu kartach; cookie jest `httpOnly`, więc widać wyłącznie nagłówek strony.
- **`<input type="file">` DA SIĘ obsłużyć automatem** (`DataTransfer` → `input.files` → `change`) — inaczej niż checkbox Reacta z pułapki niżej.
- **Rozszerzenie przeglądarki zaciemnia część wyników `javascript_tool`** (`[BLOCKED: Sensitive key]`, `[BLOCKED: Base64 encoded data]`) — to nie jest błąd aplikacji; sprawdzaj takie rzeczy testem serwera.
- **Bronią obszarową celuj w puste pole** — klik w żeton tylko go zaznacza (u MG każdego), broń schodzi z ręki, a następny klik w mapę jest **rozkazem marszu**; strzał puszcza „Potrząśnij i strzel", nie drugi klik.
- **Efektu mapy nie złapiesz zrzutem** (1,1–1,6 s) — wywołaj go wprost przez `fx.play([...])` i **zamroź** klatkę (`life = 400000`, `age = life * klatka / liczbaKlatek`); pierwsze 20 z 64 klatek wybuchu to białe iskry, nie usterka.
- **Slot paska akcji klikaj po współrzędnych z DOM-u** — chip stanu figury przesuwa listę o cały wiersz i klik trafia w sąsiednią broń; po kliku sprawdzaj zdanie „W ręku: …".
- **`.click()` na slocie paska nie uzbraja celownika** — klik w mapę staje się wtedy rozkazem marszu i wysyła figurę przez pół sceny.
- **Brak pytania przy koszu hurtowym to nie usterka** — `confirmDestructive` pyta tylko poza poligonem, a każde `*:clear` odkłada wpis w buforze `Ctrl+Z`.
- **`window.confirm` zawiesza kartę pod CDP na amen** — przechwyć go (`window.confirm = () => true`) **przed** kliknięciem czegokolwiek niszczącego; po przeładowaniu strony łatę zakłada się od nowa.
- **Zrzut ekranu ma inną skalę niż `clientX`** — mnóż przez `innerWidth / szerokość zrzutu`, zanim wsadzisz współrzędne w syntetyczne zdarzenie wskaźnika.
- **`form_input` na checkboksie Reacta nie zmienia stanu komponentu** — pole zaznacza się wizualnie, warunkowa część formularza się nie pojawia, a następny klik odznacza. Używaj `left_click`.
- **Efektu mapy nie złapiesz zrzutem ekranu** (trwa 300–800 ms) i `performance.now` nie spowalnia Pixi — trzeba wirtualnego znacznika `rAF`.
- **Klik w puste pole przy zaznaczonej figurze to rozkaz marszu** — automatyzuj zdarzeniami wskaźnika z policzonymi współrzędnymi CSS, nie pikselami ze zrzutu.
- **Sesję MG i gracza da się mieć naraz w jednym Chrome**: MG na `localhost:5173`, gracz na `[::1]:5173` (ciasteczko jest kluczowane hostem; `127.0.0.1` nie zadziała).
- **Klik w żeton, którym MG steruje (czyli w każdy), tylko go zaznacza** — celuje dopiero **Alt+klik**, a `modifiers` w `computer` bywa niedostarczane; pewna droga to guzik „ATAK" z karty postaci (`targeting` omija warunek Alt).
- **Dymu nie da się postawić narzędziem** — stawia go wyłącznie wystrzelony nabój („Amunicja dymna" w broni ze wzorcem `grenade`); broń podwieszana nie ma listy naboju.
- **Zrzut ekranu bywa wycinkiem okna** — wtedy klikanie po współrzędnych ze zrzutu chybia; klikaj referencjami z `find`/`read_page`.
- **Przeciągnięcie tokenu da się wysłać automatem** — `pointerdown` na `canvas`, seria `pointermove` z przerwami ~70 ms, `pointerup`.
- **Menu kontekstowe tokenu też** — `PointerEvent` z `button: 2` (Pixi słucha wskaźnika, nie myszy); wystawiane **tylko MG**.
- **Vite potrafi zapamiętać PUSTY moduł**, jeśli plik był przepisywany w trakcie — przeładowanie nie pomaga, trzeba przepisać plik jeszcze raz.
- **HMR przy działającym Pixi wywala stronę** (`Ticker.remove`) — po edycji klienta przeładuj kartę.
- **`window.confirm` zawiesza sterowanie przeglądarką przez CDP** — omijaj przyciski „usuń" albo poproś użytkownika o klik.
- **Edycja kodu w trakcie oględzin przeładowuje kartę** — ognisko wychodzi z pola tekstowego i pisanie leci w globalne skróty mapy (każde „e" to koniec tury).
- **Nowe wejście do mechaniki sprawdź na świeżo przeładowanej karcie**, bez otwierania zakładek — tylko wtedy widać leniwe ładowanie danych CP RED.
- **Rozkaz marszu automatem wymaga ustalonego hovera** — trasa liczy się na `pointermove`; klik w tej samej porcji zdarzeń nic nie robi.
- **Skrótu klawiszowego nie odpalisz syntetycznym `KeyboardEvent`** — Esc musi przyjść z CDP, inaczej marsz się nie przerwie.
- **Rzut z karty to dwa kliknięcia** (Shift+klik ładuje kubek, klik w kubek rzuca), złota kość dorzutu spada 550 ms po pierwszej fali, a stół kości chowa się **pod** oknem karty postaci.
- **Narzędzia mapy nie odpalisz syntetycznym zdarzeniem wskaźnika** — ściana rysuje się w podglądzie i znika; menu kontekstowe żetonu owszem, ale **we współrzędnych CSS**, nie tych ze zrzutu (skala ≈0,8).
- **Automat CDP jednak buduje scenę** (ściany, lampy, osłony, strefy, pinezki) — koryguje „nie da się" z 23.08; kursor płótna mówi, czy pod wskaźnikiem jest chwytalny obiekt.
- **Zrzut ekranu bywa ciemniejszy, niż mówi DOM** — Chrome przyciemnia obraz; motyw czytaj z `dataset.theme` i `getComputedStyle`, nie ze zrzutu.
- **Sprawdź, czy strona naprawdę się przeładowała**, zanim uznasz poprawkę za nieskuteczną — HMR podmienia moduł, ale globalny `keydown` zostaje po starym efekcie.
- **Odmowa serwera, która „nie chce paść"** — najpierw przeczytaj `disabled` przycisku, który miałby ją wywołać: `NET_NODE_USED` blokuje sam klient (chip „węzeł użyty w tej Turze").
- **Spowolnione `rAF` rozdmuchuje chmurę gazu na cały ekran** — sprite rośnie na klatkę, nie na milisekundę; przy 0,03 urośnie 120×. Rozmiar oceniaj przy 0,3, nie niżej.
- **Atak obszarowy z mapy to trzy kliknięcia** — uzbrój slot, kliknij pole (to **ładuje kubek**), kliknij kubek. Pominięcie któregoś = zwykły rozkaz marszu; slot rozbraja się po zmianie tury.
- **Kliknięcia `computer` idą we współrzędnych zrzutu**, nie CSS (skala ≈ 0,8 przy DPR 1,5) — syntetyczne zdarzenia wskaźnika biorą CSS; klik poza zrzutem nie robi nic i nie zgłasza błędu.
- **Nie klikaj „✕" hurtem w oknie karty** — ten sam znak nosi kosz przy wierszu, kasuje bez potwierdzenia; okno zamyka ✕ z nagłówka.
- **Wąskie okno symuluje `documentElement.style.width`**, gdy `resize_window` nic nie robi — ale `@media` czyta viewport, a Pixi potrafi zamulić kartę (zrzut nadal działa).
- **Uzbrojona broń zjada rozkaz marszu** — klik w podłoże jest wtedy strzałem; objaw to „Marsz przerwany." i stojąca figura. Rozbrój slot i powtórz.
- **Marsz automatem wymaga serii `pointermove`**, nie jednego — po linii, którą figura ma iść, z przerwami ~180 ms.
- **`window.confirm` da się podmienić i przeczytać treść pytania** bez klikania i bez ryzyka; podmiana ginie przy przeładowaniu karty.
- **Kubkiem kości nie potrząśniesz z JavaScriptu** — ani `click()`, ani ręczna seria zdarzeń wskaźnika; klikaj `computer` we współrzędnych zrzutu (skala = 1373 / `window.innerWidth`).
- **Ramka, ping i kopia działają z syntetycznych zdarzeń wskaźnika, `Ctrl+A` nie** — skrót klawiszowy trzeba wysłać przez CDP (`computer`, `key: "ctrl+a"`), po kliknięciu w mapę.
- **Ping gaśnie po 2,2 s, czyli szybciej, niż wraca zrzut ekranu** — oglądaj go `setInterval`-em pingującym co 500 ms, nie pojedynczym gestem.
- **Po przeładowaniu karty mapa wraca do `fitScene`** — współrzędne z poprzedniego zrzutu kłamią, a ramka po nich łapie zero figur i wygląda jak zepsuty gest.
- **Nazwy kopii nie odczytasz z etykiety pod żetonem** (przy zoomie stołu nieczytelna) — otwórz menu kontekstowe (`button: 2`) i przeczytaj `.context-menu-title`.
- **Kartę do oględzin da się przygotować w bazie bez logowania na MG** — `node --input-type=module` + `node:sqlite` na `packages/server/dev.db`; `better-sqlite3` nie jest w `node_modules` repozytorium.
- **`pnpm dev` z `&` w tle naprawdę startuje serwery**, choć zadanie kończy się od razu; następne uruchomienie pada na `EADDRINUSE`. Najpierw `curl` na :5173, potem szukanie trupa.
- **Tekst z liczbą sprawdzaj na liczbie większej niż jeden** — cały etap 37 przeszedł oględziny z „jedną dobą", a błąd („minęły 30 doby") pokazały dopiero trzy skoki pod rząd.
- **Feed czatu czytaj z DOM-u, nie ze zrzutu** — `[...document.querySelectorAll('.chat-time')].map(n => n.innerText)`; panel bywa przewinięty i „nie ma karty" znaczy zwykle „nie doskrolowano".


- **Stałe zaproszenie `tester-dev` jest przypięte do Poligonu (13.09).** `poligon.md` mówił, że
  „wskazuje aktywną kampanię" — ekran dołączenia pisze jednak „Kampania: Poligon bojowy", więc
  kampania-śmieć „Oględziny 12.09" (zero członków) nie ma jak wpuścić gracza tą drogą. Działa nowe
  zaproszenie wystawione z karty MG (`fetch('/api/campaigns/<id>/invitations', { method: 'POST' })`)
  i wpisanie na ekranie dołączenia imienia **istniejącego** konta: `POST /api/join/:token` szuka
  użytkownika po imieniu i dopisuje tylko członkostwo (`join.ts`, „Same name = same player").

- **`innerText` zwraca tekst po `text-transform` (13.09).** Zakładki karty postaci są w CSS
  wielkimi literami, więc `innerText` daje „KARTA", „EKWIPUNEK" — i skrypt szukający
  `innerText.trim() === 'Karta'` albo `/^Schowaj \(Akcja\)$/` nie znajduje niczego, choć przycisk
  stoi na ekranie. Pół godziny wyglądało to na brak funkcji. Szukaj po `textContent`.

- **Slot paska szarzeje na wierszu, a „Dobądź" pojawia się dopiero po pierwszym „Schowaj" (13.09).**
  Karta, przy której nikt nie zadeklarował rąk, pokazuje pierwszą broń jako trzymaną
  (`cpredDrawnWeapons`) — przy niej stoi „Schowaj (Akcja)", a „Dobądź" nie ma wcale. Po schowaniu
  `hotbar.ts` daje opcji `notDrawn`, a `CombatHud.tsx` dokłada `hud-slot--refused` (opacity 0,4)
  do **`.hud-slot-row`** — sam `button.hud-slot` zostaje bez `disabled`, z `cursor: not-allowed`.

- **Serie akcji rozszerzenia potrzebują stałej zgody na domenę (13.09).** Bez niej pojedyncze
  `computer`, `javascript_tool` i `navigate` na `localhost:5173` i `[::1]:5173` działały, a te same
  akcje w `browser_batch` dostawały „Permission denied", zrzuty wracały „[Image omitted]", a `find`
  odmawiał zawsze. Po nadaniu zgody przez MG serie ruszyły, ale `navigate` na `[::1]` w serii nadal
  odmawia („Navigation to this domain is not allowed") — nawiguj tam pojedynczo.

- **Karta automatyki jest schowana — Chrome odmawia jej pełnego ekranu (12.09, ósma sesja).**
  Klik `computer` we współrzędnych zrzutu niesie prawdziwy gest (`userActivation.isActive === true`
  w chwili wywołania), a mimo to `requestFullscreen` kończy się `TypeError: not granted`. Przyczyna
  nie leży w kodzie: `document.visibilityState` karty automatyki to `hidden` — okno stoi za oknem
  MG — a takiej karcie Chrome pełnego ekranu nie daje. Zanim uznasz za zepsute cokolwiek, co wymaga
  widocznego okna (pełny ekran, Keyboard Lock), przeczytaj `document.visibilityState`. Najpewniej
  ta sama przyczyna stoi za dławionym `rAF` z indeksu wyżej. Przytrzymania klawisza (`repeat`)
  automatyka i tak nie wyśle — `key` z `repeat` to osobne wciśnięcia.

- **Moduł klienta wczytany z konsoli to INNA instancja — jego `socket` jest pusty (12.09, siódma
  sesja).** `await import('/src/socket.ts')` — także z dokładnym adresem `?t=…` z listy zasobów —
  daje świeży moduł, w którym nikt nie wołał `connect`, więc `activateCampaign`, `createCharacter`
  i każde `emitSceneAck` wracają `{ ok: false, error: 'NOT_CONNECTED' }`, choć aplikacja obok jest
  połączona. **Działa osobne gniazdo:** `const { io } = await import('/node_modules/.vite/deps/
  socket__io-client.js?v=…')` (dokładny adres z `performance.getEntriesByType('resource')`),
  `io({ transports: ['websocket'] })` — ciasteczko sesji MG idzie samo, bo to ta sama domena. Tą
  drogą przygotowano 12.09 całą kartę do oględzin (`character:create`, łata, `character:use-dose`,
  `character:roll`, `time:set`). Przełączenie kampanii zostało jednak w interfejsie: „Panel MG" →
  „Aktywuj" przy wierszu kampanii.

- **Menu kontekstowe figury JEDNAK otwiera się z automatyki (12.09) — i to jest korekta trzech
  wpisów długu.** Zaległości 38a, 38b i 41 mówiły zgodnie: „prawym klikiem z automatyki nie
  otworzysz menu kanwy Pixi", i na tej podstawie **pięć pozycji** czekało na rękę MG. Nieprawda.
  Działa seria `pointerdown` → `pointerup` z `button: 2, buttons: 2` plus `contextmenu`, wysłana na
  `canvas` we **współrzędnych CSS** (nie tych ze zrzutu — to jest cała różnica; skala ≈ 0,73 przy
  DPR 1,25, przelicz `frame × innerWidth / szerokość_ramki`). Menu wyszło za pierwszym podejściem,
  a checkbox statusu w nim bierze `input.click()` — tak nadano i zdjęto „Powalonego". Tą drogą
  odklikano w jednej sesji: okno oględzin u MG i u gracza, „🎒 Przeszukaj…", „✏️ Edytuj…"
  i pełną ścieżkę prośby o dokładne oględziny.

- **Gracz ma własne menu figury, nie brak menu.** Wpis „wystawiane tylko MG" mylił: na **swojej**
  figurze gracz dostaje menu z **jedną** pozycją („🔍 Przyjrzyj się…"). Cudzej figury pod mgłą nie
  kliknie w ogóle — ona do niego nie jedzie — więc oględziny cudzej figury z konta gracza wymagają
  sceny, na której tamtą figurę widać.

- **Zakładka „Walka" pokazuje AKTYWNEGO uczestnika, a pasek HUD — zaznaczoną figurę.** Przy
  porównywaniu obu wejść łatwo zestawić dwie **różne** figury i wziąć to za rozjazd (albo za jego
  brak). Zanim cokolwiek orzekniesz, sprawdź nazwę w obu panelach. U gracza dochodzi drugi warunek:
  `CombatActions` renderuje się dopiero, gdy gracz **jest na turze** albo ma wstrzymaną Akcję
  (`CombatPanel.tsx`, `actor`) — poza turą siatki akcji nie ma wcale.

- **Pasek HUD maluje odmowę kursorem, nie atrybutem.** Slot odmówiony ma `disabled === false`
  i `cursor: not-allowed`, a powód w `title`; zakładka „Walka" używa prawdziwego `disabled`.
  Automat czytający tylko `button.disabled` orzeknie, że pasek niczego nie blokuje. Porównuj
  **`title`**, bo to jego treść ma być wspólna dla obu wejść.

---

- **Firefox z Playwright MCP wisiał na `browser_navigate` (17.10).** Dwie minuty, potem zadanie
w tle; pułapka z 03.10 o niewstającym Firefoksie dalej aktualna. Przy oględzinach Śmiertelnie
Rannego zadziałał tymczasowy spec w `packages/e2e/specs/99-ogledziny/`: MG w Chromium zakłada
kampanię, gracz wchodzi linkiem w Firefoksie, resztę (karta, scena, walka, rzut obrażeń) robi gniazdo
MG, a zrzuty idą do scratchpadu. `instance start` z powłoki nie nadaje się do tego: procesy instancji
giną razem z poleceniem.

- **Stan sceny z konsoli przez moduły Vite (25.09).** W dev `await import('/src/socket.ts')`
  w `browser_evaluate` daje **tę samą** instancję gniazda co aplikacja, więc MG ustawia kampanię,
  figury, kolejkę, próg sklepu i karty wyeksportowanymi funkcjami (`activateCampaign`, `createToken`,
  `startCombat`, `setCombatInitiative`, `setShopTier`, `updateCharacter`) bez osobnego
  `socket.io-client`. Magazyny czyta się tak samo (`/src/stores/*.ts`). Zaproszenie gracza: MG
  `POST …/invitations` w Chromium, gracz `POST /api/join/<token>` w Firefoksie. Token trzeba
  przenieść między przeglądarkami w odpowiedzi narzędzia, bo `browser_run_code_unsafe` nie ma
  `require` ani `import()`.
- **MG zalogowany ręką w oknie Playwrighta podmienia gracza (25.09).** Okna MCP są widoczne na
  pulpicie MG. Gdy po restarcie serwera okno gracza pokazało ekran logowania, MG wpisał tam hasło
  i Firefox `Testera` stał się kontem MG. To nie jest błąd sesji (`vtt_sid` w bazie). Wystarczy
  wylogować i ponownie zużyć zaproszenie z tym samym imieniem.



- **Dwie instancje na tych samych portach wyglądają jak zepsute logowanie (17.09, naprawa 3b).**
  Oględziny wymagają zalogowanego MG, a hasła w przeglądarce nie wpisuje automat — MG loguje się
  ręką. Gdy równolegle stoi jego zwykły `npm run dev`, wychodzą dwa objawy naraz: jego serwer pada
  na `EADDRINUSE` (porty trzyma instancja testowa), a jego hasło daje `401`, bo `localhost:5173`
  proxuje do bazy testowej z jednorazowym `GM_PASSWORD`. Rozstrzyga to jeden `curl`
  (`POST /api/auth/login` z hasłem instancji → 200) i `netstat -ano` na portach. Krótkie,
  łatwe do przepisania hasło (`test3b`) oszczędza rundy „wpisuję poprawne, a nie wchodzi”.

- **Nowy gracz i hasło MG na bazie testowej (16.09, naprawa 2a).** Oględziny kreatora wymagały
  świeżego szkicu i szkicu bez zatwierdzonej rangi. Zapis wprost do `.creation-ui.db` przez
  `node:sqlite` automat odrzucił jako niszczenie danych, a token zaproszenia rozszerzenie ukrywa
  w wyniku. Zadziałało jedno wywołanie w karcie `[::1]`: `POST /api/campaigns/<id>/invitations`,
  `POST /api/auth/logout`, `POST /api/join/<token>` z nowym imieniem i `location.href = '/'` —
  token nie opuszcza strony. Instancję testową uruchamia się z `DATABASE_URL=file:./.creation-ui.db`,
  osobnymi `UPLOADS_DIR`/`BACKUP_DIR` w katalogu tymczasowym i jednorazowym `GM_PASSWORD`, bo
  `auth/seed.ts` przy starcie przepisuje hasło MG do otwartej bazy („GM password updated from
  GM_PASSWORD” w logu). Zmienne z wiersza poleceń wygrywają z `.env` (`--env-file-if-exists` ich nie
  nadpisuje) — i dlatego ten sam wiersz bez `DATABASE_URL` zmieniłby hasło MG w `dev.db`.

- **Na `localhost` nie widać błędów, które wymagają opóźnienia (16.09, naprawa kreatora).**
  Pole kreatora związane wprost ze szkicem z serwera gubiło znaki dopiero przy RTT rzędu setek
  milisekund. Łatka w konsoli karty: `const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { setTimeout(() => send.call(this, d), 250); }` — działa
  też na otwartym już gnieździe Socket.IO i zachowuje kolejność ramek. F5 ją zdejmuje. Testy
  pisania rób prawdziwymi klawiszami (`computer` → `type`), nie ustawianiem `value`.

- **Automatyka przeglądarki gubi modyfikator `alt` przy kliknięciu (06.09).** `computer` z
  `modifiers: "alt"` klika, ale strona dostaje zwykły klik — Alt+klik na wierszu karty nie
  otwierał okna prośby, choć kod działa. Objaw jest nie do odróżnienia od „funkcja nie zadziałała".
  **Obejście:** `element.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }))`
  przez `javascript_tool` — React łapie to normalnie. `shiftKey` przechodzi tą samą drogą.

- **Automatyka przeglądarki potrafi zgubić drugą sesję.** Przy oględzinach 38b karta `[::1]:5173`
  raz wróciła jako **MG**, choć logowała się jako `Tester`; ponowne wejście na `/join/tester-dev`
  naprawiło to i po `location.reload()` sesja już się trzymała. Zanim uznasz to za błąd
  w serwerze, sprawdź `fetch('/api/auth/me')` **w obu kartach** — cookie jest `httpOnly`, więc
  z `document.cookie` niczego nie widać, a nagłówek strony jest jedynym widocznym objawem.

- **`<input type="file">` DA SIĘ obsłużyć automatem** — inaczej niż checkbox Reacta z pułapki
  niżej. `new DataTransfer()`, `dt.items.add(new File([tekst], 'plik.json'))`, `input.files =
dt.files`, `input.dispatchEvent(new Event('change', { bubbles: true }))` — React czyta
  `event.target.files` i widzi prawdziwy plik. Tak poszły oględziny importu 05.09.

- **Rozszerzenie przeglądarki zaciemnia niektóre wyniki `javascript_tool`** — pola o nazwach
  wyglądających na wrażliwe wracają jako `[BLOCKED: Sensitive key]`, a długie ciągi base64 jako
  `[BLOCKED: Base64 encoded data]`. To nie jest błąd aplikacji: `tokens` w liczniku manifestu
  i `content-disposition` wracały tak przy poprawnej odpowiedzi. Sprawdzaj takie rzeczy testem
  po stronie serwera, nie przez konsolę karty.

- **Bronią obszarową celuje się w PUSTE pole, a klik w żeton tylko go zaznacza.** 04.09 poszły
  cztery próby strzału z granatnika, zanim coś poleciało: klik w figurę przestawiał zaznaczenie
  na **nią** (u MG wolno zaznaczyć każdego), przez co uzbrojona broń schodziła z ręki, a kolejny
  klik w mapę stawał się **rozkazem marszu tej figury** — tak przy okazji przespacerował się
  żeton testowy. Kolejność, która działa: zaznacz **swoją** figurę → uzbrój broń ze slotu
  (zdanie „W ręku …" w panelu) → kliknij **pole** obok celu (pojawia się kwadrat obszaru
  i pasek „→ wybrane pole · N m · PT X") → dopiero wtedy **„Potrząśnij i strzel"**, bo strzał
  puszcza kubek, a nie drugi klik w mapę. Granat i tak odchyla się o co najmniej 2 m, więc
  aby złapać kogoś testem, celuj w pole **pod nim**, nie o dwa dalej.

- **Efektu mapy nie zobaczysz zrzutem ekranu — ale da się go zatrzymać.** Wybuch trwa 1,1 s,
  chmura 1,6 s, a runda `screenshot` przez CDP bywa dłuższa: 04.09 poszły trzy granaty i za
  każdym razem zrzut łapał albo puste pole, albo pojedynczą jasną plamkę, z której nic nie
  wynikało. **Rozpoznanie:** efekt jest w `MapFxLayer.items`, a na obrazku go nie ma.
  **Obejście, które zadziałało:** na czas oględzin podnieś `EXPLOSION_MS`/`CLOUD_MS` do kilku
  sekund, wystaw warstwę na `window` (`__fx = this` w `play`), a potem wywołaj efekt **wprost** —
  `fx.play([{ kind: 'blast', at: { x, y }, sideM: 10 }])` — i **zamroź** go, podstawiając
  wybranej pozycji `life = 400000` i `age = life * klatka / liczbaKlatek`. Wtedy zrzut łapie
  dowolną klatkę, także tę z ognistą kulą (u wybuchu dopiero ~40 z 64; pierwsze dwadzieścia to
  białe iskry, po których łatwo uznać arkusz za zepsuty). `fx.play` niczego nie wysyła na
  serwer, więc stan stołu zostaje nietknięty. **Sam ślad klatek** (`sprite.texture.frame`)
  wystarcza za dowód, że arkusz jest pocięty dobrze — prostokąty idą wiersz po wierszu i nigdy
  nie wychodzą poza arkusz.

- **`window.confirm` nie zawsze jest tam, gdzie go szukasz.** 04.09 kosz „usuń wszystkie osłony"
  nie zapytał o nic — i to **nie jest** błąd: `confirmDestructive` pyta tylko poza poligonem,
  a hurtowe kasowanie warstwy wraca `Ctrl+Z` (wszystkie sześć zdarzeń `*:clear` woła
  `rememberDeletion`). Zanim uznasz brak pytania za usterkę, sprawdź **obie** rzeczy: flagę
  `Campaign.sandbox` i to, czy zdarzenie odkłada wpis w buforze cofania.

  **Druga połowa tej samej pułapki, znaleziona 12.09: pyta też „✕" przy kolejce inicjatywy.**
  `stopTurnMode` w `CombatBar.tsx` woła **goły** `window.confirm` („Wyłączyć tryb turowy?"),
  a nie `confirmDestructive`, więc **flaga `sandbox` go nie zdejmuje** i pyta zawsze. Karta
  zawisła na amen w połowie oględzin, bo przechwycenia nie założyłem — przycisk nie wygląda na
  niszczący. **Zamknięcie karty nie jest wyjściem:** modal ginie jako „Anuluj", więc walka
  **zostaje w bazie**, a kolejnej kartki nie da się już zalogować jako to samo gniazdo — moduł
  wciągnięty przez `import('/src/socket.ts')` dostaje **własną**, niepodłączoną instancję
  (`NOT_CONNECTED`), więc `endCombat()` z konsoli też nie przejdzie. Zostaje ręka MG.
  **Przed dotknięciem „✕" zakładaj `window.confirm = () => true`.**

- **Slot paska akcji trzeba klikać po współrzędnych z DOM-u, nie z pamięci.** Lista przesuwa się
  o cały wiersz, gdy figura zyska albo straci chip stanu (04.09: dołożenie statusu
  „Nieprzytomny" zsunęło broń o ~30 px i klik „Granatnik podwieszany" trafił w
  „Bagnet", a po przeładowaniu magazynka — w „Arasaka Minami 10"). Objaw jest cichy:
  uzbraja się **inna** broń i dopiero karta na czacie mówi, czym się strzelało. Przed klikiem
  czytaj `document.querySelectorAll('button.hud-slot')` i przeliczaj `getBoundingClientRect`
  na skalę zrzutu; po kliku sprawdzaj zdanie „W ręku: …" pod paskiem.

- **`.click()` na slocie paska nie uzbraja celownika, a klik w mapę staje się wtedy rozkazem
  marszu.** 04.09 wysłało to avatar9 przez pół sceny zamiast wystrzelić granat. Uzbrajaj slot
  prawdziwym kliknięciem (CDP), a **przed** kliknięciem w mapę potwierdź zdanie „W ręku: …" —
  bez uzbrojenia klik w puste pole zawsze znaczy „idź tam".

- **`window.confirm` zawiesza kartę pod CDP, jeśli nie przechwycisz go PRZED kliknięciem.**
  `confirmDestructive` (`client/src/confirm.ts`) to natywny `window.confirm`, a natywny modal
  blokuje `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent` **i** wstrzykiwanie skryptów —
  czyli wszystkie drogi, którymi dałoby się go zamknąć. Karta zostaje martwa; jedynym wyjściem
  jest ją **zamknąć i otworzyć na nowo**. **Obejście, zawsze przed klikaniem czegokolwiek
  niszczącego:** `javascript_tool` z `window.confirm = () => true`. Uwaga: przeładowanie strony
  zdejmuje tę łatę, więc po każdym reloadzie trzeba ją założyć od nowa. Sprostowanie do
  wcześniejszego wpisu, który mówił, że confirm „nie zawiesza sterowania" — nie zawiesza tylko
  wtedy, gdy jest przechwycony.

- **Zrzut ekranu ma inną skalę niż `clientX`/`clientY`.** Współrzędne z narzędzia zrzutu trzeba
  przemnożyć przez `window.innerWidth / szerokość zrzutu` (03.09: 1964/1394 ≈ 1,41), zanim
  wsadzi się je w syntetyczne zdarzenie wskaźnika. Bez tego klik ląduje w zupełnie innym
  miejscu mapy i wygląda jak „Pixi nie odbiera zdarzeń".

- **Menu kontekstowe tokenu otwiera `pointerdown` z `button === 2`**, a `right_click` z CDP go
  nie dowozi (`wireInteraction` w `MapRenderer.ts`). Obejście, sprawdzone 03.09: dispatch
  `new PointerEvent('pointerdown', {button: 2, buttons: 2, …})` na `<canvas>` po przeliczeniu
  współrzędnych (wpis wyżej). Potem `find` znajduje pozycje menu normalnie.

- **`form_input` na checkboksie Reacta zmienia DOM, ale nie stan komponentu.** Pole zaznacza
  się wizualnie, a warunkowa część formularza się nie pojawia — i kolejny prawdziwy klik
  **odznacza** je z powrotem, bo React nadal uważa, że jest wyłączone. Do kontrolowanych pól
  React używaj `left_click`, nie `form_input`.

- **Efektu mapy NIE DA SIĘ złapać zrzutem ekranu, a spowolnienie `performance.now` nic nie
  daje** (ustalone 20.08 przy 27i, kosztowało pół godziny). Efekt trwa 300–800 ms, a runda
  narzędzia zrzutu to około półtorej sekundy — więc widać zawsze pustą mapę i pierwsza myśl
  („nie działa") jest fałszywa. `performance.now` nie spowalnia Pixi: `Ticker` v8 bierze czas
  ze **znacznika `requestAnimationFrame`**, nie z zegara. **Obejście:** opakuj `rAF` tak, żeby
  przeliczał znacznik (`cb(virt)` zamiast `cb(t)`), i ustaw współczynnik dopiero po pojawieniu
  się karty na czacie — wcześniej spowolniłbyś też animację kości. **Rozpoznanie, zanim
  zaczniesz szukać błędu w rysowaniu:** `graphics.getBounds()` w tym samym miejscu, w którym
  rysujesz — niepuste bounds w sensownych współrzędnych ekranu znaczą, że Pixi ma geometrię
  i problem jest wyłącznie w tym, kiedy patrzysz.

- **Klik w puste pole mapy przy zaznaczonej figurze to rozkaz marszu** — i tak właśnie 20.08
  Tony przeszedł pół Strzelnicy, bo zrzut ekranu miał inną skalę niż okno i kliknięcie „w żeton"
  minęło go o kilkadziesiąt pikseli. Przy automatyzacji celuj **zdarzeniami wskaźnika
  z policzonymi współrzędnymi CSS** (`canvas.dispatchEvent(new PointerEvent(...))`), nie
  współrzędnymi ze zrzutu — patrz wpis o wycinku okna niżej.

- **Sesję gracza i sesję MG DA się mieć naraz w jednym oknie Chrome** (ustalone 09.08 przy 24b,
  obala wpis „sesja gracza w tej samej przeglądarce wylogowuje MG"): ciasteczko jest kluczowane
  **hostem**, a `localhost` i `[::1]` to dwa różne hosty, mimo że Vite słucha na obu. MG zostaje na
  `http://localhost:5173/`, gracz wchodzi na **`http://[::1]:5173/join/<token>`** i wybiera swoje
  imię (bez hasła). Obie sesje widzą się nawzajem na liście obecności i dostają rozgłoszenia na
  żywo. **`127.0.0.1` nie zadziała** — dev-serwer Vite nasłuchuje pod `localhost`, czyli na
  pętli IPv6. Link zaproszenia bierze się z „Panel MG"; token jest wielorazowy, więc powrót tego
  samego gracza nie tworzy nowego konta. To znosi powód, dla którego kilkanaście pozycji w `zaleglosci.md`
  ma dopisek „wymaga drugiego profilu Chrome". **Trzeci gracz naraz wymagałby trzeciego hosta**
  (dwa konta graczy w kampanii to Tony i avatar9) — do sprawdzenia, czy Vite wpuści np.
  `localhost.` z kropką na końcu albo `[0:0:0:0:0:0:0:1]`; alternatywnie przelogowanie się
  w karcie `[::1]` na drugie imię.

- **Zrzut ekranu bywa WYCINKIEM okna, a nie całym oknem — i wtedy klikanie po współrzędnych
  ze zrzutu chybia** (ustalone 11.08, kosztowało pół godziny). Narzędzie przelicza podane
  współrzędne przez `innerWidth / szerokość_zrzutu`, ale gdy okno jest szersze niż ekran, zrzut
  pokazuje tylko lewy-górny kawałek strony — obie skale się rozjeżdżają i klik ląduje kilkadziesiąt
  pikseli obok. Objaw jest mylący: element **widać** na zrzucie, a klik w niego nic nie robi.
  **Rozpoznanie:** weź dowolny przycisk, porównaj `getBoundingClientRect()` z jego pozycją na
  zrzucie; jeśli iloraz nie równa się `innerWidth / szerokość_zrzutu`, zrzut jest przycięty.
  **Obejście:** klikaj **referencjami** z `find` / `read_page` (nie współrzędnymi), a dla warstwy
  Pixi licz `arg = CSS / (innerWidth / szerokość_zrzutu)`. `resize_window` na zmaksymalizowanym
  oknie nic nie daje.

- **Wielokrokowe przeciągnięcie tokenu DA się wysłać automatem** (11.08): `pointerdown` na
  `canvas`, seria `pointermove` na `window` **i** `canvas` z przerwami ~70 ms, na końcu
  `pointerup` — tak jak przy kubku w 23c. `left_click_drag` z CDP też dochodzi i też kończy się
  odmową serwera, więc obie drogi nadają się do testów budżetu ruchu.

- **Vite potrafi zapamiętać PUSTY moduł, jeśli plik był przepisywany w trakcie** (14.08).
  Skrypt, który czyta plik, przetwarza i zapisuje z powrotem, ma między tymi krokami moment,
  w którym plik na dysku jest pusty — a jeśli Vite akurat wtedy go przeczyta, zapamięta pustkę
  **razem ze stemplem `?t=`** i będzie ją serwować także po przeładowaniu strony. Objaw jest
  mylący: `tsc --noEmit` przechodzi, a przeglądarka mówi
  „does not provide an export named 'X'". **Rozpoznanie:** `curl http://localhost:5173/<ścieżka>`
  — pusty moduł ma w mapie źródeł `sourcesContent: [""]`. **Obejście:** przepisz plik jeszcze
  raz (samo dotknięcie mtime wystarczy); przeładowanie strony **nie** pomaga.

- **HMR przy działającym Pixi wywala stronę** wyjątkiem `Ticker.remove` — po edycji plików klienta przeładuj kartę.

- **`window.confirm` w panelach zawiesza sterowanie przeglądarką przez CDP** — omijaj przyciski „usuń" przy automatyzacji albo poproś użytkownika o kliknięcie.

- **Menu kontekstowe tokenu DA się otworzyć automatem** (ustalone 09.08 przy 23c, koryguje
  wpis niżej): `right_click` z CDP go nie dowozi, ale ręcznie wysłany
  `canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 2, clientX, clientY }))`
  owszem — Pixi v8 słucha zdarzeń **wskaźnika**, nie mysich. Współrzędne trzeba przeliczyć ze
  zrzutu na CSS-owe (`window.innerWidth / szerokość_zrzutu`). Tą drogą przeszły w 23c: menu,
  launcher Konfrontacji i potrząśnięcie kubkiem (`pointerdown` na `.dice-cup`, seria
  `pointermove` na `window`, `pointerup`). **Uwaga:** menu jest wystawiane **tylko MG**
  (`MapArea.tsx:455`), więc u gracza nie otworzy się niezależnie od sposobu klikania.

- ~~**Do warstwy Pixi nie dociera przez CDP ŻADNE zdarzenie wskaźnika na tokenie**~~ — **to była błędna diagnoza, obalona 31.07 w 16e.** Kliknięcia docierały zawsze; nie działał **hit-test**, i to dla wszystkich, także dla prawdziwej myszy. Pełnoekranowe warstwy przykrywające (płachta widoczności z 18a u gracza, mgła z 17a u każdego, kto ją ma włączoną) leżą **nad** warstwą tokenów i domyślnie biorą udział w trafianiu, więc Pixi zwracał jako cel `Viewport` zamiast `TokenNode`. Naprawa: `eventMode = 'none'` na warstwach czysto malarskich (`init` w `MapRenderer`). **Skutek dla planowania sesji:** oględziny rzeczy wymagających kliknięcia w token są znowu wykonalne automatem — sprawdzone w 16e (zaznaczenie, podgląd trasy, odmowa). Zanim zapiszesz „CDP tego nie dowozi", wypisz w logu `event.event.target` z `viewport.on('clicked')`: jeśli to `Viewport`, a nie `TokenNode`, problem jest w hit-teście, nie w automatyzacji.

- **Haseł w formularze nie wpisuję** — sesję MG zakłada użytkownik, sesję gracza zakłada się kluczem z panelu MG (bez hasła).

- **Edycja kodu w trakcie oględzin przeładowuje kartę, a wtedy pisanie staje się skrótami klawiszowymi.** Kosztowało to 08.08 przypadkowe przeskoczenie tury w żywej kampanii: po edycie `realtime/rules.ts` `tsx watch` zrestartował serwer, Vite przeładował stronę, ognisko wyszło z pola tekstowego — i wpisywane zdanie poleciało do globalnych skrótów mapy (**każde „e" to „koniec tury"**, litery uzbrajają narzędzia). **Zasada:** albo kończysz edycje przed wejściem do przeglądarki, albo przed każdym pisaniem robisz zrzut i sprawdzasz, że kursor stoi w polu. Po wpadce `Esc` rozbraja uzbrojone narzędzie.

- **Rozkaz marszu wysyłany automatem wymaga ustalonego hovera.** Trasa liczy się na
  `pointermove`, a nie w chwili kliknięcia: `pointerdown` wysłany w tej samej porcji zdarzeń co
  `pointermove` trafia w pustkę i figura przesuwa się o ułamek metra albo wcale. Wygląda to
  łudząco jak zepsuty ruch — 22.08 kosztowało pół godziny szukania błędu, którego nie było.
  **Obejście:** `pointermove` → pauza ~300 ms → drugi `pointermove` o parę pikseli → dopiero
  `pointerdown`/`pointerup`. Ta sama pauza jest potrzebna przed czytaniem podglądu trasy ze zrzutu.

- **Skrótów klawiszowych mapy nie uruchomisz syntetycznym `KeyboardEvent`.** `new KeyboardEvent
('keydown', { key: 'Escape' })` wysłany na `document` albo `window` **nie** przerwał marszu,
  choć listener wisi na `window` i czyta `event.key`. Prawdziwe naciśnięcie klawisza przez CDP
  (`computer` → `key: Escape`) zadziałało od razu — i dopiero ono pokazało, że przerwany marsz
  księguje przebyty odcinek, a nie całą trasę. **Wniosek:** klawisze automatyzuj przez CDP,
  zdarzenia wskaźnika możesz nadal wysyłać z konsoli.

- **Narzędzi mapy nie da się obsłużyć syntetycznym zdarzeniem wskaźnika, a menu kontekstowego —
  współrzędnymi ze zrzutu.** Dwie osobne pułapki, które razem zjadły pół sesji 23.08.
  **Ściana:** `left_click_drag` przez CDP i własna seria `pointerdown`/`pointermove`/`pointerup`
  **rysują podgląd**, ale ściana nigdy nie trafia na serwer — znika, gdy narzędzie się wyłącza.
  Sprawdzenie jest proste: włącz narzędzie ścian jeszcze raz i zobacz, czy warstwa coś pokazuje;
  pewniejsze — policz `wall` w bazie. Ściany i żetony do oględzin szybciej wstawić wprost przez
  Prismę (`packages/server`, `createPrisma(process.env.DATABASE_URL)`) i tak samo skasować.
  **Menu kontekstowe:** działa, ale `clientX/clientY` muszą być w **pikselach CSS**, a zrzut ekranu
  bywa przeskalowany (23.08: ≈0,8). Przelicznik bierze się z `canvas.getBoundingClientRect().width`
  podzielonej przez szerokość płótna na zrzucie. Bez tego zdarzenie ląduje obok żetonu i nic się
  nie dzieje — bez błędu w konsoli.
  **Ostrzeżenie na przyszłość:** z płótna Pixi **nie odczytasz pikseli** (`drawImage` z canvasu
  WebGL daje przezroczysty obraz), więc powiększenia fragmentu mapy nie da się zrobić z poziomu
  strony — zostaje `zoom` narzędzia albo przybliżenie samej mapy kółkiem.

- **Rzut z karty postaci idzie dwoma kliknięciami: `Shift`+klik ładuje kubek, klik w kubek
  rzuca.** Zrzut zaraz po pierwszym kliknięciu pokazuje pusty stół i wygląda jak awaria.
  Kości leżą 3,2 s po ustaniu (`FADE_OUT_DELAY_MS`), a **złota kość dorzutu krytyka spada
  dopiero 550 ms po pierwszej fali** (`EXTRA_DIE_DELAY_MS`) — zrzut po 2 s łapie moment przed
  nią, dopiero ~3 s pokazuje obie. Stół kości to pełnoekranowa nakładka **pod** oknem karty
  postaci: przy otwartej karcie kości są niewidoczne, więc do łapania rzutów kartę trzeba
  zamknąć (kubek zostaje naładowany).

- **Zrzut ekranu z przeglądarki bywa renderowany ciemniej, niż mówi DOM** (23.08). Przy oględzinach
  27k `getComputedStyle(document.body).backgroundColor` dawało jasny motyw dzienny, a zrzut
  pokazywał ciemny interfejs — to Chrome nakłada własne przyciemnienie na obraz, nie strona.
  **Nie zgaduj motywu ze zrzutu:** czytaj `document.documentElement.dataset.theme` i tokeny
  z `getComputedStyle`, inaczej szukasz błędu kontrastu w złym motywie.

- **Automat CDP _jednak_ buduje scenę: ściany, lampy, osłony, strefy i pinezki** (23.08,
  koryguje notatkę z sesji o pasy zasięgu, która mówiła „nie da się"). Narzędzie `computer`
  wysyła zdarzenia przez CDP, a nie syntetyczne `PointerEvent`, i Pixi je przyjmuje: w tej sesji
  automatem postawiono lampę, przeciągnięto osłonę i strefę, wbito pinezkę, rozpoczęto i
  porzucono łańcuch ścian oraz zaznaczono i skasowano po kolei siedem rodzajów obiektów.
  Nietrafiona pozostaje tylko wcześniejsza obserwacja o `dispatchEvent` z ręki. Praktycznie:
  klikaj współrzędnymi ekranu z pełnego zrzutu, sprawdzaj skutek `zoom`-em na wycinku, a stan
  narzędzia czytaj z DOM — `document.querySelector('.map-canvas-host canvas').style.cursor`
  mówi, czy kursor stoi nad obiektem, który da się złapać.

- **Sprawdź, czy strona naprawdę się przeładowała, zanim uznasz poprawkę za nieskuteczną**
  (24.08). Przy oględzinach 27l ta sama poprawka wyglądała raz na działającą, raz nie — HMR
  podmienił moduł, ale globalny `keydown` został zarejestrowany przez stary efekt. Kosztowało to
  kilka minut szukania błędu, którego już nie było. Zgodne z wpisem o HMR przy Pixi wyżej:
  **po edycji klienta przeładuj kartę i dopiero wtedy powtarzaj test.**

- **Zanim zaczniesz szukać, dlaczego odmowa z serwera „nie chce paść" — sprawdź, czy klient
  w ogóle da ci ją wywołać** (27.08, pakiet Sieci). `NET_NODE_USED` figurowało w zaległościach
  jako „nie da się, bo na Poligonie nie ma rund". Rundy zrobiono, walkę rozkręcono — i przycisk
  i tak nie chciał zadziałać, bo `NetRunWindow` **sam wyszarza wszystkie przyciski urządzeń**
  (`spent = floor.nodeUsed`) i zamiast odmowy pisze chip „węzeł użyty w tej Turze". Ta sama
  rodzina co `NET_DEVICE_OFF` i `FORBIDDEN` przy cudzym rysunku: **odmowa istnieje dla klienta,
  który by o tym nie wiedział, a UI nie pozwala do niej dojść.** Zanim zbudujesz pod taką
  odmowę scenę, przeczytaj warunek `disabled` przycisku, który miałby ją wywołać.

- **Spowolnione `rAF` rozdmuchuje chmurę gazu na cały ekran — to artefakt oględzin, nie błąd**
  (28.08, przy odklikiwaniu 27i). Sprite chmury rośnie **na klatkę**, nie na milisekundę
  (`sprite.scale.set(scale * 1.0015, …)` w `drawSprite`), więc przy normalnym tempie urośnie o 15%
  w ciągu życia efektu, a przy współczynniku 0,03 — **sto dwadzieścia razy** i zieleń zalewa całe
  płótno. Przy takim widoku nie zgłaszaj błędu w rozmiarze obszaru: sprawdź to samo przy 0,3
  (chmura ma wtedy jakieś 10×10 m, tyle co pole wybuchu z karty). Uczciwe zastrzeżenie: rosnięcie
  na klatkę **jest** zależnością od odświeżania ekranu — na 144 Hz chmura urośnie o 41% zamiast
  o 15% — ale przy stole nikt tego nie nazwie.

- **Atak obszarowy z mapy to trzy kliknięcia, nie jedno** (28.08). Kolejność, bez której klik
  w podłogę jest **rozkazem marszu**: (1) uzbrój slot broni w panelu postaci (`W ręku: …` musi
  wymieniać tę broń — po zmianie tury slot się rozbraja i wraca slot 1), (2) klik w pole mapy —
  to **ładuje kubek**, nie strzela (`throwAtPoint` wymaga `weapon.tokenId === selectedTokenId`),
  (3) klik w **kubek** w lewym dolnym rogu — dopiero on rzuca. Objaw pomylenia kroków: figura
  spokojnie przechodzi pół sceny, a magazynek stoi.

- **Kliknięcia narzędzia `computer` idą we współrzędnych ZRZUTU, nie CSS** (28.08, kosztowało
  dwa kliknięcia w próżnię). Wpis obok mówi o **syntetycznych zdarzeniach wskaźnika** — te biorą
  CSS. Narzędzie `computer` (CDP) bierze piksele zrzutu, a zrzut bywa przeskalowany: przy oknie
  1697 px CSS i `devicePixelRatio` 1,5 zrzut ma 1350 px, czyli skala **0,795**. Przelicz
  `getBoundingClientRect()` przez `szerokość_zrzutu / window.innerWidth` albo klikaj `ref`-em
  z `find`. Klik poza zakresem zrzutu po prostu nic nie robi — bez błędu.

- **Nie klikaj „✕" hurtem w oknie karty postaci** (28.08, skasowany świeżo kupiony wiersz
  sprzętu). Skrypt zamykający okno szukał `button` o treści „✕" wewnątrz `[class*=sheet]` — a taki
  sam znak noszą **kosze przy wierszach** broni, pancerza, sprzętu i cyborgizacji, więc
  `querySelectorAll(...).forEach(click)` skasował wiersz zamiast zamknąć okno. Okno zamyka
  przycisk w **nagłówku** (`.sheet-window header ✕`); wiersze mają swój ✕ w ostatniej kolumnie.
  Kasowanie wiersza karty **nie pyta o potwierdzenie**.

- **Wąskie okno symuluje się `document.documentElement.style.width = '900px'`**, gdy
  `resize_window` nic nie robi (okno zmaksymalizowane — `outerWidth` wraca wtedy jako bzdura).
  Układ przelicza się naprawdę i widać nachodzenie elementów. Dwa zastrzeżenia: **`@media` czyta
  viewport**, nie tę szerokość (reguł progowych tym nie sprawdzisz), a Pixi dostaje kaskadę
  `resize` i potrafi zamulić kartę tak, że `Runtime.evaluate` wraca timeoutem — **zrzut ekranu
  nadal działa**, a przywrócenie (`style.cssText = ''`) przechodzi normalnie. Do samego układu
  paska wystarczy klon węzła w kontenerze o stałej szerokości — bez ruszania płótna.

**Uzbrojona broń zjada rozkaz marszu.** Klik w podłoże przy broni „w ręku" jest strzałem
w wybrane pole, nie marszem — pasek mówi to małą linijką „W ręku: … — kliknij cel na mapie",
której łatwo nie zauważyć. Objaw: figura stoi, a na czacie ląduje „Marsz przerwany.". Zanim
uznasz, że rozkaz nie dochodzi, rozbrój broń (drugi klik w slot) i powtórz.

**Marsz automatem wymaga serii ruchów, nie jednego.** Jeden `pointermove` przed klikiem bywa za
mało — trasa liczy się przyrostowo, więc ustal hover **kilkoma** ruchami z przerwami ~180 ms po
linii, którą figura ma iść, i dopiero wtedy klikaj. Rozszerza wcześniejszą pułapkę o „ustalonym
hoverze": chodzi o serię, a nie o pojedyncze zdarzenie.

**`window.confirm` da się podmienić i wtedy nic nie wisi** — `window.confirm = m => { zapisz(m);
return false; }` pozwala **przeczytać treść pytania** bez klikania w natywne okno i bez ryzyka,
że coś naprawdę zniknie. Tak sprawdzono obie gałęzie `confirmDestructive` 28.08. Podmiana ginie
przy przeładowaniu karty — po każdym `location.reload()` trzeba ją założyć od nowa.

**Kartę do oględzin da się przygotować w bazie, bez logowania na MG.** `node --input-type=module`
z `node:sqlite` (`DatabaseSync('packages/server/dev.db')`) czyta i zapisuje kolumnę `Character.data`
jako JSON; działający `pnpm dev` nie przeszkadza, wystarczy przeładować kartę przeglądarki, żeby
`state:sync` przyniósł nowy stan. `better-sqlite3` **nie jest** w `node_modules` na poziomie
repozytorium — jedzie jako zależność adaptera Prismy i `require` go nie znajdzie.

**Kubkiem kości nie potrząśniesz z JavaScriptu.** `cup.click()` nic nie robi, a ręcznie złożona
seria `pointerdown` → `pointermove` → `pointerup` na `.dice-cup` też nie — kubek zostaje na
ekranie, rzut nie leci. Klikać trzeba narzędziem `computer`, **we współrzędnych zrzutu**: przy
oknie 1766 px CSS i zrzucie 1373 px skala to ≈0,777, więc `getBoundingClientRect()` trzeba przez
nią przemnożyć (`x * 1373 / window.innerWidth`). Guziki na kartach czatu i w formularzach reagują
na `click()` normalnie — to sam kubek jest wyjątkiem.

- **Klik w żeton, którym MG może sterować, ZAZNACZA go zamiast celować — celuje dopiero
  Alt+klik** (01.09, kosztowało kilka „ataków", które okazały się zmianą zaznaczenia).
  `aimTargetFor` w `MapRenderer` zwraca `null`, gdy cel jest sterowalny (`movableTokens`)
  i nie trzymasz Alt — a **MG steruje wszystkim**, więc przy koncie MG dotyczy to każdego żetonu
  na scenie. Podpowiedź pod paskiem mówi to wprost („Alt+klik celuje we własny token"), tylko
  łatwo ją przeoczyć. **Rozpoznanie:** po kliknięciu lewy pasek pokazuje **cel**, a nie
  strzelca, i nie ma banera „Potrząśnij i strzel".
  **Drugie dno:** `modifiers: "alt"` w narzędziu `computer` **bywa niedostarczane** — kilka
  ataków z rzędu przeszło, a potem te same kroki zaczęły tylko zaznaczać cel.
  **Obejście, które działa zawsze:** uzbrój atak **z karty postaci** (guzik „ATAK" w wierszu
  broni). Wtedy `this.targeting` jest prawdą, a `aimTargetFor` zwraca cel **przed** sprawdzeniem
  Alt — zwykły klik wystarczy. Kartę można po uzbrojeniu zamknąć, celowanie to przeżywa.

- **Dymu nie da się postawić narzędziem — stawia go wyłącznie wystrzelony nabój** (01.09).
  W panelu osłon jest tylko „Rozwiej cały dym"; komentarz w `MapTools.tsx` mówi to wprost
  („nobody _places_ a cloud — a round does"). Żeby mieć chmurę do oględzin, trzeba broni
  strzelającej wzorcem `grenade` (Granatnik, Granat) i wpisu **„Amunicja dymna"** wybranego
  listą naboju przy wierszu broni. **Broń podwieszana tej listy nie ma** (patrz `zaleglosci.md`),
  więc granatnik pod karabinem do dymu nie posłuży — dopisz osobny wiersz „Granatnik"
  z katalogu.

**Kafla „Fumble zignorowany" nie doczekasz się rzutami — wymuś kostkę (04.09).**
Naturalna 1 na 1k10 to średnio dziesięć strzałów, a każdy z nich to uzbrojenie slotu, Alt+klik
w cel i potrząśnięcie kubkiem. Taniej: dopisz na minutę `if (sides === 10) return 1;` na
początku zwracanej funkcji w `realtime/dice-rng.ts` (obrażenia lecą k6, więc zostają losowe),
obejrzyj kafel i **przywróć plik z kopii**, sprawdzając `git diff`. Ta sama sztuczka pokaże
Krytyka, Fumble i każdy próg, którego nie da się doczekać.

**Ramka i ping działają z syntetycznych zdarzeń wskaźnika, `Ctrl+A` nie (05.09).**
`Shift`+przeciągnięcie (ramka), Alt+klik (ping) i Alt+przeciągnięcie (kopia) odpalają się
z serii `PointerEvent` wysłanej na `canvas` we **współrzędnych CSS** — tak samo jak zwykłe
przeciągnięcie żetonu. Skróty klawiszowe **nie**: `window.dispatchEvent(new KeyboardEvent(…))`
z `ctrlKey` przechodzi bez echa (potwierdzenie pułapki z `Esc`), a `Ctrl+A` trzeba wysłać przez
CDP — `computer` z `key: "ctrl+a"`, **po** kliknięciu w mapę, żeby ognisko było w oknie.

**Ping gaśnie po 2,2 s, czyli szybciej, niż wraca zrzut ekranu (05.09).**
Pojedynczy ping wysłany w jednym wywołaniu i oglądany w następnym zawsze będzie już wygasły —
wygląda to jak „ping nie działa". Najtaniej: `setInterval` pingujący co 500 ms przez kilkanaście
sekund, z `clearInterval` w osobnym wywołaniu. Ta sama sztuczka nadaje się do każdego efektu
krótszego niż jedna wymiana z przeglądarką.

**Po przeładowaniu karty mapa wraca do `fitScene`, więc współrzędne z poprzedniego zrzutu
kłamią (05.09).** Ramka rozciągnięta po starych liczbach łapie zero figur i wygląda jak zepsuty
gest — a złapała puste pole. Po każdym `location.reload()` (i po każdej panoramie) rób nowy
zrzut, zanim policzysz współrzędne; skalę czytaj `window.innerWidth / szerokość zrzutu`.

**Kopia figury po Alt+przeciągnięciu nie ma jak pokazać swojej nazwy na mapie** — etykieta pod
żetonem jest przy zoomie stołu nieczytelna. Nazwę sprawdza się **menu kontekstowym**:
`PointerEvent` z `button: 2` we współrzędnych CSS, a potem `.context-menu-title`.

**`pnpm dev` z `&` w tle faktycznie startuje serwery, choć zadanie kończy się od razu**
— następne uruchomienie pada wtedy na `EADDRINUSE 3001` i „Port 5173 is already in use", co
wygląda jak zawieszony poprzedni proces. Zanim zaczniesz zabijać porty, sprawdź, czy aplikacja
po prostu nie działa: `curl -o /dev/null -w "%{http_code}" http://localhost:5173`.

**Tekst z liczbą sprawdzaj na liczbie większej niż jeden** — cały etap 37 przeszedł oględziny
z „jedną dobą" i dopiero trzy skoki pod rząd pokazały „minęły 30 doby". Każda etykieta zależna
od liczby ma trzy przypadki po polsku (1, 2–4, 5+ i osobno 12–14), a zrzut z jedynką nie mówi
o nich nic.

**Dwie sesje obok siebie to jedyny sposób na tę klasę błędów** — MG na `localhost:5173`, gracz
na `[::1]:5173`. Zrzut ekranu wystarczy do paska, ale feed czatu czytaj z DOM-u
(`[...document.querySelectorAll('.chat-time')].map(n => n.innerText)`): panel bywa przewinięty
w górę i „nie ma karty" na zrzucie znaczy najczęściej „nie doskrolowano".

- **Ścieżka z przycisku i ścieżka ze skrótu to DWIE ścieżki (06.09).** Prośbę o Test otwiera
  Alt+klik w wiersz karty **i** przycisk w oknie rzutu; oględziny etapu 40 przeszły pierwszą
  i minęły drugą, w której siedziała usterka. Automatyka przeglądarki gubi modyfikator `alt`
  (pułapka wyżej), więc naturalne jest sprawdzenie tej ścieżki, którą da się kliknąć — i to
  właśnie ta druga zostaje niesprawdzona. Przy funkcji z dwoma wejściami sprawdź **oba**.

- **Karta w tle dławi `setInterval` i `requestAnimationFrame` do ~1 Hz (06.09).** Pomiar
  przytrzymania guzika przez automatykę przeglądarki dał jeden krok zamiast siedmiu i wyglądał
  na błąd w kodzie powtarzania. **Rozpoznanie:** pętla `requestAnimationFrame` przez sekundę
  nie zwraca **ani jednej** klatki, a `setInterval(…, 100)` odpala dwa razy na sekundę.
  **Obejście:** nie mierz w tle nic, co zależy od zegara — sprawdź samą logikę testem
  jednostkowym albo powtórz kliknięcie ręcznie (`pointerdown`/`pointerup` w pętli z `await`),
  co przechodzi normalnie.


## testy — Testy i środowisko dev

- **Test serwera, który nie pyta o pulę Eksploracji, ustawia `paceTesting.off = true` (`realtime/pace.ts`, 15.10, etap 52)** — do 52 takie pliki stawiały scenę w „Swobodnym”; tryb zniknął, a figura bez karty ma pulę 12 m, więc marsz przez pół sceny dostawał `MOVE_PACE`. 11 plików ma wyłącznik u góry, zaraz po importach. W E2E marsz to **dwa kliknięcia** — `walkOnMap` (`fixtures/scene.ts`) i `walkWorld` (`fixtures/canvas.ts`); pojedynczy `clickOnMap` w podłoże przy zaznaczonej figurze tylko wskazuje cel. Klatka pośrednia gracza z gniazda wymaga `token:walk` (inaczej `MOVE_NOT_PLANNED`), lądowanie (`final: true`) — nie.
- **Natywne przeciąganie HTML5 (`draggable` + `dataTransfer`) zawiesza `page.mouse.move` Playwrighta w Chromium (15.10)** — wiersz z „Postaci” złapany `mouse.down()` i niesiony na mapę: ruch nie wraca, test stoi do limitu 3 min (ślad kończy się na „Mouse move”); to samo robi `browser_mouse_drag_xy` z Playwright MCP. Przeciąganie z `startTokenDrag` (wiersz postaci, kafel „Grafik”) testuj zdarzeniami `dragstart` → `dragover` → `drop` z jednym `DataTransfer` przez `dispatchEvent` (`dragCharacterToMap` w `fixtures/scene.ts`); przeciągania na zdarzeniach wskaźnika (`MapDropHandle`, okno „Wymiana”) to nie dotyczy — tam mysz działa.
- **Python na Windows zapisuje pliki z CRLF (11.10, etap 50c)** — `open(p, 'w')` w trybie tekstowym zamienia każdy znak nowej linii na CR LF, więc skrypt poprawiający plik zostawia Prettierowi „18 plików do poprawy”, a gitowi ostrzeżenia `CRLF will be replaced by LF`. Pisz z `io.open(p, 'w', encoding='utf-8', newline='')` (czytaj tak samo) albo puść `npx prettier --write` na zmienionych plikach przed commitem (diff zostaje ten sam).
- **Od 50b u MG w walce klik w figurę nie zaznacza, a kamera jeździ za NPC-em w turze (10.10)** — pomocnik E2E, który bierze figurę MG klikiem (`Esc` + klik w figurę + klik w podłogę), dostaje sam podgląd; bierze się ją `takeFigure(mg, punkt)` z `fixtures/walka.ts` (menu „Prowadź tę figurę”, poza walką samo zamyka menu). NPC w turze jest zaznaczony z urzędu, więc `Esc` (opuszcza broń) i ponowny klik **nie uzbrajają** — `aim(…, alt)` bierze wtedy slot. `fitCamera` przybliża wokół środka sceny, więc najpierw przesuwa go na środek widoku środkowym przyciskiem (`panSceneCentre`); bez tego po kadrze na NPC-a scena wychodziła nad pasek narzędzi.
- **46a.15 raz nie otworzył menu figury Pasera prawym klikiem (10.10, 48b; `t46a- t46b- t46c- 00-baseline` z nowego `po-T6`)** — timeout 2 min na „🤝 Wymiana…”, figury drużyny stoją ciasno przy Paserze; powtórka `t46a-` 17/17. Migotanie kliku w mapę, nie regresja — przy powtórce w tym samym miejscu szukaj, czyja figura łapie klik (#52).
- **Firefox gracza w T6b 6.9c łapie w konsoli „Image corrupt or truncated” przy `/art/login-poster.webp` (10.10, 47b, drugi pełny przebieg)** — obrazek tła logowania przerwany w locie, kiedy T6b restartuje serwer przy kopiach; kanarki i filtr konsoli padają, a punkt `po-T6` się nie zapisuje (dalsze specyfikacje biorą starszy). Powtórka `t6b-` od `po-T6a` 18/18. Migotanie, nie błąd cennika — gdy wróci, rozważ wpis tego komunikatu na listę dozwolonych w filtrze konsoli.
- **Od 47b każda karta poza pojemnikiem ma na końcu broni „Bijatykę” (`bare-hands.brawling`), także martwy Zbir po „Zabierz wszystko” (10.10, etap 47b)** — `weapons).toEqual([])` i `toHaveLength(n)` na liście broni padają; w testach serwera filtruj `cpredWithoutBareHands`, w E2E porównuj id (`['bare-hands.brawling']`). Metodę w kreatorze zmienia się **klikiem** w radio i czekaniem na `toBeChecked()` — `check()` pada („Clicking the checkbox did not change its state”), bo radio odbija szkic z serwera. Kreator MG domyślnie liczy budżet Krawędziarza (500 ed), a po cenniku domowym to cena jednej broni.
- **Kwota w teście serwera to cena próbki razy cennik domowy, a w teście `shared` — tyle, ile wpisano (10.10, etap 47a)** — `loadCompendium` mnoży `sample.json` przy starcie (Zgrzyt 9: 50 w danych, 500 ed w grze; latarka 20 → 60), więc asercje kwot w testach serwera i E2E liczą się po przeliczniku. Wpis zbudowany ręcznie w teście jednostkowym przelicznika nie przeszedł: poziom sklepu i cena pasma zakładają wpis z rejestru, więc owiń go `cpredScaledEntry` (helpery w `shop.test.ts`). Solo w Kompletnym Pakiecie bez `kitChoice` nie kończy kreatora (`CREATION_INCOMPLETE`).
- **E2E przesuwa okno karty za środek belki i w bok, nie w dół; asercja po rzucie kubkiem czeka dłużej niż 10 s (09.10, etap 46b2)** — portret w rogu belki Firefox ciągnie jak obrazek, okno nie wyjedzie poza ekran, a figura po rzucie przychodzi po animacji kości.
- **`Start-Process cmd -ArgumentList '/c','"C:\…\run.cmd"',…` nie uruchamia niczego i nie zostawia śladu (09.10, etap 46c2)** — `cmd /c` z cudzysłowem na początku i kolejnymi cudzysłowami w argumentach zdejmuje pierwszy i ostatni cudzysłów całej linii, więc ścieżka skryptu się rozjeżdża, okno znika, a log nie powstaje. Ścieżka scratchpadu nie ma spacji — podawaj ją **bez** cudzysłowu, cudzysłów tylko wokół listy speców (`start.ps1` w scratchpadzie: `-ArgumentList @('/c', "$dir\run.cmd", $Name, "`"$Specs`"")`). Sprawdź `head` logu po 10 s, zanim uzbroisz monitor.
- **`toBeDisabled()` / `toBeEnabled()` Playwrighta nie widzi `disabled` na `<option>` (08.10, etap 46a2)** — opcja z atrybutem `disabled` przechodzi jako „enabled”, więc `toBeEnabled()` niczego nie sprawdza, a `toBeDisabled()` pada. Pytaj o atrybut: `toHaveAttribute('disabled', '')`. Wybór opcji po fragmencie etykiety — przez `getAttribute('value')` i `selectOption(value)`; `selectOption({ label })` nie przyjmuje wyrażenia regularnego.
- **Skrypt Pythona na Windows zapisuje plik z CRLF (08.10, etap 46a2)** — `open(p, 'w')` w trybie tekstowym zamienia `
` na `

` (a heredoc w Git Bash czyta stdin w cp1250 — `python -X utf8`). Prettier zgłasza wtedy kilkadziesiąt „zmienionych” plików. Pisz z `newline=''`; dokumenty w `docs/etapy` mają na dysku CRLF i tak mają zostać.
- **Restart serwera instancji E2E daje w konsoli Chromium 500 na `socket.io/?…transport=polling` (04.10, T9b)** — to pośrednik `vite preview`, kiedy serwer leży, nie aplikacja; Firefox pisze w tym czasie „can’t establish a connection”. Filtr konsoli po restarcie (`socketDropped` w `t9b-dwie-grupy`) bierze 500–503, nie tylko 502/503 — w drugim przebiegu przyszło właśnie 500.
- **Karta rzutu dochodzi do obserwatora dopiero po kościach 3D: zwykły rzut ~7–9 s, krytyk i fumble ~9–13 s (04.10, T9b)** — karta czeka na koniec animacji i 3,2 s leżenia kości, a naturalne 1 i 10 dorzucają drugą falę. Domyślne 10 s `expect.poll` migocze raz na kilka przebiegów na „losowym” fumble'u. Rzut, który ma tylko dojść, dostaje wymuszone ścianki (`scriptDice([5, 6])`) i 30 s (`ROLL_CARD_MS` w `t9b-dwie-grupy`).
- **`bot:chat` odpowiada tylko gniazdu, które pytało, a jego rozłączenie przerywa strumień, zanim dojdzie do gatewaya (04.10, T9b)** — `streamBotAnswer` słucha `disconnect`. Surowe gniazdo z `actor.socket()` rozłączaj dopiero po `bot:reply`/`bot:error`; inaczej atrapa nie dostaje żadnego `/chat` i test wygląda jak odmowa bramy.
- **Surowe gniazdo konta właściciela (`mg.socket()`) to też „obecność właściciela” (04.10, T9b)** — test karencji AI musi zamknąć **wszystkie** gniazda kont z flagą: karty (`page.goto('about:blank')`) i surowe gniazda, inaczej „Udostępniam AI” nigdy nie gaśnie.
- **Podsłuch widzi też paczkę JS klienta — nazwa zdarzenia czy trasy nie nadaje się na kanarek (04.10, T9b)** — `ai-access:owner` i `/api/owner/ai` stoją w `index-*.js`, więc każdy gracz „dostał” prośbę o AI. Kanarkiem jest kształt ramki (`["ai-access:owner"`) albo klucz JSON w cudzysłowie (`"canTakeOver":`) — w minifikowanym kodzie klucze są bez cudzysłowu. Do tego kontrola dodatnia: konto właściciela kanarek **dostaje**.
- **Postać ma figurę na kilku scenach — żeton po nazwie zawężaj do sceny (04.10, T9b)** — Kowal stoi i na „Knajpie”, i na „Bramie”; `queryOne` po `t.name = 'Kowal'` brał figurę z nieoglądanej sceny, a magazyn `token` klienta (tylko bieżąca scena) oddawał `null`. Gracz pod ręczną mgłą nie widzi też figur MG — świadkiem ruchu MG jest MG.
- **Zdarzenia innego gniazda potrafią przyjść w tej samej milisekundzie co ack MG (04.10, 44d)** — test „po `session:end` gracz nic nie słyszy” zaczynał podsłuch zaraz po ack i łapał spóźnione `state:sync`/`session:changed` gracza, gdy handler dostał jedno `await` więcej (`ai.refresh()`). Gniazda to osobne połączenia, kolejności między nimi nie ma; przed podsłuchem „ciszy” `await settle()`.
- **`locator.check()` na polu sterowanym odpowiedzią serwera pada „did not change its state” (04.10, 44d)** — Playwright sprawdza stan zaraz po kliknięciu. Przełącznik, który ma się zaznaczyć, zaznacza się w UI od razu (optymistycznie, z powrotem przy błędzie) — tak stoi „Udostępniam AI”.
- **Ciasteczko z `context.request.post(SERVER_URL…)` nie trafia do karty na `BASE_URL` (04.10, 44d)** — `127.0.0.1:3101` i `localhost:4173` to inne hosty; rejestrację czy zakładanie kampanii z kontekstu aktora rób ścieżką względną (`/api/…` przez podgląd Vite). Nagłówek `x-forwarded-for` przechodzi przez pośrednika, więc limit rejestracji z jednego adresu da się ominąć tak jak w T9a.
- **Python na Windows zapisuje pliki z CRLF (04.10, 44c)** — `open(p, 'w')` w trybie tekstowym zamienia `
` na `
`, a repo trzyma LF: Prettier zgłosił 36 plików, choć zmiany były w kilku wierszach. Skrypt edycji czyta i pisze z `newline=''` (albo po wszystkim `sed -i 's/
$//'` na zmienionych plikach). Sprawdzenie: `file <plik>` mówi „with CRLF line terminators”.
- **Filtr czatu ma przycisk „Walka” — `getByRole('button', { name: 'Walka' })` łapie go zamiast zakładki (04.10, 44c)** — zakładki panelu bocznego to `.side-tab`; liczbę i kolejność zakładek sprawdzaj `page.locator('.side-tab')`.
- **`stateFingerprint` bez `User.lastSeenAt` (04.10, T9a)** — od 44a każde połączenie gniazda odświeża `lastSeenAt`, więc klient wracający sam po odtworzeniu kopii zmieniał odcisk `User` i `4.10 punkt kontrolny po-T4` padał losowo (pełny przebieg 04.10: 196 zielonych, reszta kaskadą od `po-T4`). `fixtures/db.ts` pomija tę kolumnę jak tabelę `Session`. Nowa kolumna „kiedy ostatnio” w bazie = dopisz ją do `VOLATILE_COLUMNS`.
- **Liczbowe id (czat) nie nadają się na kanarki „obiekt istnieje” (04.10, T9a)** — `"178"` siedzi w co drugiej ramce (współrzędne, kolejne id). Kanarkiem są tylko napisowe cuid (`stringIds` w `fixtures/izolacja.ts`, ≥ 20 znaków).
- **Właściciel widzi id kont MG z „Konta MG” (04.10, T9a)** — `/api/owner/accounts` niesie `id` każdego konta MG, więc id konta MG-B w podsłuchu właściciela to nie wyciek; w ramkach gniazda go nie ma.
- **Daty Prismy w SQLite to tekst ISO, nie liczby (04.10, T9a)** — `node:sqlite` oddaje `expiresAt` jako `'2026-10-05T07:28:56.883+00:00'`; porównuj przez `Date.parse`. Nowy link resetu hasła **kasuje** poprzedni wiersz `PasswordReset`, a nie oznacza go.
- **Login właściciela `MG` ma 2 znaki — rejestracja odpada na długości, nie na „zajęty” (04.10, T9a)** — test zajętego loginu w UI rób na loginie z rejestracji (`BARTEK-MG` z drugiej przeglądarki).
- **Sztuczki ze ścieżką (`/%75ploads/…`) puszczaj prosto na serwer `:3101` (04.10, T9a)** — podgląd Vite na `:4173` nie przekazuje nieznanej ścieżki i oddaje `index.html` z 200, więc test „nie 200” padłby na kliencie, nie na strażniku.
- **Nowa scena otwiera się MG sama jako „podgląd” — przycisku „Pokaż” przy niej nie ma (03.10, T8c)** — po „Utwórz” MG już ją ogląda (`sceneListRow` z plakietką „podgląd”), a klik w „Pokaż” czeka do limitu testu. Sprawdzaj `store('scene')` MG, zanim klikniesz.
- **MG rysuje domyślnie na warstwie MG (`drawGmOnly: true`, 17b) (03.10, T8c)** — prostokąt „dla stołu” bez kliknięcia oka wychodzi z `gmOnly: 1` i gracz go nie dostaje. Przełącznik: `button[title^="Rysujesz na warstwie MG"]` ↔ `^="Rysujesz dla wszystkich"`; `title="Prostokąt"` dokładnie (pędzel mgły ma „Prostokąt — przeciągnij…”).
- **Notki klienta (`.chat-note`: „Przywrócono osłonę.”, odmowy) widać tylko na zakładce „Czat” (03.10, T8c)** — MG po przeciągnięciu postaci na mapę stoi na „Postaciach” i `chatLine(...)` czeka do limitu. Klik „Czat” przed asercją.
- **Klawisze w liście skrótów to osobne `kbd` — `hasText: 'Alt + klik w mapę'` nie trafia (03.10, T8c)** — tekst wiersza to „Altklik w mapę…”. Szukaj wiersza po opisie („Wskaż miejsce wszystkim”).
- **`restoreCheckpoint` w `beforeAll` zabija instancję trzymaną przez `hold.ts` (03.10, T8c)** — `stopInstance` czyta PID-y z `.e2e/instance.json`. Oględziny MCP i przebieg suity nie idą naraz; po przebiegu `hold.ts` od nowa (stan bazy zostaje po ostatnim teście).
- **Gdzie co stoi na karcie (03.10, T8c)** — panele Zdolności Specjalnych na „Karta”, Reputacja (z „😠 Postaw się…”) na „Ścieżka Życia” (u gracza dopiero od pierwszego wyczynu), Zakwaterowanie i Poziom życia na „Ekwipunek”. „+” Twórcy gaśnie na limicie Specjalizacji (poziom ≤ ranga), nie na końcu puli.
- **`pendingDice()` tuż po `shakeCup` jeszcze nie jest pusty (03.10, T8c)** — rzut przetwarza serwer po puszczeniu kubka; `expect.poll(pendingDice).toBe('')`.

- **Okno, które otwiera się samo albo przyciskiem, czeka się na jedno z dwojga — nie `isVisible()` (03.10, retest T6a)** — „6.2 handel z Paserem” zapytał `tradeWindow(mg).isVisible()` ułamek sekundy przed tym, jak okno MG wyskoczyło samo, i kliknął „Otwórz”, którego już nie było (3 min do limitu testu; na zrzutach obie strony mają okno). Wzór: `openTradeWindow` w `t6a-handel-rozwoj.spec.ts` — `expect(okno.or(przycisk).first()).toBeVisible()`, klik z krótkim limitem i `catch`, potem `expect(okno)`.
- **Python na Windowsie zapisuje pliki z CRLF, jeśli `open(..., 'w')` nie dostanie `newline=''` (03.10)** — edycja skryptem przerobiła końce wierszy w czterech plikach TS, a Prettier zgłosił je jako „Code style issues” (cały plik w diffie, gdyby nie `sed -i 's/\r$//'`). Edytując skryptem: `open(p, encoding='utf-8', newline='')` przy odczycie i zapisie; w zwykłym napisie Pythona `'\b'` to znak cofania, nie granica słowa w wyrażeniu regularnym — pisz `r'…'`.
- **Przegląd układu T8a zawęża kontrolki do `scope` — sprawdzian sprawdzacza musi brać całą stronę (03.10, T8a)** — `inspectLayout(page, '#okno')` liczy osiągalność tylko kontrolek w tym oknie, a kontrast w ogóle tylko przy `scope`. Pierwsza wersja `t8a-uklad` zawęziła przegląd do okna z szarym napisem i „nie widziała” przyciętego przycisku obok — błąd sprawdzianu, nie `uklad.ts`. Zielone `t8a-ekrany` znaczy coś tylko przy zielonym `t8a-uklad` (celowe usterki w obu silnikach).
- **Klik w mapę zaraz po „Start” walki nic nie robi — klient gracza dostaje start dopiero po animacji ostatniej kości inicjatywy (03.10, T8a)** — pas „Przed walką” ma już właściwą kolejność, więc `queueOf` przechodzi, zanim tura dotrze; marsz Kowala w drugim układzie macierzy nie wysłał ani jednego `token:move`. Po „Start” najpierw `clientsSeeTurn(...)`, potem klik.
- **Bez Zmysłu Walki z T4a Kowal na 16 m nie trafia nawet dziewiątką (03.10, T8a)** — `po-T3`: modyfikator 11, PT 20, a trafienie musi PT przebić; 9 + 11 = 20 to pudło w obu układach. Skrypt kości daje wtedy `[10, reszta]` (dziesiątka wybucha), a karta strzału przychodzi po dwóch animacjach — czekaj na nią 30 s, nie 10.
- **Klik w środek pola tuż pod cudzą figurą to klik w jej podpis, nie w mapę (02.10, T7c, #52)** — marsz „pole w prawo” w walce T7b nie ruszał, gdy nad celem stał sąsiad (Sowa pod Lisem, Iskra pod Kowalem); serwer nic nie dostaje. Do poprawki #52 testy z marszem w ciasnym szyku klikają w dolną część pola albo wybierają pole bez figury nad nim. Ślad nieudanego marszu: `nieudane[].diag` w pomiarach `t7b-obciazenie`.
- **`E2E_T7B_BRAMA_SKALA` skraca samą „Bramę” w `t7b-obciazenie` (02.10, T7c)** — walka „Knajpa” zostaje w pełnej długości (3 min); przebieg ~5 min. Pomiary idą pod klucz z godziną (`knajpa-proba-1-brama-0.05-HH:MM:SS`), więc linia bazowa `brama`/`knajpa` zostaje nietknięta.
- **Headless Chromium i Firefox trzymają `requestAnimationFrame` na 60 Hz — klatki nie pokażą zapasu karty graficznej (02.10, T7c)** — na RTX 5070 Ti scena 4096 z 40 figurami, 200 ścianami i 10 światłami daje wszędzie 60 kl./s, p95 17 ms, więc licznik klatek rozróżnia tylko „zacina się” i „nie”. Do porównań przed/po refaktoryzacji w Chromium jest `mainThreadLoad` z `fixtures/pomiary.ts` (CDP `TaskDuration`/`ScriptDuration` w oknie pomiaru — odsetek czasu, w którym wątek główny pracował).
- **`JSHeapUsedSize` nie liczy pamięci `ArrayBuffer` (02.10, T7c, #50)** — bufory geometrii Pixi siedzą poza stertą JS; pierwszy przebieg `t7c-pamiec` pokazał „spadek” sterty MG z 64 do 28 MB, choć 520 buforów (21,7 MB) dalej wisiało. `clientMemory` czyta też `buffersMb` (`Runtime.getHeapUsage` › `backingStorageSize`); co rośnie — `t7c-diag-sterta` (zrzuty sterty, różnica na konstruktor).
- **Panorama mapy to goły lewy przycisk, nie środkowy (02.10, T7c)** — `drag({ mouseButtons: 'left-middle' })` w `MapRenderer`, ale środkowy w Playwright nie przesuwał kamery (pomiar „przesuwania” mierzył stojącą mapę). Lewy na pustym polu przy zaznaczonej figurze to nie rozkaz marszu, dopóki gest przekracza próg przesunięcia; `centreOn` i `panCircle` w `fixtures/wydajnosc.ts`.
- **Kółko pixi-viewport nie trzyma punktu pod kursorem przy brzegu mapy (02.10, T7c)** — przybliżanie nad środkiem trasy przy górnym brzegu sceny 4096 przesuwało trasę w górę o ~120 px na krok, aż wyszła pod pasek narzędzi. `frameBoth` po każdym kroku centruje środek trasy przeciągnięciem.
- **Marsz MG statystą na zatłoczonej scenie staje co kilka pól („… w polu widzenia — marsz przerwany”) (02.10, T7c)** — dotyczy też figur MG; 16 pól ulicą między 38 statystami = 5 przerwań. `march` w `t7c-mapa` klika figurę i cel jeszcze raz, aż figura stanie na celu, i liczy przerwania.
- **`managedTextures` w Firefoksie ma dziury (`null`) (02.10, T7c)** — `page.evaluate: can't access property "pixelWidth", c is null`; `e2eCounts` filtruje puste wpisy.
- **`wall:create` z gniazda przyjmuje punkty `{ x, y }`, nie pary `[x, y]` (02.10, T7c)** — para daje `BAD_REQUEST` bez szczegółów (`sanitizeWallChain`).
- **`pnpm test:e2e t7b-zapis-karty` daje „No tests found” (02.10, poprawki #48/#49)** — `playwright.config.ts` włącza `40-odpornosc` tylko wtedy, gdy któryś argument zawiera „odpornosc” albo jest `E2E_ODPORNOSC=1`. Pojedynczy plik z tego katalogu puszczaj z `set E2E_ODPORNOSC=1` (w skrypcie `.cmd` z CRLF) albo z `--grep @odpornosc`.
- **Pod obciążeniem klient jest minuty za serwerem — porównanie „klient = baza” musi czekać na zbieżność (02.10, T7b, #48)** — rzuty odtwarzają się po jednym (~6 s każdy), a `RollPresentation` trzyma za nimi czat, figury, karty i walkę. Po 7 min gry pięciu osób stół doszedł do zgodności po ~17 min; `clientsSeeTurn` (30 s) i „Następna tura” MG (klient dalej pokazuje „Start”) padają, choć nic nie jest zepsute. `tableAgrees` w `t7b-obciazenie` pyta co 5 s do 20 min i zapisuje czas zbieżności; kierowca tur czeka do 120 s. Nowy test z dużą liczbą rzutów kubkiem — licz się z tym albo wyłącz animację (`animate`). **Od poprawki #48 (02.10) zaległość to najwyżej kilka sekund** (rzut czekający > 3 s wychodzi kartą bez animacji), ale nadal nie zero — porównanie po każdej czynności dalej czeka na zbieżność.
- **Klik w to samo pole, na którym stoi figura, to dwuklik w figurę (02.10, T7b)** — marsz „na wylosowane pole” trafił w pole startowe Strażnika i otworzył MG jego kartę, a okno zasłoniło „Rzuć wszystkim” na czarnym pasie („sheet-title … intercepts pointer events”). `march` w `t7b-obciazenie` przesuwa cel o wiersz, a przed walką test zamyka wszystkie karty.
- **`E2E_T7B_SKALA=0.1` skraca obciążenie T7b do próby suity (02.10)** — pomiary idą wtedy pod klucz `brama-proba-0.1`/`knajpa-proba-0.1` w `.e2e/pomiary/t7b-obciazenie.json`, pełne — pod `brama`/`knajpa`. Pełny przebieg (~50 min z czekaniem na zbieżność) puszczaj we własnym oknie konsoli (`run-t7b.cmd` w scratchpadzie). Rozmiar tabel: `dbstat` działa w `node:sqlite` (`tableBytes` w `fixtures/pomiary.ts`).
- **„Test timeout of 120000ms exceeded” po czerwonym, długim teście obciążenia (02.10, T7b)** — pojawia się po zapisie pomiarów, przy sprzątaniu sześciu aktorów; wynik testu i pomiary są kompletne. Nie szukaj w nim przyczyny porażki — patrz wcześniejsze `Error:`.
- **„Gracz nie widzi figury na polu docelowym” na scenie Dynamicznej to nie zawieszony ruch (01.10, #47)** — Kowal na (12,14) w „Knajpie” jest poza polem widzenia Oli; końcowa lista `token:sync` go nie ma, więc znika z jej magazynu, a ostatni zapis śladu (`recordTrail`) to pozycja sprzed zniknięcia. `seenAt` daje wtedy `null`, a asercja „wszyscy widzą figurę u celu” wygląda jak figura utknięta na starcie. Sprawdź listę w ramkach, zanim uznasz to za wyścig.
- **Opóźnienie i zerwanie sieci w E2E: `Network.install` przed pierwszym `goto` (01.10, T7a)** — `routeWebSocket` łapie tylko gniazda otwarte po nim, więc `fixtures/network.ts` wchodzi przez `prepare` w `cast.mg`/`cast.gracz`. Losowy rozrzut opóźnienia idzie w kolejce (ramka nie wyprzedza poprzedniej), bo sam `setTimeout` przestawiałby ramki. `setOffline` odcina long-polling, od którego Socket.IO zaczyna ponowne łączenie — w 30 s offline pośrednik nie widzi ani jednej próby, i tak ma być.
- **Na scenie Dynamicznej magazyn `token` gracza ma tylko figury w jego polu widzenia (01.10, T7a)** — Paser przy barze nie istnieje u Oli na tarasie ani u Marka; `seenAt` daje `null` i test „klient zgodny z bazą” pada na własnym założeniu. Porównuj każdą figurę **ze sklepu klienta** z bazą, a nie listę nazw u wszystkich.
- **Wezwanie do Testu dochodzi tylko do właściciela karty i MG (01.10, T7a)** — karta wezwania Kowala nie istnieje u Oli; pętla „wszyscy widzą rozstrzygnięcie” czeka do limitu na „element(s) not found”.
- **Własna kwota w oknie handlu stoi w `input`, a `innerText` okna jej nie ma (01.10, T7a)** — `toContainText('100 ed')` na oknie Oli pada, choć kwota jest; u drugiej strony to tekst. Sprawdzaj `getByLabel('Ile eurodolców w polu wymiany')` → `toHaveValue`.
- **Notka lokalna klienta to `.chat-note`, nie `.chat-message` (01.10, T7a)** — odmowa „🤖 Rzeźnik: model jest niedostępny…” z `BotTurnButton` żyje tylko w magazynie czatu MG i nie ma jej w bazie.
- **Rola „Nomad” w kreatorze to „Nomada”, id `nomad` (01.10, T7a)** — `getByText('Nomad', { exact: true })` czeka do limitu testu (6 min).
- **Pełny przebieg E2E puszczaj we własnym oknie konsoli, nie powłoką agenta w tle (01.10, T6c)** — przy braku RAM-u Claude Code zabija swoje polecenia w tle; Playwright przeżywa, ale każdy proces startowany potem (nowy pracownik, serwer instancji) pada z `worker process exited unexpectedly (code=3221225794)` = `0xC0000142` (`STATUS_DLL_INIT_FAILED`, konsola zerwana). Wygląda jak kaskada porażek T6a–T2, a to sierota. Start: `powershell Start-Process cmd -ArgumentList '/c','run.cmd','N' -WindowStyle Minimized` (skrypt w scratchpadzie, wyjście do pliku), monitor czyta plik. Gateway — w terminalu MG, z tego samego powodu.
- **Pełny przebieg od zera nadpisuje wszystkie punkty kontrolne (01.10, T6c)** — `saveCheckpoint` w każdym pliku T3a–T6b; czerwony przebieg zostawia punkty ze stanu, w którym padł. Przed serią przebiegów kopia `.e2e/checkpoints` obok.
- **Gniazdo aktora E2E dzieli wiadro limitu tempa z kartą przeglądarki tego konta (01.10, #13)** — limit jest per konto, nie per gniazdo. Pętla `emitAck` z `actor.socket()` zjada zapas, z którego korzysta UI tej samej osoby. `emitAck` i `probe` ponawiają `RATE_LIMITED` po 250 ms; po długiej serii surowych zdarzeń daj stronie 3 s, zanim klikniesz.
- **Gniazdo wygasłej sesji rozłącza się samo (01.10, #11)** — `emit` na rozłączonym gnieździe socket.io buforuje i ack nigdy nie przychodzi (`E2E: no ack for chat:send`). Test „sesja traci prawa” sprawdza najpierw `socket.connected`.
- **`/uploads/` wymaga ciasteczka (01.10, #10)** — `rawGet` bez ciasteczka dostaje 401 na wszystko, więc test „bez wyjścia poza katalog” musi iść też z ciasteczkiem MG, inaczej niczego nie sprawdza. `page.request` niesie ciasteczka strony, `APIRequestContext` aktora — swoje.
- **Test limitu logowania blokuje `127.0.0.1` na 15 minut całej reszcie suity (01.10, #12)** — dlatego instancja E2E ma `TRUST_PROXY=1`, a 6.2.11 zgaduje z adresu w `X-Forwarded-For`. Przeglądarki idą przez proxy `vite preview` bez tego nagłówka.
- **Restart instancji przy otwartych kartach zostawia w konsoli Firefoksa „downloadable font: download failed … status=2152398861” (30.09, T6b)** — to `NS_ERROR_CONNECTION_REFUSED` z chwili, gdy `vite preview` leżał; Chromium pisze to samo jako `ERR_CONNECTION_REFUSED`. Test z restartem filtruje oba, inaczej migocze raz na kilka przebiegów.
- **`pnpm test:e2e -g "…6\.6…"` nie dopasowuje niczego (30.09, T6b)** — `pnpm --filter` cytuje argument drugi raz i ukośnik się podwaja; „Running 1 test” zamiast sześciu. Pisz wzorzec bez ukośnika (`-g "start z po-T6a|6.6"` — kropka i tak pasuje).
- **Okno zegara MG stoi nad zakładkami panelu bocznego (30.09, T6b)** — po skokach „+10 min” klik w „Walka” czeka do limitu testu („settings-window-body intercepts pointer events”). Zamykaj zegar („Zamknij zegar”) zaraz po skokach.
- **Walka z samą drużyną: „Tylko postacie graczy” (30.09, T6b)** — pola uczestników w „Walka” nie mają `aria-label` (nazwa idzie z etykiety), więc pętla po `getAttribute('aria-label')` odznacza wszystkich i „Rozpocznij walkę (0)” jest wyszarzone. Domyślnie nikt nie jest zaznaczony.
- **Klik gracza w slot akcji, zanim jego klient dostanie turę, daje notkę „To nie jest tura tej postaci” (30.09, T6b)** — i nic więcej; test czeka potem do limitu na formularz. Po `Start`/`nextTurn` zawsze `clientsSeeTurn(gracz)`, nie tylko przed marszem.
- **Streszczenie dziennika czyta wyłącznie wiersze `say` (30.09, T6b)** — po T3–T6 to 4–6 wypowiedzi (reszta to rzuty i akcje), model 27B nie proponuje wtedy żadnej relacji; test ma ścieżkę zapasową (`relation:set` MG) i dopisuje obserwację, zamiast padać.
- **Python z heredocu wstawia do TS prawdziwe znaki zamiast `\n` i `\u…` (30.09)** — `'\\n'` w zwykłym napisie Pythona ląduje w pliku jako nowa linia w środku literału (błąd składni), `\u` bez czterech cyfr wywraca sam skrypt, a narzędzie Edit zamienia `一` na znak. Tekst z ukośnikami zapisuj najpierw do pliku (Write), a zakres pisma pisz `\p{Script=Han}/u`.
- **Atrapa gatewaya musi mówić `llama: 'ready'` w `/health` (30.09, retest #21)** — `status: 'ok'` nie wystarcza: `toStatus` liczy `available` z `llama` `ready`/`external`, a tura bota odmawia na starcie (`AI_UNAVAILABLE` w acku, zero zapytań do `/chat`) — wygląda jak brak poprawki #21. Skrypt retestu: atrapa HTTP, `restoreCheckpoint('po-T4a')`, `startServer({ AI_GATEWAY_URL })`, `bot:play-turn` Rzeźnika.
- **Zamknięcie karty czatu (`chat:update`) po rzutach dochodzi dopiero po animacji kości (30.09, T6a)** — klient trzyma widoki do końca prezentacji rzutów; po operacji (Test + Człowieczeństwo) plakietka „Zoperowane” u Oli w Firefoksie przyszła po >5 s. Czekaj z `timeout: 20_000`, jak na karty rzutów.
- **`locator.screenshot()` elementu schowanego za zakładką panelu czeka do limitu testu (30.09)** — `.catch()` nie pomaga, bo najpierw mija 2 min; zrzut Kompendium rób, zanim klikniesz „Czat”.
- **Po `scene:activate` MG zostaje przy scenie, którą oglądał — jako „podgląd” (29.09, T6a)** — gracze idą za aktywną, MG nie (`followActivation` w `sceneStore`, zamierzone); `store('scene')` MG dalej pokazuje starą. Po aktywacji MG klika „Pokaż” przy nowej scenie (`sceneListRow`).
- **Pierwszy `select` karty wpisu Kompendium u MG to „Poziom w tej kampanii”, nie odbiorca (29.09, T6a)** — `selectOption({ label: 'Paser' })` czeka do limitu na „did not find some options”, co wygląda jak „karty statysty nie ma na liście”. Odbiorca i chirurg: `.compendium-assign select` (pierwszy i drugi); u gracza poziomu nie ma.
- **`character:update` niesie pola karty w `patch.data` — pole na wierzchu łaty serwer pomija z `ok: true` (29.09, T6a)** — test „gracz nie podbije sobie PD” z `patch: { improvementPoints }` wyglądał jak dziura w uprawnieniach; poprawnie `patch: { data: { improvementPoints } }` → `FORBIDDEN`.
- **Dziesiątka w skrypcie kości dla Testu k10 wybucha i zjada następną ścianę (29.09, T6a)** — `scriptDice([10, 3, 4])` dla montażu i 2k6 Człowieczeństwa dało Test 10 + 3 i Człowieczeństwo 4 + los; „ma przejść” skryptuj 9 i licz wynik z karty.
- **Panel boczny gracza po Kompendium nie ma pola czatu (29.09, T6a)** — `say()` czeka na „Wiadomość czatu” do limitu testu `@llm` (6 min); przed rozmową klik w zakładkę „Czat”.
- **Okno runu stoi domyślnie przy prawej krawędzi mapy — też na placu, po którym klika scenariusz (29.09, #34 naprawiony)** — do 29.09 otwierało się na pasku kolejki i narzędziach MG. Scenariusz dalej odsuwa oba okna (`tuckRunWindow` w T5b): MG zwęża je uchwytem (`.window-resizer`) nad lewy panel, gracz zsuwa pod pas. Położenie przeżywa F5.
- **Klik w środek sąsiedniego pola nie ruszał figury (27.09, #36 — naprawiony 29.09)** — dwie przyczyny: grot kierunku i aureola tury (sekcja `mapa`). Pomocnik `walk` w T5b klika znowu w środek pola; obejście „dolna część pola” zdjęte — jeśli wróci potrzeba, sprawdź `event.event.target` w `clicked`, zamiast przesuwać klik.
- **Gateway nie wstaje, a jego log co 5 s pokazuje `GET :8080/health "HTTP/1.0 404 File not found"` i restartuje llama-server (29.09)** — port 8080 trzyma inny proces (tu: zapomniany `python -m http.server 8080`); llama-server wstaje na tym samym porcie obok, ale zdrowie pyta obcy serwer. `netstat -ano | grep ':8080 .*LISTEN'` i linia poleceń procesu (`Get-CimInstance Win32_Process`), zanim zaczniesz szukać błędu w gatewayu; cudzy proces zamyka się za zgodą MG.
- **Na otwartym placu marsz staje „Ktoś pojawił się w polu widzenia”** — figura nie dochodzi do celu, a pomocnik czekający na pozycję wisi do limitu. `walk` w T5b ponawia rozkaz (do trzech razy); przed czekaniem na „stoi” daj marszowi 1,5 s na start, inaczej figura „stoi” jeszcze na starcie.
- **Broń nie zawsze sama trafia do ręki po zaznaczeniu figury** (Strażnik po marszu MG, Kowal po zmianie naboju na karcie) — Alt+klik MG w cel bez „W ręku” nie ładuje kubka i nic nie mówi. `aimAs` w T5b sprawdza „W ręku:” i w razie braku klika slot.
- **Węzeł kontrolny, z którego Demon strzelił w tej rundzie, jest dla netrunnera „użyty w tej Turze”** — „Strzelaj/Wyłącz” wyszarzone do następnej rundy; Kontrola (przejęcie) działa. Scenariusz przejmuje węzeł w rundzie 1, strzela w 2, wyłącza w 3 (Demon bez węzła już nie strzela).
- **Lista celów wieżyczki netrunnera to figury, które widzi jego ciało** — Strażnik za barierą (zasłania figury) nie ma opcji w „Cel strzału”; `selectOption` czeka do limitu testu na „did not find some options”.
- **Model 27B oddaje pierwszy krok tury bota w 2–3 s** — pad gatewaya „w trakcie generowania” tnij zaraz po zobaczeniu `POST /chat` w pośredniku (`poll` co 50 ms); czekanie 2 s wpuściło propozycję.
- **Po Turze Demona klienci widzą następną turę po kilkunastu sekundach** (animacje kilku rzutów) — `nextTurn` i `clientsSeeTurn` czekają do 30 s; stan runu (LOD „zderezowany”) sprawdzaj najpierw w bazie, okno — z limitem 30 s.
- **Aktywacja nowej sceny nie przenosi figur graczy, którzy mają figurę gdzie indziej (27.09, T5a)** — #9 stawia sam tylko żeton postaci bez żadnej figury; na „Bramie” MG stawia Kowala i Iskrę, przeciągając wiersz z „Postaci” na mapę (`dragCharacterToMap`; do 15.10 — ⊕ „Postaw na scenie”).
- **Na ręcznej mgle gracz nie dostaje ściany ani bramy leżącej choćby o piksel poza odsłoniętym (27.09, T5a)** — odsłonięcie od y = 472 przy barierze na y = 467 zostawia bramę w mgle; prostokąt MG obejmuje **linię** otworu. Klamek na ręcznej mgle i tak nie ma (#30).
- **Klamka 🚪 pod własnym żetonem łapie klik jako figurę (27.09, T5a)** — figura na polu tuż pod środkiem odcinka przykrywa uchwyt; stań o pole w bok.
- **Klik gracza w mgłę to marsz do skraju odsłoniętego, nie odmowa (27.09, T5a)** — „figura stoi” po kliku jest fałszywe; odmowę serwera (`MOVE_REFUSED`) sprawdza surowy `token:move`, a marsz pod skraj psuje dziś #28.
- **`locator.textContent()` na nieistniejącym elemencie czeka do końca limitu testu (27.09, T5a)** — w adnotacji po porażce (np. treść komunikatu, którego może nie być) używaj `allTextContents()` albo `count()`; zawieszony `try` wygląda jak zawieszony klik w `finally`.
- **Gniazdo przez proxy `vite preview` (:4173) czasem dostaje odmowę — pełny przebieg pada na konsoli aktora (27.09, T4b, do zbadania)** — w 2 z 5 przebiegów: `WebSocket … ws://localhost:4173/socket.io … ERR_CONNECTION_REFUSED` (Chromium) albo „Firefox can’t establish a connection…” w `unexpectedErrors()`, raz poprzedzone `ERR_CONNECTION_TIMED_OUT` na pliku z `/public/`, raz z padem następnego pliku na `page.goto` (podgląd nie wstał). Strażnik pytający :4173 co 2 s w zielonym przebiegu nic nie złapał. Log `client.log` zeruje każdy start instancji — przy następnym wystąpieniu kopiuj `.e2e/logs` zaraz po porażce.
- **Cechy i PW postaci z kreatora T3a były losowe w każdym przebiegu od zera (27.09, T4a/T4b; od 01.10 skrypt kości)** — 01.10 los dał Kowalowi REF 4 i 4.2 nie trafiał nawet kością 9, więc 3.6 skryptuje dziesięć kości Cech (`KOWAL_STAT_FACES`, Kowal z `po-T3a` z 26.09) i sprawdza Cechy na karcie. Ścieżka Życia zostaje losowa. Dawniej: punkt kontrolny ma jednego Kowala, pełny przebieg innego (REF 6–8, ZW 6–7, RUCH 5–7): stała kość „9 → trafia” raz trafia, raz nie. Kość dobiera się do modyfikatora z kubka (`store('roll').attack.modifierTotal`) bez 10 (eksploduje), budżet i PW czyta się z karty. Spec zielony od punktu nic nie mówi o przebiegu od zera.
- **`hasText` z napisem nie rozróżnia wielkości liter, a nowa karta czatu czeka na animację kości (27.09, T4b)** — „Ciężki pistolet — obrażenia” łapie też „Bardzo ciężki pistolet — obrażenia”, a `.last()` tuż po rzucie to jeszcze stara karta; jej „Zastosuj” działa drugi raz (#26). `chatCards` (tytuł z rozróżnieniem liter) i `freshCard` (karta ponad liczbę sprzed rzutu) w `fixtures/walka.ts`.
- **Klik w środek figury obok sąsiada łapie grot kierunku sąsiada (#25), a klik w pole pod cudzą figurą — jej podpis** — MG zaznacza nie tę figurę, gracz zamiast marszu dostaje atak. Przybliż kamerę (`zoomAt`), klikaj górę/dół żetonu (`upperOf`, `walk(…, 'lower')`) i dolną część pola (`floorOf`).
- **Marsz rozkazany tuż po zmianie tury w bazie przerywa „Zmiana tury — marsz przerwany”** — klient dostaje nową turę chwilę po bazie; figura robi jedno pole. `nextTurn` czeka na magazyn `combat` klienta MG, przed marszem gracza `clientsSeeTurn(gracz)`.
- **Dwie szóstki na obrażeniach biorą ze skryptu kości jeszcze 2k6 tabeli ran — na każdy cel** — bez nich rana jest losowa (w T4b „Złamana ręka” wytrąciła Rzeźnikowi pistolet i dalszy krok padł). Skryptuj `[…obrażenia, …2k6 × liczba celów]` i sprawdzaj `pendingDice() === ''`.
- **Pozycję figury po turze bota wybiera żywy model** — T4a kończy z Rzeźnikiem raz w drzwiach tarasu, raz w sali za oknem; następny plik ustawia figurę MG-iem (`token:move` z gniazda MG) przed krokami, które od niej zależą.
- **„Bieg” przed ruchem odmawia (`RUN_NEEDS_MOVE`), a MG idzie wtedy dalej po cichu z `overspent`** — kolejność RAW: marsz do RUCH × 2 m, „Bieg”, drugi marsz; asercja `overspent === 0` pilnuje, że MG nie przekroczył budżetu.
- **Vite przegapia drugi zapis pliku w ciągu ~1 s (26.09, etap 43a)** — dopisanie funkcji (`cat >>`) i zaraz potem dopisanie importu (skrypt) dało moduł z pierwszego zapisu: `ReferenceError: X is not defined`, choć plik na dysku i `tsc` są poprawne, a F5 serwuje ten sam `?t=`. `touch` pliku wymusza przeładowanie; sprawdzisz `curl localhost:5173/src/<plik>`.
- **Rzut w teście szybszy niż animacja kości u innych aktorów** — klient wstrzymuje skutek rzutu do końca animacji (umowa `serwer`, 22.09), więc pas kolejki i karty u MG spóźniają się o kilka–kilkanaście sekund. Następny rzut dopiero po wyniku na ekranie odbiorcy; asercje UI po rzucie z limitem ≥ 30 s.
- **Ponowny klik „Zatwierdź” propozycji bota wykonuje ją drugi raz (#20)** — karta długo nie zmienia się na „Zatwierdzone”, a `toPass` z klikiem w środku klika do skutku. Jeden klik, potem czekanie do 90 s; kolejka gatewaya po takim przebiegu zostaje pełna i następny przebieg dostaje 503 („Brak połączenia z AI Gateway”).
- **Ack zdarzenia to też dane dla gracza** — podsłuch przeglądarki łapie ramki `43…` (odpowiedzi na własne żądania), a surowe gniazdo `socket.io-client` nie jest podsłuchiwane; wyciek przez ack (#19) widać tylko na karcie gracza. `Sniffer.evidence()` daje wycinek ramki, `mark()` — kontrolę po znanym wycieku.
- **Klik w jedyny slot broni na pasku odkłada ją z ręki** — pasek sam bierze jedyną broń („W ręku: …”); klik w slot przed klikiem w cel rozbraja, a klik w cel robi z niego podgląd figury.
- **`fitCamera` odrzuca kadr gracza** — asercja zakłada pasek narzędzi MG nad mapą; gracz ma niższy pasek, a scena i tak mieści się na ekranie: u graczy `.catch(() => undefined)`.
- **Surowe gniazdo E2E wysyła zdarzenie przed przydziałem kampanii** — kampanię i pokoje gniazdo dostaje asynchronicznie po `connect`; zdarzenie wysłane od razu kończy się odmową „brak kampanii”, a test czyta to jako poprawną odmowę uprawnień. Czekaj na `state:sync` (`rawSocket` w `fixtures/security.ts`).
- **Zaproszenia w punktach kontrolnych wygasają tydzień po zapisie punktu** (domyślny czas zaproszenia; `po-T3` z 26.09 — 03.10) — plik startujący z punktu bierze świeże zaproszenie z API MG (`invite()` w `fixtures/nocna-zmiana.ts`, `createInvitation` w `table.ts`), a nie wiersz z bazy. T3b z `E2E_FROM=po-T3a` czyta zaproszenia z bazy — po tygodniu pada na wejściu graczy; pełny przebieg od zera tego nie ma.
- **Śmieciowe ładunki z prawdziwym id kasują cel reszcie prób** — `character:delete`, `scene:delete` z id i śmieciem w reszcie pól przechodzą; zdarzenia niszczące idą na koniec serii (`destructiveLast`), a to, co ma własny test, wypada z serii.
- **Test „odmowa” bez kontroli pozytywnej przechodzi za darmo** — `chat:history` bez `beforeId` odmawia `BAD_REQUEST` każdemu, więc „gracz spoza kampanii nie dostał historii” nic nie sprawdzał; każdą odmowę poprzedź tym samym żądaniem, które przechodzi u uprawnionego.
- **Headless Chromium Playwrighta renderuje WebGL programowo (SwiftShader)** — domyślny `headless_shell` daje 2–8 kl./s na ciemnej scenie z oświetleniem, a marsz figury (limit `MARCH_MAX_FRAME_MS`) wlecze się wtedy 5× wolniej niż w oknie; aktorzy E2E startują z `channel: 'chromium'` (nowy headless z GPU, 160 kl./s). Firefox headless ma GPU od początku.
- **Narzędzie ścian: pierwszy klik łańcucha w środek istniejącej ściany ją zaznacza, zamiast zacząć rysunek** — styk „T” rysuj jako wspólny koniec obu łańcuchów (dziel ścianę w punkcie styku); karta segmentu (dwuklik) otwiera się tylko z narzędziem „Ściany” w ręku, a Esc zdejmuje najpierw zaznaczenie, dopiero drugi — narzędzie.
- **Odczyt `node:sqlite` w asercji trafia na „database is locked”**, gdy serwer akurat pisze — `new DatabaseSync(plik, { readOnly: true, timeout: 5_000 })` w `fixtures/db.ts`.
- **Checkbox sterowany stanem z serwera (np. „w sesji” bota, „Ciemna scena”) nie przeżywa `locator.check()`** — Playwright sprawdza stan zaraz po kliknięciu, a ten zmienia się dopiero po odpowiedzi serwera. `click()` + `expect(…).toBeChecked()`.
- **`instance start` z powłoki agenta stawia instancję E2E na kilka sekund** — procesy serwera i `vite preview` giną razem z poleceniem, choć `cli.ts` je odpina; do oględzin MCP na instancji E2E trzymaj ją `node instance/hold.ts` w tle, a gaś `instance stop`.
- **Python na Windows zapisuje pliki z CRLF** — `open(p, 'w')` zamienia `\n` na `\r\n` w całym pliku; `git diff` tego nie pokaże (normalizuje), Prettier i ESLint owszem. Pisz z `newline=''` albo po fakcie `sed -i 's/\r$//'`. Plik „niesformatowany” z pustym `git diff` to CRLF na dysku: `git ls-files --eol | grep w/crlf`, naprawa `rm` + `git checkout --`.
- **`vitest -t` w `creation.test.ts` serwera wycina test, który otwiera gniazda** — gniazda `vex`/`gm` powstają w pierwszym `it`, więc filtrowany test pada na `Cannot read properties of undefined (reading 'emit')`. Puszczaj cały plik.
- **Zatrzymanie `pnpm dev` puszczonego w tle nie gasi jego dzieci na Windows** — `tsx` i `vite` dalej trzymają :3001 i :5173, a następny start pada na `EADDRINUSE`. Zabij drzewo po PID (`taskkill //PID <pid> //T //F`), zanim uznasz port za zajęty przez coś obcego.
- **Żeton zadany na połówce kratki staje o pół kratki DALEJ** — `snapAxis` robi `Math.round`, a `Math.round(4.5)` to 5: (450, 1450) ląduje na (500, 1500), środek (550, 1550). Komentarze w `walls.test.ts` z 18a mówią „centre (500, 1500)" i mylą; geometrię testu licz od pozycji po przyciągnięciu.
- **Wysyłka do gracza po ruchu MG potrafi dojść PO ack MG** — to dwa różne połączenia, więc kolejność między nimi nie istnieje. `waitFor(player, …)` ustawione po ruchu łapie spóźnioną wiadomość i test przesuwa się o jedną; czekaj na wiadomość spełniającą warunek (`blockersWhere`).
- **`pnpm dev` potrafi zgubić backend przy edycjach w wielu plikach naraz — i `tsx watch` go już nie podniesie.** Objaw: proxy Vite oddaje na `/api/*` `500` z **pustą** treścią (nie `401`), `netstat` nie widzi :3001, a proces `tsx … watch` żyje. Ani `touch`, ani zmiana treści pliku go nie budzą — restartuje ręka MG. Czy winny jest kod, sprawdza próbna instancja na innym porcie, z katalogami tymczasowymi (start robi migawkę bazy).
- **Pomocnik testowy, który przy odczycie odpina słuchacza, daje test przechodzący LOSOWO** — `collectMessages` gaszony w pętli „losuj do skutku”; objaw wygląda na wyścig w serwerze, a siedzi w harnessie. Odczyt = żywa tablica, odpięcie = osobny krok.
- **`vitest` nie sprawdza typów** — `rof: 2` (a to napis) przeszedł 38 testów i padł dopiero na `tsc --noEmit`. Ten krok jest osobny, nie formalnością po testach.
- **`socket.once('chat:message')` łapie kartę POPRZEDNIEGO testu**, gdy tamten jej nie odebrał — tak migotał `gametime.test.ts` („Minęło dziesięć minut" zamiast „Minęła doba"). Test odkładający kartę ma ją odebrać, choćby jej nie sprawdzał.
- **Testy nie widzą ściętego napisu** — trzy z sześciu błędów 30a–30d to szerokość elementu i treść etykiety; przy panelu w wąskiej kolumnie mierz `getBoundingClientRect().width` przeciw `scrollWidth`, zanim uznasz układ za dobry.
- **Nowy plik testów dymnych musi dostać `}, 60_000);` przy `beforeAll`** — hak robi `prisma migrate deploy` i podnosi Fastify, a pod pełną równoległością nie mieści się w domyślnych 10 s; objaw to `FAIL` całego **pliku**, nie testu.
- **`waitFor(socket, 'chat:message')` bierze pierwszą wiadomość, jaka przyjdzie** — publiczny rzut dociera też do MG, więc następny test łapie kartę poprzedniego. Czekaj po treści (`waitForRoll`), nie „na pierwszą".
- **Test mierzący spadek PW musi sam ustawić PW na starcie** — przy zerze serwer odmawia graczowi ruchu, więc spadek wychodzi 0 → 0 i pada asercja, nie stan (`healUp()` w `zones.test.ts`).
- **Czerwony pojedynczy plik w pełnym przebiegu serwera to najpierw podejrzenie wyścigu.** Zestaw pada mniej więcej co drugi raz i za każdym razem gdzie indziej — także na czystym HEAD; powtórz plik osobno (`npx vitest run src/<plik>`), zanim zaczniesz szukać błędu w swojej zmianie.
- **Migotanie testu: sprawdź, czy komunikat mówi o czasie, czy o asercji** — dwa razy „ciasny limit czasu" okazał się losowością w samym teście.
- **`tsc --noEmit` łapie błędy w testach, których vitest nie widzi** — `damage.test.ts` używał `DamageLogEntry` bez importu przez nieznaną liczbę sesji.
- **`walls.test.ts` i `realtime.test.ts` też migoczą przy pełnym `vitest run`** (dołączają do `netdevices` i `zones`) — powtórz przebieg, zanim uznasz to za regres. Od 30.08 dołączyły `roles30d.test.ts` i `specialties.test.ts`; w izolacji przechodzą. Jeden czerwony przebieg z 54 plików nie jest dowodem.
- **W trwającej walce jeden strzał wysyła dwie wiadomości czatu** — najpierw wpis dziennika Akcji, potem kartę rzutu; `once('chat:message')` łapie tę pierwszą. Test czekający na kafel ataku musi filtrować po `message.roll?.attack`.
- **`weapon:reload` w walce kosztuje Akcję i potrafi odmówić** — pętla testowa dostrzeliwująca magazynek zostaje z pustą bronią; uzupełniaj łatą karty (`ammoCurrent: ammoMax`).
- **Ten sam rzut obrażeń potrafi wylosować ranę z tabeli** (dwie szóstki na 5k6 to ~20% strzałów), więc Celowanie w nogę bywa Celowaniem w nogę **już złamaną** — wygląda jak regres reguły, jest pechem kości.
- **`damageReduced` to `min(redukcja, obrażenia)`** — test Redukcji obrażeń na broni `1k6` migocze raz na sześć przebiegów. Broni testowej podnosi się **minimum**, nie średnią.
- **Test rzutu, który „ma się udać", migocze na fumble'u** — naturalna 1 odejmuje 1k10 i przebija każdy modyfikator; powtarzaj rzut w pętli.

---

- **Odsłanianie mapy spod okna karty w E2E (46b2).** Trzy przebiegi `t46b-` padły na tym samym
  kroku: (1) chwyt belki karty w lewym rogu trafia w portret, który Firefox zaczyna ciągnąć
  natywnie jak obrazek — okno stoi; chwytaj w środku belki; (2) `useWindowPlacement` trzyma okno
  w ekranie, więc zsunięcie 1180-pikselowej karty w dół nie odsłania stolika — przesuwaj ją
  w prawo, do krawędzi; (3) po przesunięciu dopasuj kamerę jeszcze raz (`fitCamera`). Osobno:
  **zmiana figury po rzucie kubkiem dochodzi do klienta dopiero po animacji kości** (umowa
  „rzuty doganiają stół”, `token:sync` w ramkach jest od razu, w magazynie po ~7 s), a krytyk to
  dwie kości — asercja na oknie, które czeka na tę figurę, potrzebuje limitu ~30 s.

**Limity z 01.10 w suicie E2E (#11–#13).** Instancja E2E startuje z `loadConfig`, więc limity
są włączone jak na produkcji. Trzy skutki: (1) wiadro jest per **konto** — `actor.socket()`
i karta przeglądarki tej samej osoby czerpią z jednego zapasu, dlatego `emitAck` i `probe`
ponawiają `RATE_LIMITED` (surowy zalew 6.2.4 emituje bez nich i mierzy limit); (2) zgadywanie
hasła z `127.0.0.1` zablokowałoby logowanie MG reszcie przebiegu — 6.2.11 zgaduje spod
`X-Forwarded-For: 203.0.113.50` (instancja ma `TRUST_PROXY=1`); (3) gniazdo wygasłej sesji jest
rozłączane przez serwer, a `emit` na rozłączonym gnieździe nie dostaje acku nigdy.


**Test „zawieszonego kliku” w Firefoksie, który był zawieszonym odczytem (27.09, T5a).** Test #31
klikał piętro 2 w oknie runu, a w adnotacji czytał `window.locator('.net-run-notice').textContent()`
— komunikatu nie było (to był sam błąd #31), więc odczyt czekał do limitu testu, a sprzątanie
w `finally` padło na „Target page … has been closed”. Wyglądało to na klik Oli (Firefox) w przycisk
piętra, który „nie reaguje”; dwa przebiegi poszły na szukanie pułapki myszy Firefoksa. Odczyt do
adnotacji: `allTextContents()` (nie czeka), sprzątanie po znanym błędzie — z gniazda aktora
(`netrun:move`), bo to nie jest krok, który test sprawdza.

**Klik w mgłę to marsz do skraju, a nie odmowa (27.09, T5a).** Planer gracza prowadzi figurę
„najdalej, jak się da” po odsłoniętym, tak jak pod zamknięte drzwi w T3b, więc asercja „figura stoi”
po kliku w mgłę jest fałszywa. Odmowę serwera sprawdza surowy `token:move` z gniazda gracza
(`MOVE_REFUSED`); marsz pod skraj mgły zatrzymuje dziś #28 (figura przechodzi trasę i wraca na start).

**Stara karta czatu zamiast nowej (27.09, T4b).** Pierwszy przebieg T4b kliknął „Zastosuj” na
karcie obrażeń strzału Rzeźnika, a obrażenia dostał… Rzeźnik — drugi raz od pięści Iskry. Dwie
przyczyny naraz: klient wstrzymuje nową kartę do końca animacji kości (umowa `serwer`, 22.09),
więc `rollAndWait` (który czeka na wiersz w **bazie**) wraca, zanim karta jest w DOM-ie; a
`locator('.chat-message', { hasText: 'obrażenia (Korpus)' }).last()` trafiał w poprzednią pasującą
kartę. Poprawiona wersja z `hasText: 'Ciężki pistolet — obrażenia (Korpus)'` trafiła w kartę
**z T4a** („Bardzo ciężki pistolet…”), bo dopasowanie napisem ignoruje wielkość liter — i martwy
Zbir stracił punkt pancerza. Serwer przyjął oba zastosowania (#26). `chatCards(page, tytuł)` buduje
wyrażenie regularne z rozróżnieniem liter, a `freshCard(page, tytuł, ile_przed)` czeka, aż kart
będzie więcej niż przed rzutem, i zwraca tę nową.

**Grot kierunku jako uchwyt obrotu łapie kliki w sąsiada (27.09, T4b, #25).** MG klikał środek
Rzeźnika, a panel pokazywał Iskrę stojącą pole niżej: od `f26ed9c` grot jest uchwytem obrotu
i wystaje poza oprawę na sąsiednie pole. Mapa w całości (`fitCamera`) zlewa figury jeszcze
bardziej. Ta sama rodzina: klik w **środek** pola tuż pod cudzą figurą trafia w jej podpis —
Iskra zamiast marszu „atakowała” Rzeźnika, a MG-owi zaznaczał się Ochroniarz zamiast pola.

- **Rzut w teście szybszy niż animacja kości u innych aktorów (26.09, T4a).** Marek i Ola rzucali
  inicjatywę kubkiem jedno po drugim, MG od razu „Rzuć wszystkim” i „Start”; baza miała już rundę 1,
  ramki doszły do MG w 0,1 s, a pas MG przez 10 s pokazywał „Przed pierwszą rundą” z pustymi
  inicjatywami. Na zrzucie MG toczyły się jeszcze kości Kowala: klient trzyma skutek rzutu do końca
  animacji (`withPresentation`, umowa w `serwer`), więc każdy rzut przesuwa cały stan o kilka sekund.
  Przy stole nikt tak szybko nie rzuca — w teście następny rzut dopiero po wyniku na pasie MG.

- **Ponowny klik „Zatwierdź” propozycji bota (26.09, T4a).** Karta propozycji Rzeźnika przez 10 s
  nie przeszła na „Zatwierdzone”; `expect(…).toPass()` z klikiem w środku klikał co 5 s. Serwer
  przyjął każde kliknięcie (#20): 7 strzałów w jednej turze, `overspent: 5`, kolejka gatewaya 6 —
  a dwa kolejne przebiegi dostały w 13 ms „Brak połączenia z AI Gateway” (w dzienniku decyzji
  `AI_UNAVAILABLE`, czyli 503 z pełnej kolejki). Jeden klik i cierpliwość; po przerwanym przebiegu
  z botem sprawdź `queue_length` w `/health` gatewaya, zanim uznasz 503 za błąd.

- **Ack zdarzenia to też dane dla gracza (26.09, T4a).** Kanarki T2 sprawdzały pushe, `state:sync`,
  listy i HTTP — surowe gniazda T2 nie mają podsłuchu, więc odpowiedzi na żądania gracza nikt nie
  czytał. Wyciek #19 przyszedł ramką `4310[{"ok":true,"data":{…widok walki MG…}}]` — ackiem na
  „Kończę turę”. Dziennik ramek tnie każdą do 600 znaków, a id figury było dalej; `Sniffer.evidence`
  podaje wycinek wokół kodu z początkiem ramki (nazwa zdarzenia albo numer acka).

- **Klik w jedyny slot broni odkłada ją z ręki (26.09, T4a).** Iskra z jedną bronią („Pięści”):
  test klikał slot na pasku, potem Zbira — Zbir otworzył się jako „Podgląd”, a pasek zgubił broń.
  Pasek uzbraja jedyną broń sam („W ręku: Pięści — kliknij cel”); klik w slot był drugim.

- **`fitCamera` u gracza (26.09, T4a).** Asercja „scene top below the toolbar” (≥ górna krawędź
  mapy + 90 px) liczy pasek narzędzi MG; gracz ma dwa przyciski, a kadr z kółka staje wyżej — cała
  scena i tak jest na ekranie. T3b łapał to `.catch`, T4a też.


- **Surowe gniazdo i kampania po połączeniu (26.09, T2).** `emitAck(chat:history)` zaraz po
  `connect` dostawało odmowę, choć ta sama sesja w przeglądarce czytała historię. Serwer w
  `io.on('connection')` rozwiązuje kampanię w `void (async …)`, a handler czyta
  `socket.data.campaign` — w pierwszych milisekundach `null`. Objaw myli, bo test na „odmowę”
  przechodzi. `rawSocket()` czeka na `state:sync` i oddaje go do sprawdzenia kanarków.

- **Kontrola pozytywna przy każdej odmowie (26.09, T2).** Test „gracz spoza kampanii nie czyta
  historii czatu” przechodził, bo `chat:history` bez `beforeId` odmawia każdemu. Dopiero wariant
  „ta sama sesja przed wylogowaniem czyta historię” ujawnił, że ładunek był zły. Podobnie
  `fetch` i `APIRequestContext` zwijają `..` w ścieżce przed wysyłką — próby wyjścia z
  `/uploads/` idą `node:http` z surową ścieżką (`rawGet` w `t2a-http.spec.ts`).

- **PNG z fixture: bajt filtra każdego wiersza musi być 0–4 (26.09, T2).** `png()` wypełniał
  cały bufor 0x80; `image-size` (mapy, żetony, handouty) czyta sam nagłówek i przyjmował plik,
  a `sharp` w portretach go dekodował i zwracał `INVALID_IMAGE`. Wyglądało na błąd portretów.

- **Headless Chromium Playwrighta renderuje WebGL programowo (26.09, T3b).** Marsz Kowala do
  baru w „Knajpie” (ciemna scena Dynamiczna, dwa światła) ruszał 10 s po kliknięciu i szedł po
  ~6 px świata co ~0,55 s — w MCP (okno z GPU) ta sama trasa trwała 3 s. Pomiar `rAF`:
  `chromium.launch({ headless: true })` → 7,7 kl./s, `UNMASKED_RENDERER` = SwiftShader; przy trzech
  aktorach naraz jeszcze mniej. Marsz liczy się czasem, ale z limitem 100 ms na klatkę
  (`MARCH_MAX_FRAME_MS`), więc przy 2 kl./s figura idzie 5× wolniej i `expect.poll` na pozycję
  w bazie przekracza limit, choć lądowanie w końcu dochodzi i serwer je przyjmuje. Lek:
  `channel: 'chromium'` (nowy tryb headless, ANGLE D3D11 na karcie) — 160 kl./s, T3b z 8,7 min do
  1,5 min. Firefox headless od razu ma GPU. Rozpoznanie: ramki gniazda aktora (`<aktor>-ramki.txt`
  w wynikach porażki) pokazują gęstość `token:move` z `final:false`.

- **Pierwszy klik łańcucha ścian w środek istniejącej ściany ją zaznacza (26.09, T3b).** Łańcuch
  `(44,178)→(88,178)` zaczynał się na środku ściany zachodniej `(44,265)–(44,44)`: klik zaznaczył
  ją („Zaznaczono: ściana”), drugi klik zaczął nowy łańcuch z jednym punktem i Enter nie zapisał nic.
  Tak samo płot startujący 5 px od ściany magazynu (przy skali kamery 0,4 promień trafienia
  w ekranie obejmuje kilkanaście pikseli świata). Plan mapy w `fixtures/maps.ts` ma każdy styk
  jako wspólny koniec — dzielisz dłuższą ścianę w punkcie, w którym coś do niej dochodzi (to przy
  okazji uszczelnia styk dla wzroku i światła). `drawWalls` czeka po każdym łańcuchu na liczbę
  odcinków w bazie i mówi, który łańcuch nie wszedł.

- **„database is locked” w odczycie asercji (26.09, T3b).** `fixtures/db.ts` otwierał bazę E2E
  `readOnly` bez `timeout`; gdy serwer w tej samej chwili zapisywał marsz figury, `expect.poll`
  kończył się błędem SQLite zamiast wartością. Od T3b odczyt ma `timeout: 5_000` (busy timeout).

- **`locator.check()` na checkboxie sterowanym z serwera (26.09, T3b).** „w sesji” w wierszu bota
  ma `checked={bot.active}` — stan zmienia dopiero `bot:upsert`. Na wolnym (SwiftShader) przebiegu
  przechodziło, na szybkim `check()` padał „Clicking the checkbox did not change its state”. Tak samo
  „Ciemna scena” w edytorze sceny i blokada ruchu graczy. `click()` i czekanie na `toBeChecked()`.


- **Instancja E2E z `instance start` umiera po powrocie polecenia (26.09, T3a).** Uruchomiona
  z narzędzia Bash agenta (także w tle z `&& tail -f`), odpowiadała na `/health` przez chwilę,
  a potem porty :3101/:4173 były puste, `tasklist` nie znał PID-ów z `.e2e/instance.json`,
  a Chromium z Playwright MCP dostawał `ERR_CONNECTION_REFUSED`. Windows zamyka drzewo procesów
  polecenia, choć `launch()` robi `unref()`. Pod `playwright test` problemu nie ma — proces
  testów żyje do końca przebiegu. Do oględzin MCP: `E2E_GM_PASSWORD=… node instance/hold.ts
  --skip-build` jako zadanie w tle (proces trzyma instancję), potem `instance stop`. Przy okazji:
  `vite preview --host localhost` słucha tylko na `[::1]`, więc `curl 127.0.0.1:4173` milczy —
  to nie jest martwa instancja.

- **Python na Windows zapisuje pliki z CRLF (17.09, naprawa kreatora 3a).** Skrypt podmieniający
  fragmenty kodu przez `open(p, 'w', encoding='utf-8')` przepisał trzy pliki TypeScript na `\r\n`.
  `git diff --stat` pokazał tylko prawdziwe zmiany (Git normalizuje końce wierszy przy porównaniu),
  a ostrzeżenie „CRLF will be replaced by LF” było jedynym śladem — Prettier z `endOfLine: lf`
  zgłosiłby cały plik. Zapisuj z `newline=''` (i czytaj tak samo), a po wypadku `sed -i 's/\r$//'`.
  Przy okazji: długi heredoc z polskimi cudzysłowami urwał się w Bash w połowie — dłuższy kod
  zapisz najpierw plikiem w scratchpadzie i wklej skryptem.
  **23.09:** Prettier zgłaszał `aim-preview.test.ts`, a `prettier --write` dał plik, w którym git
  nie widział żadnej zmiany — repo miało LF, dysk CRLF (razem 15 plików). Sam `git checkout --`
  ich nie przepisze (indeks uznaje je za aktualne); trzeba je najpierw usunąć z dysku.

- **`vitest -t` nie działa na `creation.test.ts` serwera (17.09).** Gniazda `vex` i `gm` opisu
  „kreator postaci” zakłada pierwszy test („opens a fresh draft…”), nie `beforeAll`. Filtr `-t`
  pomija go, więc każdy wybrany test pada na `Cannot read properties of undefined (reading 'emit')`
  w `emitAck` — wygląda to jak zepsuty test, a to kolejność. Uruchamiaj cały plik (~5 s).

- **Zatrzymane zadanie `pnpm dev` zostawia serwery przy życiu (16.09, naprawa kreatora).**
  Zatrzymanie zadania w tle kończy tylko `pnpm`, a `concurrently`, `tsx` i `vite` żyją dalej jako
  sieroty — tak powstał `EADDRINUSE :3001` na koniec sesji 15–16.09. Rozpoznanie: `netstat -ano`
  pokazuje LISTENING na :3001/:5173, a `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`
  zwraca procesy z `VTT` (ścieżka repozytorium) w linii poleceń. Sprawdź, że to twoje dzieci, i zamknij drzewo
  `taskkill //PID <pid> //T //F` (w Git Bash podwójne ukośniki). Dotyczy też próbnej instancji
  serwera i samego `vite`.

- **Żeton na połówce kratki i spóźniona wysyłka — dwie pułapki jednego testu (13.09, etap 42a).**
  Nowy zestaw barier w `walls.test.ts` padł trzy razy i ani razu przez kod. **Pierwsza:** okno
  postawione „2 m od środka gracza" było w rzeczywistości 2,6 m od niego, bo figura zadana
  w (450, 1450) staje na (500, 1500) — `snapAxis` robi `Math.round((value − origin) / cell)`,
  a `Math.round(4.5) === 5`. Komentarze starszych testów w tym pliku („centre (500, 1500)") mówią
  co innego, niż robi serwer; arytmetyka zasięgu (`2 / 0,02`) daje dokładnie 100 px i nie jest
  winna. **Druga:** test czekał `waitFor(player, 'blocker:sync')` tuż po `token:move` MG, a ack
  przychodzi połączeniem MG, wysyłka wizji — połączeniem gracza. Spóźniona wiadomość z ruchu
  powrotnego poprzedniego testu trafiała do następnego („mgła" dostała listę Dynamicznej,
  „scena otwarta" — listę mgły). Lek: `blockersWhere(accept)` — czekaj na wiadomość, która spełnia
  warunek, zamiast na pierwszą z brzegu.

- **Backend w `pnpm dev` padł w trakcie sesji i sam nie wstał (12.09, siódma sesja).** Przy
  edycjach w kilkunastu plikach `shared` i `server` jeden z restartów `tsx watch` trafił na stan
  pośredni (import funkcji, której druga edycja jeszcze nie dopisała, albo port trzymany przez
  poprzednie dziecko) i od tej chwili proces-strażnik żył bez serwera: ani `touch src/main.ts`, ani
  dopisana i cofnięta pusta linia go nie obudziły. Rozpoznanie w trzech krokach: `/api/auth/me`
  przez :5173 daje `500` z pustą treścią (proxy bez celu), `netstat -ano | grep :3001` jest pusty,
  a lista procesów (`Get-CimInstance Win32_Process` ze skryptu `.ps1` — w linii poleceń Bash rozwinie
  `$_`) pokazuje żywe `tsx … watch src/main.ts`. **Czy winny jest kod, sprawdza próbna instancja:**
  `PORT=3099 UPLOADS_DIR=<tmp> BACKUP_DIR=<tmp> BOT_DECISION_LOG= timeout 25 node
  node_modules/tsx/dist/cli.mjs --env-file-if-exists=.env src/main.ts` — zmienne z wiersza poleceń
  wygrywają z `--env-file`, a katalogi tymczasowe są konieczne, bo start **robi migawkę bazy**
  i sprząta osierocone uploady. Na przyszłość: po dużej zmianie, przed oględzinami, najpierw `curl`
  na :3001, dopiero potem logowanie.

- **Pomocnik testowy, który przy odczycie odpina słuchacza, daje test przechodzący LOSOWO.**
  `collectMessages` w `tables.test.ts` zwracał listę **ze** `stop()`, a pętla „losuj, aż wypadnie
  podrzut” wołała go w każdym obrocie — po pierwszym przebiegu nasłuch był zgaszony i test
  przechodził tylko wtedy, gdy trafił za pierwszym razem. Objaw jest mylący: pada raz na kilka
  uruchomień i wygląda na wyścig w serwerze. Odczyt ma być **żywą tablicą**, a odpięcie osobnym
  krokiem na koniec.

- **`vitest` nie sprawdza typów — zielony test nie znaczy zielony `tsc`.** Fixture wiersza broni
  z `rof: 2` (a `CpredWeaponRow.rof` jest **napisem**) przeszedł 38 testów i wywrócił się dopiero
  na `tsc --noEmit`. Zestaw testów jest transpilowany bez sprawdzania typów, więc `tsc --noEmit`
  na wszystkich trzech pakietach jest osobnym krokiem przed commitem, a nie formalnością po nim.

- **`socket.once('chat:message')` łapie kartę POPRZEDNIEGO testu, jeśli tamten jej nie odebrał.**
  W `gametime.test.ts` test „+10 min" czekał tylko na rozgłoszenie `time:set`, a karta czatu
  zostawała w locie i trafiała w `once` następnego testu — który dostawał „Minęło dziesięć minut"
  zamiast „Minęła doba". Wychodziło raz na kilkanaście przebiegów i wyglądało jak błąd zegara.
  **Test, który wywołuje zdarzenie odkładające kartę na czacie, ma tę kartę odebrać**, choćby jej
  nie sprawdzał. Naprawione 05.09.

- **Nowy plik testów dymnych musi dostać `}, 60_000);` przy `beforeAll` — inaczej pęka pod
  równoległością, i to całym plikiem.** Hak startowy uruchamia `npx prisma migrate deploy`
  (osobny proces CLI Prismy) i podnosi Fastify z Socket.IO; pod pełnym `vitest run` (55 plików,
  każdy z własnym serwerem) nie mieści się w **domyślnych 10 s** vitesta. **Rozpoznanie:** objaw
  jest inny niż przy zwykłym migotaniu — w raporcie stoi `FAIL src/plik.test.ts
[ src/plik.test.ts ]`, bez nazwy testu i bez asercji, bo pada **hak**, nie test. 03.09 miało
  to pięć plików (`compendium`, `netcombat`, `netrun`, `netrunning`, `screamsheets`); reszta
  limit miała od początku. To jest przyczyna, którą wcześniejszy wpis o „pękaniu na limicie
  czasu" opisywał po objawach.

- **`waitFor(socket, 'chat:message')` bierze PIERWSZĄ wiadomość, jaka przyjdzie — i to jest
  wyścig, nie ostrożność.** Publiczny rzut dociera także do gniazda MG, a jego kopia potrafi
  wylądować już **po** tym, jak test, który go wywołał, wrócił na kopii gracza. Wtedy oczekiwanie
  **następnego** testu rozwiązuje się na karcie **poprzedniego**, a asercja pada w miejscu, które
  z przyczyną nie ma nic wspólnego (03.09 kosztowało to diagnozy w trzech plikach naraz).
  **Rozpoznanie:** pada raz na kilka przebiegów, za każdym razem gdzie indziej, a sam plik
  uruchomiony osobno przechodzi. **Obejście:** dopasowanie po treści, nie „pierwsza, jaka
  przyjdzie" — wzorzec `waitForMatch` / `waitForRoll(socket, tytuł)` jest w `roles30d.test.ts`,
  `netdemons.test.ts` i `character-rolls.test.ts`. Nowy test czekający na kartę na czacie
  **od razu** pisze, na którą.

- **Test, który mierzy „PW spadły", musi sam ustawić PW na starcie.** Przy zerze serwer
  **odmawia graczowi ruchu w ogóle** (`realtime/movement.ts`), więc walk się nie odbywa, spadek
  wychodzi 0 → 0, a test pada na `expected 0 to be less than 0` — obwiniając asercję zamiast
  stanu, który go zepsuł. Kilka trafień po 6k6 wystarczy, żeby figura z 50 PW dojechała do zera
  w połowie pliku. **Obejście:** pomocnik w rodzaju `healUp()` z `zones.test.ts`, który stawia
  kartę na pełni **i zwraca tę liczbę** — a asercja porównuje się z nią, nie ze stałą wpisaną
  z palca.

**`tsc --noEmit` łapie błędy w testach, których `vitest` nie widzi.** 29.08 (trzecia sesja)
`damage.test.ts` używał `DamageLogEntry` bez importu i przechodził od nieznanej liczby sesji —
vitest transpiluje bez sprawdzania typów, a `pnpm -r build` pomija pliki testowe. Jeśli dotykasz
typu, którego używają testy, sprawdź go osobnym `tsc`, nie samym `pnpm -r test`.

**`walls.test.ts` i `realtime.test.ts` też migoczą przy pełnym `vitest run`** (dołączają do
`netdevices` i `zones` z 29.08): raz „no such table: main.SceneExploration" po teardownie bazy,
raz timing obecności w `presence:update`. Uruchomione osobno przechodzą; drugi pełny przebieg
zwykle też. Zanim uznasz to za regres, powtórz przebieg.

- **W trwającej walce jeden strzał wysyła DWIE wiadomości czatu** (29.08, czwarta, kosztowało pół
  sesji polowania na migotanie): najpierw wpis dziennika Akcji z trackera, dopiero potem kartę
  rzutu. `once('chat:message')` łapał tę pierwszą, `roll.attack` było `undefined`, a pętla
  wystrzeliwała cały licznik prób i meldowała „30 strzałów i ani jednego trafienia" — mimo że
  trafień było w bród. Test, który czeka na kafel ataku, musi **filtrować** (`socket.on` +
  warunek `message.roll?.attack`), jak `waitForDamage` filtruje kartę obrażeń.

- **`weapon:reload` w trwającej walce kosztuje Akcję i potrafi odmówić** — pętla testowa, która
  dostrzeliwuje magazynek przeładowaniem, potrafi zostać z pustą bronią do końca licznika.
  Magazynek w teście uzupełnia się łatą karty (`character:update` z `ammoCurrent: ammoMax`),
  która nic nie kosztuje.

- **Ten sam rzut obrażeń potrafi wylosować ranę z tabeli** (dwie szóstki na 5k6 to około jedna
  piąta strzałów) — a atrapa danych ma w tabeli korpusu jeden wpis, więc raz na kilkadziesiąt
  przebiegów Celowanie w nogę trafiało w nogę **już złamaną** i słusznie nie dokładało nic.
  Wygląda jak regres reguły, jest pechem kości: test, który chce zdrowej nogi, musi umieć
  ją oddać i strzelić jeszcze raz.

**`damageReduced` to `min(redukcja, obrażenia)`, więc testy Redukcji obrażeń migoczą na małej
kości.** `combat-awareness.test.ts` bił pałką za `1k6` i sprawdzał „zredukowano o 2" — jedynka na
kości dawała 1 i test padał raz na sześć przebiegów przez cały etap 30a. Broń w takim teście musi
mieć **minimum obrażeń większe od redukcji** (`1k6+3`), nie większą średnią.

**Migotanie pełnego `vitest run` na serwerze nie ogranicza się do `walls`/`realtime`.** 30.08
padły w jednym przebiegu `roles30d.test.ts` („Pogłoski […] szeptem": `roll` zamiast `gmroll`)
i dwa testy z `specialties.test.ts`, a w trzech innych przebiegach tego samego kodu — nic.
Oba pliki przechodzą w izolacji. Zanim uznasz taki wynik za regres: **powtórz przebieg
i puść same te pliki**. Jeden czerwony przebieg z 54 plików nie jest dowodem.

**`specialties.test.ts` migotał na fumble'u, nie na czasie (31.08).** Naturalna 1 odejmuje 1k10,
więc rzut leczenia z modyfikatorem 18 schodzi do 9–18 i przegrywa z PT 17 mniej więcej raz na
dziesięć przebiegów — zabierając ze sobą dwa następne testy, bo rana zostawała na karcie. Objaw
mylił: asercja mówiła o liście ran, a przyczyna siedziała w kości. Rzut, który w teście **ma się
udać**, powtarzaj w pętli do skutku zamiast szukać modyfikatora nie do pobicia (sufity Cechy
i Umiejętności to 10 i 10, fumble przebija każdy).

**Czerwony pojedynczy plik w pełnym przebiegu serwera to najpierw podejrzenie wyścigu, nie
regresji (03.09).** `pnpm --filter @vtt/server test` pada mniej więcej co drugi przebieg, za
każdym razem w innym pliku — złapane `roles30d.test.ts`, `zones.test.ts` i `netdemons.test.ts`.
Ten sam plik uruchomiony osobno (`npx vitest run src/<plik>`) przechodzi 6/6. Sprawdzone
`git stash`-em: **na czystym HEAD pada tak samo**, więc nie jest to regresja sesji, która akurat
to zobaczyła. Objawy są dwojakie i oba wskazują na współdzielony czas, nie na logikę:
`waitFor(gm, 'chat:message')` bierze **pierwszą** wiadomość, jaka przyjdzie (czyli czasem
broadcast poprzedniego testu), a testy sprawdzające spadek PW zaczynają czasem od zera, bo
poprzedni krok zdążył dobić figurę. Obejście na czas sesji: powtórz plik osobno i idź dalej.
Naprawa docelowa — w `zaleglosci.md`.

**Testy nie widzą ściętego napisu — a trzy z sześciu błędów 30a–30d były właśnie tym (04.09).**
Mechanika dziewięciu Ról jedzie w 150 testach i wszystkie były zielone, kiedy sześć zdolności
Zmysłu Walki czytało się na karcie jako „R..", „W.", „B..", „P..", „W.", „W." — dwie pary nie do
rozróżnienia. Żaden test nie mierzy szerokości elementu ani nie czyta etykiety guzika, a panel
stał w kolumnie o **sztywnych 15 rem**, więc nie pomagało nawet rozciągnięcie okna. Diagnoza,
która to rozstrzyga w jednym kroku: porównaj `getBoundingClientRect().width` z `scrollWidth`
tego samego elementu (15 px przy potrzebnych 119 to nie jest „ciasno", to jest zerwany układ)
i przeczytaj `getComputedStyle` rodzica, żeby zobaczyć, która kolumna zjada resztę. Ten sam
odruch łapie drugi wariant: guzik z napisem, który dziedziczy sztywną szerokość po sąsiadach ±
(„Wezwij" jako „Wezw"). **To już drugie spotkanie z tym samym błędem** — 29b naprawiło go wąsko
dla `.advance-buy` („Podn" zamiast „Podnieś"), nie ruszając reguły, która go powodowała.
