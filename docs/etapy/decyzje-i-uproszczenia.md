# Decyzje i świadome uproszczenia

Rzeczy, które **nie są zaległościami** — nikt ich nie zapomniał i nikt nie ma ich „dokończyć".
To zapisane decyzje: gdzie VTT czyta podręcznik po swojemu, co zostało celowo uproszczone i które
miejsce pęknie pierwsze, gdy zmienią się dane wejściowe. Wyjęte z `POSTEP.md` 22.08, żeby plik
czytany na starcie każdej sesji został listą zadań, a nie archiwum ustaleń.

**Czytaj na żądanie**, nie rutynowo — najczęściej wtedy, gdy przy stole wyjdzie, że coś działa
inaczej, niż mówi podręcznik, albo gdy dotykasz wymienionego tu kodu. Jeśli któraś z tych decyzji
przestanie się bronić, przenieś ją stąd do `POMYSLY.md` jako zadanie — nie odwrotnie.

## Jazda w pościgu: prędkość, pasy i kadr (etap 72b1, 19.11.2026 — zastępuje tempo, dryf i budżet z 65c)

Zasada domowa (decyzje MG z 15.11, projekt `etap-72-poscig-kokpit.md`). Podręcznik opisuje pościg
tylko Testami i Manewrami (s. 191–192); liczby niżej to VTT.

- **Auto ma prędkość trwającą między turami i pas ruchu.** Prędkość w punktach Ruchu (na ekranie
  ×5 mil/h), od 0 do Ruchu pojazdu. Gaz +10, hamulec −20 na turę — każdy z nich albo zmiana pasa
  o jeden kosztuje Akcję Ruchu, jazda prosto nic. Bieg kierowcy dalej odpada.
- **Auto rusza się raz na rundę, w turze swojego kierowcy**, o `(prędkość − prędkość pościgu) / 4`
  kratek wzdłuż drogi (+ Nitro: `Ruch / 4`, odpalone przed „Jedź”). Kierowca, który skończy turę
  bez „Jedź”, jedzie sam: bez pedału i zmiany pasa. Auto bez tury (kierowcy nie ma w kolejce,
  pusty fotel) jedzie na początku rundy — od rundy 2, pierwszą ustawia MG.
- **Prędkość pościgu to prędkość auta kadru z początku rundy**, stała przez rundę. Auto kadru:
  wskazane przez MG (72f), inaczej pierwsze auto drużyny z kierowcą, auto drużyny, najszybsze.
  Na początku rundy wszystko na drodze (auta, figury w fotelach, przeszkody) przesuwa się sztywno,
  żeby auto kadru stanęło na 30% długości kadru od tylnej krawędzi („Drużyna goni”) albo od
  przedniej („Drużyna ucieka”, `Scene.chaseRole`). **Piesi na jezdni się nie przesuwają** — jak
  przed etapem stoją w kadrze; do oceny przy rozegraniu 72g.
- **Prędkość startowa (dawne „Tempo”)**: w pierwszej rundzie walki auto z kierowcą i pracującym
  silnikiem dostaje `min(Ruch, prędkość startowa)`. Bez kierowcy albo ze zgaszonym silnikiem
  prędkość maleje o połowę co rundę, wrak stoi. Poza walką widok pokazuje prędkość, z którą auto
  ruszy, a bieżnia jedzie jak przed etapem.
- **Zderzenie na drodze ruchu pyta kierowcę, zanim cokolwiek wyda**: „Taranuj” (jeden taran na
  turę), „Zwolnij za nim” (gdy różnica prędkości mieści się w hamulcu, ≤ 100 mil/h — auto staje
  przy zderzaku i bierze prędkość blokującego), przy zmianie pasa „Zepchnij” (taran bokiem, bez
  Pługa). Zderzak w zderzak z wolniejszym też jest zderzeniem.
- **Koniec tury bez „Jedź” przy zderzeniu (MG 19.11):** zwolnij, a gdy hamulec nie wystarcza —
  taran („kierowca nie zareagował”). Przeszkoda czekająca na odpowiedź, której kierowca nie dał,
  kończy się tak samo.
- **Cofające się auto (wolniejsze od pościgu) staje przy zderzaku auta z tyłu bez obrażeń**, a wybór
  ma tamten kierowca, gdy w swojej turze dojedzie (MG 19.11). Na początku rundy auto bez tury, które
  cofa się na auto z kontrolą, czeka na jego wybór (`chase:vehicle-answer`), a na auto bez
  kontroli — zderzenie od razu.
- **Utrata kontroli to automat zamiast ręki MG**: prędkość od razu −10 (−50 mil/h), a ruch tej
  rundy (w turze kierowcy albo od razu, gdy stracił kontrolę we własnej turze przed ruchem) jedzie
  bez pedału z 1k6 na pas (1–2 wyżej, 3–4 prosto, 5–6 niżej; przy krawędzi zostaje); każde
  zderzenie to taran. Kontrola wraca z nową rundą, „Oddaj kontrolę” MG zostaje.
- **Nagłe zatrzymanie** udane zbija prędkość do zera od razu. Od 72d1 (MG 20.11) jest też trzecią
  odpowiedzią na to, co stoi przed zderzakiem (obok Gwałtownego skrętu i taranu, PT 13): auto
  staje, przeszkoda przestaje czekać.
- **Auto o prędkości 0 stoi na drodze jak przeszkoda (72d1)** — nic na nie nie najeżdża: przeszkoda,
  która dojedzie do jego zderzaka, i auto cofające się bez tury stają przy nim bez pytania i bez
  zderzenia. Ruszyć można zmianą pasa albo gazem (wtedy pyta „Zderzenie”).
- **Gwałtowny skręt o dwa pasy (72d1, MG 20.11)** — udany Manewr zadeklarowany w turze pozwala
  w tej rundzie zmienić pas o dwa w jednym „Jedź” (Akcja na Manewr, Akcja Ruchu na jazdę); dalej
  też omija przeszkodę tuż przed zderzakiem.
- **Kierowca nie liczy metrów (72d1)** — w jego turze Akcja Ruchu to sam żeton „gaz, hamulec albo
  pas”, bez paska dystansu i bez Biegu.
- **Auto, które wyjechało za krawędź, odpada dopiero na początku rundy** — po sztywnym przesunięciu,
  bo kamera jedzie za autem kadru i liczy się kadr z tej chwili.
- **Wyścig (72c, decyzje MG z 15.11 i 20.11)** — na początku każdej rundy walki kierowcy aut
  w kadrze (z turą w kolejce, z kontrolą, silnikiem i nie we wraku) rzucają Test przeciwstawny
  Prowadzenia; zryw `⌊(wynik − najniższy) / 2⌋` kratek, najwyżej 5, dolicza się do ruchu w turze.
  Za NPC-ów rzuca serwer bez kości 3D (jedna karta czatu), gracz — kubkiem na wezwanie,
  a **runda stoi bez tury**, aż wszyscy gracze rzucą. MG rzuca za gracza (z karty, bez
  Szczęścia) albo go pomija — „Pomiń Wyścig” albo zwykłą „Następną turą”; pominięty jedzie bez
  zrywu, bez utraty kontroli, a jego brak wyniku nie jest „najniższym”. Koniec walki przerywa
  czekający Wyścig. Wynik NPC-a jest jawny, jego rozbicie (REF, Umiejętność) — tylko u MG.
- **Kto jak rzuca Wyścig:** z karty planerem — REF + Umiejętność prowadzenia **nazwana na
  karcie** (z czipem i Moto) + 1k10; statysta bez Prowadzenia wychodzi więc na samą Cechę + 1k10
  (ogólny poziom broni się nie podstawia); figura z Wartością bojową (Wsparcie) i figura bez karty
  — czyste 1k10. **Słaby kierowca** (REF + Prowadzenie + Moto ≤ 9, NOM-03) to tylko **postać
  gracza albo NPC z pełną kartą** (taką, która nie mieści się w szybkim edytorze statysty —
  decyzja MG 20.11); jego rzut Wyścigu jest Testem zwykłej jazdy (PT 10, zdaje się powyżej),
  porażka to utrata kontroli od razu (prędkość −10), ruch automatem 1k6 na koniec jego tury.
  Test zwykłej jazdy przy „Jedź” zniknął.

## Role po weryfikacji (etap 71, 14–18.11.2026)

