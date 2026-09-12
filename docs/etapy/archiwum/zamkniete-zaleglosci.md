# Zamknięte zaległości — archiwum

Pozycje, które **przeszły** z sekcji „Otwarte zaległości" w `POSTEP.md`: naprawione błędy
i odklikane ścieżki, każda z diagnozą i opisem naprawy. Przeniesione tu 2026-08-22, żeby
`POSTEP.md` (czytany w całości na starcie każdej sesji) wrócił do rozmiaru, w którym da się
go czytać.

**Tego pliku nie czyta się rutynowo.** Sięgaj po niego, gdy szukasz, _jak_ coś naprawiono,
albo gdy chcesz sprawdzić, czy pozycja, która wygląda na nową, nie jest wracającą starą.
Treść wpisów jest niezmieniona — łącznie z datami i odsyłaczami do notatek sesji.

## Zamknięte 2026-09-12 (siódma sesja — Stym, Edytor bólu i stan ran statysty)

**03.09 (farmaceutyki, 30b): Stym nie zawieszał kar Poważnie Rannego — robił to MG.** Wpis odkładał
naprawę „do etapu 39", który zamknięto 05.09 bez niej, więc pozycja nie miała już na co czekać.
**Przepis z wpisu był niepełny:** zakładał, że wystarczy nauczyć `sheetSituationModifiers` (siedem
wywołań), a karę za rany liczyły poza nim jeszcze `haggle.ts`, podgląd kubka Ustabilizowania
i Leczenia (`rollStore.ts`) i napis na karcie — poprawka według przepisu rozjechałaby kubek
z wynikiem. Do tego naklejki liczą czas wyłącznie rundami, a godzinę świata zna tylko `CpredStatEffect`
z etapu 39, który wymaga Cechy. **Naprawa:** pole karty `woundSuspension` (`shared/woundsuspension.ts`)
z terminami z `cpredStatEffectDeadlines`; nakłada `applyStym` → `applyWoundSuspension`, wygasza to samo
`expireSheetStatEffects` (oba zegary, z nazwą w wierszu „Efekty wygasły"), zdejmuje guzik ⌫ efektu
(`character:stat-effect` po `effectId`), a `character:update` odmawia u wszystkich. Wiersze kary
składa jedna funkcja `cpredWoundPenaltyRows` — „Poważnie ranny −2 · Stym +2"; −4 Śmiertelnie Rannego
zostaje. **Decyzją MG doszedł Edytor bólu** — wpis kompendium mówi to samo zdanie, a w kodzie nie było
go wcale; działa po nazwie wiersza chromu. Testy: 20 w `shared` (`woundsuspension.test.ts`) i dwa na
żywych gniazdach (`recovery.test.ts`: dawka → Test → odmowa łaty → ⌫ → Śmiertelnie Ranny → skok
zegara; PT Ustabilizowania z wydruku).

**Znalezione przy tej samej robocie, nie było na liście: stan ran statysty liczony z Cech (etap 38a).**
Umowa 38a mówi, że stan ran karty to `cpredSheetWoundState` (z wydrukowanego maksimum PW) — a tak
liczył wyłącznie atak. Z BC i SW liczyły: wszystkie Testy (`planCpredRoll`), PT Ustabilizowania celu
(`character-rolls.ts`), targowanie, podgląd kubka oraz napis i próg na karcie. Statysta z PW 35 przy
BC 6 i SW 0 (Wartość bojowa zeruje SW) miał przy 15 PW −2 w ataku i zero w Teście, a Medyk stabilizował
go z PT 10 zamiast 13. **Naprawa:** wszystkie te miejsca idą przez `cpredSheetWoundCondition`,
`cpredSheetWoundCheckPenalty` i `cpredSheetSeriousWoundThreshold`.

## Zamknięte 2026-09-12 (szósta sesja — kratka z liczby kolumn, naklejki bez kwadratu)

**11.09 (etap 04): edytor sceny pytał o piksele, a nie o liczbę kratek.** Rozmiar kratki ustawiał
wyłącznie suwak w pikselach, więc trafienie w skalę mapy było zgadywanką — „StrefaPrzemysłowa" miała
47 px zamiast 36,2 (1448 / 40). **Naprawa:** `gridSizeForColumns` i `gridCellsAlong`
w `shared/scenes.ts` (pięć testów), pole „Kratek w poziomie (skala mapy)" pod suwakiem
(`GridColumnsField` w `ScenePanel.tsx`), widoczne przy wgranym tle; mapa powitalna liczy tym samym
helperem. **Wpis proponował dwa pola — zostało jedno, decyzją MG:** kratka jest kwadratowa, a pliki
z paczek nie dzielą się równo (2896 × 2176 przy 40 × 30 to 72,4 i 72,53 px), więc dwa pola dawałyby
dwie różne odpowiedzi. Wiersze są podpowiedzią („W pionie wychodzi równo 30" albo „… 23,11 — ostatni
rząd rozjeżdża się o 5 px"). Dwie rzeczy, których zgłoszenie nie przewidziało: pole trzyma wpisywany
tekst na czas pisania (inaczej „4" w drodze do „40" przeskakiwało na wynik kratki 362 px), a pole
pikseli dostało `step="any"` (przy kroku 1 kratka 36,2 była `:invalid`). **Obejrzane i zapisane
na żywo** na „StrefiePrzemysłowej": 47 → 36,2 px, 40 × 30 równo, budżet walki Marcina nietknięty
(66,5 m / 12 m). Czy linie siadają co do piksela na pasach parkingowych — do oceny okiem MG.

**11.09 (etap 27e/27h): naklejka statusu wnosiła do interfejsu czarny kwadrat — a przepis
z zaległości by go nie zdjął.** Wpis kazał rysować statusy maską jak `HudIcon`, bo „maska bierze
alfę, czarne tło jest nieistotne". Nieprawda: pliki statusów zaczynają się od
`<path d="M0 0h512v512H0z"/>` bez `fill`, czyli **nieprzezroczystym** czarnym kwadratem, więc maska
z alfy dałaby pełny kwadrat w kolorze chipu. Sprawdzone w pliku przed kodem. **Naprawa:**
`StatusIcon` (`HudIcon.tsx`) z tą samą zmienną `--hud-icon` plus `.status-icon { mask-mode:
luminance }` — czerń znika, biała sylwetka bierze `currentColor`. Przepięte trzy miejsca (chip
w `CombatHud`, wybierak w `TokenContextMenu`, pasek grupy w `TokenGroupBar`); mapa bez zmian.
**Obejrzane** w menu figury w obu motywach: 17 ikon, zero `<img>`, sylwetki jasne nocą i ciemne
w dzień. Chipu w panelu postaci i paska grupy nie oglądano — wymagałyby nadania statusu albo
zaznaczenia grupy w walce trwającej na „StrefiePrzemysłowej"; to ten sam komponent i ta sama
reguła CSS.

**11.09 (etap 04): MG, który połączył się przy braku aktywnej sceny, po własnej aktywacji widział
dalej „Brak sceny".** Serwer przenosił gniazdo MG do pokoju sceny (`data.viewedSceneId === null`
w `scene:activate`), a klient wołał `applyScene`, które milczy, gdy lokalna scena jest `null`.
Przepis z wpisu — samo `setScene` w gałęzi MG — był niepełny: dałby mapę **bez figur**, bo figury
nowej sceny przychodzą dopiero z `state:sync`. **Naprawa:** `sceneStore.followActivation(scene,
isGm)` — MG bez sceny na ekranie idzie za aktywacją jak gracz, a `true` każe gniazdu wysłać
`state:request`; cztery testy w `client/src/scene-activation.test.ts`. **Obejrzane na żywo za zgodą
MG** na kampanii-śmieciu „Oględziny 12.09 — do usunięcia" (serwer nie ma trasy usuwania kampanii,
a stan „MG nie ogląda niczego" powstaje wyłącznie w świeżej kampanii, bo tworzenie sceny z panelu od
razu ustawia jej podgląd): scena „Test Brak sceny" z mapą Night City i pustym żetonem „Figura
testowa" → przeładowanie karty → „Brak sceny — utwórz i aktywuj…" → „Aktywuj" → mapa **z figurą**
od razu, bez przeładowania i bez „Pokaż".

## Zamknięte 2026-09-12 (piąta sesja — interfejs, który nie kłamie)

**10.09 (etap 14b/16f): zakładka „Walka" oferowała przyciski, które pasek na mapie wyszarzał —
i odwrotnie.** `CombatActions.tsx` pytał o jedno (`!isGm && action.cost === 'action' &&
actionSpent`), a pasek szedł przez prywatne `actionSlotRefusal` w `hotbar.ts` i pytał o wszystko:
blokady z 14e, statusowe (`cpredActionBlock` / `cpredMovementBlock`) i regułę katalogu „druga Akcja
Ruchu dopiero po pierwszej". **Naprawa:** `actionSlotRefusal` wyprowadzone jako
**`cpredActionRefusal(actionId, { statuses, turn, isGm })`**, wołane z obu wejść, plus
`cpredTurnRefusalInput(turn)` — jedno czytanie budżetu tury zamiast dwóch odręcznych
`resources.find('action')` (to one się rozjechały). Formularze („Wstrzymanie Akcji…",
„Ustabilizowanie…") przestały być wyjęte z warunku i gasną razem z resztą.

**Gałąź, której nie było w zgłoszeniu, a bez której naprawa byłaby regresem:** zakładka ma przycisk
**„Akcja Ruchu"** (koszt `move`), którego pasek nie ma — wspólna odmowa gasiłaby go zdaniem
o wykorzystanej **Akcji**, czyli o zasobie, którego ten przycisk nie dotyka. Stąd gałąź po koszcie
z katalogu. Sześć testów w `hotbar.test.ts`; **obejrzane na żywo** przez status „Powalony" nadany
Marcinowi (status blokuje też MG, więc nie trzeba było ruszać kolejki): oba wejścia dają odtąd
**identyczne zdanie** „Powalony token musi najpierw wstać (Akcja „Wstanie")", Wstanie zostaje żywe
w obu, Akcja Ruchu gaśnie blokadą ruchu. Status zdjęty, stan stołu przywrócony co do liczby.

**11.09 (ekran logowania): hasło podstawione z menedżera haseł nie odblokowywało „Zaloguj się" —
a sama naprawa przycisku byłaby gorsza od błędu.** `LoginPage.tsx` pytał o stan Reacta
(`disabled={busy || password.length === 0}`), a autofill pisze prosto do DOM-u, bez zdarzenia
`input`. Diagnoza ze zgłoszenia była trafna tylko w połowie: pole pełne, przycisk martwy — ale
odblokowanie guzika wysłałoby **pusty stan** przy pełnym polu, czyli „nieprawidłowe hasło" na
oczach użytkownika patrzącego na swoje hasło. **Naprawa:** `useAutofillableField`
(`client/src/autofill-field.ts`) — `read()` bierze wartość **z węzła** przy wysyłce, a efekt po
zamontowaniu przepisuje do stanu to, co już tam stoi; warunek o długości zszedł z przycisku,
bo autofill nie ma pewnego momentu. To samo na ekranie dołączania (`JoinPage.tsx`), gdzie pustkę
odbija „Wpisz imię.". **Obejrzane na żywo** na `[::1]:5173`: pusta wysyłka odbiła zdaniem,
a wartość podstawiona natywnym setterem **bez zdarzenia** zalogowała konto Tony'ego.

**06.09 (etap 23b): lista odbiorców przelewu zawierała statystów — rozstrzygnięta przez MG
12.09: „zostaw jak jest, ale posortuj".** Od 38a statyści **są** kartami, więc w „przelew do…"
stały „Ganger", „Cel 23x", „Automatyczna wieżyczka" i Demony. Nic się nie psuło (przelew do NPC-a
bywa całym sensem sceny), ale lista szumiała. **Naprawa:** `economy:history` niesie na każdym
odbiorcy `player: boolean` (czy karta ma właściciela), a karta rozdziela listę na dwa `<optgroup>`:
**„Postacie graczy"** i **„NPC i figury MG"**. Nikogo nie ubyło. Okno „Wymiana" z 38b **zostawione
bez zmian** — buduje listę tak samo, ale tam wieżyczka bywa sensownym celem, więc filtr jest
decyzją per lista (uwaga ze zgłoszenia, utrzymana). Test w `economy.test.ts`; **obejrzane na żywo**
z konta gracza: Marcin / Test 27x / avatar9 w pierwszej grupie, trzy statystyki i Frank w drugiej.

**10.09 (etap 41): dokładne oględziny NIE DZIAŁAŁY — błąd znaleziony dopiero oględzinami.**
Pozycja brzmiała „cały UI etapu nieoglądany w przeglądarce" i szacowała ryzyko na średnie.
Było wyższe: **jedyna droga gracza do dokładnych oględzin była przerwana**.
`requireCallableRequest` (`realtime/checks.ts`) przepisuje żądanie Testu **pole po polu** i wycinał
`sightingTokenId` — a to on mówi, na co gracz patrzy. Klient go słał (`SightingWindow.tsx`), serwer
go czytał (`character-rolls.ts:1138`), między nimi ginął po cichu: zdany Test Percepcji nie
odsłaniał **niczego**, bez błędu i bez odmowy. **Żaden test nie dotykał tego pola** — ani 15
w `shared`, ani 13 na gniazdach. **Naprawa:** pole dopisane do białej listy (adres jest bezpieczny,
bo o prawo do patrzenia pyta dopiero `revealSighting`), plus dwa testy na żywych gniazdach
przechodzące **pełną** drogę prośba → zgoda → rzut; sprawdzone, że bez poprawki padają.

**Odklikane przy okazji (41 i 38b), tą samą drogą — menu figury z automatyki:** „🔍 Przyjrzyj
się…" u MG („Oględziny — Marcin": głowa bez ochrony, Granatnik w rękach) i u gracza (z przyciskiem
prośby, którego MG nie dostaje); pełna ścieżka **prośba → drabinka PT u MG → zgoda → wezwanie →
kubek → rzut** (14 > PT 9) → **karta „Oględziny" z liczbami** („2k6 · 30/30", czyli to, czego
zwykłe spojrzenie nie pokazuje) i „Pokaż wszystko" otwierające okno z nagłówkiem „Przyjrzałeś się
dokładnie"; **„🎒 Przeszukaj…"** (38b) z właściwym zdaniem „Przeszukać można figurę, która leży
albo nie żyje i nie ma właściciela"; guziki **„Dobądź / Schowaj (Akcja) / Upuść"** przy wierszach
broni.

## Zamknięte 2026-09-12 (trzecia sesja — okienko w mgle)

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

**Zamknięte tego samego dnia, po decyzji MG: okienko jest.** `MapRenderer.drawFogPeepholes`
wycina w kompozycie mgły krąg wokół każdej figury, którą steruje ten widz — ostatnim
przebiegiem, więc wygrywa także z zamalowaniem pędzlem (`hide`), tak jak na serwerze. Wielkość
wybrał MG: **około trzech kratek średnicy** (`fogPeepRadius` w `map/token-ring.ts`), a przy
figurze większej niż 1 × 1 promień rośnie tak, żeby pełne wycięcie objęło całą figurę z oprawą.
Okienko jedzie z figurą także **poza store** — `refreshFogPeepholes` wisi na `setTokens`,
na przeciąganiu i na kroku marszu — więc gracz nie idzie przez czerń do mety.

**Pierwsza wersja brzegu została odrzucona przez MG i to jest tu najciekawsze.** Rozmycie
złożone z pięciu pierścieni o malejącej alfie widać na mapie jako **koncentryczne okręgi**;
zanik idzie więc gradientem wypalonym na kanwie (`fogPeepTexture`), tą samą drogą, co światło
z 18b i pamięć mapy z 18c. Wpis w `pulapki-dev.md`.

**Czego okienko nie zdradza:** cudzych figur. `concealedFrom` nie wypuszcza ich z serwera, więc
pod okienkiem może się pojawić wyłącznie rysunek mapy. Nowa informacja dla gracza to sam kawałek
podłoża wokół jego postaci — i na to MG się zgodził wprost.

## Przeniesione 2026-09-04 (druga sesja — paczka „oczy i uszy")

Pięć pozycji z `POMYSLY.md` i z ostatniego akapitu `zaleglosci.md`, wybranych przez MG jako
jedna sesja klikania bez modelu: **wybuch i chmura gazu na mapie**, **rzut obrażeń obszaru
(16d)**, **„usuń wszystkie osłony" (16c)**, **dźwięki walki dobrane bez odsłuchu** i
**przechylenie figury dla stanu „nieprzytomny"**. Cztery zamknięte, jedna została częściowo
(dźwięki — zmierzone, ale ocena brzmienia należy do ucha MG).

**Wybuch i chmura gazu — obejrzane, arkusze pocięte dobrze.** Oba arkusze wczytują się
(`/fx/explosion.png` 1024², `/fx/smoke.png` 1280×768) i klatki idą po nich w kolejności
wiersz po wierszu: dla wybuchu 8×8 = 64 klatki po 128 px, dla chmury 5×3 = 15 klatek po 256 px.
Ognista kula wyszła na mapie w pełnym rozmiarze (11,5 m ≈ 575 px sceny, tryb `add`), a chmura
gazu — zielonkawą mgłą nad polem. **Zrzutem ekranu tego się nie łapie** (efekt trwa 1,1 s,
a runda zrzutu bywa dłuższa); sposób, który zadziałał, jest w pułapkach dev.

**Rzut obrażeń obszaru (16d) — odklikany.** Granatnik podwieszany avatar9 w pole między dwie
figury: karta ataku wypisała obie z odległością od środka, jeden guzik „Obrażenia 6k6" dał
**jeden** rzut (6k6 = 20), a „Zastosuj wszystkim (2)" wystawiło **dwie osobne karty obrażeń**
— „testowy 2x2: przebicie 7 (rzut 20 − OB 13), PW 35 → 28, Ciężka kurtka kuloodporna OB 13 → 12"
i „Automatyczna wieżyczka: przebicie 20, bez pancerza, PW 25 → 5". Ten sam rzut, różny wynik
przez pancerz — dokładnie „Każdy cel otrzymuje tyle samo obrażeń" (s. 174). Obie karty
cofnięte „Cofnij"; PW i ablacja pancerza wróciły.

