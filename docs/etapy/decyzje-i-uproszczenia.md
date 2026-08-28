# Decyzje i świadome uproszczenia

Rzeczy, które **nie są zaległościami** — nikt ich nie zapomniał i nikt nie ma ich „dokończyć".
To zapisane decyzje: gdzie VTT czyta podręcznik po swojemu, co zostało celowo uproszczone i które
miejsce pęknie pierwsze, gdy zmienią się dane wejściowe. Wyjęte z `POSTEP.md` 22.08, żeby plik
czytany na starcie każdej sesji został listą zadań, a nie archiwum ustaleń.

**Czytaj na żądanie**, nie rutynowo — najczęściej wtedy, gdy przy stole wyjdzie, że coś działa
inaczej, niż mówi podręcznik, albo gdy dotykasz wymienionego tu kodu. Jeśli któraś z tych decyzji
przestanie się bronić, przenieś ją stąd do `POMYSLY.md` jako zadanie — nie odwrotnie.

## Sieć i walka — czytanie RAW

- **Etap 26f — promień zauważenia strefy (4 m) to czytanie VTT, nie RAW.** Podręcznik daje samo
  „Percepcja PT 17, by zauważyć" i żadnej odległości — dokładnie jak przy promieniu Skanera z 26b.
  4 m to dwa pola: dość blisko, żeby „widziałem druty w dywanie" dało się powiedzieć przy stole,
  i dość daleko, żeby rzut padł **przed** pierwszym krokiem na pułapkę. Stała
  `ZONE_SPOT_RANGE_M` w `packages/shared/src/zones.ts`.

- **Etap 26f — rzut na Percepcję jest jeden na postać i nie da się go powtórzyć.** Bez tego
  gracz cofałby się o metr i wracał, aż wyjdzie. Drugiej szansy nie ma nawet po zmianie sceny;
  drogą obok nieudanego rzutu jest wyłącznie przycisk MG „Odsłoń graczom". Lista prób siedzi
  w kolumnie `sightings` strefy i ginie razem z nią.

- **Etap 26f — figura, która już stoi na strefie, nie wchodzi na nią drugi raz.** „Cel **wchodzi**
  na broniony obszar" czytane dosłownie: ruch wewnątrz obszaru wyzwalacza `enter` nie odpala
  (odpala `move`, czyli Ślizgawkę i Siatkę laserową). Podłoga elektryczna bije wtedy dopiero na
  koniec Tury — i to jest ta sama liczba, którą podręcznik obiecuje.

- **Etap 26e — Demon nie strzela sam z siebie do figur, których nie widzi netrunner.** Cel
  wieżyczki wybiera silnik: **figura netrunnera**, gdy jest do niej linia strzału, a w przeciwnym
  razie najbliższa figura, która nie jest urządzeniem tej Architektury. To **czytanie VTT, nie
  RAW** — podręcznik zostawia wybór ofiary stołowi, a decyzja MG z 16.08 („jeden klik") kazała
  komuś wybrać. Jeśli przy stole wyjdzie, że Demon strzela nie w tego, w kogo trzeba, pierwszym
  miejscem do obejrzenia jest `pickTurretTarget` w `realtime/netdemons.ts`.

- **Etap 26e — Demon nie obsługuje kamer ani drzwi, tylko strzela i Pafa.** `nextDemonStep` zna
  trzy kroki (odbierz węzeł, strzel, Pafnij), bo tylko strzał ma w silniku konsekwencję, którą da
  się rozliczyć. Obrócenie kamery czy zamknięcie bramy przez Demona zostaje **ręcznym hakiem MG** —
  ta sama umowa, którą 26c zawarło z dwoma efektami „na godzinę", a 26d z widzeniem kamery.

- **Etap 26d — kamera „obrócona" jest faktem na czacie, nie stożkiem na mapie** (decyzja MG
  z 15.08). VTT nie ma modelu widzenia kamery, więc obsługa zmienia stan urządzenia i pisze
  zdanie („nie patrzy już na broniony obszar"), a resztę rozstrzyga MG — dokładnie tak jak dwa
  ręczne haki Programów z 26c. Prawdziwy stożek liczony geometrią z 18a jest wpisem w `POMYSLY.md`.

- **Etap 26c — Powłoka i Tarcza są na razie martwe z samego RAW.** „Redukuje do 0 ATK
  atakujących cię Programów typu Agresor, **niebędących Czarnym LOD-em**" i „pierwszy udany atak
  Programu **niebędącego Czarnym LOD-em**" — a jedynym, co atakuje w Sieci przed 26d i przed
  wrogim netrunnerem, są Czarne LOD-y. Kod obu obrońców jest napisany i pokryty testami
  (`netShellActive`, `netShieldFor`); czeka na przeciwnika, którego zdanie nie wyklucza.

- **Etap 26b — trzy rzeczy świadomie uproszczone, do rozważenia przy stole.** (1) **Promień
  Skanera to wynik Testu w metrach** — podręcznik mówi „MG określa dokładną liczbę znalezionych
  punktów dostępu" i nie daje żadnej liczby, więc to czytanie VTT, nie RAW; MG ma obok przycisk
  „Odsłoń graczom" na karcie gniazda. (2) **Zwiad liczy piętra wszerz** (obie drogi w dół
  z rozgałęzienia naraz), bo mapa, która patrzy tylko w trzon, ukrywałaby odgałęzienie, do
  którego RAW każe zanieść Wirusa. ~~(3) Piętro z Czarnym LOD-em odkrywa się, ale nic się na nim
  nie dzieje~~ — **domknięte w 26c 15.08**: wejście na takie piętro stawia LOD-a w szybie,
  a `metIce` służy dziś do tego, do czego było pisane — do rachunku za awaryjne odłączenie.