Etap 71 sprawdził dziewięć Ról (bez Netrunnera — etap 70) regułę po regule wobec podręcznika
i wobec maszynerii, która doszła po etapie 30. **Pełna odpowiedź „co działa, co uproszczone,
dlaczego” stoi w `role-macierz.md`** — 194 wiersze z dowodem (kod, test vitest, specyfikacja
`52-role/t71-*`) i klasą odwzorowalności. Stan po 71h1: 138 ✅, 34 🟡, 19 📜, 2 ❌ (oba poza
etapem), 1 ⚠️ (MED-05, błąd #88 — naprawa w 71h2). Każde 🟡 ma wpis w jednej z sekcji „… po weryfikacji Ról” niżej (71c0–71g2).

**Co świadomie zostało prozą (📜)** — reguły klasy C i D, których VTT nie liczy, bo skutek pisze
MG albo fabuła; każda ma zdanie w panelu Zdolności albo na karcie rzutu:

| Rola        | wiersze                    | dlaczego proza                                                                                  |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| wspólne     | WSP-20                     | „nieco czasu między awansami” — przy stole (bramka 15.11, D4)                                    |
| Technik     | TEC-20, TEC-21             | Wynajdywanie: zasady wynalazku pisze MG, wynalazek to jego wpis Kompendium                      |
| Medyk       | MED-14                     | Zryw działa w opisie środka; snu VTT nie modeluje                                               |
| Nomada      | NOM-15, NOM-16             | reputacja w Rodzinie i opcje Zakwaterowania Nomady — fabuła; zakwaterowanie ustawia się na karcie |
| Fixer       | FIX-07, FIX-11             | wypłat za Zlecenia VTT nie prowadzi; „kto odbiera telefon” to drabina w panelu                  |
| Korpo       | KOR-01, KOR-04             | katalogu Mody i abonamentów Trauma Team nie ma (KOR-04 wraca, jeśli abonament powstanie)        |
| Stróż Prawa | STR-10, STR-12, STR-R1     | federalni w tej samej sprawie i stopień w organizacji — fabuła; pojazdy Wsparcia — po etapie 72 |
| Rocker      | ROC-05, ROC-10, ROC-11     | kto jest fanem, miejsca występów i co fani zrobią — rozstrzyga MG, karta podaje zakres          |
| Media       | MDA-06, MDA-11, MDA-12     | treść pogłoski i skala skutku publikacji pisze MG (bez treści od LLM, decyzja 14.11)            |

**Czego etap 71 nie zamknął i gdzie to czeka:** MED-05 — leczenie Rany Krytycznej postaci
innego gracza przez gracza-Medyka (#88) — podetap 71h2 (decyzja MG 18.11); NOM-03 (Moto w progu „słabego kierowcy”)
i NOM-02 (Wyścig i Manewr Nomady) — etap 72; STR-12 (Wsparcie autem w pościgu) — po etapie 72;
FIX-10 (Nocny Targ) — osobny etap (`POMYSLY.md`); KOR-04 — tylko z abonamentem Trauma Team;
parafraza zdań podręcznika w reszcie kodu (~535 ciągów poza `roleability.ts`) — **osobny etap,
decyzja MG z 18.11** (`zaleglosci.md`). Boty i NPC-e MG używający Zdolności — poza zakresem
(decyzja 14.11).

## Parafraza zdań podręcznika w `roleability.ts` (etap 71g2, 18.11.2026)

Bramka MG z 15.11 (G37, WSP-19): **parafraza w kodzie** — nie „zostają” i nie „teksty do
`data/private`”. Rozstrzygnięcia bez pytań:

- **Co jest parafrazą.** Każde zdanie o regule: opisy Zdolności i Specjalizacji (dymki paneli),
  dziesięć skutków Ulepszania, szczeble drabin (Rocker, Fixer, Media), przywileje Korpo, tabela
  zmian Lojalności, opisy grup Wsparcia, zadania pracowników, targi Fixera, odmowa „dużej grupy”
  Rockera i cytaty w komentarzach. Komentarze mówią teraz po angielsku albo własnymi słowami,
  zawsze z numerem strony. Treść reguł (liczby, progi, warunki) się nie zmieniła — zmieniło się
  tylko brzmienie; testy jednostkowe wszystkich Ról przechodzą bez zmian poza jednym, który
  sprawdzał fragment zdania (`rolerolls.test.ts`).
- **Co zostaje dosłownie i dlaczego.** Nazwy (Zdolności, Specjalizacji, Umiejętności,
  przedmiotów, wszczepów, pojazdów, grup Wsparcia, szczebli) — to słownictwo stołu, a nazwa
  inna niż w podręczniku utrudniałaby grę. Listy samych nazw (Umiejętności agentów federalnych,
  wszczepy i osprzęt pracowników Korpo) też. **Liczby** — tabele Cech pracowników (s. 155–157),
  bloki statystyk Wsparcia, progi, PT — to fakty mechaniki, nie zdania; G37 nie obejmował ich
  przeniesienia do `data/private` (gdyby MG chciał, to osobna doróbka — `POMYSLY.md`).
- **Miara „dosłowne”**: wspólny ciąg co najmniej **6 słów** z prywatnym podręcznikiem
  (`data/private/rulebook/manual/CPRED-podrecznik/*.md` + FAQ). Przed 71g2 w `roleability.ts`
  było ~1500 takich słów w 142 ciągach, po 71g2 — tylko listy nazw. Strażnik:
  `packages/server/src/licensing.test.ts` („no rulebook sentences in committed code”); na
  maszynie bez podręcznika test się pomija. Lista `guarded` w teście to pliki już
  sparafrazowane; kolejne dopisuje się po ich przepisaniu.
- **Reszta kodu poza zakresem 71g2** — ten sam pomiar znalazł ~535 takich ciągów w innych
  plikach (`attacks.ts`, `netcombat.ts`, `character.ts`, `netrunning.ts`, `turn.ts`…), głównie
  cytaty reguł w komentarzach. Zapisane w `zaleglosci.md` (18.11).

## Kreator, PD i wieloklasowość po weryfikacji Ról (etap 71g1, 17.11.2026)

Bramka MG z 15.11 (G33–G36, D2, D3, P4) — rozstrzygnięcia bez pytań:

- **Pakiet Roli Krawędziarza kładzie kreator (G33, WSP-08)** — `edgerunnerKits`
  w `data/private/cpred/creation.json`, przepisane ręką z sklejonych tabel s. 98 (broń
  i pancerz), s. 103 (Ekwipunek, Osprzęt, strój) i s. 117 (cyborgizacje). Wybory „lub” to pola
  w kroku „Wyposażenie” (brak w `creationIssues`, zmiana Roli i metody je zdejmuje); 500 ed
  zostaje na resztę, a pakiet nie zostawia wiersza w historii eurodolców. Świadomie poza kartą:
  **amunicja do broni palnej** (także zapalająca Medyka — kule, śrut i strzały są bez dna od
  23.10), **strój** (VTT nie ma katalogu Mody — trafia prozą do notatek karty), **chrom** (wszczepia
  MG „Dodaj za darmo” z losowaną UC — stała UC z tabeli s. 117 dalej czeka w `POMYSLY.md`).
  Granat z pakietu to wiersz „Granat” i zapas w sztukach. Wątpliwe komórki zrzutu, odczytane
  **❓ do sprawdzenia w druku przez MG**: Rocker ma gitarę **i** wykrywacz podsłuchu (zrzut:
  „Gitara elektryczna lub Wykrywacz podsłuchu” — nazwa wpisu to „Gitara… lub inny instrument”);
  Korpo dostaje Agenta, choć zrzut zgubił jego komórkę (ma go każda Rola); Stróż Prawa ma dwa
  zestawy stroju; Media — „Jednorazowy telefon ×2 **lub** wyrzutnia haków”. Poprawka to edycja
  danych, nie kodu.
- **Listy Umiejętności Rockera i Medyka wg oryginału (G34, ROC-K1, MED-K1)** — parser zamienia
  jedną Umiejętność broni (`ORIGINAL_EDITION_SWAPS` w `parse-creation.py`), pakiety Ulicznika
  idą za nią. Gotowe postacie bez zmian; szkic Krawędziarza w toku traci punkty w Umiejętności,
  która wypadła z listy (filtr listy Roli przy odczycie).
- **Powrót do Roli z karty kosztuje jak nowa Rola — 60 PD (D3, WSP-18)** — zmiana decyzji MG
  z 30.08. Ranga zostaje ta, którą Rola miała; bramka dalej pyta bieżącą Rolę (≥ 4).
- **„Zrób główną” przy Roli poprzedniej (G35, zaległość 9)** — u gracza to ten sam zakup co
  wybór z listy (bramka, 60 PD); **u MG to poprawka karty**: bez bramki i bez PD, tylko z Rolą,
  którą karta już niesie (`gmSwap`, odmowa `NOT_HELD`), z wierszem „zamiana ręką MG” w rejestrze.
  Nową Rolę MG dalej nadaje wierszem „Rola” na karcie.
- **Środek za punkt Farmaceutyków wybiera Medyk (D2, MED-08)** — zmiana decyzji z 03.09.
  `pharmaPicks` na karcie: kolejność wyborów, dostęp dają pierwsze N (N = punkty). Karta sprzed
  71g1 dostaje przy odczycie środki z kolejności tabeli, ile ma punktów, i dopiero następne
  wybiera. Zdjęty punkt chowa ostatni wybór, dołożony z powrotem go oddaje. Wybór zdejmuje tylko
  MG (✕ przy środku); łata karty (`character:update`) wyborów nie zmieni nikomu. Punkty
  Farmaceutyków wpisane ręką MG czekają na wybór jak każde inne.
- **Wazeliniarz przy awansie (G36, FIX-12)** — Znajomości kupione na 3, 5 albo 7 piszą wiersz
  `gmaction` dla kupującego i MG: nowa kultura i jej język na poziomie 4. Języka nie dopisuje
  automat — karta ma jeden wiersz Języka (projekt wielu języków w `POMYSLY.md`); ranga ustawiona
  ręką MG przypomnienia nie daje.
- **Ulicznik Fixera: pistolet i lekka broń biała (P4, WSP-23)** — jak druk; dane poprawione.

## Czas i zasoby narracyjne po weryfikacji Ról (etap 71f, 16.11.2026)

Bramka MG z 15.11 (G27–G32, G39, P2) — rozstrzygnięcia bez pytań:

- **Fani to grupy na karcie, a blokada jest na grupę (G27, ROC-08, ROC-09)** — podręcznik
  zamyka „tych fanów” na „tę samą przysługę”; VTT nie umie porównać dwóch próśb, więc po
  nieudanym Teście **cała grupa** nie przyjmuje prośby przez 7 dób zegara świata (termin i „o co”
  stoją na wierszu). Gdy następna prośba jest o coś innego, blokadę zdejmuje MG („Odblokuj”).
  Termin mija sam — bez przemiatania; prośba do zamkniętej grupy to odmowa także dla MG.
- **Prośba wymaga grupy** — „Zdolność działa tylko na fanach”: bez grupy tej wielkości na karcie
  rzutu nie ma. Grupę daje udany Test „nowi fani” (nazwa od gracza albo domyślna) albo MG
  wpisem bez rzutu („kto już jest fanem, rozstrzyga MG”). Usuwa tylko MG, nazwę zmienia też
  właściciel. Sufit 24 grup. Istniejące karty Rockerów zaczynają z pustą listą.
- **Nowych fanów nie robi się w walce (P2, ROC-04)** — odmowa serwera dla gracza przy
  jakiejkolwiek walce w kampanii (ta sama miara co `COMBAT_LOCKED`); MG przechodzi.
- **Tydzień to tydzień kalendarza od poniedziałku (G28, G32)** — „dwa razy na tydzień” i licznik
  wezwań liczą się w tygodniu daty świata (`gameWeekIndex`), nie w oknie 7 dób od rzutu.
  Przypomnienie o Pogłoskach idzie **tylko do MG**, raz, gdy zegar wejdzie w nowy tydzień, a w
  minionym były mniej niż dwa rzuty; skok o kilka tygodni daje jedno przypomnienie. Tylko karty
  prowadzone przez graczy. Karta bez licznika (i zegar cofnięty) zaczyna liczyć po cichu.
- **„Szukaj pogłosek” to skrót, nie nowy rzut (G29, MDA-05)** — MG wystawia zwykłe wezwanie
  z PT z kolumny „Aktywne”, gracz zwykłą prośbę o Test z tym PT w uzasadnieniu („ostateczne PT
  ustala MG”). Wynik nie zapisuje nic na karcie.
- **Rejestr publikacji (G30, MDA-10)** — publikacja ma obowiązkowy temat; ten sam temat (bez
  wielkości liter i odstępów) wraca tylko z zaznaczeniem „mam nowe informacje”, które zostaje we
  wpisie. Czy są nowe — ocenia MG (może wpis usunąć). Rejestr trzyma 40 najnowszych. **Wpisu do
  dziennika kampanii (24b) nie ma** — rejestr na karcie wystarcza regule, dziennik pisze MG.
- **Druga broń Wsparcia (G31, STR-13)** — jedna na kategorię: pistolet policji stanowej
  i federalnych, granatnik szeryfa, wyrzutnia C-SWAT. Bardzo ciężki pistolet szeryfa zostaje
  w opisie wyposażenia. Broń, której nie ma w Kompendium kampanii, wypada bez błędu.
- **Licznik wezwań (G32, STR-14)** — liczy wezwania, na które **ktoś odpowiedział** (nieudany
  rzut i odmowa się nie liczą); widzi go MG w panelu Wsparcia. Kara to decyzja MG.
- **Karta Pogłosek (G39)** — „14 > 13” zamiast „≥”; remis nie zdaje od 30.08.

## Handel i pieniądze po weryfikacji Ról (etap 71e, 16.11.2026)

Bramka MG z 15.11 (G20–G23, G25, G26, P6) — rozstrzygnięcia bez pytań:

- **Druga strona targu (G20, FIX-01)** — przy ladzie handlarza suma to CHA (efektywna) +
  Handel + Znajomości **z karty handlarza**, liczona przez serwer; poza sklepem sumę wpisuje
  MG na kartę Fixera („Daj graczowi”), a **jeden rzut ją zużywa** (wygrany czy przegrany).
  Gracz nie podaje liczby wcale; MG rzucający za Fixera z karty podaje ją od ręki. Suma ma
  sufit pola MG (30).
- **Jeden rzut na ladę do transakcji** — po rzucie przy ladzie (`counterHaggle`) drugi rzut
  u tego samego handlarza dopiero po transakcji z nim; inaczej rzucałoby się do skutku. Porzucenie
  targu przez gracza nie zdejmuje rzutu (zdejmuje MG). Targ dobity przy ladzie działa **tylko
  u tego handlarza**; targ z sumą od MG — wszędzie (Kompendium, salon aut, każdy sklep).
- **Handlarz-Fixer urywa przy skupie (FIX-14, FAQ)** — handlarz z kartą ze Znajomościami płaci
  przy skupie 10% mniej (Znajomości 1–8) albo 20% (9–10), dopóki sprzedający nie wygra z nim
  rzutu spornego przy ladzie; wygrana daje „cenę bazową” (skup handlarza bez cięcia). Rzucić
  może każdy („poziom Znajomości, jeśli masz”); u handlarza bez Znajomości rzut bez targu
  odmawia `NOTHING_TO_HAGGLE`. Druga połowa FAQ (Fixer odsprzedaje drożej, pośrednictwo
  z godzinową stawką) zostaje przy stole.
- **Targ procentowy przy sprzedaży (G21, FIX-04)** — „sprzedajesz o 10% drożej albo kupujesz
  o 10% taniej”: w jednej transakcji okna „Wymiana” targ idzie na stronę, która **waży więcej
  w ed** (skup liczony po cięciu handlarza-Fixera; remis — zakup). Podwyżka i cięcie w dół.
- **Szósta sztuka gratis (G22, FIX-05)** — jedna darmowa sztuka najdroższej pozycji koszyka
  z co najmniej sześcioma sztukami („kupując 5 lub więcej, szóstą dostajesz za darmo” —
  jedna, nie co szósta). Targ, którego koszyk nie używa, zostaje na karcie.
- **Pół teraz, pół za miesiąc (G23, FIX-06)** — tylko w oknie „Wymiana” (Kompendium i salon
  aut liczą dalej same procenty). Luksusowe = sztuka od 5000 ed ceny półki (pasmo Luksusowe
  s. 342 bez mnożnika domowego); połowa w dół idzie na **ratę na karcie** z terminem tego samego
  dnia miesiąc później w kalendarzu świata (31.01 → koniec lutego). Spłata — właściciel albo
  MG, gotówką z karty, także po terminie; umorzenie — tylko MG. **Po terminie** przemiatanie
  zegara oznacza ratę jako zaległą, **zamyka targ na zawsze** (`halfLaterClosed`) i pisze MG;
  pieniędzy samo nie pobiera — co robi wierzyciel, rozstrzyga MG. Najwyżej 12 rat naraz.
- **Lojalność na zamknięciu sesji (G25)** — każda droga końca sesji (MG, zegar, administrator):
  ponad 10 → 10 samo (KOR-12); pracownik bez dodatniej zmiany z tabeli w tej sesji dostaje
  **propozycję −1 dla MG** (KOR-13: „−1” przyjmuje wierszem „Brak wzrostu…”, „Pomiń” — wzrost
  był przy stole), ujemna Lojalność — przypomnienie o odejściu (KOR-14), zwalnia dalej MG.
  Jeden wiersz `gmaction` na Korpo. Wzrost liczy się od poprzedniego zamknięcia, więc zmiana
  między sesjami idzie na konto następnej. Przycisk „Koniec sesji” przy pracowniku zniknął.
- **Następca (G26, KOR-15)** — zaznaczenie „Następca (200 ed)” przy zatrudnieniu: Lojalność 1
  i 200 ed z karty Korpo (wpis w historii), odmowa `NOT_ENOUGH_EDDIES` przed kośćmi HR.
  Kto jest następcą, mówi gracz (VTT nie pamięta odejść).
- **Pracownik staje obok Korpo (P6, KOR-S1)** — przy zatrudnieniu, na **aktywnej scenie**,
  jeśli stoi na niej figura Korpo (najbliższe wolne pole); bez niej figurę stawia MG z listy
  „Postacie”, jak dotąd.
- **Targ przy ladzie i spłata raty działają między sesjami** w sklepach oznaczonych przez MG
  (`BETWEEN_SESSIONS_EVENTS`) — te same pieniądze co `merchant:deal` i przelewy.

## Praca Twórcy i kriopompa (etap 71d2, 16.11.2026)

Bramka MG z 15.11 (G13, G19) — rozstrzygnięcia bez pytań:

- **Ulepszanie i Wytwarzanie to Testy przez kubek w robotach drużyny (G13)** — ta sama rura co
  naprawa z 71c2 (rodzaje rzutu `itemUpgrade` i `fabricate`), czas pracy to **propozycja zegara
  dla MG** (decyzja bramki dla 71d), nie wpis „w toku”: rzecz jest gotowa po kościach, a MG
  przesuwa zegar przyciskiem na karcie rzutu. Porażka — połowa czasu i od nowa, jak s. 148.
- **PT i czas z pasma ceny rzeczy** (tabela s. 148), Superluksusowe — miesiąc na każde
  100 000 ed ceny domowej (cennik 47a; „na każde 10 000 ed” z podręcznika razy dziesięć).
- **Surowce to pieniądze, nie przedmioty (TEC-09)** — sprawdzane przed kośćmi, schodzą
  z portfela Technika **przy sukcesie**; porażka ich nie zjada („nie odnoszą uszkodzeń”,
  „nie przepadają”). Ulepszanie: cena **pasma** rzeczy (nie wydrukowana cena sztuki),
  Wytwarzanie: pasmo niżej, Tanie — 5 ed z ramki s. 148, Superluksusowe — połowa ceny.
  Wszystko w cenniku domowym wpisu (ten sam mnożnik, którym `entryPrice` liczy rzecz z samym
  pasmem) — ciężki pistolet (Premium) to 1000 ed surowców na ulepszenie.
- **Umiejętność „którą zwykle naprawia się taki przedmiot”** — broń i dodatki: Naprawa broni,
  wszczep (także leżący w plecaku): Cyberinżynieria, cyberdek: Elektronika i zabezpieczenia,
  reszta: Podstawowe naprawy (FAQ). Naprawa Technika do tych Testów nie dochodzi (TEC-03).
- **Ulepsza się rzeczy kart drużyny** (jak naprawa), stempel tą samą `cpredApplyItemUpgrade`,
  co menu MG „Ulepszenie…” — menu MG zostaje (furtka sędziego). **Montaż wynalazku i ulepszenie
  pojazdu nie idą tą drogą**: wynalazek ma zasady i kategorię od MG (TEC-21), auto — „Zamontuj”
  przy aucie (71c2). Rzecz **bez pasma ceny** (wiersz wpisany ręką) Testem się nie ulepsza —
  nie ma skąd wziąć PT, czasu ani surowców; ulepsza ją MG.
- **Wytwarza się broń, dodatki, pancerz, sprzęt i wszczepy** z Kompendium kampanii; wszczep
  ląduje w Wyposażeniu jak znaleziony chrom (montaż dalej Testem i z Utratą Człowieczeństwa).
  **Nie** wytwarza się amunicji (pudełka i kalibry), programów (Netrunner poza etapem 71),
  pojazdów ani używek (farmaceutyki to Medyk, narkotyków ulicznych nie robi nawet on).
- **Wytwarzanie gracza nie sięga ponad poziom sklepu kampanii** — decyzja D1 z bramki („żadna
  postać nie sięga ponad poziom sklepu”) obowiązuje też tę drogę; MG bez ograniczeń.
- **Kriopompa jest wierszem Wyposażenia z licznikiem zużytych ładunków (G19)** — ładunków 1,
  a u Medyka z 4 i 5 punktami Obsługi kriosystemów 2 i 3 (liczone wg poziomu Medyka, który ją
  trzyma — „twoja kriopompa”). Pierwszy punkt daje pompę raz, przyciskiem „Odbierz kriopompę”
  w panelu Medycyny. Obsługuje ją wyłącznie Medyk (ranga Medycyny).
- **Zamrożenie** — Akcja w walce, pacjent z kartą w zasięgu ramienia (nie sam Medyk), jeden
  ładunek. Pacjent dostaje stan „w kriośnie” z terminem tygodnia zegara świata i status
  „Nieprzytomny”; dopóki stan trwa, **nie rzuca przeciw śmierci** (tura go nie wymaga, rzut
  odmawia `IN_CRYO`). Po tygodniu stan schodzi w przemiataniu zegara („kriostaza minęła”),
  a status zostaje — pacjent dalej leży w worku; „Rozmroź” (Medyk, który zamroził, albo MG)
  zdejmuje jedno i drugie. **Zgoda przytomnego pacjenta i osłona worka 15 PW zostają przy
  stole** — VTT nie pyta o zgodę, a osłonę MG stawia na mapie.
- **Płyn: 150 ed za ładunek** — „50 ed (Drogo)” z s. 353 w cenniku domowym drobnego sprzętu
  (×3); poza walką.
- **Kriozbiorniki (punkty 2–5) zostają prozą** — dostęp do zbiornika w krioośrodku i własne
  zbiorniki to miejsca, nie przedmioty na karcie; Test PT 13 i leczenie dwa razy szybsze
  prowadzi MG.

## Walka i leczenie po weryfikacji Ról (etap 71d1, 15.11.2026)

Bramka MG z 15.11 (G12, G14–G18, G40, G41) — rozstrzygnięcia bez pytań:

- **Prowizorka puszcza sama (G12, TEC-05)** — łata niesie terminy jak efekt czasowy
  (`cpredStatEffectDeadlines`: runda trwającej walki i minuta zegara świata, wygasa
  alternatywa) i zdejmują ją te same dwa przemiatania. Koniec łaty: OB sprzed niej, **a jeśli
  pod łatą sztuka oberwała jeszcze niżej — niższe** („wraca do stanu, w którym był” nie oddaje
  OB straconego po drodze); ten sam rachunek ma guzik „Koniec prowizorki”. Wiersz „Efekty
  wygasły” mówi „Prowizorka puściła: …”. Łata sprzed 71d1 terminów nie ma i puszcza guzikiem.
- **Skutki Ulepszania czyta VTT, stempel wpisuje dziś MG (G14–G16).** Test Technika
  (Ulepszanie z PT, czasem i surowcami) to G13 w 71d2; do tego czasu stempel na przedmiocie
  stawia MG menu „Ulepszenie…” przy wierszu (broń, Wyposażenie, wszczep bazowy) — jak „+1 OB”
  przy pancerzu od 48c. Gracz go sobie nie wpisze (`ITEM_LOCKED`). Lista sposobów w menu to
  `cpredUpgradesForTarget` — ta sama, którą zapyta Test w 71d2.
- **Dodatkowe gniazdo** — broń dystansowa z gniazdami dostaje czwarte (sufit gniazd broni 4,
  `CPRED_WEAPON_SLOTS_CEILING`; dodatek dalej zjada najwyżej 3), dek z wiersza Wyposażenia
  podpina się z jednym więcej (stempel jedzie z dekiem przez podpięcie i odpięcie), wszczep
  bazowy (cyberręka, cyberoko) dostaje gniazdo opcji raz, przy stemplu. „Nowe gniazdo musi być
  tego samego rodzaju” — broń biała i egzotyczna nie dostają go tą drogą.
- **Broń egzotyczna to dla VTT broń dystansowa, nie rzucana, z zerem gniazd w katalogu**
  (miotacz ognia) — podręcznik nie ma znacznika „egzotyczna”, a s. 342 mówi, że tylko zwykła
  broń ma trzy gniazda. „Gniazdo w broni egzotycznej” daje jej jedno. **Amunicja
  niestandardowa w broni egzotycznej zostaje prozą** (stempel jest, rachunku nie ma — VTT nie
  ma tabeli niestandardowych naboi do broni egzotycznej).
- **Jakość Doskonała tylko ze Zwykłej** („ze Zwykłej na Doskonałą”) — broń Niskiej jakości
  w menu jej nie ma. FAQ „także cyberbroń” — menu stoi przy wierszach broni z wpisem
  Kompendium broni; cyberbroń, która takiego wiersza nie ma, ulepsza się przy stole.
- **Broń do ukrycia** — jednoręczna, nieukrywalna staje się ukrywalna na karcie (s. 148); VTT
  nie ma mechaniki ukrywania broni, więc to napis, nie reguła.
- **UC wszczepu niższa o 1k6 (G16)** — stempel idzie na **znaleziony wszczep w Wyposażeniu**
  (montaż „Znaleziony”, 48c), bo UC rzuca się raz, przy wszczepieniu. Tylko wpisy z UC w k6
  od 2k6 wzwyż i nie borgizacje; 2k6 → 1k6, 4k6 → 3k6. Montaż bierze ulepszoną sztukę przed
  zwykłą z tego samego wpisu. Wszczep kupowany „w pakiecie” u ripperdoka stempla nie ma —
  Technik ulepsza rzecz, którą trzyma w ręku.
- **„Raz dziennie” Turbo uzdrawiacza i Stymu (G17) było egzekwowane od 59b** — audyt 71a tego
  nie zauważył; 71d1 dołożył test Turbo i asercję. Dawka ponad limit pustoszeje fiolkę bez
  skutku (jak u Śmiertelnie Rannego).
- **Czas zabiegu to propozycja zegara dla MG (G18)** — Łatanie minuta, Leczenie cztery godziny
  na każdej karcie próby (także nieudanej: „każda próba zajmuje…”), partia farmaceutyków
  godzina. Ta sama maszyna co naprawa w 71c2 (`RollResult.clock`, „⏩ Przesuń zegar o …”).
  Łata rany „do końca dnia” dalej schodzi guzikiem — zegar jej nie zdejmuje (poza zakresem G18).
- **„Wytwórz” czeka na zapis punktów (G40)** — klient wysyła zbuforowany zapis karty
  i czeka na jego potwierdzenie (`characterSaved`, najwyżej 5 s), zanim poprosi o partię.

## Naprawa i montaż Technikiem (etap 71c2, 15.11.2026)

Bramka MG z 15.11 (G10, G11, P5) — rozstrzygnięcia bez pytań:

- **Zwykła naprawa to Test przez kubek dla każdej postaci** (s. 140: „za pomocą odpowiedniej
  Umiejętności technicznej”), nie tylko dla Technika — Naprawa Technika i Moto Nomady dochodzą
  same, bo to Testy z ich list. Pancerz rzuca Podstawowymi naprawami (FAQ), auto — Naprawą
  pojazdów lądowych, wodnych albo powietrznych wg rodzaju. Warsztat z etapu 68 (za ed, od razu)
  **zostaje obok** (decyzja bramki).
- **PT i czas:** pancerz — pasmo ceny wpisu Kompendium (s. 140), wiersz bez wpisu PT 13 i 6
  godzin (Drogi szczebel, jak Prowizorka z 71c0); auto — stopień uszkodzeń (s. 147: 9/3 h,
  13/dzień, 17/tydzień) wg zasady domowej z etapu 68 (PUK 0 — zniszczony, połowa albo mniej —
  poważne). „Szybsza naprawa” z Ulepszania (stempel `fastRepair` na wierszu) połowi czas.
- **Czas pracy to propozycja dla MG, nie automat** — ta sama zasada, którą bramka przyjęła dla
  czasu zabiegu i Pracy Twórcy (71d). Skutek udanego Testu wpisuje się **od razu**; karta rzutu
  niesie czas, a MG ma na niej „⏩ Przesuń zegar o …” (raz na kartę, karta „Czas” na czacie).
  Stanu „w naprawie do…” nie ma.
- **Porażka: pół czasu, rzecz bez zmian, od nowa** („w połowie prac orientujesz się, że musisz
  zaczynać od początku”). Kolejna próba od razu — MG przesuwa zegar o tę połowę.
- **Nie w walce** (`COMBAT_LOCKED`) — w walce jest Prowizorka.
- **Cudze rzeczy tylko drużyny**: karty graczy i towarzyszy-botów (`teamCardsWhere`), ich
  pancerze i auta. NPC-a MG nie naprawia się z karty gracza. Lista robót przychodzi z serwera
  (`repair:targets`) — w panelu Twórcy, bo to Technik naprawia cudze rzeczy; każda postać ma
  „Napraw” przy własnym pancerzu i „Napraw (Test)” przy własnym aucie.
- **Broń nie ma w VTT stanu uszkodzenia** — podręcznik nie daje reguły, która by ją psuła
  (zacięcie broni Niskiej jakości usuwa Akcja, s. 244), więc Naprawa broni nie ma czego
  naprawiać. Pomysł na stan „uszkodzona” od MG — `POMYSLY.md` (15.11).
- **Montaż ulepszenia auta przez Technika (TEC-18):** tylko ulepszenia z progu Moto 1;
  Test TECH + Naprawa pojazdów + Ulepszanie (Naprawa nie — „chyba że Test wiąże się z inną
  Specjalizacją”; Moto tak — to Test Naprawy pojazdów), PT 24 i dwa tygodnie („traktowane jako
  1000 ed, Bardzo kosztowne”). **Surowce = cena wpisu ulepszenia w Kompendium kampanii**
  (z etapu 68: 3000 ed) — trzeba je mieć przed kośćmi, schodzą z portfela Technika przy
  sukcesie, a przy porażce zostają (s. 148: „nie odnoszą żadnych uszkodzeń”).
- **Jedno auto Technik ulepsza raz** („dany przedmiot można ulepszyć tylko raz”) — stempel
  `techUpgrade` na wierszu ulepszenia. **Także auto z Taboru** — to Zdolność Technika, a nie
  zakup w warsztacie, którego decyzja z 06.11 dotyczy.
- **P5 — bieżące OB gracz tylko obniża** — tak było od 48c (`ITEM_LOCKED`, wyszarzona ▲);
  bramka to potwierdziła, 71c2 dopisało test.

## Tabor Rodziny jako stan gry (etap 71c1, 15.11.2026)

Bramka MG z 15.11 (G6–G9, G38) — rozstrzygnięcia bez pytań:

- **„Następny ranek” to najbliższa 6:00 zegara świata** (ten sam krok co skok zegara „do rana”).
  Pierwsze auto Taboru jest w użyciu od razu; przy wymianie stare zostaje przy Nomadzie do
  przyjazdu nowego, a wybranie starego z powrotem odwołuje wymianę. Wymiana w walce jest
  dozwolona — i tak przyjedzie rano.
- **Znacznik „w użyciu” informuje, nie blokuje.** VTT nie zabrania jechać autem Taboru, które
  „stoi u Rodziny” — scena pościgu przechodzi przebudowę w etapie 72; pilnuje tego MG.
- **Rodzina naprawia tylko wrak (PUK 0)** — „zwykłe naprawy należą do obowiązków Nomady”
  (s. 162): warsztat z etapu 68, od 71c2 Technik. 500 ed to usługa — bez cennika domowego.
  Auto dostaje pełne PUK od razu w danych, ale przez 7 dni kalendarza stoi „U Rodziny” i nie
  da się go wziąć; oddanie zdejmuje znacznik „w użyciu”. W walce — odmowa.
- **Głowa Rodziny (Moto 10) używa całego Taboru naraz** — guzików wymiany nie ma. „Dokupuje po
  cenie rynkowej” = zwykły zakup auta (etap 67) i „Do Taboru Rodziny” na karcie auta
  (`fleetJoined`, bez wiersza awansu). Takie auto ulepsza Rodzina („Rodzina montuje”, 1000 ed
  × cennik domowy sprzętu = 10 000 ed, stała z etapu 30d, bez Testu i czasu), a nie warsztat 68
  — jak każde auto Taboru (decyzja MG z 06.11). Wiersze ulepszeń z awansu Moto dalej trafiają
  tylko do aut z wierszem „Pojazd”.
- **Prezent od Rodziny raz na kartę** (`fleetGift`): wybór jednej z trzech broni s. 164 otwiera
  się, gdy w dowolnym aucie Taboru stoi Stanowisko bardzo ciężkiej broni. Broń trafia do
  Wyposażenia z notatką „Prezent od Rodziny”; zdjęcie Stanowiska jej nie zabiera.
- **Tabor tylko z tabeli s. 162 (G38)** — stary wybór spoza tabeli (Karetka itp.) zostaje na
  karcie, dopóki nikt go nie zmieni; lista pokazuje go z dopiskiem „spoza tabeli s. 162”.

## Błędy Ról z audytu: Prowizorka jako Test i Akcja bez `tokenId` (etap 71c0, 15.11.2026)

Bramka MG z 15.11 (G1–G5) — rozstrzygnięcia bez pytań, które naprawa musiała przyjąć:

- **Prowizorka rzuca Podstawowymi naprawami** (pancerz naprawia się nimi wg FAQ), z poziomem
  Naprawy jednym wierszem — Podstawowe naprawy są na liście Testów naprawczych, ale Naprawa nie
  dolicza się drugi raz. PT to „typowa naprawa takiej rzeczy”: pasmo ceny **wpisu Kompendium**,
  z którego wiersz pochodzi (s. 140). **Wiersz wpisany ręką, bez wpisu, dostaje PT 13**
  (Codzienny szczebel drabinki, s. 129) — zasada domowa; MG widzi PT na karcie rzutu.
- **Nieudana Prowizorka nic nie psuje** — Akcja przepada, sztuka zostaje, jak była; kolejna
  próba w następnej Akcji. Podręcznik nie mówi o skutku porażki tej Akcji.
- **Rejestr bez Podstawowych napraw** (zestaw Easy Mode z `data/public`, świeży klon) rzuca
  zapasową definicją Umiejętności z poziomem 0 — sama TECH + Naprawa.
- **„Pełna naprawa” zdejmująca ślad zużytej łaty to pełne OB bez trwającej łaty** — dziś ↻ MG,
  od 71c2 Test naprawy Technikiem. Łata zakłada się wyłącznie Testem: `character:field-repair`
  bez `undo` odmawia (`FIELD_REPAIR_NEEDS_ROLL`). Odliczania 10 minut na poziom dalej nie ma
  (wpis z 29.08 niżej) — przychodzi w 71d1 (G12).
- **Figurę, która płaci Akcję Zdolności z karty, wybiera serwer** — najpierw figura tej karty
  grająca w walce od rundy 1, potem figura na oglądanej scenie. Wsparcie wezwane z karty poza
  walką stawia więc funkcjonariuszy przy figurze na oglądanej scenie (do 71c0 z karty nie stawiało
  nikogo).
- **Modyfikator obrażeń MG przy serii dalej mnoży się z kośćmi** — po mnożniku dochodzi tylko
  Wykrycie słabości (FAQ mówi o nim, o modyfikatorze sytuacyjnym nie mówi nic).

## Wykrycie w Sieci zaczyna walkę (14.11.2026, zlecenie i decyzje MG)

Zmienia akapit „Poza walką automat tylko wykrywa i budzi” z 70e niżej.

- **Co zakłada starcie:** Czarny LOD, który wykrył netrunnera (automat albo „LOD wykrywa
  intruza” MG), Demon, który zaczyna ścigać (wejście na jego piętro albo przejęcie węzła),
  i **ostatecznie** nieudane Maskowanie — ostatnia próba Tury bez sukcesu albo zejście z piętra
  (ruchem lub Ślizgiem) w połowie prób. Pojedyncza pechowa próba, gdy zostały następne, jeszcze
  nie. Zejście z piętra **bez żadnej** próby (czerwone „bez maskowania”) nie zakłada niczego.
- **Jak zauważenie wroga (etap 56):** runda 0 „Przed walką”, drużyna staje (marsze i ruch po
  Sieci — gracz dostaje „Zaraz walka — czekaj, aż MG ją rozpocznie.”), MG ma pasek „Wykrycie
  w Sieci” z „⚔ Rozpocznij walkę / Odwołaj”. Runda 1 dopiero po kliknięciu MG.
- **Kto w starciu:** drużyna (figury graczy na scenie) i LOD albo Demon, który wykrył. Po
  nieudanym Maskowaniu **tylko drużyna** — plus to, co na tym piętrze już ściga netrunnera;
  nikogo nie budzi, wrogów z mapy nie dokłada (MG ręką w „Walce”).
- **LOD na czele kolejki także po starcie z rundy 0** (s. 205: „wchodzi do walki na pierwszym
  miejscu Kolejki Inicjatywy, nawet jeśli byłeś szybszy”): „Rozpocznij walkę” po rzutach NPC-ów
  stawia LOD-y i Demony z rundy 0 nad najwyższą inicjatywą. Gracz, który rzuci inicjatywę dopiero
  w rundzie 1 wyżej, wyprzedzi LOD-a (spóźniony rzut z 06.11) — uproszczenie.
- **W trwającej walce** bez zmian: LOD i Demon wchodzą na czoło kolejki; netrunner spoza walki
  dołącza (rzuca kubkiem).
- **Tylko w trwającej sesji na aktywnej scenie** (jak zauważenie); poza nią — jak przed 14.11.
- **Hamulec „Wstrzymaj obronę” wraca do stanu sprzed 14.11** — żadnego starcia z Sieci, także
  po ręcznym „LOD wykrywa intruza” MG (LOD wchodzi wtedy tylko do trwającej walki), a nieudane
  Maskowanie zostawia sam znacznik. Rozstrzygnięcie bez pytania: hamulec to sposób MG na
  prowadzenie obrony ręką.
- **„Odwołaj”** kończy starcie; LOD dalej ściga poza walką (na „Tura LOD-a”), a wykrycie się
  nie powtarza — nowe starcie założy dopiero następne nieudane Maskowanie albo inny LOD / Demon.

## Maskowanie piętro po piętrze, próby w jednej Turze (14.11.2026, decyzje MG)

Zastępuje „Maskowanie — raz na Architekturę” z 02.11 (sekcja o jednej próbie niżej).

- **Każde piętro maskuje się osobno.** Nowe piętro to nowa szansa, zamaskowane zostaje
  zamaskowane (także po odłączeniu — rekord w runtime Architektury, klucz postać + scena + piętro).
- **Test:** spór z najczujniejszym żywym Programem tego piętra — Czarny LOD Percepcją + 1k10,
  Demon Interfejsem + 1k10 (podręcznik: „Demony nie mają Percepcji”, s. 212; Interfejsem Demon się
  broni). Netrunner rzuca Interfejs + Dopalacze (Gumka) + 1k10 i musi **przebić** (remis = ślady
  zostają). Piętro bez Programu: **łatwe PT** (MG: „test niech również będzie, tyle że łatwy”) —
  szczebel „Podstawowy” z s. 210 z danych prywatnych, bez nich 6 (`NET_CLOAK_EASY_DV`).
  Wybór Demona i Interfejsu jako jego „Percepcji” to rozstrzygnięcie sesji — do słowa MG.
- **Próby mieszczą się w jednej Turze.** W walce netrunner może wydać na Maskowanie wszystkie
  Akcje Sieciowe tej Tury; pierwszy sukces zamyka piętro jako zamaskowane. Ostatnia Akcja bez
  sukcesu, koniec Rundy albo zejście z piętra — „nieudane”, i żadna późniejsza Tura tego nie
  otwiera. **Poza walką** pobyt na piętrze liczy się jak jedna Tura: tyle prób, ile Akcji
  Sieciowych.
- **Skutek: tylko znacznik dla MG** — „ślady zatarte · wynik” na planie Architektury, a piętra
  z niezatartymi śladami **na czerwono** (zlecenie MG z 14.11, sekcja „Czerwone ślady” niżej;
  tylko MG — gracz widzi na karcie piętra neutralne „maskowanie nieudane” po swojej próbie). Obrona Sieci nie reaguje, a cudzy Zwiad
  przeciw wynikowi Maskowania (s. 199) dalej nie istnieje w kodzie — to informacja dla MG
  (decyzja MG z 14.11: „zostaw, to informacja dla MG”).
- **„Oddaj próby” MG** zeruje nieudane i rozpoczęte Maskowania postaci na scenie; zamaskowanych
  nie rusza (sukces, jak pamięć).
- Kod: `netCloakState`, `netRecordCloak`, `netLeaveCloaks` (`shared/systems/cpred/netrun.ts`),
  `netCloakWatcher`, `netCloakPlan` (`netcombat.ts`), `cloakFloor` (`server/realtime/netrun.ts`).

## Czerwone ślady na piętrach bez Maskowania (14.11.2026, zlecenie i decyzje MG)

- **Czerwone jest piętro opuszczone bez zatartych śladów**: Maskowanie nieudane („ślady:
  nieudane”) albo żadnej próby („ślady: bez maskowania”). Piętro pod stopami czerwienieje
  dopiero, gdy jego szansa przepadła (nieudana ostatnia próba, koniec Rundy) — bez próby jeszcze
  da się je zamaskować. Odłączenie z piętra liczy się jak zejście: po ponownym wejściu piętro
  jest czerwone, chyba że netrunner znów na nim stoi.
- **Wygląd:** plan MG — czerwony brzeg wiersza i czerwona plakietka; w oknie MG także plakietka
  na karcie piętra i czerwona kropka w śladzie runu.
- **Tylko MG** (MG dwa razy zmieniał zdanie 14.11, ostatecznie: „niech gracz nie ma czerwonego
  oznaczenia przypominającego mu o maskowaniu”). `traces` liczy się wyłącznie w ładunku MG —
  do gracza nie wychodzi; gracz ma jak wcześniej neutralne „maskowanie nieudane” po swojej
  przegranej próbie, a o piętrach bez próby nie dostaje nic.
- **Pamięć po odłączeniu:** odwiedzone piętra trafiają do pamięci postaci na scenie
  (`CpredNetMemory.visited`, zapis przy każdym ruchu windy), czyści je „Zapomnij” sceny. Ślad
  gracza się przez to nie wydłuża — `netRestoreRun` ich nie składa do `entered`.
- „Oddaj próby” zeruje nieudane Maskowanie, więc piętro zmienia „ślady: nieudane” na „ślady:
  bez maskowania” — ślady dalej są, a próba wraca.

## Zwiad pokazuje Programy na piętrze niżej (14.11.2026, decyzja MG)

- Wyjście znane ze Zwiadu (albo z pobytu) niesie **nazwy Programów** czekających na tamtym
  piętrze — „▼ Niżej: ☠ Strażnik — Piekielny Ogar”. MG: „zrób jak w podręczniku”; podręcznik mówi,
  że Zwiad „ukazuje, czym ona jest, ale nie podaje Poziomów Trudności” (s. 200), a przykład Ślizgu
  kończy się „czeka tam na niego kolejny Piekielny Ogar. Trzeba było wykonać Zwiad!”. Statystyki
  Programów i PT zostają u MG. Kod: `NetExitView.programs`, `programNameOf` w `netRunView`.
- **Zwiad nie daje dostępu ani kontroli** (sprawdzone 14.11 na prośbę MG): zapisuje tylko
  `scouted`; urządzenia, kamery i figury idą wyłącznie z `controlled`, które pisze udana Kontrola.

## Wyłączone urządzenie: MG przełącza je z mapy, a da się je przeszukać (etap 70f, 14.11.2026)

- **„⏻ Włącz / Wyłącz w Sieci” w menu MG figury urządzenia** — bez runu netrunnera i bez Akcji
  Sieciowej, we wszystkich Architekturach, które figurę wskazują. Od 70c wyłączone urządzenie
  milczy (tura, straż, oczy), a jego stan zmieniał tylko węzeł trzymany przez netrunnera — MG
  nie miał czym obudzić uśpionego drona przy alarmie „Fabryki dronów”. Kod: `net:device:switch`.
- **Urządzenie z naklejką „Wyłączony” przeszukuje się jak ciało** (`searchable` stanu `net-off`)
  — drzazgę z wyłączonej Sowy wyjmuje się łupem bez ręcznego „Unieruchomiony” (pomysł z 31.10,
  `POMYSLY.md`). Dotyczy każdego urządzenia z kartą: wyłączona wieżyczka oddaje też broń
  z magazynkiem, który ma w środku. Przejęte (naklejka „Przejęty w Sieci”) — nie.

## Obrona Sieci rusza się sama, MG trzyma hamulec (etap 70e, 13.11.2026, decyzja MG nr 4 z 11.11)

Cofa decyzję z 15.08 („LOD nigdy nie rusza się sam”, powtórzoną 16.08 dla Demona).

- **Wykrycie Czarnego LOD-u rzuca serwer sam**, gdy netrunner stanie na jego piętrze: ruch (każde
  piętro trasy, tak jak liczy się spotkanie LOD-u), udany Ślizg, podłączenie na piętrze wejścia.
  Ten sam test sporny i ten sam skutek co pod przyciskiem MG (s. 205): przegrana to darmowy atak
  i miejsce na czele kolejki. LOD zgubiony Ślizgiem wykrywa znowu, gdy netrunner wróci na jego
  piętro; zderezowany — nigdy.
- **Demon zaczyna ścigać sam**, gdy netrunner wejdzie na jego piętro **albo przejmie dowolny
  węzeł** jego Architektury (rozstrzygnięcie nr 8 etapu 70 — Demon broni węzłów).
- **Tura w kolejce gra się sama.** Wskaźnik staje na wierszu LOD-u albo Demona → LOD atakuje (raz
  na Rundę), Demon gra całą Turę → kolejka idzie dalej. Wiersz bez czego zagrać (LOD zderezowany,
  już po Turze w tej Rundzie, Demon bez Akcji Sieciowych) oddaje Turę bez wiersza na czacie.
  „Krótka pauza na kości” to kolejka prezentacji klienta, nie zegar serwera: stan kolejki ze
  wskaźnikiem na LOD-zie wychodzi przed jego kośćmi, następny — dopiero za nimi.
- **Poza walką automat tylko wykrywa i budzi.** Bez rund nie ma Tury, więc ścigający LOD poza
  walką rusza się na „Tura LOD-a” jak dotąd. ~~LOD wykryty poza walką nie wchodzi sam do kolejki,
  gdy MG potem założy starcie~~ — **od 14.11 wykrycie samo zakłada starcie z LOD-em w kolejce**
  (sekcja „Wykrycie w Sieci zaczyna walkę” wyżej).
- **Ręka automatu to konto MG** (#39): karta, kości i wiersz dziennika idą kontem MG, także gdy
  wywołał je ruch gracza. Kości widzą MG i netrunner, stół dostaje skrót jak dotąd.
- **Hamulec „Wstrzymaj obronę”** w belce stanu okna runu MG, na Architekturę (zostaje po
  odłączeniu). Wstrzymana obrona zachowuje się jak przed etapem; przyciski MG działają w obu
  trybach. **Zdjęcie hamulca niczego nie nadrabia** — wskaźnik stojący na LOD-zie czeka na
  „Następna tura” MG (inaczej jego klik przeskoczyłby następnego), a LOD czyhający pod stopami
  netrunnera wykryje dopiero przy następnym wejściu na piętro albo na klik MG. Gracz nie wie, czy
  obrona działa sama.
- **„Następna tura” MG z kolejki sprzed kości jest odmową** („Kolejka poszła już dalej — poczekaj,
  aż opadną kości…”). Klient pokazuje kolejkę za kośćmi, więc Tura LOD-u toczy się u MG jeszcze
  kilka sekund po tym, jak wskaźnik stanął na następnym — klik w to, co MG widzi, przeskoczyłby
  kogoś, kto nie zagrał. Dotyczy każdego kroku MG, nie tylko Sieci (tak samo chroni przed klikiem
  po rzucie gracza, który zdążył skończyć turę).

## Sieć ze sceny wg rodzaju, urządzenia dopiero na węźle, obszar straży od figury (etap 70d, 13.11.2026)

Decyzje MG z 11.11 (nr 2, 3, 5, 8) i rozstrzygnięcia bez pytań z sesji — do słowa MG.

- **Lista urządzeń dopiero na piętrze węzła** (decyzja nr 2, wdrożona w 70a): od podłączenia
  okno SIEĆ nie mówi o urządzeniach nic, na piętrze węzła — nazwa stołu i rodzaj, władzę daje
  Kontrola. Cofa decyzję nr 4 z 28.10 (etap 62: lista od podłączenia zdradzała skalę obrony).
- **Sieć ze sceny ma węzły wg rodzaju** (decyzja nr 5): wejście → „Monitoring” (kamery,
  czujniki) → „Obrona” (wieżyczki, drony, roboty) → „Instalacje” (terminale, strefy
  środowiskowe, drzwi „Sterowane z Sieci”). Węzeł powstaje tylko z urządzeniem; nadmiar ponad
  6 idzie do „Monitoring 2” itd. Siłę netrunnera MG ustawia liczbą węzłów — każdy działa raz na
  Turę. Scena bez urządzeń to samo wejście (wcześniej pusty węzeł do zdobycia).
- **Strefy i drzwi dochodzą same tylko do Sieci złożonej ze sceny.** Do Architektury z edytora
  (np. „Brama” z T5) dalej dochodzą wyłącznie figury z ikoną (jak w 62); strefę wiąże tam pole
  „Węzeł kontrolny” karty strefy (#33), drzwi — urządzenie „Drzwi lub winda”. Dzięki temu ręcznie
  zbudowana Sieć nie zmienia się od tego, co MG dołoży na mapie.
- **Strefa środowiskowa wchodzi do Sieci ze sceny sama**, chyba że MG zaznaczy na karcie
  „Poza Siecią”; drzwi, okno i brama — tylko z przełącznikiem „Sterowane z Sieci” na karcie
  otworu (domyślnie wyłączony). Odhaczenie zdejmuje urządzenie z węzła, węzeł zostaje (pozycje
  pięter trwających runów).
- **Strefę netrunner tylko wyłącza i włącza** (decyzja nr 3) — klikiem w strefę na mapie
  (okienko strefy) albo z paska „Oczy i urządzenia”; bez odpalania i przepustek. Strefy
  rozbrojonej na miejscu z Sieci się nie uzbroi (66e pkt 27).
- **Okienko strefy pyta przy każdym kliku w zauważoną strefę i przy marszu przez nią** —
  także w cudzej turze i u podłączonego netrunnera (wtedy „Wejdź mimo to” kończy się zwykłą
  odmową). Strefa, na której figura już stoi, nie pyta. Pytanie nie zdradza niczego, czego
  gracz nie ma: zna wyłącznie strefy widoczne albo przez siebie zauważone.
- **Obszar straży rysuje się od figury urządzenia** (decyzja nr 8): menu wieżyczki, drona,
  drona naziemnego i robota → „🛡 Obszar straży…” (wpis stanowiska albo aktywnego systemu, PT
  zauważenia, „Narysuj”). Narzędzie „Strefy bronione” ma już same systemy środowiskowe. Obszar
  startuje ukryty — gracze widzą wieżyczkę, nie jej pole ostrzału. **Wpis daje figurze Wartość
  bojową, RUCH i PW** (figura bez paska PW dostaje PW wpisu), **broni nie** — tabela s. 213–214
  opisuje broń zdaniem („zwykle jedną z poniższych”), więc lufę MG ustawia w „Edytuj…”.
- **„Postaw figurę urządzenia”** na starej strefie drona albo stanowiska bez figury: figura
  z ikoną (stanowisko — wieżyczka, dron z nazwy wpisu) na środku strefy, z PW strefy; strefa
  zostaje jej obszarem straży. System środowiskowy figury nie dostaje.

## Przejęty dron jeździ, urządzenia pożyczają oczy, wyłączone milczą (etap 70c, 13.11.2026)

Rozstrzygnięcia bez pytań z projektu etapu (nr 3, 5 i 6) i drobniejsze z sesji — do słowa MG.

- **RUCH drona = metry jednej Akcji Ruchu** (RUCH × 2, jak u postaci): z wpisu systemu obronnego
  („RUCH 8”, ta sama kolejność źródeł co Wartość bojowa: obszar straży, potem wpis urządzenia),
  a bez wpisu z karty figury (`readSheetMoveBudget`). Bez Biegu. Dron bez RUCH-u stoi z odmową
  `NET_DEVICE_NO_MOVE` i podpowiedzią dla MG. Kilka marszów jednej aktywacji płaci z tych samych
  metrów; strzał nie zamyka jazdy (dron może strzelić, a potem podjechać). Poza walką bez limitu.
- **Przejęty dron nie odpala stref, nie rzuca Percepcji w drodze i nie zakłada walki
  z zauważenia** — jest okiem i lufą netrunnera, nie postacią. Ściany, mgła i figury na drodze
  zatrzymują go jak każdego.
- **Wieżyczka i dron pożyczają oczy kołem** na zasięg wzroku figury (kamera dalej stożkiem 90°),
  w ciemności też, tylko netrunnerowi. Bez pamięci mapy, bez otwierania drzwi. Dron planuje
  marsz własnymi oczami (bariery, które widzi tylko on, trafiają do planera operatora).
- **Urządzenie wyłączone w Sieci** (stan w Architekturze, przeżywa odłączenie): naklejka
  „Wyłączony” (szara figura na mapie), tura oddana z wierszem „wyłączona w Sieci”, obszar straży
  milczy, nie patrzy na skradających się i nie zakłada walki z zauważenia. Włącza się je
  z paska „Oczy i urządzenia” w oknie SIEĆ (Akcja Sieciowa jak każda obsługa).
- **Księga „węzeł raz na Turę” zeruje się z początkiem i końcem walki** — liczy rundy jednej
  walki, a każda zaczyna od rundy 1.

## Przejęte urządzenie: aktywacja to pełna tura, strzał Wartością bojową (etap 70b, 12.11.2026, decyzje MG z 11.11)

- **Jedna Akcja Sieciowa aktywuje urządzenie na Turę: ruch i jedna czynność** — zamiast RAW
  „obsługa każdej rzeczy … wymaga użycia osobnej Akcji Sieciowej” (s. 199). Węzeł dalej działa
  **raz na Turę** (s. 199 zostaje): drugie urządzenie tego samego węzła w tej rundzie odmawia,
  a siłę netrunnera MG ustawia liczbą węzłów. Poza walką nie ma rund, więc nic nie kosztuje.
  Kod: `netDeviceUse` (`shared/systems/cpred/netdevices.ts`), zapis `deviceTurns` w runie.
- **Przejęte urządzenie strzela własną Wartością bojową, nie Umiejętnością netrunnera** — wbrew
  s. 213 („rzucając na Umiejętności tego Netrunnera”). Źródła po kolei: wpis systemu obronnego
  obszaru straży przypiętego do figury → wpis urządzenia w Architekturze → Wartość bojowa
  w bloku statystyk figury → figura z pełną kartą NPC-a strzela Umiejętnością broni z własnej
  karty. Brak którejkolwiek liczby to odmowa `NET_DEVICE_NO_COMBAT_VALUE` bez kosztu
  (podpowiedź dla MG), nie strzał zerem. Bez Szczęścia netrunnera — to nie jest Test postaci.
- **Figura przejęta nie gra własnej tury i jej obszar straży milczy**, dopóki ktoś trzyma jej
  węzeł — także NPC-netrunner MG. Zostaje w kolejce, a wskaźnik ją przeskakuje z wierszem
  „Tura oddana — przejęta w Sieci”. O tym, czy wrogowie ją ostrzelają, decyduje MG.
- **„Wyłącz” oddaje figurę** — wyłączone urządzenie wypada spod ręki netrunnera (bez naklejki
  „Przejęty w Sieci”, bez wiersza „wraca do obrony”) i włącza się je z okna SIEĆ (od 70c
  z paska „Oczy i urządzenia”, z naklejką „Wyłączony” na figurze).
- **Strzał z okna SIEĆ nie istnieje** (`NET_DEVICE_FIRES_FROM_MAP`): cel z listy, płatne pytanie
  o osłonę po fakcie i „Strzelaj mimo osłony” zniknęły. Osłona pyta przed zapłatą, jak u strzelca
  przy mapie. Zastępuje „strzał z urządzenia Umiejętnościami netrunnera” z etapu 26d niżej;
  strzał Demona i strefy (Wartość bojowa, `fireDevice`) bez zmian.

## Zwiad widzi tylko jedno piętro w dół (10.11.2026, decyzja MG)

- **Zwiad odsłania wyłącznie piętra tuż pod netrunnerem** — kolejne piętro pnia i szczyt każdej
  odnogi odchodzącej od tego miejsca — zamiast RAW „tyle pięter, ile wyniósł Test” (s. 200).
  Przy wynikach 12+ RAW odsłaniało cały szyb, a Zwiad ma odpowiadać na jedno pytanie: co czeka
  piętro niżej i czy tam wchodzić. PT dalej nie przychodzi (rodzaj, etykieta, programy tak —
  nazwy Programów dopiero od 14.11, wcześniej wpis to obiecywał, a kod ich nie wysyłał).
  Z RAW zostaje blokada hasłem: stojąc na **niezłamanym** haśle, Test musi dorównać jego PT,
  żeby zobaczyć cokolwiek pod nim. Kod: `netScoutReveal` (`shared/systems/cpred/netrun.ts`).
  Zastępuje punkt (2) „Zwiad liczy piętra wszerz” z etapu 26b niżej.

## Strefa broniona odpala tylko na figurach graczy (07.11.2026, decyzja MG przy „Po zamknięciu”)

- **Strefa broniona (podłoga, system środowiskowy) uruchamia się wyłącznie marszem figury
  gracza.** NPC-e (personel zna swoją podłogę) i przestawienie figury ręką MG nigdy jej nie
  odpalają — MG może poprawić ustawienie bez skutków, a ochrona „Pod Neonem” chodzi korytarzem
  przed gabinetem. **Wdrożone 07.11 (siódma sesja):** odpala tylko marsz gracza jego
  własną figurą; powtórka na koniec Tury (podłoga elektryczna) też tylko figurom graczy.

## Taran, skręt przed przeszkodą i spóźniona inicjatywa (06.11.2026, decyzje MG po „Zastawie”)

- **Jeden taran na turę kierowcy** (zasada domowa, w każdym pościgu). Podręcznik limitu nie
  podaje, ale Nitro daje 10 m, a taran przepycha auto o ok. 2 m — w „Zastawie” jedna Akcja Ruchu
  zrobiła z furgonu wrak trzema taranami. Po taranie pasek „Zderzenie” daje tylko „Zatrzymaj się
  przed”, a serwer odmawia drugiego (`RAM_USED`). Limit liczy się tylko w turze kierowcy: ręka MG
  poza nią (poprawki) i wymuszona odpowiedź na przeszkodę przed zderzakiem (pasek po dryfie) go
  nie zużywają ani nie sprawdzają.
- **Udany Gwałtowny skręt z menu auta omija przeszkodę MG stojącą wprost przed zderzakiem**
  (rozstrzygnięte bez pytania, zaległość 66d) — tak jak odpowiedź „Gwałtowny skręt” na pasku,
  tylko za Akcję. Wcześniej skręt z menu tylko zużywał Akcję, a notatki obu wzorców pościgu
  zakładały, że omija. Porażka bez zmian: utrata kontroli, przeszkoda dojeżdża dryfem. Auta i piesi
  przed zderzakiem zostają — dla nich jest taran albo jazda obok.
- **Spóźniony rzut inicjatywy w rundzie 1 gra zaraz po bieżącej turze.** MG kliknął „Rozpocznij
  walkę”, zanim gracz rzucił, a rzut wyszedł wyżej niż grający — figura nie traci rundy 1: dostaje
  turę jako następna, potem kolejka wraca tam, dokąd szła. Tylko runda 1 i tylko figury (Demon
  i Czarny LOD grają z biegu Sieci); od rundy 2 zwykła kolejność.
- **Kadr gracza w pościgu bez zmian** — gracz sam oddala widok kółkiem, gdy furgon stoi poza
  kadrem (MG, zaległość 04.11).

## Warsztat: ulepszenia auta za ed i naprawa (etap 68, 06.11.2026, decyzje MG)

- **Cena ulepszenia = cena pasma z s. 163 × 3** — Moto 1 „Bardzo kosztowne” 1000 → **3000 ed**,
  reszta „Luksusowe” 5000 → **15 000 ed** (cennik ×10 dawał opancerzenie droższe od auta).
  `CPRED_VEHICLE_UPGRADE_PRICE_SCALE` w `vehicle-upgrade-shop.ts`.
- **Poziom sklepu z pasma:** Moto 1 → 3 (Wojskowe), reszta → 4 (Czarny rynek) — „bardzo rzadko
  pojawiają się w sprzedaży”. MG przestawia pojedynczy wpis w Kompendium.
- **Montaż od razu po zapłacie**, bez Testu i bez czasu; reguły montażu jak w oknie MG.
- **Tylko do własnych aut spoza Taboru Rodziny** — auto Rodziny ulepsza się za Moto. Naprawa auta
  z Taboru jest dozwolona („zwykłe naprawy należą do obowiązków Nomady”, s. 162). *(Od 71c1,
  15.11: także auto dołożone do Taboru przez Głowę Rodziny — ono ma „Rodzina montuje”.)*
- **Naprawa tylko w warsztacie** (handlarz z kategorią „Ulepszenia pojazdów”): **50 ed za
  brakujący PUK** kadłuba, szyby w cenie, same szyby — jak 1 PUK, wrak też. Auto wraca od razu;
  PT i czas z „Naprawy pojazdów” (s. 147) stoją tylko na karcie czatu. Podręcznik ceny naprawy nie
  podaje. Stopień uszkodzeń (zasada domowa): PUK 0 — zniszczony, połowa PUK albo mniej — poważne,
  reszta — lekkie. *(Od 71c2, 15.11: obok warsztatu naprawa Testem — „Napraw (Test)” na karcie auta.)*
- **Demontażu przez gracza i odkupu ulepszeń nie ma** — zdejmuje MG w oknie pojazdu, bez zwrotu.

## Ręka MG, „Cofnij” obrażeń i karty NPC-ów kopii sceny (05.11.2026, decyzje MG)

- **Ręka MG jest darmowa.** Przeciągnięcie figury przez MG — także w jej turze i także wysiadka
  z auta na jezdnię — nie zdejmuje jej metrów ani nie pyta o przekroczenie budżetu: MG koryguje
  stół, nie gra za figurę. Marsz MG klikiem płaci jak dotąd (tak MG prowadzi NPC-a w jego turze).
- **Po „Cofnij” na karcie obrażeń przyciski „Na kubek” / „Zastosuj” wracają** — to droga
  przeniesienia trafienia na inny cel (także przy kadłubie auta). Ryzyko podwójnego zastosowania
  MG przyjmuje.
- **Karty NPC-ów zostają w kampanii po usunięciu kopii sceny ze wzorca** („mogą się przydać”).
  Druga kopia wzorca dokłada drugi komplet kart (Wolt, Kłoda, …) — to nie błąd.
- **NPC-e wzorca „Ostatni zjazd” mają EMP co najmniej 3** — przy EMP 2 lista MG świeciła „NA
  GRANICY” przy zwykłych gangerach.

## Rama pościgu i auto bez kierowcy (05.11.2026, decyzje MG)

- **Przewijana droga pod autem znaczy, że auto jedzie.** Kadr jedzie z autem drużyny: dopóki któreś
  auto drużyny ma kierowcę, droga przewija się z tempem sceny, a auto NPC-a bez kierowcy odpływa
  w tył; gdy auto drużyny stoi (pusty fotel kierowcy, kierowca leży, zgaszone, wrak), stoi też
  droga, a jadące auta odjeżdżają do przodu (w walce dryfem, `(prędkość − rama) / 4`). Poza walką
  nikt nie dryfuje — auto bez kierowcy stoi, a stojące auto drużyny zatrzymuje bieżnię.
- **Kierowca znika albo pada — auto powoli zwalnia.** Pęd z ostatniej rundy spada co rundę o połowę
  (Ruch 20: 10 → 5 → 0; Ruch 40: 20 → 10 → 5 → 0), poniżej 4 auto staje. Podręcznik każe autu bez
  kierowcy po prostu „zwolnić i się zatrzymać” bez liczb — połowa na rundę to zasada domowa.
  Utrata kontroli to co innego: kierowca jest, auto jedzie swoim Ruchem.
- **Jadące auto, które dryfem dojedzie do stojącego, pyta kierowcę o skręt albo taranowanie** —
  tak samo jak stojące auto, które dryfuje przed jadące (03.11). Bez kontroli wjeżdża od razu.

## Przegląd mechanik pościgu (03.11.2026, decyzje MG)

- **Test zwykłej jazdy idzie w ramach Akcji Ruchu, nie Akcji.** Słaby kierowca (REF +
  Prowadzenie ≤ 9) dalej strzela jedną ręką albo odpala Nitro w tej samej turze — wcześniej Test
  zabierał Akcję, więc Nitro było dla niego martwe (po Nitro jazda odmawiała). Test rzuca serwer
  raz na turę przy pierwszym ruchu auta, tylko gdy ten ruch mieści się w budżecie; turę z Testem
  pamięta budżet (`drivingTested`). Manewr dalej go zastępuje.
- **Taranowanie pieszego bije tylko pieszego.** Auto nie traci PUK, a jadący nie dostają
  „Odgięciowego urazu kręgosłupa szyjnego” — 6k6 i Rana zostają przy zderzeniu z autem
  i przeszkodą.
- **Auto stojące na drodze (wrak, zgaszony silnik) jest jak przeszkoda z 65e.** Dryfuje w tył
  z pełnym tempem; gdy trafi na zderzak jadącego auta, staje przy nim i czeka na jego kierowcę:
  Gwałtowny skręt (PT 13, porażka — utrata kontroli i zderzenie) albo taranowanie (oba auta po
  6k6). Auto bez kontroli (pusty fotel, kierowca leży, utrata kontroli z poprzedniej rundy)
  wjeżdża w nie od razu. Po skręcie i po zderzeniu stojące auto ląduje za tylnym zderzakiem.
  Wcześniej przyklejało się do zderzaka bez obrażeń i jechało z autem rundę po rundzie. Wolniejsze,
  ale jadące auto dalej staje przy zderzaku bez pytania (65d2).
- **Taranowany wrak ląduje za autem, które przez niego przejechało** — jak przeszkoda. Podręcznik
  każe jechać dalej po zniszczonym pojeździe, a na bieżni bryły nachodziły na siebie.
- **Tempo, dryf i budżet zostają, jak są (decyzja MG 12 z 30.10 potwierdzona).** Kierowca, który
  co turę jedzie całym Ruchem do przodu, równoważy dryf: kompakt (Ruch 20) przy tempie 40 trzyma
  się w kadrze, a sportowy (40) zyskuje 10 kratek na rundę. Wolne auto odpada, gdy kierowca nie
  jedzie (albo strzela zamiast jechać — wtedy płaci tylko dryf).

## Przeszkody, ruch uliczny i kolczatka (etap 65e, 31.10.2026)

- **Przeszkoda stoi na drodze, więc w kadrze jedzie w tył o `tempo / 4` kratek na rundę**
  (decyzja MG 12). Ruch uliczny też: auta cywilne nie jadą swoim tempem, tylko stoją względem
  drogi jak wraki. Zderzenie liczy się ruchem względnym (`chaseObstacleSweep`): auto
  z Ruchem 40 zbliża się do przeszkody o 10 kratek na rundę, a auto stojące na drodze
  (zgaszone, wrak) nigdy w nią nie wjedzie. Przeszkody są tylko w walce — poza nią nie ma rund.
- **Przeszkoda na torze staje przy zderzaku i czeka na kierowcę bez limitu czasu.** Wybór
  („Gwałtowny skręt” — Manewr PT 13 z tabeli s. 192, albo „Taranuj”) nic nie kosztuje:
  przychodzi na początku rundy, poza czyjąkolwiek turą, tak jak Manewr na wezwanie MG (65d2).
  Do odpowiedzi kierowca-gracz nie przesunie auta (`OBSTACLE_PENDING`), a przeszkoda jedzie
  przy zderzaku. Za kierowcę-NPC-a odpowiada MG (pasek i menu przeszkody).
- **Auto bez kontroli wjeżdża w przeszkodę samo** — pusty fotel kierowcy, kierowca leży albo
  utrata kontroli. Nikt nie skręca.
- **Barykada to beton — nie do rozbicia** (decyzja MG z 04.11.2026). Taranowanie albo nieudany
  Gwałtowny skręt kończy się wrakiem auta (PUK 0, także z Pługiem) i Raną Krytyczną dla
  jadących; beton nic nie bierze i zostaje na drodze (dryfuje dalej, może zatrzymać następne
  auto, tego samego już nie — `passed`). Podręcznik (s. 192) liczy przeszkodzie PW jak osłonie.
- **Przeszkoda reaguje tylko z pierwszym autem, potem znika** (decyzja MG z 04.11.2026) — po
  udanym skręcie, ale też po zderzeniu, którego nie rozbiła: auto ją odepchnęło i jedzie dalej.
  Podręcznik każe taranującemu stanąć przy przeszkodzie, która przetrwała (s. 192), ale na
  bieżni auto, które stanie, wypada z kadru — więc szkodą są kości, a nie zatrzymanie. Do 04.11
  minięta przeszkoda stawała za tylnym zderzakiem i lądowała na aucie jadącym tuż za nim.
  Kolczatka tak samo: rzuca na pierwsze auto, które na nią wjedzie, i znika (wcześniej jechała
  dalej i wyglądała, jakby tkwiła przy aucie).
- **Taranowanie przeszkody to 6k6 w jej PW bez OB i bez „Cofnij”**, jak w osłonę (s. 179):
  przeszkoda to chwilowa dekoracja walki, nie wiersz z historią. Auto bierze swoje 6k6 jak przy
  taranowaniu auta (przez OB kadłuba, z „Cofnij”), Pług bojowy działa — przeszkoda zawsze trafia
  w przód. PW 0 — przeszkoda rozbita, znika z drogi.
- **Wyrzutnia kolczatki: jedna kolczatka na każde wykupienie, na pościg.** Podręcznik mówi
  tylko, że kolejne wykupienie „zwiększa liczbę kolczatek”, a uzupełnić ich nie można w czasie
  jazdy — VTT liczy je jak zbiorniki Nitro (`SceneVehicle.spikesUsed`). Zrzut za Akcję
  kierowcy, w walce. Uzupełnia je ten sam przycisk MG co Nitro (03.11).
- **Kolczatkę przejeżdża każde auto z oponami raz** — także kierowca-gracz w swojej turze
  (`chaseSpikesCrossed`), z wyjątkiem auta, które ją zrzuciło. Test Prowadzenia PT 17 rzuca
  serwer; auto bez zdolnego kierowcy Testu nie ma i bierze 4k6 w słaby punkt (po OB ×2).
  Poduszkowiec, łódź i maszyny latające kolczatki nie czują.

## Manewr, taranowanie i broń pokładowa (etap 65d2, 31.10.2026)

- **Manewr płaci Akcją, a Akcją Ruchu jest sama jazda.** „Manewr zabiera obie Akcje” (s. 192):
  VTT księguje Akcję (`vehicle-maneuver`), a kierowca dalej ciągnie auto z budżetu Akcji Ruchu.
  Ta jazda to sam Manewr, nie osobny ruch. Strzelać już nie może. Manewr zastępuje Test zwykłej
  jazdy w tej turze.
- **Manewr na wezwanie MG nic nie kosztuje**, za kierowcę-NPC-a MG rzuca bez kosztu. To MG
  zdecydował, że sytuacja go wymaga („MG decyduje, kiedy…”). Często woła o niego w cudzej
  turze, na przykład gdy coś wyskoczy przed auto.
- **Utrata kontroli trwa do następnej rundy**, nie „do końca tury”. To ta sama flaga co po
  oblanej zwykłej jeździe (65c). MG wyznacza drogę, przeciągając auto bez budżetu. Gdy trafi
  w coś po drodze, dostaje pytanie o taranowanie jak kierowca.
- **Zderzenie liczy się tylko w walce.** Poza walką MG ustawia szyk i auta przechodzą przez
  siebie. W walce droga auta przez inne auto albo pieszego to pytanie „Taranuj / Zatrzymaj się
  przed”. Bez taranowania auto staje przy przeszkodzie i płaci tylko za dojazd. Z taranowaniem
  płaci za całą drogę, a jeśli zderzenie je zatrzyma, reszta Akcji Ruchu przepada.
- **Dryf nie przepycha auta przez auto.** Auto, które na początku rundy dryfuje na inne, staje
  przy jego zderzaku bez obrażeń (od 03.11 wyjątek: auto stojące na drodze — wpis na górze). To nie taranowanie, tylko szybszy dogania wolniejszego. Czy
  w nie wjechać, decyduje kierowca w swojej turze. Auta dryfują po kolei (kolejność postawienia).
- **6k6 taranowania idzie przez OB kadłuba** jak każde trafienie w auto (pieszy — przez
  pancerz). Podręcznik mówi tylko „otrzymujecie po 6k6 obrażeń”. Kości lecą jawnie na czacie,
  a obrażenia rozlicza droga „Zastosuj” z „Cofnij”.
- **Rana „Odgięciowy uraz kręgosłupa szyjnego” idzie do każdej figury z kartą** w obu autach.
  Taranujący z Pługiem przodem jest z niej zwolniony. Figura bez karty rany nie ma gdzie
  zapisać. Rana bez bonusowych obrażeń: to nie Krytyk z kości.
- **Unik pieszego rzuca serwer od razu**, jak auto-unik z 63b. „Wskoczenie na pojazd” po
  udanym Uniku albo po trafieniu z ≥ 1 PW nie ma gestu: MG sadza figurę w fotelu ręką.
- **Osłony z mapy (42b) się nie taranuje** — na bieżni ich nie ma. Przeszkody drogowe z PW
  przychodzą w 65e.
- **Broń pokładowa przeładowuje się za darmo do pełna, także rakiety**, na postoju (silnik
  zgaszony albo droga stoi), w walce za Akcję. To zasada domowa z 23.10 (naboje bez dna)
  rozciągnięta na zasobnik rakiet, który nie ma skąd brać rakiet z ekwipunku kierowcy.
- **Miotacz ognia i broń biała pokładowa razą na każdą stronę.** Podręcznik montuje je
  „z przodu, z boku lub z tyłu”, ale VTT nie pamięta strony montażu. Karabin maszynowy
  i rakiety razą tylko „cele przed pojazdem”: przednia ćwiartka bryły (`vehicleSideFacing`).
- **Stanowisko bardzo ciężkiej broni nie ma osobnej mechaniki.** Pasażer i tak strzela
  z fotela własną bronią dwuręczną, przeładowuje w jeździe, a szyba kuloodporna chroni go jak
  każdego pasażera (65d1). Od 03.11 (decyzja MG) okno pojazdu pokazuje je jako „— opis”
  (`combat: false`), żeby nie udawało liczonego ulepszenia.

## Ostrzał pojazdów (etap 65d1, 31.10.2026)

- **Szyby kuloodporne to cztery burty, nie każde okno.** Podręcznik (s. 163) mówi „każde okno
  przyjmuje obrażenia osobno”, ale auto na bieżni nie ma okien w geometrii. VTT trzyma PW szyb
  na burtę (przód, tył, lewa, prawa — `Vehicle.system.windows`), a strzał w pasażera idzie przez
  burtę zwróconą do strzelca (`vehicleSideFacing`). Strzelec w tym samym aucie szyby nie ma.
- **Szyba zatrzymuje strzał jak osłona**, z kartą „Ostrzelaj szybę / Strzelaj mimo szyby”
  (16c). „Mimo szyby” to decyzja stołu (szyba opuszczona, cel się wychylił). Granat leci nad
  szybą jak nad osłoną; wybuch dziś bije figury w obszarze, a samego auta nie rusza (`POMYSLY.md`).
- **OB kadłuba się nie zdziera.** Ablacja (s. 186) jest regułą pancerza postaci; o pojeździe
  podręcznik nie mówi, więc Opancerzenie kadłuba zostaje OB 13 do końca. Broń biała bierze
  połowę OB kadłuba jak pancerza (s. 176).
- **Cios bronią białą w jadące auto ma PT 13 także bez Celowania.** Podręcznik daje PT 13
  wprost tylko ciosowi w słaby punkt („…a ponadto modyfikator −8 wciąż ma zastosowanie”);
  zwykły cios w jadące auto nie może być łatwiejszy. W stojące (zgaszony silnik, stojąca droga,
  wrak) cios trafia zawsze — w VTT to PT 0.
- **Ulepszone zespolenie: kierowca unika *zamiast* pasażera.** „Unika ataków za siebie,
  pasażera i motocykl” (s. 165) — VTT woła o Unik kierowcę (`RollAttackMeta.evasionBy`), także
  przy strzale w pasażera, zamiast dawać dwa Uniki do wyboru.
- **Wrak to PUK 0, nie osobny stan.** Kolumna `SceneVehicle.status` mówi tylko, czy auto jest
  w kadrze; widok liczy `wrecked` z PUK. Wrak dryfuje w tył z pełnym tempem jak zgaszone auto,
  figury zostają w fotelach, silnika się nie uruchomi (`VEHICLE_WRECKED`). „Cofnij” trafienia
  albo PUK ustawione przez MG przywracają jazdę.

## Jazda w pościgu (etap 65c, 31.10.2026)

- **Od 19.11 (etap 72b1) nie obowiązuje — zastępuje go „Jazda w pościgu: prędkość, pasy i kadr”
  na górze pliku.** Zostaje dla historii: **Tempo, dryf i budżet `Ruch / 4` to zasada domowa** (decyzja MG 12 z 30.10). Podręcznik
  (s. 192) każe kierowcy jechać „jak Akcją Ruchu na piechotę, tylko z Ruchem pojazdu”, czyli
  Ruch × 2 m — na bieżni 40 Ruchu to 80 kratek, więcej niż cała mapa. VTT liczy więc Akcję Ruchu
  kierowcy jako `Ruch / 4` kratek, a każde auto na początku rundy (od drugiej) dryfuje
  o `(Ruch − tempo) / 4` kratek: wolniejsze od tempa pościgu zostaje w tyle, szybsze ucieka.
  Kratki, nie metry — skala sceny (domyślnie 1 m) nic tu nie zmienia.
- **Uruchomienie przenosi kierowcę na początek kolejki inicjatywą „najwyższa + 1”** (jak LOD,
  s. 205), a kolejka wraca potem do tego, kto był następny. Auto postawione przez MG już pracuje,
  więc w zwykłym pościgu nikt nie „startuje” i kolejka zostaje taka, jaką wyrzuciły kości.
- **Test zwykłej jazdy rzuca serwer przy pierwszym ruchu auta w turze**, nie na początku tury —
  kierowca, który nie rusza auta, nie rzuca. Od 03.11 w ramach Akcji Ruchu (wpis na górze).
  Bez Szczęścia. Porażka to utrata kontroli do następnej rundy (auto prowadzi MG); zderzenia
  i taranowanie dochodzą w 65d.
- **Ręka na kierownicy odmawia broni dwuręcznej** (`WHEEL_TWO_HANDED`); świadome „zdjęcie ręki”
  z utratą kontroli na początku następnej tury (s. 191) nie ma osobnego gestu.
- **Nitro: zbiornik na pościg, nie na dobę** — liczy go auto na scenie (`SceneVehicle.nitroUsed`),
  a nie zegar świata; nowe postawienie auta napełnia zbiorniki. **Od 03.11 (decyzja MG)** „raz
  dziennie” rozstrzyga MG przyciskiem „Uzupełnij Nitro i kolczatki” w menu auta
  (`vehicle:refill`) — także w walce, bez kosztu.

## Pojazdy i Tabor Rodziny (etap 65a, 30.10.2026)

- **Jacht, żyrokopter, helikopter, AV-4, AV-9 i Aerozep wycięte z gry (decyzja MG z 10.11.2026)** —
  znikają z Kompendium, z „＋ Dodaj pojazd” MG i z Taboru Rodziny (Nomada nie dostanie ich z Moto,
  choć s. 162 na to pozwala). Wycina je `withoutRetiredVehicles` przy ładowaniu katalogu z plików;
  własny wpis MG o tym samym id wraca. Łodzie (skuter wodny, motorówka, łódź kabinowa) zostają
  i mają modele z grafikami.
- **Wzmocniona konstrukcja dokłada 20 także do bieżących PUK (decyzja MG z 03.11).** Podręcznik
  mówi tylko „+20 PUK”; wcześniej rósł sam sufit i auto na pełnych PUK po montażu wyglądało na
  rozbite (45/65). Demontaż zabiera 20 (najniżej 1), wrak zostaje wrakiem, uszkodzenia sprzed
  montażu zostają. Działa w oknie MG (na oczach MG, przed zapisem) i przy wierszu z Taboru.

- **Ulepszenie foteli raz w motocyklu, skuterze i żyrokopterze.** Plik etapu mówił „nie
  w motocyklu”, a s. 163 mówi „kilkukrotnie dla większości pojazdów prócz motocykli…” i wspomina
  kosz motocyklowy — więc małe pojazdy biorą je raz (tak samo Skrytki przemytnicze).
- **Zakwaterowanie bez wymogu Wzmocnionej konstrukcji w kompakcie i sportowym** — VTT nie odróżnia
  tych dwóch od supersamochodu po rodzaju; wymóg stoi w opisie ulepszenia, pilnuje go MG.
  Zakwaterowanie wolno w każdym samochodzie, łodzi i statku powietrznym (podręcznik: AV-4,
  aerozep, łódź kabinowa, jacht, samochód).
- **Rodzaje drobniejsze niż tabele s. 190–191** (motocykl, samochód, skuter wodny, łódź,
  żyrokopter, statek powietrzny) — tak dzielą je wyjątki ulepszeń.
- **Kategoria wiersza Taboru = próg pojazdu z s. 162 albo „Wymagany Poziom Moto” ulepszenia** —
  gracz jej nie wpisuje; stary wiersz z samą nazwą dostaje pojazd zgadnięty z nazwy (najdłuższa
  nazwa z katalogu, potem słowo-wskazówka, na końcu kompakt z notką dla MG).
- **Ceny pojazdów w katalogu to 0,3 ceny podręcznika (decyzje MG z 31.10.2026)** — wcześniej szły
  cennikiem domowym ×10 jak sprzęt trwały (etap 47a); kompakt 9000 ed, motocykl 6000 ed.
  `CPRED_PRICE_SCALE_VEHICLE` w `pricing.ts` — jedyny mnożnik ułamkowy, kwoty się zaokrągla.
  Pojazdu i tak nie kupuje się w VTT (`POMYSLY.md`).

## Skradanie się (etap 61, 28.10.2026)

- **Tryb, nie pojedynczy Test.** Podręcznik mówi tylko „Skradanie się (ZW) przeciw Percepcji”
  (s. 130); VTT robi z tego tryb z jednym rzutem gracza (wynik = PT dla każdego NPC-a, który go
  zobaczy) i jednym rzutem każdego patrzącego na jedno skradanie (decyzje MG 1 i 3).
- **Modyfikator MG przy zgodzie** to cała „trudność” — VTT sam nie dolicza ciemności, hałasu ani
  odległości. NPC na scenie bez ścian widzi całą mapę; zasięg ogranicza mu `visionRange` figury.
- **Atak z ukrycia bez Uniku celu** — zasada domowa (decyzja MG 6). Przy walce wręcz zostaje
  bierne PT z ZW + Unik celu; znika tylko rzut Uniku. Wybuch zostaje przy odskokach.
- **W walce wejście kosztuje Akcję** (decyzja MG 4) — podręcznik nie ma takiej Akcji; ruch bez
  kary.
- **NPC bez karty nie patrzy** — nie ma czym rzucić Percepcji (jak ukryta figura bez PT w 58d).

## Sieć i walka — czytanie RAW

- **Przejęta kamera widzi w ciemności (07.11.2026, decyzja MG po oględzinach „Fabryki dronów”).**
  Podręcznik o widoczności przez kamery milczy. W ciemnej hali stożek kamery pokazywał czerń:
  pożyczony wzrok widział tylko miejsca oświetlone, więc podgląd nic nie dawał, a przejęte drony
  nie miały w co strzelać (cel wybiera się spośród figur, które widzi gracz). Teraz stożek
  przejętej kamery widzi na jej zasięg (`visionRange`) także w ciemności, tylko dla netrunnera,
  który trzyma węzeł. Kamera dalej nie świeci nikomu innemu, nie otwiera drzwi, nie planuje
  marszu, nie zasila pamięci mapy i nie zakłada walki z zauważenia.
- **Strzał z urządzenia, któremu odmówi ścieżka ataku, nie kosztuje Akcji Sieciowej (07.11.2026,
  bez pytania).** Brak linii strzału, cel poza zasięgiem, pusty magazynek: strzelec przy mapie
  dostaje taką odmowę za darmo, a netrunner nie ma podglądu geometrii. Wyjątek bez zmian: osłona
  na linii strzału (`NET_SHOT_COVERED`) jest płatnym pytaniem, jak od 26d.

- **Podłączona figura stoi (02.11.2026, zasada domowa MG).** Podręcznik pozwala chodzić
  w promieniu 6 m od punktu dostępu, a wyjście dalej odłącza awaryjnie (s. 198). Gracz zgłosił,
  że „hakowanie się wyłączyło przy włączeniu trybu turowego” — najpewniej przypadkiem ruszył
  postacią i wypadł z zasięgu. MG: ruch „nie powinien być możliwy w trakcie podłączenia”.
  Serwer odmawia `NET_JACKED_IN_MOVE` każdego ruchu wpiętej figury (przeciąganie, marsz klikiem,
  skok, ruch bota) — także w zasięgu. Przepuszcza tylko przeciągnięcie ręką MG (sędzia), a takie
  wyniesienie poza 6 m dalej odłącza awaryjnie z rachunkiem za Czarny LOD.
- **Jedna próba na zdolność i pamięć sukcesów na scenie (02.11.2026, zasady domowe MG).**
  Podręcznik nie zabrania ponawiać Testów Interfejsu, więc netrunner rzucał do skutku. MG:
  „netrunner na danej scenie powinien móc tylko raz hackować dany element”, potem „zwiad,
  maskowanie, wirus też”. Backdoor, Ajdi, Kontrola i Wirus — raz na piętro, próbę zużywa
  porażka; Zwiad — raz z piętra, Maskowanie — raz na Architekturę, bo wynik jest odpowiedzią
  i każdy rzut zużywa próbę (**Maskowanie zmienione 14.11** — piętro po piętrze, próby w jednej
  Turze, sekcja na górze pliku). Skaner, Ślizg i Paf bez limitu (świat fizyczny, walka w Sieci).
  Druga połowa: **udane próby są pamiętane** — „powinny być zapamiętywane, aby przy ponownym
  połączeniu nie trzeba było ich na danej scenie powtarzać dla danej postaci”. Złamane hasła,
  rozpoznane i skopiowane Pliki, piętra ze Zwiadu i przejęte węzły wracają po ponownym
  podłączeniu, świadomie wbrew „Odłączenie resetuje obronę” (s. 198) i „Tracisz kontrolę nad
  wszystkimi węzłami” (s. 199). Węzeł, który w międzyczasie trzyma inny netrunner albo który
  rywal odebrał, nie wraca. Wszystko na postać + scenę: inna postać albo inna scena zaczyna od
  zera. „Oddaj próby” MG w oknie runu zwraca próby, pamięci nie rusza.
- **Szczęście: nie do Inicjatywy, a pula wraca sama na starcie sesji (22.10.2026, decyzje MG).**
  „Punkty te dodajesz do wyniku Testu” (s. 74), a czy 1k10 + REF w Inicjatywie jest Testem,
  podręcznik nie mówi wprost — MG rozstrzygnął: nie, kubek inicjatywy nie ma licznika Szczęścia.
  „Pula odnawia się na początku każdej sesji” czyta się dosłownie: odnawia ją „Rozpocznij sesję”
  (wiersz na czacie), a ręczne odnowienie zostaje MG. Gracz pulę na karcie może tylko zmniejszyć,
  np. po punktach wydanych ustnie przy stole.
- **Tarcza: tylko ręka, bez kary do ruchu (10.10, decyzja MG).** „Gdy wykorzystujesz rękę do
  niesienia tarczy, nie możesz tej ręki używać do innych celów” (s. 183) — trzymana tarcza (pancerz
  „Tarcza” założony na karcie) zajmuje jedną rękę, więc broń dwuręczna odpada. Podręcznik nie daje
  tarczy kary do RUCHU i MG nie chce reguły domowej: ruch z tarczą jest zwykły. Akcji za
  założenie tarczy na karcie VTT nie pobiera (jak dotąd — „Przygotuj/upuść tarczę” księguje MG).
- **Kule, śrut i strzały się nie kończą — liczą się tylko granaty i rakiety (23.10.2026, zasada
  domowa MG).** Podręcznik liczy każdy nabój: „Amunicja zwykła — 10 ed za 10 sztuk” (s. 94),
  Przeładowanie „załadowujesz magazynek do pełna” (s. 169), a przykładowy Jay kupuje „Zwykła
  amunicja karabinowa ×100”. MG nie chce przy stole księgowości naboi, więc VTT liczy tylko
  magazynek: opróżnia się strzałami (ogień ciągły dalej zjada 10), a Przeładowanie (w walce za
  Akcję) napełnia go **za darmo** dowolnym pasującym rodzajem — także przeciwpancerną, zapalającą,
  gumową czy śrutem. Zmiana rodzaju w walce dalej kosztuje Przeładowanie. Pudełek kul, śrutu
  i strzał nie ma w ekwipunku, na półkach, w kreatorze ani w skrzyniach; te sprzed zasady zdjęto
  z kart (bez zwrotu ed). **Granaty i rakiety zostają przedmiotami** („nie zaliczają się do
  amunicji zwykłej i trzeba je kupić osobno”, s. 94): leżą w ekwipunku, kupuje się je na sztuki
  i schodzą przy przeładowaniu granatnika/wyrzutni i rzucie granatem — **u wszystkich**, także
  u NPC i statysty (przełącznik „Licz amunicję” zniknął; „bez dna” jest tylko figura bez karty).
  Zasady zapasu granatów z 09.10 (etap 46c) zostają: zmiana rodzaju oddaje sztuki z magazynka do
  zapasu, granat ręczny bez magazynka bierze sztukę przy rzucie, kaliber to rodzina z pola
  „Amunicja” typu broni (granat pasuje do ręki i granatnika, s. 344), paczka to 1 sztuka, zwykły
  granat i rakieta kosztują 100 ed na poziomie 3 (`ammo.standard-explosive`). Gracz dalej nie
  podniesie magazynka ręką na karcie — napełnia go Przeładowanie. Stary tekst „Amunicja (zapas)”
  zostaje notatką.

- **Zastrzyk siłą: serwer rzuca za obie strony, a pudło zostawia dawkę (25.09, decyzje MG).**
  „Jeśli cel nie chce przyjąć środka, w ramach Akcji wykonujesz jeden Atak bronią białą i jeśli
  trafisz, zamiast zadać obrażenia, wstrzykujesz” (strzykawka bezigłowa, s. 150). VTT robi to
  guzikiem „Siłą” w sekcji Farmaceutyków na karcie, a nie atakiem z mapy: bez celownika, bez
  karty ataku z „Broń się” i bez Szczęścia obrońcy. Za to Unik celu jest **rzucony naprawdę**
  (ZW + Unik + 1k10), a nie zastąpiony biernym PT jak na mapie, bo nikt nie czeka na drugiego
  gracza. Podręcznik nie mówi, co z dawką przy pudle; VTT zostawia ją w strzykawce, a przepada
  tylko Akcja. Figura bez karty broni się Codziennym PT 13, a cel, który nie może unikać,
  biernym PT. Powrót do „pudło zjada dawkę” to jedna linia w `characterUseDoseEvent`.

- **Bariera ma OB, choć podręcznik nie zna częściowej osłony (13.09, etap 42b, decyzja MG).**
  „Nie ma czegoś takiego jak »częściowa« osłona" (s. 179), a osłona ma PW, nie OB (16c). Mimo to
  bariera — siatka, krata, barierka — ma w VTT liczbę OB, którą strzał i wybuch tracą **przed**
  pancerzem celu: 20 obrażeń przez siatkę OB 7 w kurtkę OB 11 to 20 − 7 = 13, a 13 − 11 = 2 PW.
  Reszta zasady, żeby nikt jej nie „poprawiał" po kawałku: OB bariery **nie zużywa się**; pancerz
  celu zużywa się tylko wtedy, gdy coś przebiło *jego*; ostrze bariery nie połowi (wręcz przez nią
  i tak nie sięga); **seria odejmuje je raz** od całej sumy, jak pancerz; premia +5 rany krytycznej
  idzie prosto w PW; obrażenia ignorujące pancerz ignorują też barierę; dwie bariery na linii
  odejmują każda swoje; strzelający tuż przy siatce też strzela przez nią. „Zastosuj" przestawione
  na figurę, której atak nie nazwał, mierzy linię od miejsca, w którym strzelec stoi teraz.
  Całość jest jednym wejściem silnika (`resolveCpredDamage`, `barrierSp`) — powrót do RAW to OB 0
  na każdej barierze, nie zmiana kodu.

- **Przeniesiony pancerz przychodzi zdjęty (06.09, etap 38b).** Podręcznik nie mówi nic o czasie
  zakładania pancerza i VTT też nie będzie — ale wiersz, który ląduje na karcie z `equipped: true`,
  **natychmiast** zmienia OB odbiorcy, czyli liczbę, którą ktoś zaraz przeciwko niemu rzuci.
  To jedyne pole, które `cpredMoveItems` zmienia po drodze. Odwrócenie tej decyzji to jedna linia
  w `cpredMoveItems`, ale wtedy łup po walce po cichu ubiera całą drużynę.

- **Zasięg przenoszenia mierzy się MG tak samo jak graczom (06.09, etap 38b).** Świadomy wyjątek
  od zwyczaju „MG omija blokady", wzięty wprost z `Ustabilizowania` (14e) i z tego samego powodu:
  MG podaje przedmiot **figurą stojącą na mapie**, więc odległość jest dla niego równie prawdziwa.
  Drogą naokoło zostaje edycja obu kart ręką, którą MG i tak ma. Gdyby to zaczęło uwierać przy
  stole (MG rozdający łup, gdy gracze już odeszli), zmiana jest jednym warunkiem w `inventory:give`
  i `inventory:take` — ale zmieniaj **obie** czynności naraz albo żadnej.

- **Wiersz czatu o przeniesieniu ma jednego adresata i to czasem za mało (06.09, etap 38b).**
  `ChatMessage.recipientId` jest pojedyncze, więc gdy **MG** przenosi między dwiema kartami
  **graczy**, historia zapisuje wiersz u tego, kto dostaje; drugi gracz widzi go na żywo, ale po
  przeładowaniu nie odzyska. Wybrane świadomie: dwa wiersze na jedno zdarzenie kłamałyby o tym,
  ile razy coś się stało, a obie karty i tak jadą do obu graczy przez `character:upsert`.
  Naprawa wymagałaby tabeli odbiorców przy wiadomości — to zmiana schematu, nie łata.

- **Efekty czasowe na Cechach nie ruszają PUL (05.09, decyzja MG).** Efekt z etapu 39 przesuwa
  wszystko, co rozstrzyga się „teraz" — Testy, Unik, Inicjatywę, PT obrony, RUCH, Rzut na Śmierć,
  obrażenia wręcz — ale **maksymalne PW, pula Szczęścia i sufit Człowieczeństwa liczą się z Cechy
  bazowej**. Opis etapu mówił „BC rusza PW" i to jest świadome odstępstwo od tamtego zdania.
  Powód jest w kodzie, nie w podręczniku: `normalizeCharacterData` przycina `hpCurrent`
  i `luckCurrent` do maksimum przy **każdym** zapisie karty, więc maksimum obniżone na godzinę
  zabrałoby postaci punkty **na stałe** — wygaśnięcie efektu podniosłoby sufit, ale nie oddałoby
  tego, co przycięcie już zjadło. Próg Poważnie Rannego idzie za maksimum z tego samego powodu.
  Gdyby to kiedyś przestać się bronić, pierwszym miejscem jest `normalizeCharacterData`, a nie
  `cpredEffectiveStats`.

- **Podłoga Cechy pod efektami to 1, ale Empatia zerowa zostaje zerowa (05.09).**
  `CPRED_STAT_MIN` przycina każdą Cechę zbitą efektami, **z jednym wyjątkiem**: podłoga nigdy nie
  stoi wyżej niż wartość bazowa, bo Empatia obniżona Człowieczeństwem schodzi do zera i schodzić
  ma (s. 229). Zaciskanie do jedynki **podnosiłoby** ją cyberpsychopacie — a to byłby cichy
  prezent, nie zabezpieczenie.

- **Broń podwieszana strzela amunicją zwykłą, nie wybieraną (01.09).** Wiersz `↳` ma własny
  magazynek (`attachmentAmmo`), ale **nie ma własnego `ammoId`**: podwieszany granatnik rzuca
  granatem, którego obrażenia (6k6) i Eksplozję niesie sam typ broni, a podwieszana strzelba
  strzela zwykłym pociskiem. Wybór naboju specjalnego **do broni doczepionej** wymagałby trzeciego
  pola na wierszu karty, a przy stole rozstrzyga się to tak, jak resztę fikcji — MG mówi, co jest
  w komorze. Nabój w magazynku broni-gospodarza celowo **nie** przechodzi na doczepioną:
  amunicja przeciwpancerna w karabinie nie jest w granatniku pod nim.

- **Bonus lunety i smartguna nie kumuluje się z niczym poza sobą (01.09).** Podręcznik pisze przy
  lunecie „Nie kumuluje się z cyborgizacją Teleskop" (s. 344); VTT niesie tę informację jako
  `rangedBonus.conflictsWith`, a od etapu 59a (24.10) ją **egzekwuje**: luneta, która w tym
  strzale dała +1, wyłącza Teleskop (`blockedBy` w `cpredChromeAttackModifiers`). „Efekty dwóch jednakowych dodatków nie kumulują się"
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
  *(Od 71c2, 15.11: także montaż ulepszenia auta z progu Moto 1 — Test Technika, wpis wyżej;
  czasy naprawy są — „Szybsza naprawa” połowi czas zwykłej naprawy.)*
  *Dopisek 15.11.2026 (etap 71d1):* nieaktualne — VTT liczy siedem z dziesięciu (gniazdo,
  gniazdo w broni egzotycznej, jakość Doskonała, do ukrycia, UC wszczepu, +1 OB, szybsza
  naprawa); sekcja „Walka i leczenie po weryfikacji Ról” na górze pliku.
  *Dopisek 16.11.2026 (etap 71d2):* stempel stawia też Test Technika (Ulepszanie przez kubek
  w robotach drużyny) — sekcja „Praca Twórcy i kriopompa”.

- **Prowizorka nie ma odliczania (29.08, czwarta).** „Działa przez 10 minut na poziom" to sześćdziesiąt
  rund na poziom — dłużej, niż trwała którakolwiek walka w tym projekcie. Zegar, który nigdy nie
  bije, to zegar, którego nikt nie czyta; wiersz pancerza pamięta starte OB, a guzik oddaje je,
  gdy MG uzna, że prowizorka puściła. Ta sama umowa, którą 16h zawarła z efektami poza walką.
  *Dopisek 15.11.2026 (etap 71c0):* powód nieaktualny — zegar świata jest od etapu 37; odliczanie
  wchodzi w 71d1 (G12). Od 71c0 łata zakłada się Testem (sekcja „Błędy Ról z audytu”).
  *Dopisek 15.11.2026 (etap 71d1):* odliczanie jest — łata puszcza sama z zegarem świata
  i rundą walki (sekcja „Walka i leczenie po weryfikacji Ról”).

- **Farmaceutyki i kriosystemy zostają prozą (29.08, czwarta).** Obie Specjalizacje dają liczbę do
  Umiejętności Technologia Medyczna i **listę rzeczy, których VTT nie modeluje**: dawek leków
  (wiersz ekwipunku to wolny tekst, nie zapas z licznikiem) i kriozbiorników. Panel drukuje obie
  listy słowami podręcznika, więc przy stole są pod ręką; wytwarzanie i podawanie dawki prowadzi
  MG. Pozycja stoi w `zaleglosci.md` — gdyby powstał model przedmiotów zużywalnych, wraca.
  *Dopisek 16.11.2026 (etap 71d2):* nieaktualne w obu częściach — Farmaceutyki działają od
  03.09 (dawki z licznikiem), kriopompa od 71d2 (wiersz z ładunkami, stan „w kriośnie”);
  prozą zostają tylko kriozbiorniki — sekcja „Praca Twórcy i kriopompa”.

- **Celowanie w trzymany przedmiot jest zdaniem, nie ruchem w ekwipunku (29.08).** RAW: „cel
  upuszcza trzymany w rękach przedmiot (twój wybór). Przedmiot upada na podłoże przed
  przeciwnikiem" (s. 170). VTT **nie modeluje tego, co kto trzyma w rękach** — kabury, wolne ręce
  i dobywanie broni to osobna pozycja w `POMYSLY.md` — więc karta obrażeń pisze, co się stało,
  i nic nie rusza wierszy broni. To cała reguła, jaką da się dziś uczciwie wyegzekwować; gdy
  powstanie model rąk, ta decyzja wraca jako zadanie.

- **W rękach jedna broń, zamiana za Akcję (29.10.2026, decyzja MG).** RAW zna tylko wolne ręce
  (s. 168): pistolet i nóż trzyma się naraz, a dobycie jest darmowe, gdy ręka jest wolna. VTT
  pozwala trzymać **jedną** broń; dobycie innej przy pełnej ręce chowa poprzednią i kosztuje
  Akcję (cena schowania). Karta, przy której nikt niczego nie dobywał, trzyma pierwszą broń.
  Bijatyka, Sztuki walki i granat ręczny są poza limitem — zawsze pod ręką. Dotyczy każdej karty
  (gracze, boty, NPC-e MG).

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
  „Odsłoń graczom" na karcie gniazda. (2) ~~**Zwiad liczy piętra wszerz** (obie drogi w dół
  z rozgałęzienia naraz), bo mapa, która patrzy tylko w trzon, ukrywałaby odgałęzienie, do
  którego RAW każe zanieść Wirusa.~~ Zastąpione 10.11.2026: Zwiad widzi jedno piętro w dół (sekcja na górze pliku). ~~(3) Piętro z Czarnym LOD-em odkrywa się, ale nic się na nim
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
  *Dopisek 15.11.2026 (etap 71d1, G18):* czas ma już kartę — każda próba proponuje MG
  przesunięcie zegara (minuta / cztery godziny). Łatę „do końca dnia” dalej zdejmuje ⌫.

- **Rana załatana zostaje na karcie (30.08).** „Łatanie niweluje efekt rany do końca dnia"
  (s. 223) — więc milkną **skutki**, nie wiersz: karta dalej mówi „Złamana noga", tylko jej efekt
  jest przekreślony, a `cpredActiveInjuries` wycina ją ze wszystkiego, co czyta skutki. Trzy rany,
  przy których tabela drukuje „Łatanie trwale usuwa Efekt tej Rany", schodzą z karty naprawdę —
  o tym rozstrzyga `cpredCarePermanent`, nie tryb guzika.

## Narkotyki, alkohol i trucizna na ostrzu (etap 59b/59c, 24.10.2026)

- **Sufit Cechy z narkotyku to 10 (decyzja MG).** „Może wynosić ponad 8” bez górnej granicy —
  Dopalacz na INT 9 daje 10, nie 11 (ten sam `clampStat` co efekty czasowe).
- **Uzależnienie od Dopalacza: INT −2 zawsze (decyzja MG)** — także pod dawką (wychodzi na zero).
  Czarna szpryca i Syntkoka karzą tylko bez dawki, bo tak mówi podręcznik.
- **Dynadetoks kończy dawki bez rzutu na uzależnienie (decyzja MG)** i oddaje Człowieczeństwo
  Czarnej szprycy — efekt dodatkowy nie zdążył zadziałać. Zrywu nie rusza (to farmaceutyk).
- **Kto widzi chemię: właściciel karty i MG (decyzja MG).** Karta zażycia `gmrecovery`, rzut na
  uzależnienie `gmroll` z adresatem, pasek figury tylko u tych, którzy mają kartę. Publiczny
  dziennik walki i karta ataku strzykawką piszą „dawka”, bez nazwy narkotyku.
- **Farmaceutyki też do kupienia (zasada domowa MG z 24.10).** Podręcznik daje je tylko Medykowi
  (s. 150); przy tym stole stoją też na półce „Używki i leki” jako zwykłe wpisy
  (`CPRED_PHARMA_COMPENDIUM_FILE` w `pharma.ts`, serwer dokłada je obok danych grupy, nie do
  próbki). Ceny wymyślone: Antybiotyk i Dynadetoks 50 ed podręcznika (Drogie, ×3 = 150 ed),
  Turbo uzdrawiacz, Stym i Zryw 100 ed (Premium, wyjątek ×3 = 300 ed) — drożej od dawki
  Medyka (partia 600 ed na kilka dawek). Bramka „podaje tylko Medyk” zostaje: kupić i nosić
  może każdy, wbić — Medyk z punktem w Farmaceutykach.
- **Narkotyki na zwykłej półce (decyzja MG)** — wg ceny i poziomu sklepu; dobór handlarzy to
  wybór MG. Boty same nie zażywają (propozycja z planu przyjęta).
- **Alkohol — zasada domowa MG:** dawka to na godzinę REF −1 i SW +1, najwyżej trzy dawki naraz
  (czwarta wypycha najstarszą), bez uzależnienia; trzy jakości różnią się tylko ceną.
- **Rzut na uzależnienie należy się dwóm osobom:** nieuzależnionej i uzależnionej, której Czarna
  szpryca trzyma Człowieczeństwo (udany rzut je oddaje). Uzależniony od Dopalacza po kolejnej
  dawce nie rzuca — nie ma o co.
- **Druga dawka narkotyku przesuwa oba terminy o pełny czas;** dawka sprzed walki dostaje termin
  rundowy od chwili wydłużenia. Człowieczeństwo z kolejnych dawek Szprycy sumuje się na dawce.
- **Fiolka trucizny: „lekka broń biała” to typ Lekka broń biała albo broń biała 1k6** (nóż markowy,
  broń z Kompendium MG). Druga fiolka na tym samym ostrzu zastępuje pierwszą.
- **Trafienie zatrutym ostrzem rozlicza Test od razu, bez okna Uniku przed nim** — tak jak
  strzała zatruta od 16h (atak bez obrażeń nie czeka na Unik). Do zmiany przy stole, jeśli zgrzyta
  (`POMYSLY.md`).
- **„Raz dziennie” / „raz na tydzień” farmaceutyków mierzy zegar świata** od ostatniej
  **skutecznej** dawki; dawka ponad limit pustoszy fiolkę i nic nie robi (jak Turbo uzdrawiacz
  podany Śmiertelnie Rannemu). Bez zegara (`minutes === null`) limit nie obowiązuje.
- **Ceny:** fiolki trucizny i biotoksyny ×1 (jak amunicja zatruta, nie ×10 sprzętu trwałego), dobry
  alkohol ×3; narkotyki z pasm Tanie–Drogie ×3 jak każdy drobiazg. Do korekty przez MG.

## Chrom zmieniający liczby (etap 59a, 24.10.2026)

- **Wymagania z opisu wszczepu to notka, nie odmowa (decyzja MG).** „Wymaga BC 6 i przeszczepu
  splotu” (ramownica ∑), „dwóch przeszczepów” (ß), „złącza interfejsu” (egzoszkielet), „dwojga
  cyberoczu i sparowania” (Poprawa obrazu) — karta pisze „Wymaga: …” na bursztynowo, a liczba
  i tak rośnie. Montaż przechodzi przez MG albo Medyka, więc decyduje stół.
- **Premie zależne od zmysłu: obraz zawsze, słuch i śpiew — MG (decyzja MG).** Serwer nie wie,
  czy Test Percepcji idzie wzrokiem. Poprawa obrazu daje +2 do Percepcji, Czytania z ruchu warg
  i Ukrycia/Znalezienia zawsze; Ulepszony słuch (+2 do Percepcji słuchem) i AudioVox przy śpiewie
  (+2 do Gry na instrumencie) MG dolicza modyfikatorem sytuacyjnym — karta mówi to notką.
- **Premie do jednej Umiejętności się nie kumulują — liczy się największa.** Wszystkie opisy to
  mówią („Instalacja kilku takich wszczepów nie powoduje zwiększenia premii”, „Premia nie kumuluje
  się z inną tego typu”, „Premie z różnych urządzeń nie kumulują się”), więc VTT bierze maksimum
  zamiast sumy: Techskaner w ręce i w plecaku dają +2, Superchrom i trzy tatuaże świetlne — +2.
- **Egzoszkielet: BC do rzutów, obrażeń wręcz i Zwarcia, bez PW i Przeżywalności.** „Punkty
  Wytrzymałości ani rzut obronny przeciw śmierci nie zwiększają się”. Podłączenie to przełącznik
  na karcie bez Akcji (jak założenie pancerza). Sufity z opisu („nie powyżej 13/15”) pomijamy:
  egzoszkielet podnosi BC **do** 12/14 i nic nad tym nie dokłada.
- **Celownik optyczny działa przy każdym Celowaniu, także wręcz** — opis mówi tylko „+1 do Testu
  przy Celowaniu”. Teleskop — wyłącznie z broni dystansowej („Strzelając…”).
- **Czip Umiejętności: jedna cena z kompendium, Umiejętność wybierana na karcie raz.** Podręcznik
  różnicuje cenę (Umiejętności ×2 — 1000 ed, reszta 500 ed); VTT bierze cenę wpisu, a Umiejętność
  gracz wybiera po montażu (zmienia ją już tylko MG). Czip bez wybranej Umiejętności nie daje nic.
- **Wszczep nie leczy.** Przeszczep podnosi maksimum PW, ale nie bieżące — postać z 35/35 po
  montażu ma 35/40 i jest Lekko ranna, jak po każdej zmianie maksimum.

## Leczenie i farmaceutyki (03.09)

- **Ręczna zmiana PW przez MG nie zostawia śladu na czacie (10.10, decyzja MG).** MG poprawia
  liczby po cichu — strzałką PW na karcie, w menu figury albo wpisem w pole. Gracz widzi skutek
  na swojej karcie i na pasku figury, a reszta stołu tylko odsetek PW (`hpShare`). Śladu nie ma
  ani dla MG, ani dla stołu. Ślad zostawiają tylko obrażenia, leczenie, odpoczynek i dawki
  rozliczane przez serwer. Gdyby wróciła potrzeba odtworzenia przebiegu walki, rekomendacja
  z triażu to wiersz tylko dla MG („Kowal: PW 30 → 25 (ręcznie)”), nie dla całego stołu, bo PW
  NPC-ów widzi wyłącznie MG.

- **„Opieki jako mnożnika tempa" w podręczniku nie ma — i nie będzie.** Zaległość opisywała
  „opiekę (Ratownictwo medyczne / klinika / szpital) jako mnożnik tempa", ale to była parafraza,
  nie cytat: s. 225 wycenia **cenę** ustabilizowania i leczenia Ran Krytycznych („Gdy trafiasz do
  szpitala, musisz zapłacić tylko za ustabilizowanie lub leczenie o najwyższym PT"), a tempo
  powrotu do zdrowia jest jedno dla wszystkich — „tyle PW, ile wynosi jego Budowa Ciała" (s. 222).
  Podnoszą je dokładnie dwie rzeczy i obie są w VTT: chrom „Ulepszone przeciwciała" (BC × 2,
  s. 362) i Antybiotyk (+2 dziennie przez tydzień, s. 150).

- **„Skuteczny tylko raz dziennie" / „raz na tydzień" jest drukowane, nie egzekwowane.** Turbo
  uzdrawiacz, Stym i Zryw mają w tabeli limit częstotliwości; karta czatu wypisuje go słowami
  z podręcznika i na tym kończy. Projekt nie ma zegara świata do **etapu 37** (kalendarz kampanii),
  a wymyślanie doby na potrzeby jednego licznika byłoby zgadywaniem, którego przy stole nikt nie
  sprawdzi. Dzień odpoczynku jest **zdarzeniem**, nie punktem na osi czasu — i licznik antybiotyku
  odlicza właśnie dni odpoczynku, czyli te, w których miałby cokolwiek do roboty.
  *Dopisek 15.11.2026 (etap 71d1):* nieaktualne od 59b — limit mierzy zegar świata (wpis
  w sekcji „Narkotyki…”); 71d1 dołożył test Turbo uzdrawiacza.

- **Który środek Medyk „wybrał" za dany punkt Farmaceutyków, VTT bierze z kolejności tabeli.**
  „Zawsze, gdy przydzielasz punkt do Farmaceutyków, zyskujesz dostęp do jednego z poniższych
  środków" (s. 150) — podręcznik nie każe wybierać, a `cpredPharmaAccess` daje pierwsze N wierszy.
  Alternatywą byłby szósty wybór na karcie („które trzy z pięciu?") po to, żeby przy pełnej randze
  i tak wyszło to samo. Panel pokazuje resztę wyszarzoną, więc widać, co kupi następny punkt.
  *Dopisek 17.11.2026 (etap 71g1, D2):* nieaktualne — Medyk wybiera środek przy punkcie
  (`pharmaPicks`); kolejność tabeli zostaje tylko dla kart sprzed tej zmiany.

- **Stym i Edytor bólu zawieszają KARĘ Poważnie Rannego, nie stan (12.09.2026; Edytor bólu
  decyzją MG).** Do 12.09 Stym zostawał przy MG z dopiskiem „do etapu 39" — a etap 39 zamknięto
  bez niego. Teraz silnik rozlicza oba źródła i trzy rzeczy są w tym świadome. (1) **Stan zostaje**:
  PT Ustabilizowania, naklejka i próg na pasku się nie zmieniają, a −4 Śmiertelnie Rannego nie jest
  zawieszane; Stym podany Śmiertelnie Rannemu i tak się zapisuje, bo zadziała, gdy cel w ciągu
  godziny wróci do Poważnie Rannego. (2) **Druga dawka nadpisuje termin**, nie kumuluje się.
  (3) **Edytor bólu działa zawsze, dopóki w chromie jest wiersz o tej nazwie** — podręcznik mówi
  „gdy zachodzi taka potrzeba", a karta nie wie, co wyłączył impuls EMP (nazwy wyłączonych stoją
  tylko na karcie czatu), więc minuta bez chipu zostaje przy MG. Wymogu gniazda czipów nikt osobno
  nie sprawdza — pilnuje go montaż (s. 111).

- **Dawka schodzi z ekwipunku także wtedy, gdy środek nic nie zdziałał.** Turbo uzdrawiacz podany
  Śmiertelnie Rannemu (podręcznik go wtedy wyklucza), Antybiotyk przed Ustabilizowaniem, Dynadetoks
  komuś bez naklejki „Zatruty" — we wszystkich trzech fiolka jest pusta, a karta mówi dlaczego.
  Odwrotnie byłoby gorzej: zwrot dawki znaczyłby, że Medyk „wie z góry", czego nie warto podawać.

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

## Kreator postaci — naprawa (16.09)

- **Slang uliczny i język kultury dzielą jeden wiersz „Język”, ale slang jest płatny (16.09,
  decyzja MG).** Podręcznik daje każdej postaci dwa wpisy: podstawowy „Język (slang uliczny)”
  co najmniej na 2 za 2 pkt i darmowy język kultury pochodzenia na 4 (s. 45, przykład z s. 90:
  po trzynastu podstawowych zostaje 60 z 86). Model karty ma jedną umiejętność `language`, więc
  kreator zapisuje „Język 4” z nazwą języka kultury, a 2 pkt za minimum slangu dolicza
  `creationFreeLanguageCharge` (zero, gdy darmowy język nie jest podstawowy w danych). Do 16.09
  ten wiersz oszczędzał każdej postaci 2 pkt. Osobny slang na karcie to projekt wielu języków
  (`POMYSLY.md`, 15.09) — wtedy opłata przejdzie na prawdziwy wiersz, a ta funkcja zniknie.

- **Poziom życia na start bez pola „pierwszy miesiąc gratis” (17.09, decyzja MG, naprawa 3a).**
  Kreator zapisuje postaci z właścicielem „Na karmie · Kontener”, a Korpo „Dobry prepak ·
  Korporacyjny konap” (s. 105); NPC MG zostaje bez rachunków. Podręcznikowego darmowego (u Korpo
  opłaconego) pierwszego miesiąca VTT nie liczy — rozliczenie miesiąca uruchamia MG i to on pomija
  świeżą postać. Opcje Zakwaterowania Nomady z Moto (s. 165) ustawia się na karcie.
- **Kreator nie wspomina o pieniądzach na Modę (10.10, decyzja MG).** Kompletny Pakiet dostaje
  w podręczniku jeszcze 800 ed wyłącznie na ubrania i cybermodę (niewydane przepadają). VTT nie
  ma katalogu Mody, więc tych pieniędzy nie ma na karcie, a wygląd opisuje pole „Styl”. Do 10.10
  kreator mówił o tym w kroku „Wyposażenie” — MG uznał, że nowy gracz czyta to jako brak, więc
  wiersz zniknął (`creationLeftOutside` mówi tylko, co dojdzie po utworzeniu postaci).
  `budgets.fashion` zostaje w danych.
- **Wszczepy świeżej postaci mają losowaną Utratę Człowieczeństwa (17.09, naprawa 3a).** Podręcznik
  przy tworzeniu postaci każe liczyć stałą wartość sprzed nawiasu, ale kreator nie instaluje
  cyborgizacji (25c), a Kompendium zawsze rzuca kośćmi — także przy „Dodaj za darmo” z pakietu
  Krawędziarza. Kreator mówi o tym na liście „Po utworzeniu postaci”; stała UC dla postaci przed
  zatwierdzeniem gotowości przez MG czeka w `POMYSLY.md`.
  *Dopisek 17.11.2026 (etap 71g1):* pakiet Krawędziarza kładzie dziś kreator — chrom z niego
  dalej wszczepia MG, z losowaną UC.

- **Dostępność liczy się z rodzaju rzeczy, nie z ceny (17.09, decyzja MG, naprawa 3b).** Do 17.09
  poziom był progiem ceny z 25c (≤ 50 / ≤ 500 / ≤ 1000 / wyżej), co stawiało wyrzutnię rakiet,
  Sandevistana i amunicję z biotoksyną na jednej półce z kamerą wideo, a Czarny LOD za 50 ed na
  Ulicy. Teraz poziom mówi, **jak legalna** jest rzecz: 1 Uliczne (cywilne, samoobrona), 2 Zawodowe
  (narzędzia fachu, broń krótka, kurtki kuloodporne, zwykły chrom), 3 Wojskowe (karabiny,
  granatniki, ciężkie pancerze, bojowy chrom i amunicja, agresorzy), 4 Czarny rynek (wyrzutnie,
  trucizny, Czarny LOD, Borgizacje, luksus). Cena wyłącznie podnosi (1000 ed → min. 2, 5000 ed → 4),
  a doskonała jakość broni daje +1. To **nadal mechanizm kampanii, nie zasada podręcznika** —
  podręcznik wiąże dostępność z kategorią cenową (Zasięg Fixera, s. 160), i ta tabela zostaje
  w panelu Fixera bez zmian (decyzja z 30.08 o pierwszeństwie poziomu sklepu obowiązuje).
- **W kreatorze Rola otwiera własną półkę (17.09, decyzja MG, naprawa 3b).** Zakupy startowe stoją
  na poziomie 1 „dla wszystkich, MG włącznie” (25c), ale narzędzia własnej Roli wolno kupić do
  poziomu 2 — bez tego Netrunner nie kupiłby cyberdeku, Medyk torby medyka, a Technik przybornika,
  bo wszystkie są droższe niż 50 ed. Listy narzędzi zatwierdził MG; Solo i Stróż Prawa mają na nich
  także broń krótką, strzelby i lekkie kurtki kuloodporne.
- ~~**Programów i cyberdeku nie kupuje się w VTT (17.09, naprawa 3b).**~~ **Nieaktualne od 10.10
  (etap 48b, decyzja MG):** Program kupuje się jak sprzęt (ląduje w Wyposażeniu), dek podłącza się
  z wiersza Wyposażenia, a Programy i Ulepszenia wkłada się z niego i do niego wyjmuje — także MG,
  bez listy z kompendium na karcie. Kreator podpina dek z pakietu Roli albo koszyka i wkłada
  Programy, ile wejdzie; pakiet Roli Netrunnera dostaje pięć Programów z pakietu Krawędziarza
  (Pancerz, Miecz, Mam cię!, Mózgoklep, Robak — s. 103, z każdego „lub” opcja inna niż Miecz),
  a boostery i defensory są jego narzędziami Roli w kreatorze. Umowa w `siec`.
- **Karta nie ma pustych wierszy do dopisania (10.10, etap 48c, decyzje MG).** Rzeczy z mechaniką
  przychodzą z zakupu, wymiany, łupu, kreatora i od MG; „+ Wyposażenie”, „+ Pancerz” i „+ Załóż”
  zniknęły u wszystkich — rzecz fabularną spoza podręcznika MG zakłada własnym wpisem
  w Kompendium. Gracz zmienia tylko uwagi, wyrzuca, zużywa, zakłada pancerz i umieszcza wszczep;
  nazwę, liczby broni i pancerza, naprawę ↻ i Ulepszanie ⊕ (+1 OB) ma MG. Dodatek do broni jest
  towarem jak Program (montaż z Wyposażenia, zdjęty wraca), a „Montaż znalezionej cyborgizacji”
  (s. 375) wymaga wiersza z tym wszczepem w Wyposażeniu. Umowa w `ekwipunek`.

## Interfejs

- **Poziom sklepu nie dotyczy montażu wszczepów (13.09, decyzja MG).** Tarcza kampanii („Uliczne —
  do 50 ed") blokuje graczowi w Kompendium wyłącznie „Kup"; „Zainstaluj — … ed" przy cyborgizacji
  zostaje dostępne także dla wpisu z wyższego poziomu (oględziny: „Celownik optyczny", Zawodowe,
  500 ed, przy sklepie Ulicznym). Powód: wszczep przychodzi przy stole także z łupu, od znajomego
  ripperdoca albo w nagrodę za zlecenie, więc tarcza tempa zakupów nie ma czego tu pilnować. Gdyby
  to zaczęło uwierać, warunek `locked && !isGm` z guzika „Kup" (`CompendiumPanel.tsx`) trzeba dopisać
  **i** po stronie serwera w `character:cyberware` — sam klient byłby tylko zasłoną.

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
  **Nieaktualne od 16.11.2026 (etap 71e):** VTT liczy cztery — procenty także przy sprzedaży,
  szóstą sztukę i ratę za miesiąc; prozą zostają +20% dla Ekipy i podwójna zapłata — sekcja
  „Handel i pieniądze po weryfikacji Ról”.

- **Etap 30d — Zasięg na szczeblu 5–6 dziedziczy pasmo z niższego.** Ramka „ZNAJOMOŚCI –
  POZIOMY 5 I 6" jako jedyna **nie drukuje kategorii cenowej**: w jej miejscu stoi Nocny.
  `cpredOperatorReach` szuka więc w dół, bo odczyt „szczebel bez pasma to brak Zasięgu" kazałby
  awansowi **odebrać** zdolność — czego w całym podręczniku nie robi żaden inny awans.

- **Etap 30d — nieudana prośba Rockera nie ma odliczania.** „Rocker nie może prosić tych fanów
  o tę samą przysługę przez tydzień" (s. 144) mierzy się w tygodniach, a VTT nie ma kalendarza
  ani pojęcia „ci fani". Zdanie stoi na karcie rzutu i w podpowiedzi panelu; pilnuje go MG. Ta
  sama decyzja, którą 30b podjęła wobec Prowizorki („10 minut na poziom").
  **Dopisek 16.11.2026 (etap 71f): nieaktualne** — fani są grupami na karcie, a odmowa zamyka
  grupę na 7 dób zegara świata; patrz „Czas i zasoby narracyjne po weryfikacji Ról”.

- **Etap 30d — Test Rzetelności nie jest Testem.** Nie ma w nim Cechy, Umiejętności, kary za rany
  ani eksplodującej dziesiątki, a Szczęścia użyć nie wolno wprost z podręcznika (s. 152). Ranga
  kupuje **szansę** („2 na 10"), nie modyfikator, więc kość leci goła i porównuje się `1k10 ≤
szansa` — kształt Rzutu na Śmierć, nie Testu na PT.

- **Etap 23c, poprawka 30.10 — Reputację czyta się po kolei, a zła przykrywa dobrą (decyzja
  MG).** „Może zastąpić Reputację dotyczącą pozytywnego wydarzenia" (s. 193) czytamy tak: zły
  wyczyn zastępuje dobrą sławę **na każdym poziomie** (tchórzostwo 3 po koncercie 6 daje złą
  sławę 3), a „może” to wybór MG, czy w ogóle go wpisać. Dobry wyczyn zastępuje obecny, także
  zły, tylko gdy jest **wyższy**; przy równym poziomie zostaje starszy (wcześniej wygrywał
  późniejszy, co pozwalało dobrej czwórce zmyć złą czwórkę). Kolejność to kolejność listy
  na karcie (nowe na końcu). **„Pokonać wroga” to 0 PW albo wygrany rewanż** — przegrany, który
  potem wygra z tym samym przeciwnikiem Konfrontację, przestaje się go bać, gdy nowy przegrany
  wybierze „wycofuję się / nie ustępuję” (wcześniej wynik może jeszcze odwrócić „Postaw się”).
  Strach zostaje na scenie: figury są per scena, statyści nie mają tożsamości poza nią.

- **Etap 30d — Wiarygodność nie dotyka Reputacji z 23c.** Opis etapu zapowiadał styk, ale
  podręcznik go nie ma: Rzetelność jest szansą na to, że **odbiorcy uwierzą publikacji**,
  a Reputacja modyfikuje Konfrontację i to, czy ktoś cię rozpozna. Dwie różne liczby o dwóch
  różnych rzeczach; sklejenie ich byłoby zasadą domową, nie odczytem.

- **Etap 30d — pogłoski przynosi rzut, treść pisze MG.** Guzik „Pogłoski" rzuca Wiarygodność +
  1k10 i mówi, **który** próg został pobity (7/9/11/13 → mglista, typowa, sprawdzona,
  szczegółowa). Czym pogłoska jest, VTT nie wymyśla — to materiał kampanii, który mieszka
  w dzienniku z 24b i w bazie wiedzy z 19b. Remis na progu zdaje, jak przy każdym innym PT
  statycznym (decyzja z 28.08), choć ramka pisze tu „wyższy od".
  **Dopisek 16.11.2026 (etap 71f): zdanie o remisie nieaktualne od 30.08** — próg trzeba
  przebić, a od 71f pisze to także karta rzutu („>”); rzuty liczy licznik tygodnia.

- **Etap 30d — Tabor Rodziny to lista, a nie pojazdy.** Projekt nie ma pojazdów, więc wiersz
  Taboru jest nazwą, kategorią i notatką. Liczone są dokładnie te dwie rzeczy, które liczy
  podręcznik: wpisów jest najwyżej tyle, ile poziomów Moto, i żaden nie jest z kategorii wyższej
  niż poziom. Ulepszenia pojazdów z s. 163–165 (kilkadziesiąt pozycji) zostają w podręczniku:
  bez pojazdów nie miałyby czego ulepszać, a wiersz Taboru „Opancerzenie kadłuba" mówi przy stole
  dokładnie to samo. *(Nieaktualne: od 65a pojazdy i ulepszenia są w VTT, od 68 — także za ed.)*

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

## Zakres VTT — czego świadomie nie ma

- **Kamera i mapa gracza — decyzje MG z 11–12.09 (przeniesione z `zaleglosci.md` 25.09).**
  - **„Ani piksela czerni" zostaje.** Gracz przy maksymalnym oddaleniu nie obejmie całej mapy
    40 × 30 na szerokim oknie i **tak ma być** — „może sobie poprzesuwać albo odpowiednio rozciągnąć
    okno". Nie proponuj powrotu do wariantu „cała mapa z czarnymi pasami".
  - **Mapa powitalna zostaje bez wyznaczanego punktu startu** — zawsze środek dolnej krawędzi.
    Tło nie ma wiersza w bazie, w którym MG mógłby punkt zapisać, i nikomu to nie przeszkadza.
  - **Czarne pole gracza pod nieodsłoniętą mgłą jest zachowaniem, nie usterką** — ale czyta się jak
    awaria: MG sam „miał obawy, że jest zepsuta", patrząc na własną scenę z widocznością `fog`.
    Nic z tym nie robimy; warto o tym pamiętać przy oględzinach i przy pierwszej sesji z drużyną.
  - **Pełny plik „StrefyPrzemysłowej" (2896 × 2176) — nie teraz (decyzja MG z 12.09).** Siatka jest
    poprawiona wpisem „40 kolumn" (36,2 px) na obecnym pliku 1448 × 1086. Wgranie większego pliku
    **przesunie całą scenę**: wgranie ustawia rozmiar sceny na wymiary pliku, a figury, ściany, mgła,
    rysunki i światła leżą w pikselach świata — bez przeskalowania ×2 wszystko zjedzie do lewej
    górnej ćwiartki. Do tego ten plik nie dzieli się równo (72,4 px w poziomie, 72,53 w pionie).

- **Figury mogą stać na jednej kratce (25.09, decyzja MG).** Planer, marsz, przycięcie
  budżetem i serwer nie znają pojęcia „zajęte pole” — jak w Foundry. Znalezione przy oględzinach:
  marsz gracza przycięty budżetem (8,5 z 10 m) zatrzymał figurę dokładnie na polu innej. To nie
  jest błąd i nie wraca jako zaległość; rozdziela je MG albo gracz przy stole.

- **Makra i własny pasek akcji — wycofane 05.09.2026 (decyzja MG).** Etap 36 („Makra i pasek
  własnych akcji", dopisany 02.09 po przeglądzie względem Foundry) został skasowany razem
  z opisem: model `Macro` w bazie, trzy zdarzenia (`macro:upsert`/`delete`/`run`), edytor
  z podglądem i druga listwa klawiszy to złożoność nieproporcjonalna do pożytku przy stole,
  na którym `/r 1k6` wpisane Enterem, wezwanie do Testu z etapu 32 i `/jako` robią to samo
  bez ani jednej nowej tabeli. **Numer 36 zostaje pusty** — etapy 37–39 zachowały numery,
  bo cytuje je dziennik sesji i umowy kodu. Konsekwencja dla paska walki: `hotbarSlotsFor`
  (16f) jest i zostaje **generowany** z tego, co figura potrafi; ręcznie układanych slotów
  nie będzie. Nie proponuj wracania do makr.

## Etap 38a — statysta jako karta postaci (05.09.2026)

**Umiejętność wpisana figurze ręcznie znaczy od 38a co innego niż do 38a.** Do 38a poziom wpisany
na liście Umiejętności profilu bojowego był **całym** modyfikatorem rzutu (Cechy szły do zera),
bo lista służyła głównie funkcjonariuszom Wsparcia i ich Wartości bojowej. Od 38a to zwykły wiersz
Umiejętności karty: Cecha dolicza się na wierzchu, tak jak u gracza. Semantykę „jedna liczba
zamiast Cechy i Umiejętności" przejęło osobne, wprost nazwane pole — **Wartość bojowa** — które
MG włącza przełącznikiem w menu figury. Zmiana jest świadoma: „figura, której MG wpisał Percepcję
4" czyta się teraz tak samo jak na każdej innej karcie, a wyjątek nazywa się po imieniu.

**Kopia figury MG dostaje własną kartę, kopia figury gracza nie.** Klonowanie żetonu (etap 35)
kopiowało profil bojowy, więc kopia była od razu osobną figurą. Gdyby po 38a przejmowała
podpięcie, dwa żetony dzieliłyby jedne PW i strzał w jednego gangera kładłby drugiego. Karta
gracza się nie kopiuje — dwie figury Vex to nadal jedna Vex.

**Rany figury prowadzonej przez MG jadą publicznie także wtedy, gdy to nazwany NPC.** Do 38a pole
`TokenView.injuries` wypełniało się wyłącznie przy figurze bez karty; teraz przy każdej karcie
**bez właściciela**. To rozszerzenie, nie przypadek: „ma odciętą dłoń" jest tym, co przy stole
widać, a Medyk gracza ma mieć co załatać — i dotyczy to Rudego tak samo jak gangera.

**Figura bez karty przestała nosić rany krytyczne.** Kółko z paskiem PW i bez karty dostaje
obrażenia i **zdanie** („ranę krytyczną rozstrzyga MG"), tak jak przed etapem 29.08. Rany, które
tamten etap dał statystom, przeniosły się razem z nimi na karty — a figura, której nikt nie
ostatystykował, nie ma ich gdzie zapisać i nigdy nie miała.
