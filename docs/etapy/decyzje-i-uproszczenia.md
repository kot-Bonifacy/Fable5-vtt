# Decyzje i świadome uproszczenia

Rzeczy, które **nie są zaległościami** — nikt ich nie zapomniał i nikt nie ma ich „dokończyć".
To zapisane decyzje: gdzie VTT czyta podręcznik po swojemu, co zostało celowo uproszczone i które
miejsce pęknie pierwsze, gdy zmienią się dane wejściowe. Wyjęte z `POSTEP.md` 22.08, żeby plik
czytany na starcie każdej sesji został listą zadań, a nie archiwum ustaleń.

**Czytaj na żądanie**, nie rutynowo — najczęściej wtedy, gdy przy stole wyjdzie, że coś działa
inaczej, niż mówi podręcznik, albo gdy dotykasz wymienionego tu kodu. Jeśli któraś z tych decyzji
przestanie się bronić, przenieś ją stąd do `POMYSLY.md` jako zadanie — nie odwrotnie.

## Sieć i walka — czytanie RAW

- **Broń podwieszana strzela amunicją zwykłą, nie wybieraną (01.09).** Wiersz `↳` ma własny
  magazynek (`attachmentAmmo`), ale **nie ma własnego `ammoId`**: podwieszany granatnik rzuca
  granatem, którego obrażenia (6k6) i Eksplozję niesie sam typ broni, a podwieszana strzelba
  strzela zwykłym pociskiem. Wybór naboju specjalnego **do broni doczepionej** wymagałby trzeciego
  pola na wierszu karty, a przy stole rozstrzyga się to tak, jak resztę fikcji — MG mówi, co jest
  w komorze. Nabój w magazynku broni-gospodarza celowo **nie** przechodzi na doczepioną:
  amunicja przeciwpancerna w karabinie nie jest w granatniku pod nim.

- **Bonus lunety i smartguna nie kumuluje się z niczym poza sobą (01.09).** Podręcznik pisze przy
  lunecie „Nie kumuluje się z cyborgizacją Teleskop" (s. 344); VTT niesie tę informację jako
  `rangedBonus.conflictsWith` i **nie egzekwuje jej**, bo Teleskop nie daje dziś żadnego
  policzalnego bonusu, z którym byłoby się co kłócić. Gdy kiedyś zacznie, warunek jest już
  w danych i wystarczy go przeczytać. „Efekty dwóch jednakowych dodatków nie kumulują się"
  (s. 342) jest natomiast egzekwowane — jako odmowa przy montażu, nie jako milczenie później.

- **Sufit pancerza pracownika Korpo nie jest egzekwowany (31.08, sprawdzone w przeglądarce).**
  „Najcięższym pancerzem […] jest Lekka kurtka kuloodporna. Taka polityka Korporacji" (s. 154)
  jedzie jako **zdanie na wierszu pancerza**, nie jako walidacja: karta pracownika jest zwykłą
  kartą postaci (`ownerId: null`), więc MG podnosi jej OB tak samo jak każdej innej. Sprawdzone na
  zatrudnionym „Firmowym ochroniarzu": OB 11 → 18 przyjęte bez odmowy. Tak ma być — MG poprawia
  karty, a polityka Korporacji jest faktem świata, nie regułą silnika. Pęknie to dopiero wtedy,
  gdy zespół zacznie być kupowany za punkty, a nie zatrudniany fabułą.