## Dane z podręcznika — co parser zgubił świadomie

- **Etap 26d — parser tabel obronnych stoi na dwóch heurystykach i to on pierwszy pęknie przy
  nowym zrzucie PDF-a.** Wiersze tnie zdanie „PT N Elektronika i zabezpieczenia, N minut…", a
  nazwę wyłuskuje się zza powtarzalnej komórki „Granica bronionej strefy"; tam, gdzie tej komórki
  nie ma (Kamera obserwacyjna), wchodzi reguła „ostatni ciąg Wielka + małe przed końcem pierwszego
  zdania". Wyszło 18 z 18 nazw, ale gdyby zrzut się zmienił, `parse_defenses` jest miejscem do
  obejrzenia w pierwszej kolejności.

- **Etap 25b — dwie tabele Ścieżek Ról są nagłówkami, nie pytaniami.** `exec.relacje` („Obecne
  stosunki z szefostwem") i `nomad.filozofia` („Ogólna filozofia watahy") wchodzą do danych
  z pytaniem zastąpionym własnym nagłówkiem kolumny („Relacje", „Filozofia"), bo podręcznik
  wprowadza je tytułem, a zrzut PDF-a skleja ten tytuł z ostatnim wierszem tabeli **wyżej**.
  Czytelne przy stole, ale nie jest to zdanie z książki.

- **Etap 25b — dwie binarne decyzje Ról zostały poza danymi.** „Masz partnera czy pracujesz
  sam?" (Netrunner, Technik, Medyk, Fixer) i „Działasz w zespole czy solo?" (Rocker) to
  w podręczniku wybór bez kości, więc parser ich nie czyta — bierze wyłącznie tabele kostkowe.
  Skutek: kreator pokazuje pytanie o partnera bezwarunkowo, tak jak robi to książka („Jeśli
  masz partnera, kim jest?"). Wpis w `POMYSLY.md`.

## Interfejs

- **Etap 23b — lista odbiorców przelewu odświeża się przy otwarciu „Kasy".** Postać utworzona,
  gdy panel jest już rozwinięty, pojawi się na liście dopiero po zwinięciu i ponownym rozwinięciu.
  Świadome: listę przynosi `economy:history` razem z audytem (klient gracza nie zna cudzych kart),
  a odświeżanie jej na każdą zmianę czegokolwiek w kampanii byłoby zapytaniem na każdy zapis karty.

## Dostępność

- **Etap 27e — marka jest jedynym miejscem poniżej 4,5 : 1 i to jest decyzja, nie przeoczenie.**
  `--accent` w dzień to **#CC2316 spróbkowane z wydruku karty postaci** (27a) i na górnym pasku
  daje 4,27. Podbicie kontrastu znaczyłoby, że tytuł aplikacji i belki karty malują się dwoma
  różnymi czerwieniami. Ta sama sytuacja jest w nocy: `--accent` #e01414 na ciemnym panelu daje
  3,1–3,7 i **istniała przed tym etapem** — audyt nocny nie znalazł nic poza nią.

## Edycja sceny (etap 27k)

- **`Ctrl+Z` nie przywraca runu w Sieci zerwanego przez usunięcie gniazda.** Wraca samo gniazdo,
  z nazwą, notatką i tym samym id; run kończy się nieodwracalnie. Powód: run niesie stan walki
  w Sieci (pozycję na piętrach, zrezowane Programy, kolejkę LOD-ów), a wskrzeszenie go razem
  z kablem znaczyłoby odtworzenie tury, którą wszyscy przy stole już widzieli. Zapisane
  w `realtime/netrun.ts` przy `netpoint:remove`.

- **Kasowanie nie pyta — cofa się `Ctrl+Z`.** Decyzja MG z 23.08, dotyczy także koszy hurtowych,
  które wcześniej kasowały bez pytania **i** bez odwrotu. Dodatkowy powód techniczny:
  `window.confirm` zawiesza sterowanie przeglądarką przez CDP, więc każde okno potwierdzenia
  zabiera możliwość oględzin automatem (patrz `pulapki-dev.md`).

- **Bufor cofania ginie z restartem serwera i trzyma 20 ostatnich usunięć na kampanię.** To jest
  „ojej, nie to" z ostatniej minuty pracy MG, a nie historia kampanii — dlatego pamięć procesu,
  nie baza. Cofa wyłącznie ten, kto usunął, i wyłącznie na scenie, którą ogląda.

- **`Delete` nie dotyka żetonów** — świadome odstępstwo od Foundry. U nas żeton siedzi w środku
  walki (`selectedTokenId` obsługuje celowanie, HUD i budżet ruchu w ~20 miejscach
  `MapRenderer.ts`), klik w pustą kratkę obok niego to rozkaz marszu, a jego id noszą inicjatywa
  i runy Sieci. Figury kasuje się dalej z menu pod prawym przyciskiem.

- **Segmentu ściany krótszego niż ~24 px nie da się zaznaczyć klikiem.** Końcówki (po 12 px
  z każdej strony) należą do rysowania łańcucha, więc na bardzo krótkim kawałku nie zostaje
  środek. Zostaje kosz warstwy albo `Ctrl+Z` tuż po postawieniu. Ściany rysuje się po kratce
  (100 px), więc w praktyce nie występuje.

## Ścieżki, których nie da się odklikać (triaż 28.08)

Sześć pozycji zdjętych z `zaleglosci.md` decyzją z 28.08. Wszystkie leżały tam jako „dług
oględzin", a żadna nie była zadaniem: to albo **odmowy nieosiągalne z UI** (klient wyszarza
przycisk, zanim serwer zdąży odmówić), albo **różnica, której z definicji nie widać**. Każda ma
test; zdanie po polsku istnieje dla klienta, który by o tej blokadzie nie wiedział. Zapisane tu,
żeby nie wróciły za miesiąc jako nowe odkrycie.

