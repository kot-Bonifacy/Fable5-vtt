# Zamknięte zaległości — archiwum

Pozycje, które **przeszły** z sekcji „Otwarte zaległości" w `POSTEP.md`: naprawione błędy
i odklikane ścieżki, każda z diagnozą i opisem naprawy. Przeniesione tu 2026-08-22, żeby
`POSTEP.md` (czytany w całości na starcie każdej sesji) wrócił do rozmiaru, w którym da się
go czytać.

**Tego pliku nie czyta się rutynowo.** Sięgaj po niego, gdy szukasz, _jak_ coś naprawiono,
albo gdy chcesz sprawdzić, czy pozycja, która wygląda na nową, nie jest wracającą starą.
Treść wpisów jest niezmieniona — łącznie z datami i odsyłaczami do notatek sesji.

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