- **Rana nazwana nie drukuje rzutu, którego nie było (31.08).** Rana z ręki MG („Nadaj ranę"),
  z gazu łzawiącego, z granatu hukowego, z bronionej strefy i z Celowania w nogę **nie** dostaje
  wyniku 2k6 z wpisu kompendium, choć technicznie dałoby się go przepisać. Powód: „2k6 = 4" na
  karcie czyta się jako „ktoś to wyrzucił", a nikt nie rzucał — i dokładnie tę zasadę egzekwowała
  od 08.08 gałąź Celowania w nogę (`delete row.rolled`). Prowieniencja nie ginie: wiersz niesie
  `assigned`, a karta pokazuje chip **„nadana"**. Zaległość z 30.08 prosiła o odwrotne
  rozstrzygnięcie („wpisz `roll` z kompendium") — **została odrzucona świadomie**, żeby nie
  wracała po raz trzeci.

- **Chirurgia to Specjalizacja, nie Rola (29.08, czwarta).** „Umiejętność ta dostępna jest tylko Medykom
  poprzez ich Zdolność Specjalną" (s. 149) czytamy jako: bramą jest **punkt w Specjalizacji
  Chirurgia**, nie sama Rola Medyka. Medyk, który wydał wszystko na Farmaceutyki, dostaje odmowę
  osobnym zdaniem („nie ma ani jednego punktu w Specjalizacji Chirurgia") — bo to zdanie mówi mu,
  co ma zrobić, a „nie jesteś Medykiem" byłoby nieprawdą.

- **Szósty punkt Chirurgii jest odrzucany (29.08, czwarta).** Piąty daje Umiejętność 10, a to sufit
  z podręcznika; szósty kupowałby zero. VTT odmawia zamiast przyjąć i spalić punkt — ta sama
  umowa, którą 30a zawarła z Precyzyjnym atakiem za 4 punkty. Farmaceutyki i kriosystemy mają
  sufit 5 wprost z podręcznika (s. 150).

- **„Po punkcie w dwóch różnych Specjalizacjach" sprawdzamy niezmiennikiem, nie historią
  awansów (29.08, czwarta).** Przydział jest legalny wtedy i tylko wtedy, gdy suma punktów nie przekracza
  `poziom × 2`, a żadna Specjalizacja nie ma więcej niż `poziom`. To dokładnie to samo, co
  „da się rozdać awansami w legalnych parach" — więc VTT nie trzyma listy dawnych wyborów, bo
  liczby na karcie i tak mówią, czy dało się je kupić.

- **Zdania o leczeniu ran czytamy z tekstu tabeli, nie z nowego pola kompendium (29.08, czwarta).**
  „Ratownictwo medyczne PT 15 lub Chirurgia PT 13" parsuje `cpredParseCare` w `shared`. Dwa
  powody: wygenerowane kompendium w `data/private/` bywa **starsze niż parser** (pułapka
  z 29.08), więc nowe pole byłoby puste dokładnie tam, gdzie się gra — i rana wpisana ręką MG
  działa wtedy tak samo jak drukowana, bez dodatkowego pola w formularzu. Zdania, którego parser
  nie rozumie, VTT **nie zamienia w rzut**: guzik się nie pojawia, a proza zostaje na karcie.

- **Z dziesięciu skutków Ulepszania VTT liczy jeden (29.08, czwarta).** „+1 OB" ma guzik przy pancerzu
  (podnosi `sp` i `spCurrent`, stempluje wiersz, drugi raz się nie da). Pozostałe dziewięć stoi
  wypisane w panelu Twórcy jako zapis dla stołu, bo każdy opiera się na maszynerii, której
  projekt nie ma: gniazda Dodatków to **etap 31**, jakości broni **nic w VTT nie czyta**
  (`quality` siedzi w kompendium i nie wchodzi do żadnego rachunku), czasów naprawy nie ma,
  pojazdów nie ma, a Utrata Człowieczeństwa liczy się przy wszczepieniu, którego VTT nie prowadzi
  jako procedury. Menu z jednym skutkiem po cichu przepisałoby Rolę, więc lista jest pełna.

- **Prowizorka nie ma odliczania (29.08, czwarta).** „Działa przez 10 minut na poziom" to sześćdziesiąt
  rund na poziom — dłużej, niż trwała którakolwiek walka w tym projekcie. Zegar, który nigdy nie
  bije, to zegar, którego nikt nie czyta; wiersz pancerza pamięta starte OB, a guzik oddaje je,
  gdy MG uzna, że prowizorka puściła. Ta sama umowa, którą 16h zawarła z efektami poza walką.

- **Farmaceutyki i kriosystemy zostają prozą (29.08, czwarta).** Obie Specjalizacje dają liczbę do
  Umiejętności Technologia Medyczna i **listę rzeczy, których VTT nie modeluje**: dawek leków
  (wiersz ekwipunku to wolny tekst, nie zapas z licznikiem) i kriozbiorników. Panel drukuje obie
  listy słowami podręcznika, więc przy stole są pod ręką; wytwarzanie i podawanie dawki prowadzi
  MG. Pozycja stoi w `zaleglosci.md` — gdyby powstał model przedmiotów zużywalnych, wraca.

- **Celowanie w trzymany przedmiot jest zdaniem, nie ruchem w ekwipunku (29.08).** RAW: „cel
  upuszcza trzymany w rękach przedmiot (twój wybór). Przedmiot upada na podłoże przed
  przeciwnikiem" (s. 170). VTT **nie modeluje tego, co kto trzyma w rękach** — kabury, wolne ręce
  i dobywanie broni to osobna pozycja w `POMYSLY.md` — więc karta obrażeń pisze, co się stało,
  i nic nie rusza wierszy broni. To cała reguła, jaką da się dziś uczciwie wyegzekwować; gdy
  powstanie model rąk, ta decyzja wraca jako zadanie.

- **Celowanie w nogę nadaje ranę samo (29.08, decyzja MG).** „cel otrzymuje także Ranę Krytyczną
  Złamanie nogi (jeśli ma niezłamaną nogę)" (s. 170) jest kategoryczne, więc serwer dopisuje ranę
  bez pytania — tak samo, jak sam losuje ranę przy dwóch szóstkach. Warunek RAW („jeśli przez
  pancerz na ciele celu przejdzie choć jeden punkt obrażeń") jest sprawdzany, drugiej złamanej
  nogi nie dokłada, a statysta bez karty dostaje zdanie zamiast rany — dokładnie jak przy ranie
  z dwóch szóstek.

- **Celowanie działa też bronią białą (29.08).** Do 29.08 planer wycinał `melee` z Celowania;
  podręcznik mówi wprost „atak Dystansowy **lub Wręcz**, z modyfikatorem -8" (s. 170), więc
  warunek zniknął. Ludzka tarcza nadal nie zasłania przed bronią białą — to osobne zdanie
  z s. 181 i ono zostaje.

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

**Remis nigdy nie zdaje — ani w teście na PT, ani w rzucie przeciwstawnym (decyzja MG,
30.08.2026; zastępuje decyzję z 28.08).** Polskie wydanie drukuje zasadę ogólną dwa razy i oba
razy ostro: „licząc na to, że wynik będzie **większy** od Poziomu Trudności (PT)" (s. 130) oraz
„Jeśli wynik Testu jest **wyższy** od PT, udało ci się!" (s. 131). Rzut przeciwstawny dochodzi do
tej samej nierówności drugą drogą — „w przypadku remisu Broniący zawsze wygrywa" (s. 130).

**Decyzja z 28.08 była oparta na cytacie, którego w tym wydaniu nie ma.** Zapisano wtedy, że
„RAW dla testu na PT mówi »równy lub wyższy = sukces«", i na tej podstawie `cpredAmmoCheckOutcome`
przeszło na `>=`; komentarz w kodzie odsyłał do s. 132, gdzie stoi lista Umiejętności i nic
o remisach. 30.08 sprawdzono obie strony w podręczniku i wróciło `>` — w trzech miejscach z tamtej
decyzji (pociski bez obrażeń, efekty stref, wypatrywanie strefy, wszystkie przez
`cpredAmmoCheckOutcome`) oraz w dwóch, które ją później powtórzyły: Efekt Charyzmy z 30d
(`character-rolls.ts`) i Pogłoski (`cpredRumourHeard`).

**Skutek przy stole jest znany i przyjęty:** Atletyka 15 przeciw PT 15 na Ślizgawce znów jest
porażką — to dokładnie ten przypadek, który wywołał zmianę 28.08. Ustabilizowanie i Leczenie
(`character-rolls.ts`) stały przy `>` od początku i były jedynym miejscem zgodnym z podręcznikiem;
teraz zgadza się z nimi całe repozytorium, a `>=` przy progu PT jest w kodzie **błędem**, nie
wariantem. Angielskiego oryginału nie ma w repo, więc gdyby kiedyś wypłynął z innym brzmieniem,
to jest ten akapit do przeczytania na nowo.

- **Redukcja obrażeń Solo liczy się po pancerzu i po mnożniku głowy (30a).** Podręcznik pisze
  „zmniejsz o 1 pierwsze **obrażenia otrzymane** w tej Rundzie" (s. 146), a trzy akapity dalej,
  przy Wykryciu słabości, dopisuje „**przed uwzględnieniem pancerza**". Dwa różne sformułowania
  w jednej ramce warto drukować tylko wtedy, gdy znaczą przeciwne końce rachunku — więc Redukcja
  schodzi z tego, co **doszło do PW**, a Wykrycie słabości dokłada się do rzutu kośćmi. Pancerz
  ściera się niezależnie: liczy go to, co przez niego przeszło, a nie to, co wchłonęło ciało.

- **Bez trwającej walki nie ma „pierwszego w tej Rundzie" (30a).** Redukcja obrażeń i Wykrycie
  słabości mierzą się w Rundach, a VTT nie ma Rund poza kolejką inicjatywy. Figura spoza walki
  **nie dostaje żadnej z tych dwóch** — alternatywa („każdy cios jest pierwszy") zamieniłaby
  Redukcję obrażeń w stały bonus do pancerza. Pozostałe cztery zdolności Zmysłu Walki działają
  zawsze, bo żadna nie mówi o Rundzie.

- **Kara warunkowa Zmysłu Walki nie istnieje — przydział zmienia się tylko przez własne
  zdarzenie (30a).** „w trakcie walki (w ramach Akcji)" (s. 146) to cena, więc przydział wyszedł
  ze zwykłej łaty karty (`character:update` odmawia go tak samo, jak odmawia `eddies` od 23b)
  i jedzie `character:combat-awareness`, gdzie tracker widzi, komu policzyć Akcję. Zapis tej
  samej wartości nic nie kosztuje — „Jeśli Solo nie zmieni przydziału tych punktów, zakłada się
  przydział taki, jaki był do tej pory".

- **Progi Zmysłu Walki są egzekwowane co do punktu (30a).** 4 punkty w Precyzyjny atak kupują
  dokładnie to, co 3, więc VTT odmawia takiego przydziału zamiast po cichu zaokrąglać w dół.
  Trzy zdolności „za każdy punkt +1" przyjmują każdą liczbę; Redukcja obrażeń tylko parzyste
  2–10, Precyzyjny atak 3/6/9, Wyjście z opresji wyłącznie 4.

- **Łatanie i Leczenie nie kosztują czasu (30.08).** Podręcznik wycenia je zegarem: „każda próba
  zajmuje minutę" i „każda próba zajmuje cztery godziny" (s. 223). VTT nie ma zegara poza licznikiem
  Rund w walce (16h), więc czas jedzie **prozą na karcie rzutu** — po nieudanym łataniu kafel mówi
  „można próbować dalej, każda próba to minuta", a resztę rozstrzyga stół. To samo dotyczy końca
  dnia, po którym łata puszcza: zdejmuje ją ⌫ przy chipie „załatana", nie zegar.

- **Rana załatana zostaje na karcie (30.08).** „Łatanie niweluje efekt rany do końca dnia"
  (s. 223) — więc milkną **skutki**, nie wiersz: karta dalej mówi „Złamana noga", tylko jej efekt
  jest przekreślony, a `cpredActiveInjuries` wycina ją ze wszystkiego, co czyta skutki. Trzy rany,
  przy których tabela drukuje „Łatanie trwale usuwa Efekt tej Rany", schodzą z karty naprawdę —
  o tym rozstrzyga `cpredCarePermanent`, nie tryb guzika.

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

- **Etap 23b — cena liczona z pasma.** `entryPrice` bierze `cost`, a gdy go nie ma —
  `COST_CATEGORY_PRICE[costCategory]`, i wtedy przycisk mówi „Kup — 50 ed", a tytuł „50 ed
  (cena pasma Drogie)". Ścieżka jest pokryta testem (`economy.test.ts`), ale **w danych
  kampanii nie ma ani jednego wpisu z pasmem bez ceny** (skan 28.08: 0 na 1000+ wpisów — importer
  zawsze wpisuje obie wartości, choć `cost: None` potrafi wystawić). Żeby to obejrzeć, trzeba by
  najpierw zmyślić wpis. Wyszarzenie przy **całkowitym** braku ceny odklikane 28.08 na
  „Faisal's Onlychance".

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

- **Etap 30c — Wsparcie wchodzi do inicjatywy na samą kość.** Tabela z s. 158–159 drukuje
  Wartość bojową, OB, PW, RUCH i BC — **i żadnego REF**, a REF to Cecha, z której robi się
  Inicjatywa. Doliczenie Wartości bojowej postawiłoby C-SWAT na szczycie każdej kolejki na
  zawsze (16 + 1k10 bije wszystko przy stole); zostawienie wiersza nierzuconego schowałoby
  posiłki na dnie listy, aż ktoś zauważy. Funkcjonariusz rzuca więc **czyste 1k10**, a MG może
  wpisać wartość ręką jak każdemu innemu. Uczciwe odczytanie ramki, która tej liczby nie podaje.

- **Etap 30c — „dwie różne grupy Wsparcia" wskazuje MG.** „Jeśli w tym rzucie wypadnie 6 […]
  chyba że poziom twojej Zdolności wynosi 10 – w takim wypadku przybywają dwie różne grupy
  Wsparcia" (s. 158) nie mówi, **które** dwie. VTT nie zgaduje: wezwana kategoria zostaje ta,
  o którą prosił Stróż Prawa, a wiersz w kolejce niesie pytanie i listę kategorii do wyboru
  (rozstrzygnięcie MG, 29.08). Dopóki pytanie wisi, **żadna z grup nie przyjeżdża** — inaczej
  pierwsza stanęłaby na mapie, a druga została pytaniem bez kontekstu.

- **Etap 30c — szóstka podnosi kategorię ponad rangę wzywającego.** „Zamiast zwykłego wsparcia,
  na odsiecz przybywa oddział z wyższej kategorii" nie powtarza sufitu, który rządzi
  **wzywaniem**, a nagrodą za szóstkę jest właśnie to, że przyjechał ktoś większy, niż wolno ci
  było prosić. Stróż Prawa z rangą 9 dostaje po szóstce federalnych z poziomu 10.

- **Etap 30c — pracownik zespołu ma Szczęście 1 i pustą sakiewkę.** Żadna z pięciu tabel zawodów
  (s. 155–157) nie drukuje kolumny SZ, bo Szczęście jest tym, co wydaje Postać Gracza. Karta nie
  przyjmuje jednak Cechy 0 (`CPRED_STAT_MIN` = 1, a `validateStats` odrzuca wtedy **cały** blok
  Cech i karta wraca z samymi piątkami), więc pracownik dostaje minimum uprawnienia i
  `luckCurrent: 0`. Przy stole znaczy to dokładnie to samo.

- **Etap 30c — cyborgizacje zespołu zostają prozą.** „Nie musisz obniżać Empatii tej Postaci
  z uwagi na Utratę Człowieczeństwa wynikającą z posiadanych cyborgizacji. Wzięto to już pod
  uwagę" (s. 155). Wpisanie chromu jako prawdziwych wierszy policzyłoby Człowieczeństwo drugi
  raz — pakiet jedzie więc do notatek, a Cechy zostają takie, jakie wylosowała tabela.

- **Etap 30c — Prowizorka zespołu i przywileje Pracy Zespołowej nie mają mechaniki.** Konap na 2. poziomie, srebrny Trauma Team na 6., dom w Bobrowisku na 7. i McPosiadłość na 10. stoją
  wypisane w panelu jako zapis dla stołu. Czynsz i standard życia liczy Poziom życia z 23b,
  a „nie płacąc czynszu" to zdanie, które stosuje MG — rabat, którego rozliczenie miesięczne
  nie ma jak zgadnąć (któremu Poziomowi życia odpowiada konap pracodawcy?).

- **Etap 30d — Zasięg Fixera nie przebija poziomu sklepu (decyzja MG, 30.08).** RAW mówi „Zawsze
  potrafisz znaleźć kogoś z przedmiotami z kategorii X lub niższej […] nawet jeśli nie da się ich
  inaczej dostać" (s. 160), a poziom sklepu z 23b jest **mechanizmem kampanii, nie zasadą
  podręcznika** — to MG odblokowuje pasma z czasem. Postawione naprzeciw siebie wygrywa MG:
  Zasięg stoi w panelu jako drabina do czytania przy stole, a katalog rządzi się poziomem
  kampanii. Do sklepu wchodzi za to **Targowanie się**.

- **Etap 30d — z sześciu targów VTT liczy dwa.** −10% (poziom 1–2) i −20% (poziom 9) to jedyne,
  które da się odjąć od ceny; udany rzut odkłada targ na kartę (`CpredCharacterData.haggle`),
  a najbliższy zakup go zdejmuje z ceny i z karty. Pozostałe cztery — szósta sztuka gratis, pół
  teraz i pół za miesiąc, +20% dla Ekipy, podwójna zapłata za Zlecenie — opisują pieniądze,
  których projekt nie prowadzi (hurt, raty, wynagrodzenie za Zlecenie). Stoją w menu, bo Fixer
  wybiera z sześciu, a menu z dwoma po cichu przepisałoby Rolę (ta sama decyzja, co przy
  Ulepszaniu z 30b).

- **Etap 30d — Zasięg na szczeblu 5–6 dziedziczy pasmo z niższego.** Ramka „ZNAJOMOŚCI –
  POZIOMY 5 I 6" jako jedyna **nie drukuje kategorii cenowej**: w jej miejscu stoi Nocny.
  `cpredOperatorReach` szuka więc w dół, bo odczyt „szczebel bez pasma to brak Zasięgu" kazałby
  awansowi **odebrać** zdolność — czego w całym podręczniku nie robi żaden inny awans.

- **Etap 30d — nieudana prośba Rockera nie ma odliczania.** „Rocker nie może prosić tych fanów
  o tę samą przysługę przez tydzień" (s. 144) mierzy się w tygodniach, a VTT nie ma kalendarza
  ani pojęcia „ci fani". Zdanie stoi na karcie rzutu i w podpowiedzi panelu; pilnuje go MG. Ta
  sama decyzja, którą 30b podjęła wobec Prowizorki („10 minut na poziom").

- **Etap 30d — Test Rzetelności nie jest Testem.** Nie ma w nim Cechy, Umiejętności, kary za rany
  ani eksplodującej dziesiątki, a Szczęścia użyć nie wolno wprost z podręcznika (s. 152). Ranga
  kupuje **szansę** („2 na 10"), nie modyfikator, więc kość leci goła i porównuje się `1k10 ≤
szansa` — kształt Rzutu na Śmierć, nie Testu na PT.

- **Etap 30d — Wiarygodność nie dotyka Reputacji z 23c.** Opis etapu zapowiadał styk, ale
  podręcznik go nie ma: Rzetelność jest szansą na to, że **odbiorcy uwierzą publikacji**,
  a Reputacja modyfikuje Konfrontację i to, czy ktoś cię rozpozna. Dwie różne liczby o dwóch
  różnych rzeczach; sklejenie ich byłoby zasadą domową, nie odczytem.

- **Etap 30d — pogłoski przynosi rzut, treść pisze MG.** Guzik „Pogłoski" rzuca Wiarygodność +
  1k10 i mówi, **który** próg został pobity (7/9/11/13 → mglista, typowa, sprawdzona,
  szczegółowa). Czym pogłoska jest, VTT nie wymyśla — to materiał kampanii, który mieszka
  w dzienniku z 24b i w bazie wiedzy z 19b. Remis na progu zdaje, jak przy każdym innym PT
  statycznym (decyzja z 28.08), choć ramka pisze tu „wyższy od".

- **Etap 30d — Tabor Rodziny to lista, a nie pojazdy.** Projekt nie ma pojazdów, więc wiersz
  Taboru jest nazwą, kategorią i notatką. Liczone są dokładnie te dwie rzeczy, które liczy
  podręcznik: wpisów jest najwyżej tyle, ile poziomów Moto, i żaden nie jest z kategorii wyższej
  niż poziom. Ulepszenia pojazdów z s. 163–165 (kilkadziesiąt pozycji) zostają w podręczniku:
  bez pojazdów nie miałyby czego ulepszać, a wiersz Taboru „Opancerzenie kadłuba" mówi przy stole
  dokładnie to samo.

- **Etap 29a — „nieco czasu na obecnym poziomie" zostaje przy stole.** Podręcznik po tabelach
  kosztów dopisuje: „Należy spędzić nieco czasu na obecnym poziomie, zanim wykupi się kolejny"
  (s. 411). To zdanie o czasie **fabularnym**, którego VTT nie ma czym zmierzyć — kalendarza
  kampanii nie ma, a licznik sesji mierzyłby coś innego niż podręcznik. Egzekwowany jest zakaz
  przeskoku poziomu, który jest liczbą; „nieco czasu" pilnuje MG, tak jak pilnuje, czy postać
  miała okazję ćwiczyć.

- **Etap 29a — mnożnik inny niż 2 czytamy jak 1.** Podręcznik ma dokładnie dwie kolumny kosztów
  Umiejętności (zwykłą i ×2), więc `multiplier: 3` w pliku danych wyceniałby Umiejętność, której
  książka nie opisuje. `cpredSkillAdvanceCost` bierze więc ×2 albo ×1 i nic pomiędzy — dane
  spoza podręcznika nie tworzą po cichu trzeciej drabinki.

- **Etap 29a — Cech za PD się nie podnosi.** RAW nie ma tabeli kosztu Cechy, a wyjątki, o których
  wspomina rozdział 18, nie są stabelaryzowane. Cechy zostają więc polem MG na karcie: awans ich
  nie dotyka, a zmiana Cechy jest decyzją przy stole, nie zakupem.

- **Etap 29a — rejestr awansów nie idzie do dziennika kampanii.** Ślad „co i kiedy podniesiono"
  ma własną tabelę przy karcie (bliźniak `LedgerEntry` z 23b), a nie wpisy w dzienniku z 24b.
  Dziennik jest prozą **indeksowaną do RAG-u**: dwadzieścia wierszy „Percepcja 4 → 5" na sesję
  zasypałoby streszczenia z 19c i kontekst botów szumem o zerowej wartości fabularnej.