- **Etap 26d — `NET_NODE_USED` i `NET_DEVICE_OFF`.** Okno runa **samo** wyszarza przyciski
  urządzeń, gdy węzeł był już użyty w tej Turze (`spent = floor.nodeUsed` w `NetRunWindow`, chip
  „węzeł użyty w tej Turze"), a wyłączone urządzenie pokazuje wyłącznie „Włącz". Do obu odmów nie
  da się dojść myszą i **tak ma być** — rozpoznanie z 27.08 jest w `pulapki-dev.md` („Odmowa
  serwera, która nie chce paść").

- **Etap 25a — `CREATION_INCOMPLETE`.** „Utwórz postać" jest wyszarzone do końca, dopóki szkic nie
  jest kompletny; potwierdzone przy pełnym przebiegu kreatora 27.08 (powstał „Rudy Kwiatkowski").

- **Etap 25a — degradacja bez `creation.json`.** Kreator ma wtedy powiedzieć „Brak danych
  tworzenia postaci…" (`CREATION_DATA_MISSING`), ale w repo leży próbka publiczna obok prywatnych
  danych, więc stan wymagałby **skasowania obu plików naraz**. Sabotaż danych to nie oględziny.

- **Etap 27e — screamsheet w motywie dziennym.** `--paper` nie ma wariantu dziennego, bo papier
  jest rekwizytem świata gry, nie chromem interfejsu (decyzja 27e). Różnica między dniem a nocą
  jest tu **żadna z definicji** — nie ma czego oglądać.

- **Etap 27l — skalowanie rysunku poza zakresem.** Rysunek dostaje sam ruch, bez rogów: ścieżka
  wpisana w prostokąt to nie prostokąt, a rozciąganie kresek jest osobną operacją (przeliczenie
  każdego punktu, minimalna grubość, tekst, który nie skaluje się jak kształt). Pomysł stoi
  w `POMYSLY.md`.

- **Etap 16e — figura przechodzi odrobinę za blisko ścian.** 🟡 **Zaakceptowane przez MG 23.08.**
  Planer pyta o **środki kratek** (`isNodeOpen`, `laneClear`), nie o obrys figury, więc trasa może
  legalnie musnąć ścianę na do pół kratki (1 m). Tak jest celowo: dokładnie te same punkty sprawdza
  serwer (`firstBlockedStep`/`footprintLanes`), więc podgląd i werdykt nie mają jak się rozjechać.
  Zwężenie marginesu wymaga zmiany **po obu stronach naraz** — planera w `shared` i walidacji ruchu
  na serwerze — plus testu obrysu zamiast środków. Ruszać dopiero, gdy zacznie przeszkadzać
  przy stole.
