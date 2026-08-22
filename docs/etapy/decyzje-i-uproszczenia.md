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