**„Usuń wszystkie osłony" (16c) — odklikane, z Ctrl+Z.** Dwie osłony postawione, kosz je zdjął
(licznik „osłon: 2" → „brak osłon", guzik wyszarzony), a **Ctrl+Z przywrócił obie naraz**
(„Przywrócono 2 osłony"). Przy okazji drobiazg naprawiony w tej samej sesji: **kosze hurtowe
osłon, ścian, rysunków i stref nie mówiły o Ctrl+Z**, choć bliźniacze kosze świateł i punktów
dostępu mówiły — a wszystkie sześć zdarzeń `*:clear` woła `rememberDeletion`. Teraz mówią
wszystkie.

**Przechylenie figury dla „nieprzytomny" — zrobione (35°, nie 20°).** `down` czytał się gorzej
niż `dead`: trup ma wielkie ✕, szary portret i czarną podstawkę, nieprzytomny — ciemnoczerwoną
podstawkę i naklejkę wielkości paznokcia. Odtąd portret kładzie się na bok (`CONDITION_TILT_DEG`
w `TokenNode.ts`), i **dotyczy to obu stanów**: figura martwa też leży, a „nieprzytomny leży,
martwy stoi" byłoby gorsze niż brak przechylenia. **Kąt z pomysłu (20°) sprawdzono
w przeglądarce przeciwko pionowej kopii tej samej twarzy i podniesiono do 35°** — różnica przy
20° była, ale przy zoomie stołu nikt by jej nie zauważył. Obraca się wyłącznie portret
(`image` i `initial`); pierścień, łuk PW, podstawka, imię i naklejki zostają pionowe.

**Dźwięki walki — zmierzone, nie ocenione.** Ucho MG rozstrzyga, czy próbka pasuje; kod może
powiedzieć tylko, co w pliku jest. Dwanaście plików WAV przeliczono na obwiednie (szczyt, RMS,
liczba ataków, cisza na starcie i końcu) — nic nie okazało się dwoma zdarzeniami, jak
`shot-rifle` sprzed pół roku. **`bowstring.wav` jest w 65% ciszą** (dźwięk kończy się w 160 ms
przy pliku 460 ms) i ma najniższy RMS z całego zestawu (−24,5 dBFS) — co zgadza się z notatką
MG, że to najsłabsze dopasowanie. Pełna tabela — w notatce sesji. **Pozycja zostaje otwarta**
w `POMYSLY.md` do odsłuchu przy stole; do wymiany wystarczy plik w `public/sfx/` i wiersz
w `SFX_FILES` (plus cztery inne miejsca — patrz umowa „nowa próbka dźwiękowa mapy").

**Dwa błędy znalezione po drodze i naprawione** — opisane w notatce sesji: amunicja bez obrażeń
wystawiała guzik „Obrażenia" z pustą kością, a importer podręcznika po cichu wycinał
`thrown`, `maxRangeM` i `ammoIds` z typów broni.

## Przeniesione 2026-09-04 (oględziny Zdolności Ról 30a–30d)

Wszystkie cztery pozycje brzmiały tak samo — „Etap 30x nie był oglądany w przeglądarce.
Mechanika jedzie w testach (…), ale żadnego z tych ekranów nikt nie kliknął" — i wszystkie
cztery zamknięto jedną sesją, jedną kartą („Frank") przestawianą kolejno na dziewięć Ról.
Zamiast czterech osobnych wpisów: **co odklikano** i **sześć błędów, które przy tym wyszły**.

**Odklikane w komplecie.** 30a: panel sześciu zdolności z progami i wyszarzeniami, pudełko
„Zmysł Walki" w pasku akcji (tylko u Solo), koszt Akcji przy zmianie przydziału w trakcie tury
(z wierszem logu „Redukcja obrażeń 1 (2 pkt), Precyzyjny atak 1 (3 pkt)") i darmowy zapis tej
samej wartości, „− 1 (Redukcja obrażeń)" na karcie obrażeń **tylko przy pierwszym ciosie
Rundy** (drugi cios: 7 przez pancerz, bez redukcji), kafel „Fumble zignorowany (Wyjście
z opresji)" i wiersze „Precyzyjny atak 1" / „Wyczucie zagrożenia 1" w rozbiciu rzutu.
30b: panel Medycyny z sufitem 5 na Specjalizację, wiersz „Chirurgia 10 · Technologia Medyczna 3",
bloki farmaceutyków (guzik „Wytwórz" tylko przy środkach w zasięgu) i drabina kriosystemów;
panel Twórcy z sakiewką 2 pkt/poziom, dziesięcioma skutkami Ulepszania i tabelą PT/czasu;
⚒ Prowizorka (OB 7 → 11 na 30 min) z kończącym ją ⌫ oraz ⊕ +1 OB znikający po użyciu.
30c: sześć kategorii Wsparcia z tabelą, karta „Ktoś odpowiada · 7 ≤ 10 · … za 3 Rundy", wiersz
„w drodze" z guzikami MG, przybycie czterech Korpogliniarzy przy wzywającym z rzuconą
inicjatywą, odmowa Uniku; panel Korpo od „Poproś HR o pracownika" po Test Lojalności
(„1 < Lojalność 7 → Wykonuje polecenie"), z kartą pracownika zgodną z tabelą (Lekka kurtka
OB 11, B.C. pistolet 4k6, Rola Netrunner rangi 2, cyborgizacje w notatkach).
30d: panel Efektu Charyzmy z „To żart, prawda?" przy randze 2, karta „Odmowa · 6 ≤ PT 10 …
nie poprosisz ich przez 7 dni", Znajomości z dobitym targiem i zakupem o 10% taniej, Moto
z „+3 do Testów: …" i wyczerpanym Taborem, Wiarygodność ze zmianą szansy po dowodach (4 → 7 na 10) i szeptaną kartą Pogłosek z nazwą pobitego progu.

- **Nazwa Zdolności ścinała się do 15 px w ośmiu panelach naraz. ZAMKNIĘTE — naprawione 04.09.**
  Sześć zdolności Zmysłu Walki czytało się jako „R..", „W.", „B..", „P..", „W.", „W.". Dane były
  całe (pełne nazwy, pełne podpowiedzi) — układ nie. `.awareness-row` to siatka
  `1fr auto auto auto`, a `.awareness-name` ma `overflow: hidden`, więc jej minimum wynosi zero;
  w kolumnie tożsamości karty, która ma **sztywne 15 rem** (`.sheet-page`), wartość (4,5 rem),
  koszt (3,5 rem) i dwa guziki zjadały 201 z 216 px. Rozciąganie okna karty nic nie dawało, bo
  ta kolumna nie rośnie. Naprawa: w `.cp-awareness` i `.hud-form` wiersz przestaje być siatką,
  nazwa bierze całą pierwszą linię, reszta schodzi do drugiej. **Drugi dom tego samego panelu**
  — pudełko „Zmysł Walki" w pasku akcji — miał to samo (52 px na 102 potrzebne) i wymagał
  drugiego selektora; rejestr awansów w `.cp-advance` zostaje jednolinijkowy, bo ma miejsce.

- **MG nie mógł zmienić Roli Medykowi z wydanymi punktami Specjalizacji. ZAMKNIĘTE —
  naprawione 04.09.** Objaw: wybór Roli na karcie wracał na starą wartość, a na dole stało
  „Błąd zapisu!" i „Ta postać nie ma tej Zdolności Specjalnej" — zdanie o Specjalizacji, choć
  zmieniano Rolę. Diagnoza: `character:update` waliduje **scaloną** kartę
  (`cpredSpecialtiesProblem`), bo rozmiar sakiewki zależy od rangi; ta sama łata potrafi jednak
  **zabrać Zdolność**, bo `roleId` jest od 29a u MG zwykłym polem, a zmiana Roli bez odłożenia
  starej do `formerRoles` zostawia `medicine` bez właściciela. `cpredSpecialtyProblem` przy
  `rank === null` i niepustym przydziale zwraca `NO_ABILITY` — czyli odrzucał **tę łatę i każdą
  następną**. Ten sam potrzask miał Tabor Nomady (`cpredFleetProblem`). Naprawa:
  `cpredDropOrphanedRolePurses` zdejmuje sakiewkę bez Zdolności **przed** trzema walidacjami;
  przy wieloklasowości nie schodzi nic, bo `cpredRoleAbilityRank` pyta też o `formerRoles`.
  Pokryte testem czystej funkcji (trzy przypadki) i testem serwera na gnieździe.

- **Guzik z napisem w rządku ± był ścinany do 1,6 rem. ZAMKNIĘTE — naprawione 04.09.**
  „Wezwij" Wsparcia czytało się jako „Wezw", bo `.awareness-steps button { width: 1.6rem }` —
  reguła pisana dla kwadratowych „+"/„−" — trafia też w guziki z napisem. **To drugie spotkanie
  z tym samym błędem:** 29b naprawiło go wąsko dla `.advance-buy` („Podn" zamiast „Podnieś"),
  zostawiając regułę, która go powodował. Tym razem `width` ustąpił `min-width` dla wszystkich,
  a obejście z 29b zeszło jako martwe.

- **Licznik figur Wsparcia padał dwa razy. ZAMKNIĘTE — naprawione 04.09.** Kolejka Inicjatywy
  pisała „Korporacyjne służby bezpieczeństwa ×4 ×4": `describeBackupPending` doklejało `×count`
  do etykiety, a `CombatPanel` maluje `{row.label} ×{row.count}` z własnego pola widoku.
  Etykieta nazywa odtąd wyłącznie „kto" — zgodnie z komentarzem przy `ReinforcementView.label`
  („the system's own words for who is coming").

- **Odmowa Uniku wracała jako surowy kod. ZAMKNIĘTE — naprawione 04.09.** Na czacie stawało
  „Błąd ataku: BACKUP_CANNOT_DODGE" zamiast „Funkcjonariusze Wsparcia nie mogą Unikać pocisków".
  Mylące, bo zdanie **istniało** — w ogólnym `ackErrorText`, a `attack:evade` idzie przez
  `attackAckErrorText`, gdzie brakowało wszystkich trzech kodów tej ścieżki
  (`BACKUP_CANNOT_DODGE`, `SHIELD_CANNOT_DODGE`, `DODGE_BLOCKED`). Zdanie Ludzkiej tarczy wzięto
  z `CPRED_GRAPPLE_PROBLEM_MESSAGES`, zgodnie z umową „zdania kodów silnika mieszkają w shared".

- **Guzik „Kup" pisał cenę sprzed dobitego targu. ZAMKNIĘTE — naprawione 04.09.** Przy targu
  Fixera („−10% od najbliższego zakupu") guzik mówił „Kup — 20 ed", a z konta schodziło 18;
  prawdę mówiła dopiero karta ekonomii po zakupie („Targ: Dziesięć procent −10% · cena
  z katalogu 20 ed"). Klient liczy teraz cenę tą samą funkcją, co serwer
  (`cpredHaggledPrice`), z tym samym warunkiem `discount > 0`, a podpowiedź guzika nazywa
  cenę katalogową.

## Przeniesione 2026-09-03 (zestaw A — leczenie, regeneracja i środki zużywalne, trzecia sesja)

- **Farmaceutyki nie miały zapasu dawek. ZAMKNIĘTE — zrobione 03.09.** Pierwotny wpis: „Panel
  drukuje pięć środków słowami podręcznika i mówi, ilu Medyk ma dostęp, ale który wybrał,
  wytworzenie dawki (Test PT 13, surowce za 200 ed) i podanie jej (Akcja) prowadzi MG. Brakuje
  modelu przedmiotu zużywalnego — wiersz ekwipunku to wolny tekst bez licznika."
  **Diagnoza była o jedno zdanie za surowa:** `CpredGearRow` miał `qty` od dawna, brakowało
  wyłącznie tego, co **zużycie sztuki oznacza**. Naprawa dodaje więc jedno pole, nie tabelę:
  `CpredGearRow.consumable` niesie id środka z nowego, bezzależnościowego modułu `pharma.ts`,
  a dwa zdarzenia robią resztę — `character:craft-pharma` (rzut TECH + Technologia Medyczna vs
  PT 13; **surowce za 200 ed schodzą z konta także po porażce**, bo tak mówi zdanie „W przypadku
  porażki surowce przepadają", a udany Test daje tyle dawek, ile wynosi Umiejętność) oraz
  `character:use-dose` (Akcja, zasięg ramienia, bramka „Postać niebędąca Medykiem nie potrafi
  poprawnie podawać farmaceutyków"). Cztery z pięciu środków rozlicza silnik; Stym został otwarty
  i ma własny wpis w `zaleglosci.md` z gotowym przepisem. Obejrzane w przeglądarce: wytworzenie
  (3 dawki, −200 ed), wiersz „Antybiotyk × 3" z guzikiem „Podaj", podanie sobie i komuś innemu.

- **Ustabilizowanie nie sprawdzało, czy medyk sięga do pacjenta. ZAMKNIĘTE — zrobione 03.09.**
  Pierwotny wpis (z `POMYSLY.md`, 30.07): „RAW nie podaje zasięgu tej Akcji, więc serwer wymaga
  tylko, żeby cel był widocznym tokenem kampanii; przy stole »ratuję go z drugiego końca ulicy«
  jest oczywistym nadużyciem." Naprawa: `requireStabilizeReach` w `realtime/character-rolls.ts`
  mierzy `metresBetweenTokens` przeciw `CPRED_MELEE_REACH_M` — **ten sam** zasięg, który mierzy
  Pochwycenie, bo czynnością jest dotknięcie rannego. Trzy rozstrzygnięcia warto zapisać:
  zasięg obowiązuje **wszystkich, MG włącznie** (wyjątek od zwyczaju „MG omija blokady", bo MG
  stabilizuje figurą stojącą na mapie); medyk bez żetonu na scenie pacjenta dostaje odmowę
  `STABILIZE_NOT_ON_SCENE`, a nie zwolnienie; a sprawdzenie idzie **przed** `spendStabilizeAction`,
  żeby odmowa „za daleko" nie kosztowała tury. Obejrzane w przeglądarce na obu gałęziach.

- **PW nie wracały nigdy. ZAMKNIĘTE — zrobione 03.09** (wpis z `POMYSLY.md`, 03.09). `treatment.ts`
  umiał zdjąć Ranę Krytyczną, `damage.ts` odjąć PW, a drogi w drugą stronę nie było wcale poza
  wpisaniem liczby ręką. Nowy moduł `shared/systems/cpred/recovery.ts` liczy **dzień odpoczynku**
  (s. 222–223): BC punktów, podwójne przy chromie „Ulepszone przeciwciała" (s. 362), plus 2 za
  Antybiotyk (s. 150), do maksimum; „Splot skórny" i „Pancerz podskórny" odzyskują przy tym 1 OB
  (s. 363). Warunek „po udanej stabilizacji" siedzi w nowym `CpredCharacterData.recovery`, a
  **udane Ustabilizowanie ustawia go na każdym progu ran** — do tej sesji rzut na stojącego
  pacjenta nie robił **nic**, więc PT 10 i PT 13 z tabeli progów były PT donikąd. Nadwyrężenie
  („Jeśli pacjent przesadzi…") zabiera dzień, ustabilizowanie i tydzień antybiotyku naraz.
  **Uwaga na jedno odstępstwo od wpisu:** „opieki jako mnożnika tempa" w podręczniku nie ma —
  szpital zmienia cenę (s. 225), nie szybkość.

## Przeniesione 2026-09-03 (dwa długi higieny, obie z drugiej sesji tego dnia)

- **`tsc --noEmit` na serwerze miał jeden błąd, którego vitest ani ESLint nie widziały.
  ZAMKNIĘTE — naprawione 03.09.** `attacks.test.ts:1941` — `expect(card.system.ammo?.id)` przy
  `Property 'id' does not exist on type '{}'`. Diagnoza dokładna: lokalny interfejs `AttackCard`
  opisywał `system` jako `Record<string, unknown>`, a przy `noUncheckedIndexedAccess`
  `card.system.ammo` to `unknown` — optional chaining zawęża je do `{}`, na którym nie ma
  żadnego pola. Naprawa **nie** przez rzut w miejscu asercji: `system` dostał prawdziwy kształt
  `CpredAttackMeta & { margin: number; multiplier?: number }` (planer plus dwie liczby, które
  dokłada serwer w `realtime/attacks.ts`), a trzynaście rozsianych po pliku rzutów
  `as AttackCard` zastąpiły dwa pomocniki: `attackCard()` i `requireAttackCard()`. **Jedyny
  rzut w pliku siedzi teraz w `attackCard()`** — i jest tam konieczny, bo `RollAttackMeta.system`
  w `dice.ts` jest `Record<string, unknown>` **świadomie**: silnik kości nie wolno mu wiedzieć,
  czym jest CP RED (separacja rdzeń/system). Testu w `shared` nie zmieniano. Sprawdzone:
  `tsc --noEmit` czysty w **całym monorepo** (`shared`, `server`, `client`).

- **Zestaw testów serwera padał losowo pod równoległością. ZAMKNIĘTE — naprawione 03.09.**
  Dwie przyczyny, obie potwierdzone w kodzie, nie zgadnięte:
  1. **`waitFor` bierze pierwszą wiadomość, jaka przyjdzie.** Publiczny rzut dociera także do
     gniazda MG, a jego kopia potrafi wylądować już **po** tym, jak test, który go wywołał,
     wrócił na kopii gracza — wtedy `waitFor` następnego testu rozwiązuje się na karcie
     poprzedniego. Naprawa: dopasowanie po treści. `roles30d.test.ts` dostał `waitForMatch`
     i `waitForRoll(socket, title)`; sześć oczekiwań na `chat:message` czeka teraz na swoją
     kartę po tytule („Pogłoski", „Targowanie się", „Efekt Charyzmy", „Test Rzetelności",
     „Prowadzenie pojazdów") albo po obecności rozliczenia ekonomii. `netdemons.test.ts` dostał
     własne `waitForRoll` — tam kolidowały karta wykrycia Demona i trzy karty Tury Demona;
     dopasowanie idzie po tytule wymiany („Miecz → Mur", bo `plan.label` to
     `${program.name} → ${demon.name}`) i po „Kontrola".
  2. **Rzut, od którego zależy pięć testów niżej — i który przegrywa raz na sto.** To była
     **główna** przyczyna, a zapis zaległości jej nie znał: kaskada wyglądała na wyścig, bo
     padało zawsze kilka testów naraz. Netrunner przejmuje węzeł kontrolny Testem Interfejsu
     10 przeciw **PT 1 wypisanemu na piętrze**. Naturalna jedynka każe dorzucić kość i ją
     **odjąć** (dorzut sam już nie wybucha), więc najniższy możliwy wynik to **równo 1** —
     a Test wymaga „więcej niż PT". Zmierzone na milionie rzutów: **0,998 %**. Gdy trafi,
     w `netdevices.test.ts` pięć następnych testów wraca z `NET_NODE_NOT_HELD`, a
     w `netdemons.test.ts` Demon nie ma czego odebrać, więc „odebrany" nie pada i PT węzła
     nigdy nie rośnie do 31. **Wzorzec naprawy istniał w repo od dawna** — `netrun.test.ts`
     ma na to pętlę dziesięciu podejść; brakowało jej w dwóch pozostałych plikach. Dołożona:
     w `netdevices.test.ts` do sześciu podejść (walka zaczyna się dopiero niżej, a poza walką
     `spendTurnForToken` zwraca „not-in-combat", więc budżetu Akcji Sieciowych nie ma),
     w `netdemons.test.ts` **jedna** powtórka — walka trwa, ranga 10 daje pięć Akcji na Rundę,
     trzy poszły na ataki wyżej, więc drugie podejście to piąta Akcja i na trzecie budżetu już
     nie ma. Dwa podejścia znoszą 1 % do 0,01 %.
  3. **`zones.test.ts` mierzył spadek PW od stanu, który mógł już być zerem.** Kolec ma 50 PW
     (BC 8, SW 8), podłoga elektryczna bije 6k6 za wejście, a **przy zerze serwer odmawia
     graczowi ruchu w ogóle** (`realtime/movement.ts`) — więc walk się nie odbywa, spadek jest
     0 → 0 i test pada na `expected 0 to be less than 0`, obwiniając asercję zamiast stanu.
     Naprawa: pomocnik `healUp()` stawia kartę na pełni i **zwraca** tę liczbę; cztery testy
     mierzące PW zaczynają od niego, a piąty (rozliczenie na koniec Tury) dostał go zamiast
     ręcznej łaty `hpCurrent: 50` wpisanej tam wcześniej — jej komentarz „Kolec leży na zerze"
     był zresztą pierwszym śladem tej diagnozy.

  4. **Pięć plików miało `beforeAll` bez podniesionego limitu czasu.** Wyszło dopiero
     w pomiarze po trzech poprawkach wyżej: jeden przebieg na dwanaście padł
     w `screamsheets.test.ts`, i to **na poziomie pliku** (`FAIL src/screamsheets.test.ts
[ src/screamsheets.test.ts ]`), a nie na asercji — czyli w haku, nie w teście. Hak robi
     `npx prisma migrate deploy` (osobny proces CLI Prismy) i podnosi Fastify z Socket.IO,
     a pod pełną równoległością nie mieści się w domyślnych **10 s** vitesta. Wszystkie
     pozostałe pliki dymne mają `}, 60_000);` — te pięć (`compendium`, `netcombat`, `netrun`,
     `netrunning`, `screamsheets`) go nie miało. Dopisane. To jest wreszcie **ta** przyczyna,
     którą stary wpis w `pulapki-dev.md` opisywał jako „testy dymne pękają na limicie czasu";
     nowy plik dymny musi dostać ten limit razem z hakiem.

  Sprawdzone po wszystkich czterech naprawach: **piętnaście pełnych przebiegów `vitest run`
  pod rząd, 918/918 za każdym razem** — zero porażek. Dla porównania: przed czwartą naprawą
  dwanaście przebiegów dało jedną (`screamsheets.test.ts` na limicie haka).

## Przeniesione 2026-09-02 (trzy błędy z oględzin etapów 31 i 32)

- **Broń podwieszana nie miała wyboru amunicji (01.09). ZAMKNIĘTE — naprawione i obejrzane
  02.09.** Diagnoza była głębsza niż zapis zaległości: brakowało nie tylko listy w wierszu `↳`,
  ale i **pola, w którym nabój miałby siedzieć**, i **gałęzi w planerze, która by go czytała**.
  `secondaryWeaponRow` ustawiała broni podwieszanej `ammoId: undefined` z komentarzem „nabój
  w magazynku hosta należy do hosta", a `planCpredAttack` i tak zerował profil
  (`const ammo = firedWith ? null : weapon.ammo`) — czyli **żaden** nabój specjalny nie miał jak
  wyjść z granatnika, choćby wpisać go ręką w bazie. Naprawa w czterech miejscach: nowe pole
  karty `attachmentAmmoId` (mapa `id dodatku → id naboju`, obok `attachmentAmmo`), nowe wejście
  planera `secondaryAmmo` (rozwiązywane przez wołającego, jak `ammo`), `weapon:reload`
  z `attachmentId` przyjmujące `ammoId` i pasujące nabój **do broni podwieszanej**, nie do
  karabinu (`requireLoadableAmmo` z parametrem `against`), oraz `AmmoPicker` w wierszu `↳`.
  Demontaż dodatku zabiera teraz i magazynek, i załadowany nabój. **Obejrzane w przeglądarce
  02.09** na „Militech Dragonie" avatar9: lista przy granatniku pokazała **wyłącznie granaty**
  (dymna, EMP, hukbłyskowa, gaz łzawiący, usypiająca…), a lista przy samym karabinie — wyłącznie
  kule, czyli sprawdzenie naprawdę idzie po broni podwieszanej. Wybór „Amunicji dymnej" napełnił
  magazynek 0/1 → 1/1 **nie ruszając 25/25 karabinu**, dymek nad celem wycenił strzał z linii
  granatnika („0–6 m · PT 16 · 1 → 0"), a strzał postawił na mapie **prostokąt „Dym −4"** —
  z kartą „nabój: Amunicja dymna · obszar 10×10 m · odchylenie…". Zwykłe ⟳ dolewa magazynek
  i **zachowuje** wybrany nabój. Testy: 3 w `shared`, 4 na serwerze.

- **Podgląd broni nad żetonem pokazywał wiersz, nie dodatek (01.09). ZAMKNIĘTE — naprawione
  i obejrzane 02.09.** Przyczyna nie leżała w planerze (ten obsługuje `attachmentId` od etapu 31)
  ani w banerze, tylko w tym, że `TargetTooltip` budował intencję **własną kopią** kodu
  z `loadAttackAtToken` i przy przepisywaniu zgubił `attachmentId` (a przy okazji `thrown`).
  Naprawa usuwa kopię: jeden `intentFromTargeting` w `attack-targeting.ts` obsługuje obie drogi,
  a gałąź paska akcji dostała `attachmentId` ze slotu. **Obejrzane 02.09**: chmurka nad Rudym
  Kwiatkowskim powiedziała „Granatnik podwieszany" i policzyła jego magazynek. Testy: 4 u klienta.

- **Odmowa serwera przy ręcznej łacie karty zostawiała pole z wartością, której nie ma w bazie
  (02.09). ZAMKNIĘTE — naprawione i obejrzane tego samego dnia.** Potwierdzona diagnoza z zapisu:
  `endSave` adoptował widok serwera **tylko** przy `ok === true`, a przy odmowie zapalał sam stan
  `error` — optymistyczna łata zostawała na ekranie do przeładowania strony. Przy odmowie ack
  nie niesie widoku (`{ ok: false, error }`) i broadcast nie idzie (bo nic się nie zmieniło), więc
  nie było **do czego** wracać; naprawa dokłada w `characterStore` cień `serverViews`
  (aktualizowany przez `applySync`, `applyUpsert` — także wtedy, gdy optymistyczny stan wygrywa —
  i udany zapis), z którego odmowa przywraca kartę, gdy nic już nie jest w locie. Druga połowa to
  powód: `saveErrors` niesie kod odmowy, a `characterSaveErrorText` tłumaczy go na zdanie do paska
  „issues" na dole karty (i na `title` nagłówka). Nowa tabela `CPRED_ROLES_PROBLEMS` w `shared`
  dopisuje zdania dla `ROLE_TWICE` i `UNKNOWN_ROLE`. **Obejrzane 02.09** na „Franku"
  z podstawionym `formerRoles: [solo]`: wybór Roli „Solo" wrócił do „— brak —", tytuł został
  „FRANK" (bez „FRANK SOLO"), a na dole karty stanęło „Ta Rola już jest na karcie — jedna Rola
  stoi na niej tylko raz.". Dotyczy **każdej** odmowy `character:update`. Testy: 4 u klienta.

## Przeniesione 2026-09-02 (oględziny rozwoju postaci — 29a i 29b)

- **Etap 29a — reszta pięciu ścieżek. ZAMKNIĘTE — odklikane 02.09.** Nośnikiem był **„Frank"**
  (pusta karta poligonu, na czas sesji własność konta `Tester`, Nomada z Moto 4 i 100 PD);
  po sesji przywrócony do stanu sprzed. (1) **„Podnieś"** — Atletyka 2 → 3 za 60 PD: licznik
  spadł 100 → 40, wiersz w panelu przeskoczył na „3 → 4 · 80 PD", strona pierwsza pokazała
  Atletykę 3, a rejestr — świeży wiersz „Atletyka 2 → 3 · −60 PD · 40 PD" **bez przeładowania**.
  (2) **Filtr „tylko na które mnie stać"** — przy 40 PD z 66 szczebli zostały 62, wyłącznie po
  20 i 40 PD; wiersze po 60, 80, 120 i 300 PD zniknęły. (3) **Brak PD** — guziki wyszarzone
  z podpowiedziami „Brakuje 200 PD" (Moto 4 → 5) i „Brakuje 20 PD" (Ogień ciągły 2 → 3).
  (4) **Tylko do odczytu u gracza** — „Poziom: Atletyka", „Ranga: Moto" i „Punkty Doświadczenia"
  mają `readOnly`; **wpisane z klawiatury „9" i „8" nie weszły** przy ognisku w polu, a wybór
  Roli jest `disabled`. U MG te same trzy pola przyjęły wpis (ranga Zmysłu Walki 1 → 4 ręką MG
  weszła i **odświeżyła panel gracza na żywo**). (5) **„✦ Przyznaj wszystkim"** — 20 PD z powodem
  „sesja oględzin 02.09" dostało **pięć postaci graczy z kampanii** (Tony, avatar9, Test 27x,
  Marcin, Frank), a **żaden BN** (Rudy Kwiatkowski 0) i **żadna postać z innej kampanii**;
  każda dostała wiersz rejestru z powodem. Zabranie −20 PD wróciło wszystkim do zera i
  **nie zeszło poniżej** (Frank stał na 0 i na 0 został).

- **Etap 29a — komunikat „Przyznano N PD" liczył postaci dwa razy. ZAMKNIĘTE — naprawione
  02.09.** Po przyznaniu stanęło **„Przyznano 20 PD — 5 5 postaci."**: `awardPoints`
  w `CharacterPanel.tsx` składało zdanie z `plural(awarded, …)`, które samo dokleja liczbę,
  i doklejało `awarded` jeszcze raz przed nim. Naprawa: `pluralWord` (dodany w 27f właśnie dla
  miejsc formatujących liczbę osobno) — sprawdzone w przeglądarce: „Zabrano 20 PD — 5 postaci."
  Drugie użycie `plural` w tym samym pliku (odnowienie Szczęścia) jest poprawne i zostaje.

- **Etap 29b — trzy ścieżki od strony MG. ZAMKNIĘTE — odklikane 02.09.** (1) **Darmowy powrót
  do posiadanej Roli** — Frank (Nomada 4) kupił za 60 PD **Solo**, MG podniósł mu Zmysł Walki
  do 4, a wtedy lista w panelu pokazała **„Nomada — powrót (Moto 4)"** i guzik obiecał „za darmo,
  Moto wraca na poziom 4". Powrót przy **0 PD w zapasie** przeszedł, kosztował **0** i zostawił
  w rejestrze wiersz „Nomada — powrót do Roli (Moto 4) · +0 PD"; powrót w drugą stronę (do Solo)
  też. (2) **Rzut ze Zdolności poprzedniej Roli** — u Franka **będącego Solo** (Nomada
  poprzednia, Moto 4) okno rzutu Prowadzeniem pojazdów pokazało „Refleks (REF) +5 ·
  Prowadzenie pojazdów +4 · **Moto 4 +4** · 1k10 + 13", a karta na czacie ten sam chip „Moto 4 +4"
  przy wyniku 20. (3) **Ręka MG** — obie rangi (`Ranga: Zmysł Walki`, `Ranga: Moto`) są u MG
  edytowalne i u gracza tylko do odczytu; odmowy sprawdzone na żywym gnieździe:
  **`ROLE_TWICE`** przy wpisaniu bieżącej Roli w `formerRoles` i przy wybraniu poprzedniej Roli
  w polu „Rola", **`UNKNOWN_ROLE`** przy nieznanej Roli w `formerRoles`. **Ustalenie:** nieznane
  `roleId` **bieżącej** Roli nie dochodzi do `cpredRolesProblem` — parser karty odrzuca je
  wcześniej jako `INVALID_DATA`, więc `UNKNOWN_ROLE` wychodzi wyłącznie z `formerRoles`.

## Przeniesione 2026-09-01 (druga sesja — pasek dodatków i domknięcie etapu 31)

- **Broń podwieszana i bagnet są nieosiągalne z paska akcji (01.09). ZAMKNIĘTE — naprawione.**
  `cpredHotbarSlots` budowało sloty wyłącznie z `sheet.weapons`, więc z granatnika
  podwieszanego i z bagnetu strzelało się tylko z karty postaci. Naprawa: `cpredWeaponOptions`
  bierze katalog dodatków i typy broni, a `weaponOptionKey` (wiersz + dodatek) niesie tożsamość
  do czterech miejsc, które dotąd kluczowały na samym `rowId` — id slotu, id przeładowania,
  grupowanie panelu i pamięć trybu ognia u klienta. Osiem nowych testów w `hotbar.test.ts`.
  Odklikane: pasek avatar9 pokazał „Bagnet" (3) i „Granatnik podwieszany" (4) osobnymi
  klawiszami, przeładowanie granatnika z paska zmieniło 0/1 na 1/1 **nie ruszając** magazynka
  karabinu (25/25), strzał z granatnika załadował kubek na pole z obszarem 10×10 m, a karta
  ataku bagnetem powiedziała „Militech Dragon · Bagnet" i policzyła go **Bronią białą**
  (nie Bronią ciężką karabinu) z odmową „Do ataku wręcz cel musi być nie dalej niż 2 m"
  powyżej dwóch metrów.

- **Etap 31 — oglądnięte sześć rzeczy z ośmiu (01.09). ZAMKNIĘTE — komplet odklikany.**
  Trzy brakujące:
  (1) **noktowizor kasujący karę za dym** — ten sam strzał avatar9 → Automatyczna wieżyczka
  (4 m, PT 15, ta sama chmura): **bez** „Celownika noktowizyjnego" rozbicie miało
  `Refleks +5 · Broń krótka +10 · Test łaty 15 −1 · Dym −4 · Złącze smartguna +1` (= +11),
  **z nim** `… bez wiersza „Dym"` (= +15). Kara **znika z rozbicia**, a nie jest równoważona
  dodatnim wierszem — dokładnie tak, jak zapowiada komentarz w `attacks.ts`.
  (2) **luneta snajperska** — w VTT nazywa się **„Luneta dalekiego zasięgu"**; strzał
  z Celowaniem (noga) z 19 m dopisał wiersz **„Luneta dalekiego zasięgu +1"**, choć do 51 m
  brakowało — czyli bonus wszedł z tytułu Celowania, nie odległości.
  (3) **demontaż przycinający naboje** — Arasaka Minami 10 przeładowana do **50/50**, po zdjęciu
  chipa „Magazynek bębnowy" pokazała **30/30**, nie 50/30.

- **Celowanie w statystę — „zdanie zamiast rany". ZAMKNIĘTE — odklikane 01.09.**
  Strzał z Celowaniem (noga) w **Automatyczną wieżyczkę** (figura bez karty, OB 0): trafienie
  17 vs PT 15, obrażenia 2k6 = 8, a karta zastosowania powiedziała „Przebicie: 8 obr. · rzut 8 ·
  bez pancerza · PW 25 → 17" z chipami **„Bez ran → Lekko ranny"** i **„Celowanie (noga):
  Złamana noga"** oraz zdaniem „−4 do Ruchu (minimum 1)". Rana jest **nazwana**, nie losowana
  z tabeli 2k6.
  **Uwaga na przyszłość:** drugiego statysty, „testowy 2x2", tą drogą nie sprawdzisz — ma
  **OB 13**, a 2k6 nigdy tyle nie przebije, więc rana krytyczna nie ma jak powstać.

## Przeniesione 2026-09-01 (wraz z wycofaniem etapu 27g)

- **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą. ZAMKNIĘTE — bez pomiaru.**
  Pozycja czekała na etap 27g (decyzja MG z 28.08). **01.09 MG wycofał etap 27g**, bo
  wydajność sprawdził samodzielnie poza sesją — a razem z adresem znika powód, dla którego
  pozycja stała otwarta. Treść oryginalnego wpisu, bez zmian:

  - **Etap 27i — pomiar fps nie objął sceny ze światłami i mgłą.** „Strzelnica" ma widoczność
    `open`, więc 160,1 → 161,2 fps mierzy **samą warstwę efektów**, a nie najgorszy przypadek
    z kryterium etapu. Warstwa rysuje na klatkę kilka ścieżek `Graphics` i najwyżej jeden sprite,
    więc rezerwa jest duża — ale liczby dla sceny z dynamiczną widocznością nadal nie ma.
    **Decyzja MG z 28.08: pomiar idzie do etapu 27g**, a nie do najbliższej sesji zaległości —
    scena, na której się go robi, już stoi („Korytarz 16e", widoczność Dynamiczna).

## Przeniesione 2026-08-31 (pasek figury bez karty: rany, Testy, przeładowanie)

Trzy pozycje długu oględzin, wszystkie z jednego obszaru — paska figury bez karty postaci —
plus dwa błędy znalezione przy okazji i naprawione tą samą sesją.

- **Statysta nie miał skąd być załatany ani wyleczony. ZAMKNIĘTE — panel „Rany" w pasku.**
  Diagnoza z 30.08 była trafna w całości: serwer umiał leczyć figurę bez karty od 29.08
  (`treatableInjuries` czyta `combatProfile`, `applyTreatment` pisze do niego z powrotem),
  a `loadTreatInjuryCup` od początku brał **adres żetonu**, nie karty. Brakowało wyłącznie
  ekranu. Doszła sekcja `FigureInjuries` w pasku (nowy komponent, klasa `cp-injuries`, więc
  wiersz rany wygląda identycznie jak na karcie) i refaktor `TreatInjury`: pacjentem jest
  **figura** (`{ tokenId, name, characterId? }`), a nie id karty, którego statysta nie ma.
  Odklikane 31.08 na wieżyczce z poligonu: „Złamane żebra" nadane ręką MG, załatane
  Ratownictwem 23 vs PT 13 („efekt milczy do końca dnia"), potem wyleczone 19 vs PT 15
  („schodzi z karty") — z zapisem w `combatProfile` żetonu i kartami na czacie.

- **Ręka MG nad ranami figury bez karty — dołożona przy okazji.** Do 31.08 rana wchodziła
  staty­ście **wyłącznie regułą** (gaz, granat hukowy, broniona strefa, Celowanie w nogę);
  MG nie miał jak jej nadać ani zdjąć bez edycji bazy. `character:injury` przyjmuje teraz
  `tokenId` zamiast `characterId` i idzie tą samą funkcją, co gaz
  (`applyForcedFailureToTokenHp`) — więc rana niesie karę do RUCH-u, dopłatę do Testu
  Przeżywalności i zabraną Akcję z 14e, a karta na czacie jest zwykłą kartą obrażeń
  i „Cofnij" działa bez jednej nowej linijki.

- **Wsparcie poziomu 10 nie rzucało Wartością bojową w piętnastu Umiejętnościach.
  ZAMKNIĘTE — lista Umiejętności w profilu.** Zrobione ogólniej niż sama zaległość:
  `CpredCombatProfile.skills` (id → poziom) niesie **dowolna** figura bez karty, agent
  federalny dostaje swoje piętnaście automatem przy postawieniu
  (`cpredBackupSkillLevels`), a MG dopisuje ręcznie w edytorze profilu. Rzut idzie przez
  `character:roll` z `attackerTokenId` i jest przyjmowany **tylko** dla Umiejętności z tej
  listy (`STATIST_CANNOT_ROLL_THIS` dla reszty) — jedna liczba `skillLevel` nie czyni
  gangera biegłym w Kryptografii. Odklikane 31.08: „Percepcja (INT) · 1k10+12 = 17"
  z rozbiciem „Inteligencja (INT) +0 · Percepcja +12".

- **Przeładowanie statysty w trwającej walce. ZAMKNIĘTE — odklikane 31.08.** Pudełko
  „Przeładuj: Karabin szturmowy 9/25" napełniło magazynek do 25/25, zgasło z podpowiedzią
  „Magazynek jest pełny", a `turnState` wieżyczki zapisał `action: { id: 'reload' }` —
  czyli Akcja została policzona.

- **Błąd znaleziony przy okazji: cztery z sześciu kategorii Wsparcia biły jak krawężnicy.**
  `sanitizeCombatProfile` klampowało `skillLevel` i `evasion` do `SKILL_LEVEL_MAX` (10),
  a to jest limit **Umiejętności postaci**. Profil statysty trzyma w tym polu Wartość
  bojową, czyli sumę Cechy i Umiejętności (s. 158) — 14, 16, 15 i 14 u czterech kategorii
  i 14 u wszystkich pięciu Demonów. Zapis do bazy szedł poprawny, ale **każdy odczyt**
  ścinał go do 10. Sufitem jest teraz `STATIST_SKILL_LEVEL_MAX` (= CPRED_STAT_MAX +
  SKILL_LEVEL_MAX). Nie wyszło wcześniej, bo 30c nie było oglądane, a testy sprawdzały
  `cpredBackupProfile` — czystą funkcję **przed** sanityzacją.

- **Błąd znaleziony przy okazji: jedna z piętnastu Umiejętności nigdy się nie dopasowywała.**
  Tabela w `roleability.ts` pisze „Ukrycie/znalezienie przedmiotu", a `skills.json` ma
  „Ukrycie/Znalezienie przedmiotu". Dopasowanie po nazwie ignoruje teraz wielkość liter.

- **Migotanie `specialties.test.ts` — naprawione.** Plik padał mniej więcej co dziesiąty
  przebieg i zabierał ze sobą dwa sąsiednie testy. Nie był to błąd kodu, tylko reguła:
  naturalna 1 odejmuje 1k10 (s. 165), więc TECH 8 + Chirurgia 10 schodzi do 9–18 i przegrywa
  z PT 17. Modyfikatora, który przebije fumble, na karcie zbudować się nie da (sufity to 10
  i 10), więc cztery rzuty leczenia powtarzają się w pętli do skutku — tak, jak zrobiłby to
  Medyk przy stole.

## Przeniesione 2026-08-31 (Celowanie, broń z katalogu, prowieniencja rany)

Cztery pozycje: trzy naprawy kodu w jednym obszarze („mechanika gotowa, nieosiągalna z UI")
i jedno sprawdzenie zakończone wpisem do `decyzje-i-uproszczenia.md`.

- **Celowanie było nieosiągalne z paska akcji. ZAMKNIĘTE — wybór przeniesiony do kursora.**
  Diagnoza się potwierdziła: baner z guzikami „Głowa / Trzymany przedmiot / Noga" wisiał na
  `attackStore.targeting`, a pasek uzbraja broń **własnym** stanem (`hudStore.activeWeapon`), więc
  figura wybrana na mapie strzelała bez możliwości Celowania. Naprawa nie dokłada drugiej
  kontrolki, tylko przenosi wybór **do jedynego miejsca, przez które przechodzą wszystkie drogi
  ataku**: `loadAttackFor` po załadowaniu kubka otwiera przy kursorze okno `AimMenu` (cztery
  sylwetki: korpus, głowa, trzymany przedmiot, noga). Dzięki temu trzeciej drogi, która by
  o Celowaniu nie wiedziała, nie da się dopisać bez ominięcia ładowania kubka. Wybór nie jest
  lepki — przeładowuje kubek tym samym zamiarem z dopisanym `aimedAt`, więc nic nie jest jeszcze
  rzucone ani zapłacone. **Odklikane 31.08 obiema drogami**: kafel paska u statysty („testowy
  2x2") i „Atak" z wiersza karty (avatar9); na karcie rzutu stanęło „Celowanie (głowa) −8".

- **Broń wpisana ręcznie na karcie nie strzelała. ZAMKNIĘTE — wiersz powstaje z katalogu.**
  „+ Broń" dokładało pusty wiersz z samą nazwą, a taki nie ma `compendiumId`, więc planer nie
  dochodzi do typu broni ani do tabeli zasięgów i odmawia („Ta broń nie ma tabeli zasięgów").
  Pole nazwy wyglądało przy tym jak pole z podpowiedziami, a nim nie było. Teraz „+ Broń
  z katalogu" otwiera wyszukiwarkę kompendium, a wiersz buduje ten sam `purchasedSheetRow`,
  którym buduje go zakup i „Dodaj za darmo". **Dopasowania po nazwie świadomie nie ma** (decyzja
  MG 31.08): „Pistolet" pasowałby do kilkunastu modeli i po cichu przypiąłby złą tabelę zasięgów,
  czyli zły PT na każdym dystansie. Wiersze **już wpisane ręką** dostają czerwony chip
  „⚠ Wskaż broń z katalogu" i **wyszarzony guzik „Atak"** — karta mówi to, co dotąd mówił dopiero
  planer w chwili nieudanego strzału; wiązanie zostawia nazwę i uwagi, a bierze obrażenia,
  magazynek i szybkostrzelność. **Odklikane 31.08** na karcie „Frank": dopisanie „Zgrzyt 9”
  z wyszukiwarki i związanie wiersza „Rura z parkingu” z „Dużą bronią białą” (3k6, LA 2).

- **Rana nadana ręką MG gubiła prowieniencję. ZAMKNIĘTE — ale nie tak, jak mówiła zaległość.**
  Zapisane w zaległości „wpisz `roll` z wpisu kompendium zamiast `rolled: 0`" **byłoby błędem**:
  ten sam plik trzy funkcje dalej (gałąź Celowania w nogę) robi odwrotnie i tłumaczy dlaczego —
  „the aim named it, so the sheet must not print a 2k6 that never happened" — i **kasuje** pole.
  Rana z ręki MG, z gazu, z granatu hukowego i z bronionej strefy to ten sam przypadek. Decyzja MG
  z 31.08: zamiast zmyślonego rzutu wiersz niesie własny znacznik `assigned`, a karta pokazuje
  przy takiej ranie chip **„nadana"** zamiast „2k6 = N". Wszystkie cztery miejsca (dwie ścieżki
  wymuszonej porażki i dwie gałęzie Celowania w nogę) idą teraz przez jedną funkcję
  `namedCriticalInjuryRow` w `shared` — bo to właśnie kopia nr 1 znała zasadę, a nr 2 i 3 nie.
  **Odklikane 31.08**: „Nadaj ranę → Korpus 3: Odcięta dłoń" na karcie „Frank" pokazało chip.
  Uwaga: rany nadane **przed** tą sesją znacznika nie mają i nie pokażą nic (np. „Test łaty 15”
  na karcie avatar9) — to nie regres, tylko brak danych w starych wierszach.

- **Prowizorka pancerza pracownika zespołu. ZAMKNIĘTE — sprawdzone i zapisane jako świadome.**
  Sufit „Najcięższym pancerzem […] jest Lekka kurtka kuloodporna. Taka polityka Korporacji"
  (s. 154) **nie jest egzekwowany** i tak ma być: karta pracownika jest zwykłą kartą, więc MG
  podnosi jej OB jak każdej innej. Sprawdzone 31.08 na zatrudnionym „Firmowym ochroniarzu":
  OB 11 → 18 przyjęte bez odmowy, zdanie z podręcznika zostaje na wierszu jako uwaga. Pełny zapis
  w `decyzje-i-uproszczenia.md`.

## Przeniesione 2026-08-30 (czwarta sesja — rany krytyczne)

Pięć pozycji: trzy naprawy kodu i dwa pakiety oględzin. Wszystko w jednym obszarze — wiersz rany
krytycznej, jej pola i to, kto ją zdejmuje.

- **Ustabilizowanie i Leczenie porównywały `>`, reszta `>=`. ZAMKNIĘTE — na `>` przeszło wszystko.**
  Rozjazd był trójstronny i okazał się rozstrzygalny w podręczniku: polskie wydanie drukuje zasadę
  ogólną dwa razy i oba razy ostro („wynik będzie **większy** od PT", s. 130; „Jeśli wynik Testu jest
  **wyższy** od PT, udało ci się!", s. 131). Decyzja z 28.08, która wprowadziła `>=`, powoływała się na
  zdanie „równy lub wyższy = sukces" i na s. 132 — takiego zdania w tym wydaniu nie ma, a s. 132 to
  lista Umiejętności. Naprawione w trzech miejscach: `cpredAmmoCheckOutcome` (przez nie idą pociski
  bez obrażeń, efekty stref i wypatrywanie strefy), Efekt Charyzmy z 30d (`character-rolls.ts`,
  razem z `≥`/`<` w zdaniu karty) i `cpredRumourHeard`. Ustabilizowanie i Leczenie zostały bez
  zmian — były jedynym miejscem zgodnym z podręcznikiem. Pełny zapis w `decyzje-i-uproszczenia.md`;
  **widać to na żywym rzucie**: łatanie „13 vs PT 13" wróciło z czatu jako „Nie udało się".

- **Edytor kompendium nie umiał zapisać połowy pól rany krytycznej. ZAMKNIĘTE.** Dołożone sześć
  brakujących pól: `movePenalty` („Kara do RUCH-u"), `actionPenalty` („Kara do rzutów") i cztery
  flagi tury z 14e jako pudełka („Brak Akcji w następnej Turze", „Nie może Unikać", „Bieg zabiera
  RUCH w następnej Turze", „Bieg otwiera ranę na końcu Tury") — w `EditorForm`, `toForm`, `fromForm`
  i w formularzu. Odklikane od końca do końca: rana własna MG („Test łaty 15", −3 RUCH-u, −1 do
  rzutów, brak Uniku, DoT po biegu) zapisała się, **wróciła kompletna przy ponownej edycji**,
  a nadana z karty weszła na nią ze wszystkimi skutkami i jej −1 stanęło w rozbiciu rzutu na czacie.
  Przy okazji poprawiony układ: cztery pudełka zawijały się nierówno w dwóch wierszach, teraz stoją
  jedną kolumną (`.injury-flags`).

- **Łatanie nie znosiło efektu rany. ZAMKNIĘTE.** „Łatanie niweluje efekt rany do końca dnia"
  (s. 223) działa: wiersz rany dostał pole `patched` (kto i czym), a **jeden filtr**
  `cpredActiveInjuries` przepuszcza wszystkie odczyty skutków — kary płaskie i warunkowe, blokadę
  Uniku, haki końca tury, Test Przeżywalności, mnożnik trafień w głowę i karę do RUCH-u. Rana
  zostaje na karcie z chipem „załatana" i przekreślonym efektem; ⌫ przy chipie kończy łatę
  („minął dzień"). Rzut jedzie tą samą drogą co Leczenie (`treatMode`), czyta **własne zdanie**
  z tabeli, a `cpredCarePermanent` rozstrzyga trzy rany, przy których łatanie leczy na stałe.
  Doszła przy tym reguła, której 30b nie miało: „można łatać samego siebie, nie można leczyć
  samego siebie" (s. 223) — pacjent wypada z listy leczących, a serwer odmawia `SELF_TREATMENT`.
  Odklikane: łata na „Złamanej nodze" i „Strzaskanych palcach", zniknięcie i powrót kary warunkowej
  w oknie rzutu, chip, ⌫ i odmowa drugiej łaty (`INJURY_ALREADY_PATCHED`).

- **Celowanie (s. 170) nieoglądane w przeglądarce. ZAMKNIĘTE.** Wszystkie cztery punkty
  odklikane na „Strzelnicy": guziki „Głowa / Trzymany przedmiot / Noga" stoją na banerze przy
  strzale pojedynczym i **znikają przy serii**; klikają się mimo `pointer-events: none` na banerze;
  wybór trzyma się do strzału i wchodzi do rozbicia jako „Celowanie (noga) −8"; karta obrażeń po
  trafieniu w nogę mówi „Celowanie (noga): Złamana noga" **bez „2k6 = …"**. Nie sprawdzony został
  jeden przypadek poboczny — Celowanie w **statystę** (ma dać zdanie zamiast rany); trzy strzały
  poszły w wieżyczkę i wszystkie były pudłem. Przy okazji wyszło, że baner z guzikami pojawia się
  **tylko** przy uzbrojeniu z karty postaci albo z menu żetonu — nowa pozycja w zaległościach.

- **Zmiany z 29.08 nieoglądane w przeglądarce. ZAMKNIĘTE (4 z 5 punktów).** (1) **Cięcie ostrzem**:
  karta obrażeń powiedziała „rzut 11 **− OB 7 (połowa pancerza)**", a wiersz pancerza spadł
  **13 → 12**, czyli o pełną ablację, nie o połowę. (2) **Chip kary warunkowej** stoi przy ranie
  („−4 · wszystkich Akcji wykonywanych tą ręką"), a **guzik** w oknie rzutu wpisuje −4 do
  modyfikatora i drugim kliknięciem cofa. (3) **Przeładowanie statysty**: pudełko „Przeładuj:
  Karabin szturmowy 25/25" stoi na pasku figury bez karty i gaśnie przy pełnym magazynku — koszt
  Akcji w trwającej walce **nie był** sprawdzony. (4) **Rana krytyczna statysty**: dwie szóstki na
  4k6 przeciw wieżyczce dały „Rana krytyczna (2k6 = 3): **Odcięta dłoń**" z pełnym opisem i
  „+ 5 za ranę krytyczną" w rachunku obrażeń; rana siedzi w `combatProfile.criticalInjuries`.
  (5) **Pola rany w edytorze kompendium** — patrz pozycja wyżej.

## Przeniesione 2026-08-28 (odsłuch dźwięków mapy)

Czwarta sesja tego dnia, jedna pozycja.

- **Etap 27i — zostały same dźwięki. ZAMKNIĘTE.** MG przesłuchał wszystkie szesnaście próbek
  przyciskami odsłuchu w „⚙ Ustawienia" — czyli dokładnie tak, jak ta pozycja od trzech tygodni
  zakładała, i to jedyny sposób, w jaki mogła zostać zamknięta. Dziesięć próbek przeszło bez
  uwag; sześć poszło do poprawki:
  (1) **Karabin strzelał dwa razy** — nie dobór próbki, tylko wada pliku: w `sks.wav` padają
  dwa strzały, drugi w 0,315 s. Przycięte, nie podmienione — reszta rodziny huków jest z tej
  samej sesji strzelnicy i sprawdzono obwiednią, że każdy ma po jednym strzale.
  (2) **Trafienie**, (3) **Rykoszet**, (4) **Gaz** i (5) **Przeładowanie** — nowe źródła.
  (6) **Wyładowanie** zostało w swojej paczce, ale na pliku `continuousspark` zamiast `spark`:
  MG chciał kilku iskier zamiast jednej.
  Przy okazji **przeładowanie rozdzieliło się na dwie próbki** (`reload-pistol` dwutaktowy,
  `reload-rifle` czterotaktowy, wybierane po ikonie broni przez `cpredReloadSound`), a **rykoszet
  po raz pierwszy w ogóle się odzywa** — do tej sesji był martwym wpisem, słyszalnym wyłącznie
  z przycisku odsłuchu. Licencje i opis obróbki: `packages/client/public/sfx/ATTRIBUTION.md`.

## Przeniesione 2026-08-28 (pakiet A+B+D+E — ruch i mgła, screamsheet, brakujące drzwi w UI)

Trzecia sesja tego dnia. Pięć pozycji zamkniętych w całości, dwie połówki i trzy pozycje zdjęte
decyzją MG. Oględziny szły na dwóch sesjach naraz: MG na `[::1]:5173`, gracz **avatar9**
na `localhost:5173`.

- **Etap 16e — dwie ostatnie ścieżki z dziesięciu. ZAMKNIĘTE.** Scena **„Korytarz 16e"**
  zbudowana od nowa (widoczność Dynamiczna, mur w kształcie litery L, pamięć eksploracji)
  i **zostawiona na stałe** — decyzja MG z 28.08, bo dynamicznej widoczności brakowało w całym
  poligonie i płaciliśmy za jej odtwarzanie drugi raz.
  (1) **Odsłanianie mgły w trakcie marszu**: żeton avatar9 przeszedł ~16 m wzdłuż muru, a cień
  rzucany przez ścianę miał w trzech kolejnych chwilach marszu **trzy różne kształty** (prawy
  skraj cofał się kolejno z x≈985 przez x≈838 do x≈790) — mgła przelicza się na bieżąco, nie
  jednym skokiem po dojściu.
  (2) **Przerwanie marszu przez NPC wychodzącego zza rogu**: gracz ruszył w długi marsz, a MG
  w tym samym czasie przeciągnął figurę „Rudy Kwiatkowski" zza muru w jego pole widzenia.
  Na czacie stanęło **„Ktoś pojawił się w polu widzenia — marsz przerwany."**, figura stanęła
  w połowie zaplanowanej trasy (zielona linia biegła dalej do porzuconego celu), a NPC był na
  ekranie gracza widoczny dopiero od chwili, w której wyszedł zza rogu.

- **Regresja hit-testu z 18a — sprawdzona i martwa.** Ta sama sesja: gracz na scenie
  z **dynamiczną widocznością** normalnie klikał swój żeton (pasek wypełnił się kartą avatar9),
  zaznaczał go i wysyłał w marsz. Naprawa z 16e trzyma; pozycja „warto powtórzyć zaległości
  z tego okresu" traci powód.

- **Etap 24c — zdjęcie prasowe.** Do screamsheetu „Kto zostawił krążek na Poligonie?" wgrana
  grafika 256×256; podgląd rysuje ją jako odbitkę gazetową — `.screamsheet-photo` ma policzony
  `filter: grayscale(0.75) contrast(1.15)`. Handout został na Poligonie jako dowód (opis
  w `poligon.md`).

- **Etap 24c — edycja zapisanego screamsheetu przez ✎.** Po zapisaniu i ponownym otwarciu przez
  ✎ formularz wrócił **jako screamsheet**: pola „Brukowiec" (KURIER POLIGONU), „Data w stopce",
  „Lead" i przycisk generatora były na miejscu, wypełnione zapisanymi wartościami, razem
  z grafiką. Rodzaj przyszedł z handoutu (`handout?.kind ?? …`), nie z przycisku, którym się go
  tworzyło. Przy okazji potwierdzona **degradacja generatora bez modelu**: „Generator jest
  niedostępny — AI Gateway nie odpowiada. Szablon wypełnisz ręcznie."

- **Katalog `ai-gateway/src/vtt_gateway/tts/` — pozycja była martwa od rana.** Skasowany
  w drugiej sesji 28.08 (patrz sekcja niżej), ale wiersz został na liście otwartych i zawyżał
  ją o jeden: `grep -c` liczył 18 pozycji, otwartych było 17. Zdjęty.

- **Zdjęte decyzją MG (28.08), bez roboty.** (1) **Etap 09 — zakładka „AI" u MG
  niezweryfikowana wizualnie**: późniejsze etapy oglądały u MG panele AI wielokrotnie, ostatnio
  w pakiecie B tego samego dnia (wiersz stanu indeksu w czterech panelach) — zaległość martwa.
  (2) **Ślad ścieżki przy przeciąganiu żetonu**: efekt czysto wizualny, nikt go nie zgłosił jako
  problem od 22.08, a łamana z licznikiem metrów nadal jest w kodzie (`drawMoveOverlay`
  w `MapRenderer`) i jest czymś innym niż ślady butów z 27j. Do kosza, nie do roboty.

## Przeniesione 2026-08-28 (pakiet A+B — ekonomia, chrom, kreator, kosmetyka UI)

Druga sesja tego dnia. Cztery pozycje w całości; wszystko na kampanii „Poligon bojowy",
guinea pigi: **avatar9** (zakupy i chrom) i **Tony** (sprzęt). Kopia wszystkich kart sprzed
sesji leży w `data/private/backups/characters-2026-08-28.json` — jednym `UPDATE` wraca stan
sprzed zakupów.

- **Etap 23b — zakup pancerza i sprzętu.** Kupiona **„Ciężka kurtka kuloodporna"** (500 ed,
  Kosztowne) dla avatar9: saldo **1550 → 1050**, karta na czacie („Zakup — … · −500 ed ·
  saldo 1050 ed"), a wiersz pancerza na karcie ma komplet — **OB 13 z 13**, **KARA −2**,
  lokacja **Korpus** (wpis chroni Głowę i Korpus, więc `purchasedSheetRow` sadza go na
  korpusie) i `compendiumId`. Sprzęt sprawdzony osobno: **„Apteczka polowa"** (50 ed) dla
  Tony'ego, który miał **dokładnie 50 ed** — przeszło, saldo zeszło do zera, wiersz
  „Apteczka polowa · ILOŚĆ 1" stanął w tabeli WYPOSAŻENIE. Drugie kliknięcie tego samego
  przycisku wróciło z **„Za mało eurodolców."** w panelu.

- **Etap 23b — wpis bez ceny liczbowej.** Jedyny taki wpis w kompendium kampanii to
  **„Faisal's Onlychance"** (`cost: null`, bez pasma): karta pokazuje **CENA —**, przycisk
  **„Kup" jest wyszarzony** z tytułem „Ten wpis nie ma ceny — uzupełnij ją w kompendium.",
  a MG nadal ma „Dodaj za darmo". Drugiej połowy tej pozycji (**cena z pasma**, czyli
  `cost: null` + `costCategory`) **nie da się dziś odkliknąć** — w całych danych kampanii nie
  ma ani jednego takiego wpisu; szczegóły przeniesione do `decyzje-i-uproszczenia.md`.

- **Etap 23b — „Znaleziony — montaż N ed".** Cyberręka ma montaż **szpitalny (1000 ed)**, więc
  przycisk pełny mówi „Zainstaluj — 1500 ed", a znaleziony „Znaleziony — montaż 1000 ed".
  Kliknięty **dwa razy** (dwie ręce): saldo schodziło po 1000 ed, nie po 1500, a rzut na Utratę
  Człowieczeństwa poszedł na czat (−8 i −7). Pełnopłatna ścieżka odklikana przy okazji na
  dodatkach: „Pazury" (200 ed) i „Chwytna Dłoń" (600 ed).

- **Etap 27c — rozbicie gniazd per pudełko sylwetki.** Po wszczepieniu **dwóch cyberrąk**
  sylwetka najpierw powiedziała czerwonym paskiem **„Bez gniazda: Cyberręka, Cyberręka. Wskaż je
  w kolumnie »Gniazdo«…"** (rozbicie liczyło wtedy „bez przypisanego miejsca: 2"), a po wskazaniu
  gniazd w tabeli wiersz rodziny rozpisał się dokładnie tak, jak obiecywała poprawka z 22.08:

  ```
  Cyberkończyny: 2 / 8
    Prawa cyberręka: 2 / 4
    Lewa cyberręka: 0 / 4
    Prawa cybernoga: 0 / 0
    Lewa cybernoga: 0 / 0
  ```

  Dwójka w prawej ręce to „Pazury" (1 gniazdo) i „Chwytna Dłoń" (1 gniazdo); w pudełkach
  sylwetki stoją nazwy wszczepów, puste pudełka nadal piszą „PUSTE". Przy okazji widać było
  księgę Człowieczeństwa z 23a: **50/50 → 28/44**, EMP w grze **5 → 2** i chip „EMP 2 · Na
  granicy" przy postaci na liście.

- **Etap 25a — Rangi Postaci inne niż „początkująca".** Selektor w kroku 2 („Kompletny Pakiet")
  ma pięć pozycji: **Podrzędna postać tła 50**, **Postać początkująca 62**, **Ważna postać tła
  70**, **Podrzędny bohater 75**, **Znaczący bohater 80**. Wybrany „Znaczący bohater" przestawił
  licznik na **„Punkty Cech: 0 z 80"**, a rozdanie po 8 na wszystkie dziesięć Cech dało
  **„80 z 80"** i przeliczone PW 50 / Poważnie ranny 25 / Przeżywalność 8 / Człowieczeństwo 80.
  Zejście rangą na „Podrzędną postać tła" przy tych samych Cechach zapaliło **czerwone
  „Punkty Cech: 80 z 50"** i podniosło licznik braków (14 → 15), czyli ranga naprawdę steruje
  walidacją, nie tylko podpisem. Ranga **nie wchodzi na kartę** — `statRankId` żyje w szkicu
  i gaśnie razem z nim, więc to cała jej rola.

- **Trzy drobiazgi UI z sesji 27.08 — wszystkie naprawione i obejrzane.** (1) **Wiersz stanu
  indeksu** (`.ai-status-main`, wspólny dla czterech paneli AI) nie zawijał się, więc trzy
  elementy plus przycisk ściskały się do jednego słowa w linijce; teraz zawija **całymi
  elementami** (`flex-wrap` + `flex-basis: 11rem`) i „3 wpisy czekają na indeks" stoi w jednej
  linii. (2) **Górny pasek nachodził sam na siebie przy ~900 px** — nie z braku miejsca, tylko
  dlatego, że tytuł i prawa grupa miały `flex: none`, a `.combat-bar` z `flex-basis: 0` kurczyła
  się do zera i wypuszczała „Włącz tryb turowy" na sąsiadów. Teraz kolejka nie schodzi poniżej
  swojej treści (`min-width: min-content`), nazwa kampanii i tytuł oddają miejsce wielokropkiem,
  a poniżej 1000 px tytuł znika. (3) **Czerwone „Brak połączenia z AI Gateway — streszczanie
  wymaga modelu." wisiało po powrocie gatewaya** — błąd dziennika żyje u klienta i nic go nie
  odświeżało. Teraz `journal:error` niesie **kod**, a `ai:status` z `available: true` woła
  `clearAiError()`, który zdejmuje wyłącznie `AI_UNAVAILABLE`. Odklikane bez modelu: atrapa
  `/health` na :8100 (opis w `pulapki-dev.md`) — zdanie zniknęło samo, bez żadnej akcji MG.

## Przeniesione 2026-08-28 (pakiet A — strefy i efekty walki)

Sześć ścieżek w jednej sesji, wszystkie na **„Strzelnicy"** i wszystkie na pięciu strefach
postawionych narzędziem ⚠ (opis i współrzędne w `poligon.md` — strefy **zostają** na scenie).
Guinea pig: **Tony**, właściciel wieżyczki: **Rudy Kwiatkowski**; stan obu przywrócony po sesji.

- **Etap 27i — wyładowanie strefy.** Żeton wchodzi na ⚠ „Podłogę elektryczną" i przez cały
  prostokąt strefy przelatuje **niebieska błyskawica**, a nad żetonem wypływa czerwona liczba
  obrażeń. Sprawdzone dwa razy: raz z wejścia (`Przebicie: 14 obr. · rzut 14 · bez pancerza ·
PW 35 → 21 · system: Podłoga elektryczna · wejście na obszar`, „Bez ran → Lekko ranny"),
  raz przyciskiem **„Odpal system"** z karty strefy (`Tura systemu`, 6k6 = 19). Obie karty mają
  „Cofnij" i obie cofnięto. Efekt złapany zrzutem przy spowolnionym `rAF` — patrz `pulapki-dev.md`.

- **Etap 27i — chmura gazu.** Tony dostał (na czas oględzin) Granatnik **Tsunami Arms Type-18**
  i **Amunicję z gazem łzawiącym**; strzał w pole rysuje **zieloną chmurę** wielkości pola
  wybuchu (10×10 m), a mechanika 16h jedzie za nią: `Tony — 3 m · Odporność na
tortury/narkotyki 7+5 = 12 vs PT 13 · Uraz oka · na minutę`. **Ostrzeżenie o fałszywym
  alarmie:** przy mocno spowolnionym `rAF` chmura rozlewa się na całe płótno — to artefakt
  pomiaru, nie błąd rozmiaru (opis w `pulapki-dev.md`).

- **Etap 26f — Ślizgawka i wymuszony Test.** Ruch na obszarze wymusza Test Atletyki:
  `Ślizgawka — Ruch na bronionym obszarze — Tony — Atletyka 5+10 = 15 vs PT 15 — nie oparł się ·
Tony: Powalony`, naklejka „Powalony" ląduje na żetonie. **Uwaga do rachunku:** remis
  (15 vs PT 15) liczy się jako **porażkę** — to świadoma reguła z 16g (`resisted: total > dv`,
  test „ties going to the round"), a nie pomyłka w tej sesji.

- **Etap 26f — kara do RUCH-u (Maź) widziana na ekranie.** Wejście na ⚠ „Maź" daje
  `Tony: RUCH −10 · Spowolniony`, na żetonie staje **druga naklejka** (ikona `slowed.svg` obok
  „Powalonego"), a w panelu postaci wiersz **DYSTANS** pokazuje `0 m / 2 m` z podpowiedzią
  **„Dystans: Spowolniony −10 (RUCH minimum 1)"** — czyli dokładnie ta liczba, która dotąd
  istniała wyłącznie w testach. Zejście z obszaru zdejmuje status samo.

- **Etap 26f — strzał stanowiska.** ⚠ „Automatyczna wieżyczka" związana z żetonem wieżyczki
  (pole „Stanowisko" na karcie strefy) strzeliła sama, gdy Rudy wszedł na obszar:
  `Karabin szturmowy → Rudy Kwiatkowski · 1d10+14 = 22 · Trafienie · 16 m (13–25 m) · PT 15 ·
magazynek 23/25`, modyfikator opisany jako **„Broń długa +14"**, czyli podstawiona Wartość
  bojowa z 26e. Magazynek przywrócony do 25/25.

- **Etap 26f — winda z gazem w Kolejce Inicjatywy.** Wejście na ⚠ „Windę z gazem usypiającym"
  wstawia do kolejki **wiersz bez figury**: `Winda z gazem usypiającym — Pułapka wchodzi do
Kolejki Inicjatywy — pierwsze miejsce, inicjatywa 1 — odpal ją w jej Turze`. W górnym pasku
  stoi jako pierwszy chip „W", a w bazie jako `Combatant` z `tokenId = NULL`, `zoneId = 6`
  i `order = -1`. W **rundzie 2** kolejka faktycznie zatrzymała się na nim.

- **Etap 25c — pozycja była już pusta.** Obie ścieżki („wgranie portretu", „druga sztuka
  przedmiotu") zamknięto 23.08 i 22.08; wpis został w `zaleglosci.md` przez przeoczenie
  i zdjęto go przy triażu 28.08.

## Przeniesione 2026-08-27 (pakiet D+A — dziennik, wiedza, degradacja i okna karty)

Trzynaście ścieżek w jednej sesji: osiem z pakietu D (dziennik, baza wiedzy, degradacja przy
zgaszonym gatewayu) i cztery z pakietu A (okna karty postaci), plus tłumaczenie 70 opisów broni
zrobione ręcznie zamiast modelem. **Sesja z kodem** — po drodze wyszły trzy błędy i wszystkie
naprawiono; opisy przy pozycjach, których dotyczą.

- **Etap 19a — degradacja panelu zasad.** Panel z zgaszonym gatewayem pokazuje chip
  **„brak indeksu"**, czerwone **„brak połączenia z AI Gateway (fetch failed)"** i pole pytania
  z podpowiedzią **„Model offline — uruchom AI Gateway"** — a nie pustą kartę. Zostają w
  `zaleglosci.md` dwie ścieżki wymagające żywego modelu (powtórka bez rozumowania, PT strzału).

- **Etap 19b — degradacja, chip „⟳ nieaktualny" i „Zaindeksuj wszystko".** Odklikana cała pętla:
  przy zgaszonym gatewayu zapis wpisu zostawia chip i licznik (**„1 wpis czeka na indeks"**,
  poprawna liczba pojedyncza), a po powrocie gatewaya **„Zaindeksuj wszystko"** chip zdejmuje.
  **Za pierwszym razem nie zdejmował** — patrz błąd niżej.
  **BŁĄD #1 (naprawiony): reindeks odsyłał sam status, nie wpisy.** `knowledge:reindex`
  i `journal:reindex` zwracały wyłącznie `KnowledgeIndexStatus`/`JournalIndexStatus`, więc
  licznik „czeka na indeks" znikał, a chip „⟳ nieaktualny" zostawał **na każdym wierszu aż do
  przeładowania strony** — MG widział zielony nagłówek nad czerwonymi wierszami. Klient od 19b
  umie broadcast `knowledge:upsert`/`journal:upsert`, więc naprawa to rozesłanie odświeżonych
  wpisów do pokoju MG; status liczony **raz**, nie per wpis. Wpisy czytane z bazy **po**
  `markIndexed`, bo doklejanie `stale: false` do kopii sprzed zapisu dawało `indexedAt: null`
  (złapał to test, nie oględziny). Dwa testy serwera.

- **Etap 19b — kosz przy wpisie bazy wiedzy.** Dwustopniowy („Usunąć?" → „Tak, usuń" / „Anuluj"),
  a po skasowaniu indeks zszedł z **„3 wpisy · 3 fragmenty"** na **„2 wpisy · 2 fragmenty"** —
  czyli wpis wyszedł też z pamięci botów. Zostaje pośredni przypadek filtra tagów u bota.

- **Etap 19c — kosz przy wpisie dziennika i „+ Wpis ręcznie".** Formularz ręcznego wpisu
  wypełniony i zapisany (tytuł, data sesji, widoczność, treść); kosz dwustopniowy tak samo jak
  w bazie wiedzy, indeks zszedł z „3 sesje · 3 fragmenty" na „2 sesje · 2 fragmenty".

- **Etap 19c — „Zakończ sesję" przy leżącym gatewayu.** Wraca po polsku:
  **„Brak połączenia z AI Gateway — streszczanie wymaga modelu."**, nie surowym kodem.

- **Etap 24b — trzy ścieżki nieodklikane.** (1) **Oś czasu przez granicę miesiąca i roku** —
  przy wpisach z 2026-09-02, 2026-08-08 i 2025-12-20 stanęły trzy nagłówki grup,
  **WRZESIEŃ 2026 / SIERPIEŃ 2026 / GRUDZIEŃ 2025**, od najnowszego. (2) **Powtórne odsłonięcie**
  zostawia **drugą** linię na czacie (21:16 i 21:17) — **z poprawką do treści pozycji: przycisk
  jest przełącznikiem** (`sharedWithPlayers: !entry.sharedWithPlayers`), więc „powtórne
  odsłonięcie" to **trzy** kliknięcia, a schowanie linii nie zostawia. (3) **Limit 12
  przypiętych materiałów** — sprawdzony na 13 handoutach.
  **BŁĄD #2 (naprawiony): limit milczał.** Po przypięciu dwunastego trzynasty chip przestawał
  reagować **bez słowa** — bez wyszarzenia, bez tooltipa, bez komunikatu (`togglePinned`
  zwracał `previous`). MG widział martwy przycisk. Teraz chip ponad limit jest `disabled`
  (jest już na to CSS), ma tytuł „Przypięto już 12 materiałów — odepnij któryś, żeby dodać ten",
  a pod chipami staje zdanie „Przypięto 12 z 12 — więcej materiałów wpis nie przyjmie.".

- **Etap 27b — wiersz rany krytycznej.** Panel „Krytyczne Urazy" stoi w kolumnie tożsamości
  strony pierwszej — dokładnie tam, gdzie drukuje go oficjalna karta (to jest „wydruk"
  z kryterium etapu; **aplikacja nie ma funkcji drukowania ani `@media print`**, więc innego
  wydruku nie ma czego oglądać). W motywie dziennym wiersz czyta się bez zarzutu: nazwa czarna,
  „+1 do Testu Przeżywalności" czerwone, pełny efekt szary, ✕ widoczne.

- **Etap 27c — dwie ścieżki skrajne.** (1) **Postać prosto z kreatora** — „Rudy Kwiatkowski"
  (Fixer) przeszedł wszystkie siedem kroków i strona druga pokazała **komplet 17 odpowiedzi**:
  12 ogólnych (kultura, język, osobowość, ubiór, fryzura, znak szczególny, najważniejsza osoba,
  co cenisz, stosunek do ludzi, najważniejszy przedmiot, tło rodzinne, kryzys, środowisko, cel)
  i 5 z „Ścieżki Życia Roli" Fixera. (2) **Wąskie okno** — uchwyt zwęził kartę do **521 px**
  (poniżej progu `@container 560px`): rubryki złożyły się do jednej kolumny, cechy stanęły jedna
  pod drugą, nic nie wyszło poza okno.
  **BŁĄD #3 (naprawiony, najpoważniejszy): kreator gubił specjalizacje umiejętności.**
  `applyCreationPatch` zapisywał `skillSpecialties` poprawnie (widać było w `CharacterDraft`
  w bazie), ale `parseCreationDraft` przepisuje pola ze składowanego szkicu **po nazwie**
  i `skillSpecialties` **nie było na tej liście** — więc odczyt zawsze zwracał `{}`. Skutkiem
  pola „w czym?" **nie dało się wypełnić**: znak wpadał, patch szedł na serwer, ack wracał pusty.
  Wiedza lokalna jest podstawowa i nie blokuje, ale **postaci z poziomem w Nauce, Sztukach walki
  albo Grze na instrumencie nie dawało się skończyć w kreatorze** — kryterium etapu 25a.
  Naprawa: `readSkillSpecialties` wyciągnięte z gałęzi patcha, używane przez zapis i odczyt.
  Test w `creation.test.ts`. To wyjaśnia też notatkę z 27.08 o „normalizacji zapisu"
  (`skillSpecialties: {}` na karcie „Test 27x") — to nie była normalizacja, tylko ten błąd.

- **Etap 27f — okno większe od przeglądarki.** Okno zapisane jako **4000 × 3000 na pozycji
  (9000, 6000)** wraca jako **970 × 361 w punkcie (16, 16)**: `clampPlacement` przycina rozmiar
  do `innerWidth/innerHeight − 16`, więc gwarancja jest **mocniejsza niż „róg do złapania"** —
  okno wraca całe, z belką i uchwytem w zasięgu. Gałąź „zmierzona treść szersza niż viewport"
  jest dla karty **nieosiągalna**, bo `.sheet-window` ma `min(1180px, 100vw − 32px)`.

- **70 broni markowych po angielsku — przetłumaczone ręcznie, bez GPU.** Zamiast przebiegu
  przez lokalny model 35 brakujących opisów przetłumaczono w sesji i wpisano do
  `translations-override.json` (to miejsce z założenia bije model i pamięć podręczną).
  Terminologia zgodna z pozostałymi 35 ręcznymi wpisami: „złącze smartguna", „wydłużony
  magazynek", „magazynek bębnowy", „dodatki magazynkowe", „4. Wojny Korporacji". `--check`
  mówi teraz „Nic do tłumaczenia"; 70 wpisów `weapons.json` ma polski `description` i angielski
  `descriptionOriginal`. Przy okazji `translate-descriptions.py` przestał wymagać llama-servera,
  gdy wszystko pokrywają ręczne tłumaczenia i pamięć podręczna.

## Przeniesione 2026-08-27 (pakiet Sieci A+B — dług oględzin 26a–26e)

Dwanaście ścieżek odklikanych w jednej sesji runu na „Strzelnicy": pięć sprzed walki i siedem
w rozpoczętej walce (RUNDA 1–4). Cztery pozycje zamknięte w całości (26a, 26b, 26c, 26e),
piąta (26d) skurczona do dwóch odmów nieosiągalnych z UI. Treść pozycji zostawiona bez zmian;
pod każdą, wcięte, to, co ją zamknęło.

- **Etap 26b — dwie ścieżki nieodklikane; „Sieć 1/4" domknięte 15.08 przy 26c.** (1) **Ściana
  między netrunnerem a gniazdem** (`NET_WALL_BLOCKS`) — Poligon nie ma ścian na scenie
  „Strzelnica"; geometria to `hasLineOfFire` z 16b, ta sama, którą 16b odklikało. (2) **Odmowy
  `NET_NO_INTERFACE` i `NET_NO_DECK` w przeglądarce** — pokryte testami serwera, u MG nieoglądane
  (przycisk „Podłącz się" po prostu wraca z odmową).

  **Odklikane 27.08.** Zdanie „Poligon nie ma ścian" było **nieaktualne** — od 23.08 na
  Strzelnicy leży ściana w kształcie L (3 segmenty, x = 1700, y = 1900–2900). Postawione zostało
  gniazdo **„Gniazdo za ścianą"** (id 10, world 1600 × 2400, odsłonięte, podpięte do „siec klub")
  po zachodniej stronie muru, a żeton **„Kolec"** po wschodniej — 5,1 m, czyli w zasięgu 6 m.
  Karta gniazda u gracza (avatar9) odpowiedziała: **„Między tobą a punktem dostępu stoi
  ściana."** — czyli `netAccessVerdict` sprawdza mur, choć klient gracza ścian nie widzi.
  **`NET_NO_INTERFACE`**: ten sam formularz z wybraną figurą **avatar9** (Solo, 3,2 m) →
  **„Ta postać nie ma zdolności Interfejs — bez niej nie da się sieciować."** — kolejność
  sprawdzeń w `netRunStartEvent` stawia kartę **przed** geometrią, więc ściana w tym wariancie
  nie ma znaczenia. **`NET_NO_DECK`**: z karty „Test 27x" zdjęto cyberdek przyciskiem ✕
  („Odłącz cyberdek od tej postaci", zakładka „Ekwipunek”) → **„Ta postać nie ma cyberdeku.
  Bez deku nie ma czym się podłączyć."**; dek przywrócono w komplecie ze zrzutu (6 Programów:
  Gumka, Pancerz, Miecz, Młot na wroga, Superklej, Szabloząb).

- **Etap 26a — jedna ścieżka nieodklikana.** Zostaje (3) **pasek „Uwagi" pod szybem**
  (`netArchitectureAdvice`) — hasło bez PT i piętro LOD-u bez wpisu; generator zawsze wypełnia
  oba, więc do tego stanu trzeba dojść ręczną edycją.

  **Odklikane 27.08.** W edytorze „siec klub" dołożono piętro 5 rodzaju **Hasło** z pustym PT
  i piętro 6 rodzaju **Czarny LOD** bez wpisu. Pasek „Uwagi" pod „+ Odgałęzienie" wypisał
  w bursztynie trzy wiersze naraz: „Trzon, piętro 5: **Hasło bez PT**.", „Trzon, piętro 6:
  **Czarny LOD bez wpisu**." i wiersz budżetu Demonów (niżej). Edytor **zamknięto bez zapisu** —
  architektura wróciła do czterech pięter.

- **Etap 26e — trzy ścieżki nieodklikane; reszta sprawdzona 16.08.**
  (1) **„Ten Demon miał już swoją Turę w tej Rundzie"** — na Poligonie tryb turowy jest wyłączony,
  więc rund nie ma i odmowa nie ma jak paść; pokryta testem serwera. (2) **Wstawka Demona do
  Kolejki Inicjatywy** — z tego samego powodu: bez rozpoczętej walki nie ma do czego wstawiać
  (test serwera sprawdza inicjatywę „o jeden punkt wyżej" i wiersz bez figury). (3) **Uwaga
  „jeden Demon na sześć pięter"** — Architektura Poligonu ma cztery piętra i jednego Demona.

  **Odklikane 27.08** (walka rozpoczęta, RUNDA 2). (2) Przycisk MG **„Demon wykrywa intruza"**
  zmienił chip Diablika z „czuwa" na **„ściga"** i **wstawił do kolejki wiersz „D Diablik 1"** —
  przed Tonym, z inicjatywą **1**, gdy pozostali mają „—" (kolejka zakładana bez rzutu), czyli
  „o jeden punkt wyżej" zgadza się. (3) Do „Serca sieci" dołożono **Chochlika** obok Diablika:
  pasek „Uwagi" napisał **„Demonów jest 2, a Architektura ma 6 pięter — podręcznik radzi jednego
  Demona na 6 pięter (s. 218)."** (1) Po pierwszym kliknięciu **„Tura Demona"** (rzut poszedł,
  kość spadła) drugie kliknięcie w tej samej Rundzie wróciło z **„Ten Demon miał już swoją Turę
  w tej Rundzie."**

- **Etap 26c — cztery ścieżki nieodklikane; reszta sprawdzona 15.08.**
  (1) **Superklej i „Zdejmij" u MG** — hak `glue` ma test w `shared`, a w przeglądarce do niego
  nie doszło: trzeba wrogiego LOD-a z tym efektem (Kraken) albo Superkleju w cudzym
  deku. (2) **Paf** — sprawdzony testem serwera, w oknie klikany był tylko Miecz. (3) **LOD
  przeciwprogramowy** (bije w losowy zrezowany Program zamiast w mózg) — cały przypadek pokryty
  testami, nieoglądany. (4) **Zderezowanie LOD-a przez gracza** i wypadnięcie go z kolejki —
  w oględzinach LOD schodził do REZ 10, nie do zera.

  **Odklikane 27.08 — cała czwórka.** (2) **Paf** na Piekielnym ogarze: „Paf trafia: 1k6 = 5 —
  Piekielny ogar REZ 15." (REZ 20 → 15); przycisk pojawia się dopiero, gdy LOD stanie w szybie —
  wcześniej okno pisze „Ślizg i Paf czekają na Czarnego LOD-a". (3) **LOD przeciwprogramowy**:
  na piętro 2 dołożono **Zabójcę** (`target: antiProgram`), gracz zrezował **Pancerz**, a MG
  kliknął „LOD wykrywa intruza" → **„Zabójca wyprowadza darmowy atak: Pancerz: 4k6 = 17 —
  zniszczony."** Program dostał chip „zużyty na to wejście", mózg netrunnera nie oberwał wcale.
  (4) **Zderezowanie**: Miecz (3k6 Czarnym LOD-om) sprowadził Zabójcę 20 → 16 → 8 → **0/20**,
  chip zmienił się na **„zderezowany"**, a **wiersz „Z Zabójca 2" zniknął z Kolejki Inicjatywy**
  (został sam „D Diablik 1"). Uwaga na różnicę: **Szabloząb „niszczy zamiast derezować"** —
  Piekielny ogar zszedł nim do 0/20 z chipem **„zniszczony"**, nie „zderezowany".
  (1) **Klej**: Superklej jest **przeciwbiałkowy** i w oknie **nie pojawia się** ani przy Czarnym
  LOD-zie, ani przy Demonie — Demon liczy się jak Program, więc listę ataków na niego zapełniają
  same agresory przeciwprogramowe. Hak `glue` obejrzano więc drugą dozwoloną drogą: na piętro 1
  wstawiono **Krakena** (`hooks: ["glue"]`), MG zagrał „Turę LOD-a" i padło **„Kraken trafia:
  3k6 = 8 bezpośrednio w mózg. Kraken przykleił netrunnera na 1 — ani niżej, ani bezpiecznego
  odłączenia."** Nad szybem stanął pas **„Kraken: ani niżej, ani bezpiecznego odłączenia — do
  rundy 5. Awaryjne odłączenie wciąż działa."** z przyciskiem **„Zdejmij"** widocznym **tylko
  u MG** — kliknięcie zdjęło pas.

- **Etap 26d — ścieżka „drzwi z 18d" (2).** Na „Strzelnicy" nie ma ani jednych drzwi; ścieżka
  jest kopią `opening:toggle` i ma test serwera, w oknie Sieci klikane były kamera i wieżyczka.

  **Odklikane 27.08.** Na scenie postawiono segment **drzwi #59** (world 2400 × 1900–2200)
  i podpięto go do „Węzła ochrony" jako trzecie urządzenie **„Brama serwerowni"** (rodzaj
  „Drzwi lub winda", selektor „— wskaż drzwi na scenie —" → „Drzwi #59"). Gracz przejął węzeł
  **Kontrolą** („Węzeł przejęty — PT odebrania go tobie: 13"), po czym **„Otwórz"** wróciło
  z **„Brama serwerowni — otwarte."**, a w bazie `Wall#59.open` przeskoczyło na `true` — czyli
  okno Sieci naprawdę rusza drzwiami z 18d, nie własną kopią stanu.
  Pozostałe dwie podpozycje 26d **zostają otwarte** (odmowy nieosiągalne z UI) — patrz
  `zaleglosci.md`.

## Przeniesione 2026-08-27 (pakiet A+B+X1 — konto testowe, kosz biblioteki, tabela ran)

Jedna zrobiona funkcja, jeden bezpiecznik i cztery ścieżki odklikane z konta gracza. Treść
pozycji zostawiona bez zmian; pod każdą, wcięte, to, co naprawdę ją zamknęło.

- **Etap 27l — strona gracza nieodklikana (drugi raz z tego samego powodu).** Gracz widzi
  dokładnie dwie karty obiektu: **gniazdo** („podłączyć się?") i **własny rysunek**. Żadnej nie
  kliknięto, bo sesja na `[::1]:5173` jest zalogowana jako MG, a dołączenie nowym imieniem
  zakłada konto-śmiecia (ten sam powód, co przy 27k niżej). Pokryte testami serwera:
  `drawing:update` odmawia cudzego rysunku (`FORBIDDEN`), a warstwy MG graczowi nie odda
  (`gmOnly` zostaje `false`).

  **Odklikane 27.08 na koncie `Tester`** (seed opisany w `poligon.md`). Gracz dostał **kartę
  własnego rysunku** — nagłówek „Prostokąt", sześć próbek koloru, suwak grubości, „Wypełnienie",
  „Usuń… albo klawisz Delete. Ctrl+Z cofa." — i **zmienił z niej kolor** (cyjan → zielony), czyli
  `drawing:update` na własnym rysunku przechodzi. Karta **gniazda** też się otworzyła, ale
  w wariancie odmownym: „Nie ma tu figury z kartą postaci, którą dałoby się podłączyć." — konto
  testowe nie ma postaci ani żetonu z Interfejsem. Wariant „podłączyć się?" należy do pakietu
  Sieci (26a–26b) i tam czeka.

- **Etap 27k — strona gracza nieodklikana.** Gracz ma zaznaczać i kasować **własny** rysunek,
  a cudzego nie. Sesja na `[::1]:5173` jest dziś zalogowana jako MG, a dołączenie do stołu nowym
  imieniem zakłada w kampanii konto-śmiecia — więc ścieżki nikt nie kliknął. Pokryta z dwóch
  stron testami: filtr autorstwa u klienta (`shared/scene-objects.test.ts`, „gracz sięga przez
  cudzą kreskę do własnej pod nią") i cofanie własnego usunięcia na żywych gniazdach
  (`server/scene-undo.test.ts`, „gracz cofa własny rysunek; usunięcie MG zostaje MG").
  **Uwaga przy odklikiwaniu:** serwerowej odmowy `FORBIDDEN` **nie da się** wywołać z UI i to
  jest zamierzone — filtr u klienta nie pozwala gracza nawet zaznaczyć cudzej kreski, tak jak
  nie pozwalał jej zetrzeć gumką od 17b. Odmowa istnieje dla klienta, który by o tym nie
  wiedział, i ma test.

  **Odklikane 27.08 na koncie `Tester`.** Trzy kroki gramatyki 27k po kolei: klik zaznaczył
  **własny** rysunek (bursztynowy obrys, pasek „Zaznaczono: rysunek · Delete usuwa · Ctrl+Z
  cofa"), `Delete` go skasował („Usunięto rysunek — Ctrl+Z cofa." na czacie), `Ctrl+Z` przywrócił
  („Przywrócono rysunek."). Klik w **cudzy** rysunek (MG, warstwa wspólna) nie zaznaczył niczego —
  dokładnie tak, jak zapowiadała pozycja: serwerowej odmowy `FORBIDDEN` z UI nie da się wywołać.
  Przy okazji potwierdzone, że rysunek MG z **warstwy MG** do gracza w ogóle nie dociera.

- **Biblioteka grafik tokenów nie ma kosza.** Raz wgrana grafika zostaje w zakładce „Tokeny"
  na zawsze — nie da się jej usunąć z UI, a plik zostaje w `uploads/tokens`. Przy oględzinach
  22.08 trzeba było skasować wpis wprost w bazie (`tokenAsset`) i plik z dysku. **Odłożone
  świadomie 23.08** (decyzja MG: „w tej sesji nie robimy"). Wzorzec jest już gotowy do
  przepisania: pula portretów z tego samego dnia ma kosz dwustopniowy i trasę
  `DELETE /api/portrait-assets/:id`, a plik z dysku i tak zbiera `uploads-gc`.

  **Zrobione 27.08 — z jedną świadomą różnicą wobec puli portretów.** Kosz jest dwustopniowy
  („✕" → „Tak, usuń" / „Anuluj"), ale zdjęcie grafiki **schodzi też z żetonów**, które ją noszą
  (decyzja MG: wariant „kasujemy, a tokeny lecą na domyślną grafikę"). Dlatego to **zdarzenie
  gniazda** `token:asset-delete`, a nie trasa REST obok `GET /api/token-assets`: zmiana rusza
  scenę, więc musi dojechać do wszystkich ekranów przez `emitTokensById` → `token:upsert`.
  Ack niesie `clearedTokens`, a panel powtarza tę liczbę zdaniem („Zdjęto „Test kosza"; 1 żeton
  wrócił do krążka."). Trzy testy w `tokens.test.ts` (kasowanie z żetonem, odmowy: gracz →
  `FORBIDDEN`, drugi przebieg → `ASSET_NOT_FOUND`, pusty payload → `BAD_REQUEST`, brak adresu
  w stanie po usunięciu). Odklikane u MG w obie strony: z żetonem (wrócił do krążka) i bez
  („Zdjęto „Test układu" z biblioteki."). Plik z dysku zbiera `uploads-gc`, bo nikt go już nie
  wymienia.

- **Etap 27f — pusty stan listy postaci u gracza nieodklikany.** `'Nie masz jeszcze żadnej
postaci.'` jest sprawdzony w kodzie i mówi tym samym językiem co pustka handoutów, ale na
  ekranie go nie było: avatar9 ma dwie postacie, a Tony i Marcin też mają swoje. Do zobaczenia
  trzeba dołączyć do stołu **nowym imieniem**, czyli założyć konto-śmiecia.

  **Odklikane 27.08.** Konto `Tester` nie ma żadnej postaci, więc zakładka „Postacie" pokazała
  „Nie masz jeszcze żadnej postaci." nad „Kreator postaci…" i polem „Imię nowej postaci" — bez
  zakładania konta-śmiecia, bo konto testowe jest stałym mieszkańcem kampanii.

- **`tabela-ran-krytycznych.md` poza repo — pozycja okazała się w połowie nieaktualna.**
  Pierwotne zdanie („na czystej maszynie trzeba go dostarczyć albo wpisać tabelę głowy
  w edytorze") opisywało stan sprzed importu podręcznika głównego. **Sprawdzone 27.08:**
  `critical-injuries.json` ma dziś 22 wpisy — 11 korpusu i 11 głowy — wszystkie ze źródłem
  „podręcznik główny, s. 187–188", czyli z `parse-manual.py`. Ręczna tabela jest potrzebna
  **wyłącznie** temu, kto ma sam Easy Mode.

  **Prawdziwy problem był inny i został naprawiony:** oba skrypty piszą pod **ten sam adres**,
  a `parse-critical-injuries.py` (Easy Mode) po cichu zastąpiłby oficjalne 22 wpisy uboższym
  zestawem — brak ręcznego pliku też przechodził **bez słowa**. Od 27.08 skrypt czyta `source`
  zastanego pliku i odmawia nadpisania czegoś spoza Easy Mode bez `--force`, a brak (albo pusty
  odczyt) ręcznej tabeli wypisuje ścieżkę, wzór i alternatywę. Wzór formatu — z wymyślonymi
  ranami, bo repo jest publiczne — leży w `data/public/cpred/tabela-ran-krytycznych.wzor.md`
  i jest sprawdzony parserem (3 wiersze, `movePenalty` i `deathSavePenalty` rozpoznane).

## Przeniesione 2026-08-26 (pakiet P1 — karta ataku i obrażeń)

Jedna naprawa i pięć ścieżek zamkniętych testem. Treść pozycji zostawiona bez zmian; pod
każdą, wcięte, to, co naprawdę ją zamknęło.

- **🐞 BŁĄD — statysta trafia, ale nie ma czym zadać obrażeń (znalezione 23.08).**
  `AttackControls.tsx:38` szuka atakującego wyłącznie wśród **kart postaci**
  (`characters.find(c => c.data.weapons.some(w => w.id === weaponRowId))`), a przycisk
  „Obrażenia" wisi na warunku `(attack.hit || attack.area) && attacker`. Figura z **profilem
  bojowym** (statysta bez karty — na Poligonie „Zbir", na scenie testowej „Strzelec 23x") nie
  ma takiej karty, więc jej karta ataku pokazuje trafienie i listę objętych obszarem, ale
  **żadnego rzutu na obrażenia**; MG musi liczyć ręcznie i wpisywać PW skrótami ±5 z menu
  żetonu. To ta sama luka, którą 22.08 zamknięto po stronie **obrony** (`statistDefender`
  w tym samym pliku, komentarz „Figura bez karty też się uchyla") — strona atakująca została
  nietknięta.

  **Naprawione 26.08.** Diagnoza z pozycji była trafna, ale niepełna: **brakowało adresu**.
  Karta ataku nie niosła żadnego wskazania na strzelca — `CpredAttackMeta` miała
  `targetTokenId`, nie miała `attackerTokenId` — więc klient nie miał czego szukać, gdy szukanie
  po wierszu broni zawodziło. Naprawa w czterech miejscach, wzorcem `statistDefender`:
  (1) `CpredAttackMeta.attackerTokenId` w `shared`, wypełniane **na serwerze** w `buildAttackMeta`
  (obie gałęzie: zwykła i ogień zaporowy) — jak każdy inny adres na tej karcie;
  (2) `CharacterRollPayload.characterId` stało się opcjonalne, a obok stanął `attackerTokenId`
  — dokładnie tak, jak wygląda `AttackRollPayload` od 16b;
  (3) `performCharacterRoll` dostał `RollSource` (`character` | `statist`) w kształcie
  `AttackSource` z `attacks.ts`: statysta wchodzi z `sheetFromCombatProfile`, a trzy miejsca,
  które **piszą** (Szczęście, Test Przeżywalności, Ustabilizowanie), pytają, którą to gałęzią;
  statysta rzuca **wyłącznie** na obrażenia (`STATIST_CANNOT_ROLL_THIS`), bo wszystko inne ma
  własne zdarzenie;
  (4) `AttackControls` szuka strzelca najpierw wśród kart, potem wśród żetonów z profilem —
  z tym samym sprawdzeniem właściciela, co obrona.
  **Serwer nie wymagał niczego więcej:** `resolveRollRequest` czytał notację, mnożnik, lokację
  i cel ze **zapisanego ataku** już wcześniej, więc karta atakującego nie była mu do niczego
  potrzebna — blokował wyłącznie klient.
  Przy okazji `tokenHpOf` z `attacks.ts` przeniesione do `sheets.ts` jako `sheetTokenHp`
  (czwarta kopia reguły „figura bez paska ma 1/1" byłaby o jedną za dużo).
  **Siedem testów serwera** w `attacks.test.ts` („damage from a figure that has no sheet"):
  żeton na karcie, rzut bez karty postaci, „Zastosuj" schodzące z PW, odmowa rzutu innego niż
  obrażenia, żeton bez profilu, cudzy statysta u gracza.
  **Odklikane 26.08** na scenie „Efekty 23x": „Strzelec 23x" rzucił Granatnikiem w „Cel 23x"
  (21 vs PT 17, obszar 10×10 m), karta pokazała **„Obrażenia 6k6"**, kubek wrócił kartą
  **„Strzelec 23x — Granatnik — obrażenia (Korpus) · 6d6 = 23 · Rana krytyczna!"**,
  a „Zastosuj wszystkim (1)" zdjęło **PW 33 → 11** i pancerz OB 6 → 5. „Cofnij" przywróciło
  jedno i drugie. Stara karta z 21:24 leży na czacie tuż nad nową i nadal ma sam „Unik" —
  różnicę widać w jednym oknie.

- **Etap 16d — odklikany poza jednym punktem.** Zostaje „zasłonięty: Samochód" na liście
  trafionych obszarem — wymaga granatu i figury za osłoną.

  **Zamknięte 26.08 testem** (kryterium MG z tej sesji: test pokrywający ścieżkę wystarczy).
  `server/areas.test.ts` sprawdza dokładnie ten wiersz na żywych gniazdach:
  `expect(hider?.spared).toBe('cover')` i `expect(hider?.sparedBy).toBe('Samochód')`.

- **Etap 16g — odklikany 08.08 poza dwoma punktami.** Zostają: (6) linia „pancerz −2" na
  karcie obrażeń i (7) **Podpalony** po amunicji zapalającej wraz z „Cofnij" gaszącym status.

  **Zamknięte 26.08 testami.** (6) `server/ammo.test.ts` — `entry.ammo?.notes` na karcie
  obrażeń zawiera „pancerz −2", a `shared/systems/cpred/ammo.test.ts` pilnuje samego zdania
  („names the extra point of ablation rather than hiding it"). (7) `server/ammo.test.ts`,
  „an incendiary round sets the target alight at its own intensity": status `on-fire` ląduje
  na żetonie, karta mówi „Podpalony", a `damage:undo` ogień gasi — cały wariant z „Cofnij".

- **Etap 16h — odklikany 08.08 poza jednym punktem.** Zostaje wyłącznie chip „na minutę — do
  rundy N" **na karcie postaci** (na karcie obrażeń jest).

  **Zamknięte 26.08 nowym testem.** Chip rysuje `describeCpredTimer(injury.timed)`
  (`CharacterSheet.tsx`), więc jedyne, czego brakowało, to dowód, że **wiersz rany na karcie
  postaci** w ogóle niesie `timed` — bez tego pola komponent nie ma czego narysować.
  `server/ammo-effects.test.ts`, „writes the timer onto the sheet's injury row — the chip's
  only source": w rundzie 1 nabój z `durationS: 60` kładzie ranę na kartę, a wiersz wraca
  z `expiresAtRound: 7` i napisem **„na minutę — do rundy 7"** — tą samą funkcją, którą woła
  klient.

- **Etap 14d — została odmowa Uniku Ludzkiej tarczy**: zostaje `SHIELD_CANNOT_DODGE`
  („Ludzka tarcza nie może unikać ataków dystansowych") — wymaga **trzeciej figury na scenie**:
  ktoś musi strzelić do trzymającego, żeby tarcza w ogóle dostała przycisk „Unik".

  **Zamknięte 26.08 — okazało się pokryte z obu stron.** `server/grapple.test.ts` ma trzy
  figury i obie połowy mechanizmu: „stops a bullet aimed at whoever is holding the shield"
  (strzał w trzymającego wraca `blocked: { kind: 'shield' }` i nazywa tarczę) oraz „forbids
  a Ludzka tarcza to dodge an incoming bullet" (`attack:evade` na tarczy → `SHIELD_CANNOT_DODGE`).
  Odmowa nie zależy od tego, **kto** strzela — `attack:evade` czyta stan zwarcia celu — więc
  trzecia figura zmienia drogę do przycisku, nie sprawdzaną gałąź.

## Przeniesione 2026-08-23 (etap 27k — edycja sceny)

Wszystkie trzy poniższe zamknął etap 27k razem z przepisaniem gramatyki kasowania. Treść
pozycji zostawiona bez zmian; pod nią, wcięte, to, co naprawdę je zamknęło.

- **Trzy błędy edycji sceny — objęte etapem 27k** (`etap-27k-edycja-sceny.md`, dopisany 23.08).
  Zostawione tutaj na wypadek, gdyby etap się przesunął, bo każdy da się naprawić osobno.
  (1) **Ciche gumki:** `MapArea.tsx:584, 728, 762` — `deleteWall`, `deleteLight`
  i `removeNetAccessPoint` idą bez sprawdzenia `ack` i bez słowa przy chybieniu, więc klik obok
  obiektu nie robi nic i nie tłumaczy dlaczego (osłony i strefy robią to poprawnie).
  (2) **Brak koszy dla świateł i gniazd:** nie ma zdarzeń `light:clear` ani `netpoint:clear`,
  choć ściany, osłony, strefy i rysunki mają swoje — scena zaśmiecona lampami wymaga klikania
  ich po jednej. (3) **`zone` i `netpoint` nie są w `MAP_TOOL_KEYS`** (`shortcuts.ts:52`), więc
  nie mają skrótu i **nie pokazują się w oknie pomocy `?`** — narzędzie punktów dostępu jest
  jedynym, o którym pomoc milczy, i to była bezpośrednia przyczyna pytania MG z 23.08.

  **Zamknięte 23.08 przez 27k.** (1) Ciche gumki zniknęły razem z gumkami: kasowanie idzie
  jedną drogą (`deleteSceneObject` w `MapArea.tsx`), która sprawdza `ack` i mówi zdaniem przy
  każdej odmowie — pilnuje tego `client/scene-edit.test.ts`. (2) `light:clear` i `netpoint:clear`
  dopisane na serwerze wraz z koszami w pasku; obydwa odkładają całą grupę jako jedną pozycję
  cofania (`server/scene-undo.test.ts`). (3) `zone` (`S`) i `netpoint` (`P`) weszły do
  `MAP_TOOL_KEYS`, więc pojawiły się w oknie `?` same z siebie; nowy test „każde narzędzie mapy
  ma klawisz i wiersz w pomocy" przewraca się, gdy ktoś doda narzędzie i o wpisie zapomni.

- **Kosz „usuń wszystkie osłony" kasuje bez pytania i bez cofnięcia.** `MapTools.tsx` woła
  `clearCovers(sceneId)` prosto z `onClick`, a scena potrafi mieć kilkanaście osłon budowanych
  przez pół sesji. Wszystkie inne kosze w aplikacji (wpis dziennika, handout, scena) pytają
  dwustopniowo. Sprawdzone 22.08: jeden klik zdjął „Samochód 25/25" i licznik od razu pokazał
  „brak osłon". **Rozwiązanie zaplanowane w 27k** i inne, niż zakładała ta pozycja: nie okno
  potwierdzenia, tylko `Ctrl+Z` — kosz odkłada całą grupę jako **jedną** pozycję cofania.

  **Zamknięte 23.08 przez 27k, innym rozwiązaniem, niż zakładała pozycja.** Nie okno
  potwierdzenia, tylko `Ctrl+Z`: `cover:clear` odkłada wszystkie osłony sceny jako **jedną**
  pozycję w serwerowym buforze cofania, więc jedno wciśnięcie klawisza przywraca je razem —
  z bieżącymi PW, których `cover:create` nie przyjmuje. Odklikane 23.08 na „Strzelnicy"
  (na gniazdach, bo to była większa grupa: kosz zdjął 6, `Ctrl+Z` oddał 6).

## Przeniesione 2026-08-23 (sesja triażu zaległości: kompendium, portrety, kości, wybuch)

- **🐞 BŁĄD — „Usuń" przy własnym wpisie kompendium kasował bez pytania.** `CompendiumPanel.tsx`
  wołał `deleteCompendiumEntry` prosto z `onClick`, więc wpis MG ginął jednym kliknięciem, choć
  wszystkie inne kosze w aplikacji (dziennik, handout, scena, architektura Sieci) pytają
  dwustopniowo. **Naprawione 23.08** tym samym wzorcem co reszta: „Usunąć?" → „Tak, usuń" /
  „Anuluj". **Odklikane 23.08** na wpisie „Kosz testowy 23x": pierwszy klik pyta, „Anuluj"
  cofa i zostawia wpis, „Tak, usuń" kasuje (wyszukiwarka pokazuje wtedy „Nic nie pasuje").

- **🕳 Wgranie portretu w kreatorze (25c) — rozwiązane inaczej, niż zakładała pozycja.**
  Zamiast odklikać wgrywanie po stronie gracza, MG zdecydował 23.08, że **pliki portretów
  dokłada wyłącznie MG**, a gracz wybiera z puli kampanii. Powstała biblioteka `PortraitAsset`
  (bliźniak `TokenAsset`) z pickerem `PortraitPicker` na karcie postaci i w kreatorze; MG
  zachował też wgranie wprost na kartę. **Odklikane 23.08**: dwa portrety wgrane do puli
  przyciskiem „+ Dodaj", wybór z puli podświetlił kafelek i przeżył przeładowanie strony
  (portret karty = adres wybranego kafelka). Opis umowy w `umowy-kodu.md`.

- **Etap 27d — kości 3D odklikane w całości 23.08.** (1) **Złoty dorzut krytyka** — złapany na
  stole: kremowa dziesiątka i **złota** kość obok, a na czacie „17 = 10 + 5 + 2 · Krytyk!
  dorzut +2" w zielonej ramce. (2) **Wyłączenie animacji i głośność 0** — przy odznaczonej
  „Animacji 3D" stół zostaje pusty, a karta rzutu jest na czacie natychmiast; suwaki zeszły do 0.
  (3) **Rzut Cech w kreatorze bez zielonych dziesiątek** — w jednym rzucie 10k10 padła naturalna
  **10** (RUCH) i naturalna **1** (BC), a żadna kość nie zmieniła koloru i nic się nie dorzuciło,
  czyli flaga `plain` działa. Metoda łapania rzutów opisana w `pulapki-dev.md`.

- **Etap 27i — wybuch i liczba obrażeń nad figurą odklikane 23.08.** Liczba: nad „Celem 23x"
  stanęło czerwone **„−2"** i popłynęło w górę (karta obrażeń: „Przebicie: 2 obr. · rzut 9 − OB 7
  · PW 35 → 33 · Pancerz: OB 7 → 6"). Wybuch: pocisk poleciał wzdłuż trasy i rozbłysnął w kwadracie
  10×10 m na celu — ale dopiero **po naprawie danych** (patrz pozycja niżej), bo wcześniej granatnik
  w ogóle nie tworzył obszaru. Zostają: chmura gazu, wyładowanie strefy i dźwięki.

- **🐞 BŁĄD (dane + importer) — granaty i granatniki nie wybuchały, a naboje nie pasowały do broni.**
  `tools/import/parse-manual.py` zapisuje `weapon-types.json` przez białą listę `schema_fields`,
  w której **nie było** `explosive` ani `ammoPatterns`. `manual-overrides.json` ustawiał obie
  flagi Granatnikowi i Wyrzutni rakiet od początku, a filtr wycinał je przy każdym imporcie —
  w kampanii MG żaden z 20 typów broni nie miał `explosive`, więc mechanika obszaru z 16d była
  martwa mimo gotowego kodu i zielonych testów (testy przechodzą na **publicznej** próbce, która
  `explosive` ma). **Naprawione 23.08**: pola dopisane do białej listy w importerze, flagi
  uzupełnione w danych kampanii z overrides (`weapon-type.grenade` dostał wpis w overrides,
  bo go nie miał), kopie zapasowe obok plików (`*.bak-23x`). Po restarcie serwera granatnik
  od razu rysuje kwadrat obszaru, a karta ataku pisze „obszar 10×10 m" z listą trafionych.

## Przeniesione 2026-08-23 (sesja pasów zasięgu na trasie ruchu)

- **🐞 BŁĄD — figura 2×2 planuje trasę **przez** ściany (klient, 22.08).** Na scenie testowej
  ze ścianą pionową ta sama droga wygląda inaczej dla dwóch figur: żeton **1×1** obchodzi mur
  (38 m wzdłuż niego, potem 16,1 m do celu), a żeton **2×2** dostaje podgląd trasy **przecinający
  obie ściany na wylot** (30 m · 2,8 m · 15,6 m). Serwer trzyma się zasad — marsz 2×2 kończy się
  po ułamku metra zamiast przejść — więc **kłamie sam podgląd**, a figura zatrzymuje się bez
  wyjaśnienia. `planWalk` w `shared` przechodzi test na tę sytuację (sprawdzone osobnym testem
  z ścianą na krawędzi kratek, oba rozmiary zdały), więc szukać trzeba **po stronie klienta**:
  `planWalkRoute`/`updateReach` w `MapRenderer.ts` (kotwica footprintu, `radiusCells`, wygładzanie)
  albo w tym, co `MapArea` podaje jako `canStep`. Blokuje ostatni punkt 16e (2×2 w metrowych
  drzwiach).

  **Naprawione 23.08.** Winny był **planer w `shared`**, nie klient. `canStep` — test krawędzi,
  który klient podaje jako `isSegmentClear` po ścianach i osłonach — był wołany **jedną linią,
  od środka figury do środka figury**. Dla żetonu 1×1 ta linia jest całym ciałem, ale środek
  figury 2×2 trzyma się o całą kratkę od ściany, więc połowa tokenu przechodziła przez mur.
  Serwer tego problemu nie miał: `firstBlockedStep` od 21.08 prowadzi po jednej linii na każde
  pole footprintu (`footprintLanes`) — i właśnie dlatego marsz kończył się po ułamku metra, choć
  podgląd rysował drogę na wylot. Poprawka to nowe `laneClear` w `pathfinding.ts`, które robi
  u planera dokładnie to samo, w trzech miejscach: krok A*, zalew zasięgu i wygładzanie trasy
  (`isRunOpen`). Pasy liczone są raz na wywołanie, nie na każdego sąsiada.

  Trzy testy w `pathfinding.test.ts` odtwarzają geometrię: ściana wysoka tylko na górny pas
  figury 2×2, którą jej środek mija. Bez poprawki padają dwa z nich (trasa i zalew), a trzeci —
  że figurze 1×1 ta sama ściana nie przeszkadza poniżej jej końca — przechodzi w obu wersjach.

  **Odklikane 23.08 — przez MG, nie automatem.** Zbudowania sceny nie dało się zrobić z poziomu
  automatyzacji (narzędzie ścian nie przyjmuje syntetycznych zdarzeń wskaźnika, z płótna Pixi nie
  odczytasz pikseli, żeton bez karty postaci nie przyjmuje rozkazu marszu — szczegóły
  w `pulapki-dev.md`), więc sprawdził to MG ręcznie. Werdykt: figura 2×2 **obchodzi ściany**,
  zamiast przez nie przechodzić. Została jedna rzecz: przechodzi **odrobinę za blisko** muru —
  świadoma konsekwencja tego, że planer i serwer pytają o **środki kratek**, a nie o obrys figury.
  MG uznał to za akceptowalne; pozycja o marginesie została w `zaleglosci.md`.

## Przeniesione 2026-08-22 (sesja naprawcza, triaż 1–8 — piąta sesja tego dnia)

Zamknięte przy oględzinach z konta MG i gracza (`localhost` + `[::1]`) oraz trzema poprawkami
w kodzie. Treść wpisów zostawiona bez zmian; co dokładnie widziano na ekranie, mówi notatka
sesji w `POSTEP.md`.

- **Etap 27j — dwie ścieżki nieodklikane; reszta sprawdzona 21.08 (patrz notatka sesji w `archiwum/dziennik-sesji.md`).**
  (Strona gracza → odklikana 22.08, patrz `archiwum/zamkniete-zaleglosci.md`.)
  (1) **Zacienienie zasięgu wokół ściany** — na „Strzelnicy" widoczność jest `open`, więc zalew nie miał czego omijać; że omija,
  wiadomo z testu w `shared` („nie zacienia drugiej strony ściany"), nie z ekranu. (2) **Figura
  2×2 lub większa** — suma kwadratów i test footprintu mają pokrycie w `shared`, ale na Poligonie
  nie ma żetonu większego niż 1×1. Od 22.08 **kolizje ruchu** takiej figury mają test na żywych
  gniazdach (`walls.test.ts`); nieoglądane zostaje to, jak wygląda na mapie.

- **Etap 27j — `down` czyta się słabiej niż `dead` i to jest świadomy kompromis.** Martwy dostaje
  wielki czerwony ✕ przez portret, nieprzytomny tylko ciemnoczerwoną podstawkę i przyciemniony
  portret (`tint` mnoży, więc nie odbarwia — Pixi nie da odsycenia bez filtra na figurę). Przy
  zoomie stołowym oba są rozpoznawalne, ale ✕ widać z drugiego końca stołu, a podstawkę trzeba
  chwilę poszukać. Gdyby przy stole wyszło, że to za mało, najtańszym krokiem jest **przechylenie
  figury** dla `down` — z tym, że obrót kontenera obróciłby też imię i naklejki, więc trzeba by
  przechylać sam portret.

- **Etap 27j — figura na zerze PW zacienia jedno pole i wygląda to jak podświetlenie.** Przy
  `metresLeft = 0` zalew zwraca samą kratkę startową, więc pod figurą pojawia się blady kwadrat
  znaczący „nie masz jak stąd wyjść". To prawda, ale czyta się jak zaznaczenie. Do rozważenia
  **27f jej nie ruszył** — stany puste tego etapu dotyczyły list w panelach, nie mapy. Wraca
  przy pierwszej sesji, na której ktoś stanie na zerze budżetu.

- **Etap 27e — pułapka, która wróci: gołe `button` maluje się jak przycisk główny.** W `styles.css`
  selektor `button` ustawia `background: var(--accent)` i biały napis, więc każdy nowy przycisk,
  który podmieni tło i **zapomni o `color`**, dostanie biały tekst. W ciemnym motywie to niewidoczne;
  w dziennym to białe na kremowym. Tak powstały dwa z czterech błędów tego etapu.
  **Zamknięte w 27f**: umowa jest odwrócona (`button` neutralny, `.primary-button` czerwony),
  a test motywu pilnuje, żeby przycisk z mocnym tłem nie zapominał o kolorze napisu.

- **Etap 24a — odmowy uploadu nieodklikane.** Plik > 12 MB, obraz > 4096 px na bok i format
  spoza PNG/JPG/WebP mają wrócić po polsku z `uploadErrorText`; sprawdzony był wyłącznie
  poprawny PNG. Ścieżka jest kopią routingu portretów z etapu 07.

- **Etap 23a — jedna ścieżka nieodklikana.** ~~(1) Chip cyberpsychozy na liście postaci~~ —
  **odklikany 22.08** na liście gracza przy „Test 27x": „EMP 2 · Na granicy" (na karcie ten sam
  stan stoi w nagłówku sylwetki jako „Cyberpsychoza: Na granicy"). Zostaje (2) **Edytor MG wpisu
  cyborgizacji** z nowymi polami (rodzina, montaż, UC stałe i kostkowe, „Połowa, w górę", gniazda,
  „Wymaga") — formularz nie był otwierany.

- **Z ośmiu błędów sesji testów 08.08 nie został żaden nienaprawiony.** #2 i #3 padły tego samego
  dnia, #4, #5, #6, #7 i #8 — 22.08 (sesja naprawcza), #1 razem z brakującym przełącznikiem
  kampanii. Plik `docs/testy/sesja-testow-walki-2026-08-08.md` dalej jest wart czytania przed
  odhaczaniem czegokolwiek, ale wyłącznie dla **poligonu i listy sprawdzonych ścieżek** — jego
  rozdział „Znalezione błędy" jest już historią.

- **Górny pasek tury (01.08, poza etapami) — strona MG odklikana 08.08 poza jednym punktem.** Przy resecie walki po wpadce z 19a sprawdziły się trzy z czterech: **„Włącz tryb turowy"** w pustej belce zakłada kolejkę z figur sceny jednym klikiem (wyszła piątka: Rico, Kaya, Manekin, Brutus, Zbir, stan „PRZED WALKĄ", inicjatywa nierzucona); **✕** rzeczywiście pyta „Wyłączyć tryb turowy?" i kasuje kolejkę; **żeton ukryty** (Zbir) jest przygaszony i widoczny tylko u MG. **Zostaje:** strzałki **◀ ▶** przesuwające turę **bez zaznaczonego tokenu** — to była główna przyczyna, dla której zostały na górze. Potwierdzone przy okazji: `window.confirm` da się przechwycić (`window.confirm = () => true`) i nie zawiesza sterowania przez CDP; przycisku wyszarzonego na scenie bez tokenów nie sprawdzano.

- **Lewy pasek (01.08, poza etapami) — dwie ścieżki nieodklikane.** (1) **Przejęcie sterowania klikiem w slot**: sprawdzone na Vexie, ale wszystkie jego sloty były odmówione („Akcja w tej turze już wykorzystana"), a odmówiony slot celowo sterowania **nie** przejmuje — do powtórzenia na figurze z wolną Akcją (po naciśnięciu slotu ma zniknąć linia „Podgląd", a na tokenie ma pojawić się przerywany pierścień). (2) **Zmiana sceny**: pasek ma wtedy wczytać figurę zapamiętaną na nowej scenie, a nie zostać przy starej — ścieżka `SelectionChange = 'scene'`. Strona MG jest z założenia nietknięta (sama pamięć, bez domyślnej figury), więc u MG wystarczy sprawdzić, że pasek nadal zachowuje się jak przed zmianą.

- **Etap 16c — strona MG odklikana 08.08.** Postawienie osłony przeciągnięciem, presety, gumka, dwustopniowy `Esc`, karta wyboru „Ostrzelaj osłonę / Strzelaj mimo osłony", obrażenia osłony z „Cofnij", wrak i to, że wrak **przestaje zasłaniać** — wszystko działa (szczegóły w pliku testów). **Zostało:** kosz **„usuń wszystkie osłony"**. Z gumki wyszedł **błąd #8**.

- **Etap 16f — formularze paska nieodklikane**: Ustabilizowanie, Pochwycenie i Wstrzymanie Akcji otwierają w pasku **te same** komponenty co zakładka „Walka" (`CombatForms.tsx`), ale przez pasek nie były klikane — sprawdzone tylko to, że sloty się pojawiają i mają skróty.

- **Etap 13 — UI kompendium odklikane tylko powierzchownie**: 30.07 (przy oględzinach 14b) potwierdzona sama zakładka „Kompendium" — chipy kategorii z licznikami (Broń 103, Pancerz 11, Sprzęt 5, Cyborgizacje 3, Rany krytyczne 22) i lista wpisów z obrażeniami i ceną. ~~karta przedmiotu z tabelą PT~~ — **odklikana 22.08** z konta gracza (Arasaka Wss Sniper System: obrażenia, magazynek, chwyt, jakość, gniazda, dostępność i pełny rządek PT 30/25/25/20/15/16). **Nadal nieodklikane:** edytor MG i dodanie przedmiotu na kartę postaci. Ścieżki serwerowe pokryte testami.

## Przeniesione 2026-08-22 (sesja naprawcza, grupy z triażu 1–6)

- ~~**ZBIORCZA — dług oględzin „strona gracza": 15 etapów, jedna sesja z drugiego konta.**~~
  **Odklikane 22.08** (trzecia sesja tego dnia) — MG na `http://localhost:5173/`, gracz **avatar9**
  na `http://[::1]:5173/join/<token>`, obie sesje w jednym oknie Chrome. Z szesnastu pozycji
  **czternaście przeszło bez zastrzeżeń**, dwie zostały (niżej). Sesja wyprodukowała przy okazji
  **dwa naprawione błędy** (biały ekran przy wejściu do Panelu MG, dziura w numeracji drabinki
  `Esc` u gracza) i **cztery znaleziska** dopisane do `POMYSLY.md`.

  Odklikane: **27f** (okno `?` ma u gracza 3 narzędzia mapy zamiast 11; pusty stan handoutów
  „Mistrz Gry nie dał ci jeszcze żadnego materiału."), **27j** (wskaźniki kierunku rysują się
  także dla cudzych figur; `Nieprzytomny` = ciemna podstawka, `Martwy` = wielki ✕ — różnica
  czytelności potwierdzona na ekranie), **27i** (smuga pocisku i napis „PUDŁO" złapane
  spowolnionym `rAF` — patrz „Pułapki dev"), **27c** (obie strony karty; Reputacja u gracza jest
  **do odczytu**, bez „+ Wyczyn" — notatka mówiąca „pole tylko dla MG" była nieprecyzyjna),
  **26a** (rząd zakładek gracza ma 6 pozycji, bez „Sieć" i bez rzędu MG), **26b–26e** (run
  z konta gracza: trzon pokazuje odwiedzone piętro, resztę jako „? ?"; Czarny LOD ma u gracza
  **sam REZ 20/20**, bez ATK/OBR/PER/PRĘ), **26f** (strefa „Podłoga elektryczna" jest u MG,
  u gracza jej nie ma), **25c** („Kup" wyszarzony z powodem „Poziom 3 (Korporacyjne) — kampania
  ma odblokowany 2 (Zawodowe)."; cały krok wyposażenia w kreatorze wraz z chipem „×2"),
  **23b** (karta „Przelew" u odbiorcy, z oboma saldami), **23c** („Postaw się" / „Wycofaj się" /
  „Nie ustępuj (−2)" trafiły do **przegranego gracza**, a karta zaktualizowała się na
  „avatar9 nie ustąpił — −2 do Akcji przeciw Tony"), **18d/18e** (ikona 🪟, „Za daleko — podejdź
  do okna (na jedną kratkę).", otwarcie okna, „Okno zamknięte na skobel — nie ustąpi."),
  **16b** (klik w token ładuje kubek — **CDP to dowozi**, wbrew dopiskowi „wymaga myszy"; dymek
  celowania z chipem naboju „30 → 29"), **14e** (karta rany krytycznej dociera do gracza z pełnym
  opisem efektu).

  Domknięte przy okazji, spoza tej listy: **27e** (ekran `/join/<token>` i okno runa od środka),
  **23a** (chip cyberpsychozy „EMP 2 · Na granicy" na liście postaci gracza), **27b** (wiersz rany
  krytycznej z nazwą, efektem i koszem), **13** (karta przedmiotu z tabelą PT), **16e** (marsz po
  kliknięciu w podłoże — i to, że **marsz przestawia `facing`**), **27j** (zalew zasięgu ruchu
  **omija okno** — zacienienie za przeszkodą, którego na scenie `open` nie było jak zobaczyć),
  oraz potwierdzenie, że **przełącznik poziomu sklepu pokazuje 2 („Zawodowe"), a nie 1**.

  - [ ] **27f** — pusty stan **listy postaci** u gracza (`'Nie masz jeszcze żadnej postaci.'`).
        Sprawdzony w kodzie i mówi tym samym językiem co pustka handoutów, ale na ekranie go nie
        było: avatar9 ma dwie postacie, a Tony i Marcin też mają swoje. Do zobaczenia trzeba
        dołączyć do stołu **nowym imieniem**, czyli założyć konto-śmiecia.
  - [ ] **26e** — **atak na Demona** (`NET_DEMON_UNKNOWN`). Demon Poligonu siedzi na piętrze 4,
        a gracz nie widzi pięter, na których nie stanął — więc z UI nie ma jak go zaatakować.
        Pokryte testem serwera; do obejrzenia trzeba przejść run do końca.

  **Ustalenia, które unieważniają część starych dopisków.** (1) Notatka „netrunnerem Poligonu jest
  „Test 27x", która należy do MG" była **nieprawdziwa** — karta należy do avatar9; przepinania nie
  było trzeba. (2) Żeton **„Kolec" nie miał właściciela** (`ownerId = null`), więc gracz nie mógł
  nim ani skanować, ani się podłączyć mimo posiadania karty — **przepisany 22.08 na avatar9**.
  (3) Punkt dostępu miał w bazie `hidden = 1`, choć notatka mówiła „stoi odsłonięty" —
  **odsłonięty 22.08** przyciskiem „Odsłoń graczom" i taki zostaje. (4) „Potrzeba trzeciego hosta"
  przy 23b **nie była potrzebna**: przelew robi się z karty postaci, więc MG wysłał go z karty
  Tony'ego, a odbiorcą był zalogowany gracz.

- ~~**Etap 26f — pułapka z własną Turą nie wstawia się do Kolejki sama.**~~
  **Naprawione 22.08.** Wejście na obszar pułapki z wyzwalaczem `turn` (winda z gazem, s. 216)
  **zakłada jej wiersz w Kolejce Inicjatywy** — `pushZoneIntoQueue` w `zones.ts`, wzorowane na
  `pushNetFoeIntoQueue` z 26c: wiersz bez figury (`Combatant.zoneId`, nowa kolumna + migracja),
  inicjatywa o punkt wyżej od najwyższej, `order: -1`. **Odpalenie zostaje klikiem MG** — linia
  26c/26e („nic nie rusza się samo") się nie zmienia; zniknęła tylko papierkowa robota.
  Trzy przypadki milczenia, każdy świadomy: nie ma walki, pułapka już w kolejce stoi, albo
  **runda 0 („PRZED WALKĄ")** — tam inicjatywy są nierzucone, więc „o punkt wyżej" dałoby
  pułapce 1, czyli po rzutach miejsce **ostatnie**. Wiersz znika przy rozbrojeniu, rozstrzelaniu
  i usunięciu strefy. Test w `zones.test.ts`.

- ~~**Etap 26d — strzał z wieżyczki za osłoną nie ma czym odpowiedzieć.**~~ **Naprawione 21.08**
  (sesja naprawcza). `request.ignoreCover` jechało w payloadzie i **nikt go stamtąd nie ustawiał**
  — `NetRunWindow.tsx` w ogóle nie znało tego pola. Odmowa jest teraz **kodem**
  (`NET_SHOT_COVERED` / `NET_SHOT_BLOCKED` w `NET_DEVICE_MESSAGES`), a nie gotowym zdaniem, więc
  okno rozpoznaje ją i podstawia przycisk **„Strzelaj mimo osłony"**, powtarzający operację
  z `ignoreCover`. `fireDevice` zwraca `blocked` jako `{ code, text }`: kod dla okna, zdanie dla
  logu Demona (26e) i strefy (26f), które wstawiają je wprost na czat. **Druga Akcja Sieciowa
  nadal się należy** — jej zwrot to osobny, świadomy wpis w `POMYSLY.md` (15.08).

- ~~**Etap 26a — szybka sekwencja zmian na karcie gubi część edycji.**~~ **Naprawione 21.08**
  (sesja naprawcza). Przyczyna leżała o krok dalej, niż mówiła notatka: strażniki
  `pendingSaves > 0` **były** i w `endSave`, i w `applyUpsert`, ale liczyły wyłącznie zapisy
  **wysłane** — łatka czekająca w buforze debounce nie liczyła się wcale, więc ack poprzedniego
  zapisu adoptował widok serwera i kasował ją ze store'a. Następny klik budował listę z okrojonego
  stanu i wiersz przepadał bez śladu. Teraz `beginSave` idzie przy **kolejkowaniu**, nie przy
  flushu (jeden bufor = jeden zapis). Ta sama poprawka w ścieżce botów, która miała identyczny
  błąd. Pilnuje `packages/client/src/character-save.test.ts` — trzy testy na podstawionym
  gnieździe, sprawdzone celowym cofnięciem poprawki.

- ~~**Etap 27c — cztery gniazda kończyn dzielą jedną pulę.**~~ **Naprawione 22.08** — i taniej,
  niż mówiła notatka: model danych **był już gotowy**, bo `bodySlot` (27c) siedzi na wierszu od
  dawna i tylko arytmetyka go ignorowała. `cyberwareCapacity` liczy teraz **także per pudełko
  sylwetki**: „Cyberkończyny 2 / 8" dostaje pod spodem „Prawa cyberręka: 2 / 4 · Lewa: 0 / 4".
  Wiersz rodziny **zostaje nagłówkiem** i nie zmienia się ani o punkt — to jego liczbę czyta
  rachunek Człowieczeństwa. Rozbicie (`places`) dostają wyłącznie rodziny z **więcej niż jednym**
  pudełkiem (Cyberoptyka, Cyberkończyny); przy Cyberaudio powtarzałoby wiersz rodziny.
  Wszczepy, których nikt nie umieścił, liczą się raz w `unplaced`, żeby obie sumy się zgadzały —
  i **nie** wpadają do żadnej kończyny po cichu. Nowość, której licznik per rodzina nie umiał
  złapać: modyfikacja w ręce, której nie ma („nie ma w czym"), gdy druga ręka jest cybernetyczna.
  Cztery testy w `cyberware.test.ts`. **Nieodklikane w przeglądarce** — do obejrzenia na karcie
  z chromem w obu rękach.

- ~~**Etap 25a — nazwa umiejętności wielokrotnej nie ma gdzie zamieszkać.**~~
  **Naprawione 22.08.** Karta ma `skillSpecialties` (skillId → dziedzina), a czyta się je
  **wyłącznie** przez `cpredSkillSpecialty` / `cpredSkillLabel` w `shared` — bo Język odpowiada
  z `lifepath.language`, gdzie mieszka od 25b, a pozostałe z nowej mapy. Etykieta „Nauka (Fizyka)"
  idzie na kartę, w tytuł rzutu i w rozbicie na czacie. Kreator **pyta** i nie skończy postaci
  bez odpowiedzi.
  **Umiejętności są cztery, nie trzy** — do „Nauki", „Gry na instrumencie" i „Wiedzy lokalnej"
  doszły **„Sztuki walki"** („każdego stylu musisz się uczyć osobno", s. 81), które notatka
  pomijała.
  **Dwa świadome ograniczenia.** (1) **Jedna dziedzina na umiejętność, nie wiele** — postać
  znająca karate i judo ma tu jeden wiersz; RAW dałoby dwie osobne umiejętności, a to inny model
  danych (`skills` kluczowane czymś więcej niż id). (2) **Umiejętność podstawowa nie blokuje
  kreatora** — „Wiedza lokalna" jest na liście każdej Roli, więc twardy wymóg byłby podatkiem
  od **każdego** NPC-a, a etap 25a wprost chroni ścieżkę „pięciu NPC-ów w jeden wieczór". Pole
  i tak stoi w kreatorze i na karcie, tylko nie zatrzymuje. Jeśli przy stole wyjdzie, że ma
  zatrzymywać — to jeden `if` w `creationIssues`.

- ~~**Etap 27b — rana krytyczna w nowym panelu nieobejrzana.**~~ **Odklikane 22.08.** MG nadał
  avatar9 „Uraz kręgosłupa" listą + „Nadaj"; wiersz pokazał nazwę, „+1 do Testu Przeżywalności",
  pełny efekt („W swojej kolejnej Turze nie możesz wykonać Akcji…") i kosz, który ranę zdjął.
  Nieoglądane zostaje to samo **na wydruku** i w motywie dziennym.

- ~~**Etap 24a — grafika po usunięciu handoutu zostaje na dysku.**~~ **Naprawione 22.08**
  (sesja naprawcza) i szerzej: sprzątacza nie miał **żaden** z czterech katalogów. `uploads-gc.ts`
  chodzi w tle przy starcie serwera i kasuje plik **tylko** wtedy, gdy żadna kolumna go nie
  wymienia i jest starszy niż godzina (portret w kreatorze powstaje, zanim istnieje postać).
  Odnośniki zbierane są z kolumn z adresem **i** wyrażeniem regularnym z kolumn JSON (szkic
  kreatora, ładunek czatu, dane karty) — **nowa kolumna z adresem musi trafić na tę listę**,
  inaczej znaczy skasowany plik. Przebieg na sucho na żywych danych: 10 plików, 0 sierot.

- ~~**Etap 23c — „Cofnij" na karcie obrażeń nie przywraca strachu.**~~ **Naprawione 21.08**
  (sesja naprawcza). Wpis był w dodatku **mylący**: komentarz w `realtime/damage.ts` obiecywał,
  że powrotem jest ręczne zaznaczenie „Onieśmielonego" w menu tokenu — a to nie działa, bo
  `clearFacedownFear` kasuje **i naklejkę, i adres** w `statusData`, a `token:update` `statusData`
  nigdy nie pisze. Karta obrażeń zapisuje teraz listę uwolnionych (`fearCleared` w
  `DamageLogEntry`), a „Cofnij" woła `restoreFacedownFear`. Test w `facedown.test.ts` dowodzi
  powrotu **rzutem**, nie samą naklejką — bo naklejka to połowa kary.

- ~~**Etap 23c — status „Onieśmielony" zaznaczony ręcznie nic nie liczy.**~~
  **Naprawione 22.08.** Kara nadal wymaga **dwóch** rzeczy naraz (naklejki i adresu przeciwnika
  w `Token.statusData`) i tak ma zostać — dzięki temu zdjęcie naklejki jest pełnym „zdejmij karę".
  Zmieniło się to, że **drugą połowę da się wreszcie dopisać ręcznie**: pod statusami w menu
  żetonu stoi lista **„Boi się:"** z figurami sceny (`token:feared`, MG-only), a nagłówek mówi
  wprost „nikogo, więc −2 nie działa". `token:update` był złą drogą i nią nie jest — pisze
  kolumny, którymi figura **jest**, a nigdy `statusData`. Lista jedzie w prywatnej części
  `TokenView` (`feared`) — MG i właściciel, jak PW. Trzy testy w `facedown.test.ts`: kara
  schodzi z rzutu dopiero po wskazaniu kogo, zdjęcie naklejki ją wyłącza mimo zapisanego adresu,
  gracz nie dopisze nikomu niczego.

- ~~**Etap 20b — `NO_ROUTE` mówi „droga jest zablokowana", choć zwykle nie jest.**~~
  **Naprawione 22.08.** Rozdzielone na trzy kody, bo powody były trzy — i przy okazji wyszło,
  że stary komunikat kłamał **częściej**, niż mówiła notatka: `planWalk` **nigdy nie odmawia**
  celu nie do osiągnięcia (oddaje trasę do najbliższego pola z `truncated`), więc „droga jest
  zablokowana" nie było prawdą właściwie nigdy. Dziś: `NO_ROUTE` (figura naprawdę zamurowana —
  najlepszym polem jest to, na którym stoi, a cel jest gdzie indziej), `NO_ROUTE_BUDGET`
  („za mało metrów ruchu w tej turze") i `ALREADY_IN_PLACE` („już tam stoisz — podejście niczego
  nie zmieni"). Zdanie idzie do modelu jako powód do poprawki, więc każde podpowiada **inny**
  następny ruch. Rozróżnienie „już tam stoję" od „zamurowany" robi porównanie pola startowego
  z docelowym (`walkCellOf` w `bot-combat.ts`). Testy w `bot-combat.test.ts`.

- ~~**Osłona nie blokuje ruchu po stronie serwera**~~ — **naprawione 21.08** (sesja naprawcza), i szerzej, niż mówiła notatka: serwer nie sprawdzał **żadnej** geometrii ruchu, więc ściany też nie blokowały przeciągnięcia. `validateTokenMove` woła teraz `refuseWalkThroughSolid` (ściany + zamknięte okna + stojące osłony, `firstBlockedStep` w `shared/pathfinding.ts`), **także poza walką**; MG jest zwolniony, jak wszędzie w tym module. Odmowa nie nazywa przeszkody — gracz nie może mapować budynku, wchodząc w ściany. Testy: `covers.test.ts` (przez samochód, dookoła niego, MG bez blokady) i `walls.test.ts` (drzwi zamknięte vs otwarte). Stara treść wpisu; `validateTokenMove` dalej liczy sam dystans. Wraca razem z kolizjami ruchu (POMYSLY, 30.07).
- ~~**Etap 16b — statysta nie może aktywnie unikać**~~ — **naprawione 22.08** (sesja naprawcza).
  `attack:evade` czyta obrońcę z zapisanej karty ataku, a kartę postaci bierze **tylko wtedy, gdy
  cel ją ma**; figura z samym profilem bojowym rzuca tą samą syntezą (`sheetFromCombatProfile`),
  którą policzone było jej bierne PT — więc obie liczby nie mają jak się rozjechać. Przycisk
  dostaje MG albo właściciel żetonu, czyli ci, którym serwer i tak wysyła profil. Testy
  w `attacks.test.ts` (Unik statysty przepisuje kartę; gracz nie uniknie za cudzą figurę).
