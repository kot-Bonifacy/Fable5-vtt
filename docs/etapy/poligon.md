# Poligon bojowy — stan sceny testowej

Wyprowadzone z `POSTEP.md` 22.08.2026. Czytaj, gdy siadasz do oględzin w przeglądarce.
Stan opisany na 22.08.2026 — po każdej sesji oględzin sprawdź, czy nadal się zgadza
(trzy rozjazdy z opisem wyszły przy oględzinach 22.08).

Opis niżej uwzględnia trzy poprawki z oględzin 22.08: karta **„Test 27x" należy do avatar9**
(nigdy do MG), żeton **„Kolec" ma właściciela** (bez tego gracz nie mógł się podłączyć do Sieci
mimo posiadania karty), a **punkt dostępu jest odsłonięty** (w bazie miał `hidden = 1`).

**🎯 Poligon jest przygotowany pod stół — nic nie trzeba budować od nowa.** Na scenie
„Strzelnica" stoi odsłonięty **„Punkt dostępu"** i obok niego żeton **„Kolec"** związany z kartą
**„Test 27x"** — Netrunner z Interfejsem 7 i cyberdekiem doskonałej jakości (Gumka, Pancerz,
Miecz, Młot na wroga, Superklej, Szabloząb). Architektura **„siec klub"** ma teraz **cztery
piętra**: 1 „Poczekalnia", 2 „Strażnik piętra" z Piekielnym ogarem, 3 **„Węzeł ochrony" (PT 8)**
z dwoma urządzeniami — **„Kamera nad bramą"** (wpis „Kamera obserwacyjna") i **„Grzechot"** (wpis
„Automatyczna wieżyczka", związany z żetonem **„Automatyczna wieżyczka"** stojącym na mapie:
REF 7, Umiejętność 7, karabin szturmowy 25/25, PW 25/25) — oraz 4 **„Serce sieci"** z **Diablikiem**
(REZ 15, Interfejs 3, 2 Akcje Sieciowe, Wartość bojowa 14). Tryb turowy jest **wyłączony**;
kolejka „PRZED WALKĄ" z Tonym i avatar9 wraca jednym kliknięciem „Włącz tryb turowy".
**Na „Strzelnicy" nie ma żadnej strefy — poprawione 27.08 (trzecia sesja).** Ten akapit
obiecywał tu ⚠ „Podłogę elektryczną" od 26f; sprawdzenie w bazie mówi, że w całym projekcie jest
**jedna** `DefenseZone` i stoi na **„Kartach 24x"** (id 3, 20 PW, uzbrojona i ukryta). Ta ze
Strzelnicy została skasowana przy którymś porządkowaniu sceny i nikt tego nie odnotował. Strefa
z „Kart 24x": kto na nią wejdzie, dostaje 6k6 przez pancerz i jeszcze raz na koniec każdej swojej
Tury; gracz jej nie zobaczy, dopóki nie zda Percepcji PT 17 z 4 m. Karta strefy otwiera się
narzędziem ⚠ w trybie 📌; „Rozbrój" ją usypia, kosz usuwa.

**Stan po sesji 13.09 (druga) — oględziny na kampanii-śmieciu, Poligon nietknięty.** Aktywna
kampania była przełączona na „Oględziny 12.09 — do usunięcia" i wróciła na „Poligon bojowy".
W kampanii-śmieciu: **nowe zaproszenie** (ważne do 20.09) i **`Tester` jest jej członkiem**;
„Figura testowa" (żeton i założona na nią karta) **usunięta** koszem; karta „Oględziny Stym" ma
właściciela `Tester`, 5000 ed, „Pistolet oględzinowy" (schowany — ręce zadeklarowane) i żeton na
scenie „Test Brak sceny"; na czacie karta inicjatywy „Ochroniarz". **Stałe zaproszenie `tester-dev`
jest przypięte do „Poligonu bojowego"**, nie do aktywnej kampanii (ekran dołączenia pisze
„Kampania: Poligon bojowy"). Na Poligonie niczego nie ruszano — kolejka „StrefyPrzemysłowej" stoi
na turze Tony'ego, a formularz Ustabilizowania był tylko otwarty, bez zatwierdzenia.

**Stan po sesji 13.09 — cyberdek netrunnera Korpo obejrzany na kampanii-śmieciu, Poligon
nietknięty.** Aktywna kampania była na czas oględzin przełączona na **„Oględziny 12.09 — do
usunięcia"** i wróciła na **„Poligon bojowy"**. W kampanii-śmieciu doszły dwie karty: **„Oględziny
Korpo"** (Korpo, Praca Zespołowa 3, zespół w komplecie) i **„Oględziny Deck"** (Korporacyjny
netrunner z HR-u, deck 5/7: Miecz, Zabójca, Robak, Pancerz), oraz karta rzutu „HR przysyła" na
czacie. Kartę Korpo założyło gniazdo z konsoli (`character:create` + `character:update`), zatrudnienie
szło już przez UI. Na „StrefiePrzemysłowej" niczego nie ruszano.

**Stan po sesji 12.09 (siódma) — Stym obejrzany na kampanii-śmieciu, Poligon nietknięty.**
Aktywna kampania była na czas oględzin przełączona na **„Oględziny 12.09 — do usunięcia"** i wróciła
na **„Poligon bojowy"** (na czacie Poligonu zostały dwa wiersze o przełączeniu). W kampanii-śmieciu
doszła karta **„Oględziny Stym"** (Medyk rangi 3, Farmaceutyki 3, 10/35 PW, jedna dawka Stymu
w plecaku, bez żetonu), trzy karty czatu (dawka, Test CHA, „Efekty wygasły") i **zegar przesunięty
o godzinę**. Na „StrefiePrzemysłowej" niczego nie ruszano.

**Stan po sesji 12.09 (szósta) — nowa kratka „StrefyPrzemysłowej" i kampania-śmieć.**
„StrefaPrzemysłowa" (aktywna scena Poligonu) ma kratkę **36,2 px** (40 × 30; wcześniej 47 px) —
zmiana świadoma, decyzja MG. Walka (RUNDA 1, Marcin i Tony) i budżet Marcina nietknięte (66,5 m /
12 m). Doszła kampania **„Oględziny 12.09 — do usunięcia"** (nie poligon) ze sceną „Test Brak sceny"
(mapa Night City, pusty żeton „Figura testowa"); serwer nie umie jej usunąć, więc **używaj jej** do
testów świeżej kampanii zamiast zakładać kolejną. Aktywna kampania wróciła na „Poligon bojowy".
Konta w Chrome: `localhost:5173` — **MG** (zalogowany ręką MG), `[::1]:5173` — **Tony**.

**Stan po sesji 04.09 (trzecia — montaż cyborgizacji i EMP) — Poligon wraca do stanu sprzed
sesji.** Nośnikiem była **nowa karta „Pacjent 23a"** (utworzona i skasowana w tej samej sesji,
razem z czterema wpisami `LedgerEntry` po zakupach wszczepów) oraz **dwa postawione żetony** —
„Pacjent 23a" i drugi „avatar9" — obydwa usunięte. Na „Strzelnicy" jest znowu **siedem żetonów**,
w bazie **dziewięć kart**. Granatnik podwieszany avatar9 wrócił do **naboju dymnego z magazynkiem
1/1** (na czas oględzin miał EMP), a z żetonu **Rudego Kwiatkowskiego** zdjęty został ślad po
cofniętym Impulsie — `statusData` znowu `{}`. Ślad zostawiony świadomie: **log czatu** — dwie
karty montażu (nieudany Fumble i udany), dwie karty Utraty Człowieczeństwa, dwie karty ataku
granatnikiem i dwie karty obrażeń przekreślone „Cofnięte — MG".

**Uwaga dla następnego, kto będzie tu strzelał bronią obszarową:** klik w żeton **zaznacza go**
zamiast celować (u MG wolno zaznaczyć każdą figurę), przez co uzbrojona broń schodzi z ręki,
a następny klik w mapę jest **rozkazem marszu**. Kolejność jest w `pulapki-dev.md`.

**Stan po sesji 09.09 (oględziny 29a — zdobywanie i wydawanie PD) — Poligon nietknięty.**
Nośnikiem był znowu **„Frank"**: na czas oględzin dostał właściciela **`Tester`**, Rolę
**Solo ze Zmysłem Walki 2**, 300 PD i cztery Umiejętności (Atletyka 2, Percepcja 4, Ogień ciągły 4,
Broń krótka 3), w trakcie sesji był jeszcze przestawiony na **Medyka** — i **wrócił do stanu
sprzed**: `NPC (MG)`, bez Roli, bez Umiejętności, 0 PD. Cztery karty graczy, którym „✦ Przyznaj
wszystkim" dosypało pulę (Tony, avatar9, Test 27x, Marcin), mają **z powrotem 0 PD**, a **rejestr
awansów jest znowu pusty** — przed sesją nie miał ani jednego wiersza w całej bazie.
**Ślad zerowy: ani jedna karta czatu nie powstała** (oba okna rzutu zamknięte „Anuluj"), żaden
żeton nie był stawiany ani kasowany, scena i kolejka walki nietknięte.

**Stan po sesji 06.09 (trzeciej — etap 40, prośba o Test).** Nośnikiem był znowu **„Frank"**:
na czas oględzin dostał właściciela **`Tester`** i **wrócił do `NPC (MG)`**. Karta jest
nietknięta — prośby i wezwania niczego na niej nie zmieniają (skutki rozlicza MG ręką, decyzja
z 32). W logu czatu został **ślad świadomy**: trzy karty „Prośba o Test" na Franku (zgoda z PT 15,
odmowa ze zdaniem MG, wycofana przez gracza), dwie karty wezwania i jedna karta rzutu
„Odczytywanie emocji (EMP) — Niezdane · 9". Otwartych wezwań **nie ma** (odwołane), kubek
Testera pusty. Reszta sceny nietknięta.

**Stan po sesji 04.09 (oględziny Zdolności Ról 30a–30d) — Poligon wraca do stanu sprzed sesji.**
Nośnikiem był **„Frank"**, przestawiany kolejno na dziewięć Ról (Solo → Medyk → Technik → Stróż
Prawa → Korpo → Rocker → Fixer → Nomada → Media) i **przywrócony z kopii zdjętej na starcie**:
znowu bez Roli, bez Umiejętności, bez broni i pancerza, 0 ed, 0 PD, PW 35/35. **„Rudy
Kwiatkowski" też wrócił** — na czas oględzin dostał Ciężki pistolet i Broń krótką 10, teraz ma
z powrotem samą „Bardzo dużą broń białą" i Broń krótką 3 (rana „Złamana noga" jest sprzed tej
sesji i została).

Skasowane po sesji: **żeton „Frank"**, **cztery żetony „Korpogliniarz 1–4"** postawione
Wezwaniem Wsparcia i **karta pracownika „Zwrotnica"** (Korporacyjny netrunner z zespołu Korpo).
W bazie jest znowu **dziewięć kart** i **siedem żetonów na „Strzelnicy"**.

Kolejka walki wróciła do **„PRZED WALKĄ" z tą samą piątką** (Tony, avatar9, testowy 2x2, Kolec,
Rudy Kwiatkowski) — sprawdzone przez włączenie i wyłączenie trybu turowego; **tryb turowy jest
wyłączony**, tak jak był. Walka rozegrana w trakcie sesji została zakończona wraz z jej
`systemState` (wpisy Wsparcia w drodze).

Ślad zostawiony świadomie: **log czatu z całej sesji** — rzuty Percepcji i Prowadzenia, karty
ataku (w tym jedna z kaflem „Fumble zignorowany" z wymuszonej kostki), dwie karty obrażeń
u Franka, Wezwanie Wsparcia i przybycie, Test Lojalności, Efekt Charyzmy, Targowanie się, zakup
z targiem, Test Rzetelności i szeptana karta Pogłosek. **Magazynek żetonu „Rudy Kwiatkowski"
(bliższego) pokazuje 7/8** — jeden strzał testowy; karta Rudego ma znów tylko broń białą, więc
ten licznik zniknie przy pierwszym odświeżeniu wiersza.

**Stan po sesji 02.09 (oględziny 29a i 29b) — Poligon nietknięty.** Nośnikiem była karta
**„Frank"** i wróciła do stanu sprzed sesji: właściciel **`NPC (MG)`**, bez Roli, bez
umiejętności, 0 PD, `formerRoles` puste. **Rejestr awansów (`AdvancementEntry`) jest znów pusty**
— w trakcie sesji stanęło w nim czternaście wierszy (zakup umiejętności, dwa zakupy Roli, dwa
powroty, przyznanie i zabranie 20 PD pięciu postaciom) i wszystkie zostały skasowane. PD
wszystkich dziewięciu kart: **0**, tak jak przed sesją. Kopia kart sprzed sesji:
`data/private/backups/characters-2026-09-02.json` (gitignore).

Ślad zostawiony świadomie: **jedna karta rzutu w logu czatu** — „Frank (Tester) — Prowadzenie
pojazdów (REF) · 1k10+13 = 20" z chipem „Moto 4 +4". Żaden żeton, żadna scena i żaden obiekt
sceny nie były w tej sesji dotykane.

**Do następnych oględzin wieloklasowości bierz „Franka", nie „Test 27x".** Pusta karta bez
Roli, bez ekwipunku i bez żetonu jest jedyną w bazie, której zepsucie nic nie kosztuje;
„Test 27x" jest nośna dla etapów 26x (cyberdek, żeton „Kolec" pod punktem dostępu).

**Stan po sesji 31.08 (Celowanie, broń z katalogu).** Poligon wraca do stanu sprzed sesji —
karta „Frank" była nośnikiem oględzin (broń z katalogu, rana nadana, zespół Korpo) i **została
wyczyszczona**: bez broni, bez ran, bez Roli i bez zespołu, tak jak stała. Zatrudniony na chwilę
pracownik **„Ochrona Test" jest skasowany** (to była jedyna karta pracownika w bazie).

Ślady zostawione świadomie: żeton **„testowy 2x2" ma 25/30 naboi** zamiast 27/30 (dwa strzały
testowe do avatar9, **oba pudła** — na kartach nikt nic nie stracił) oraz **kilka kart w logu
czatu**: dwa ataki z „Celowanie (głowa) −8" i „Celowanie (noga) −8", rana nadana i zdjęta
u „Franka" oraz rzut HR na pracownika. Kolejka walki nietknięta (tryb turowy nadal wyłączony),
scena bez zmian.

**Stan po sesji 30.08 (czwarta) — rany krytyczne.** Poligon został przygotowany pod oględziny
łatania i zostaje w tym stanie:

- **Karta „avatar9"** ma dopisane **Ratownictwo medyczne 6** i **Broń krótką 10** (żeby mogła
  sama się łatać i trafiać z Celowaniem), a na niej **trzy rany**: „Złamana noga", „Strzaskane
  palce" i **„Test łaty 15"** — rana **wpisana ręką MG w kompendium** (−3 do RUCH-u, −1 do
  rzutów, brak Uniku, DoT po biegu), zostawiona jako gotowy materiał do sprawdzania flag 14e.
  Łaty zdjęte, PW i pancerz przywrócone.
- **Karta „Rudy Kwiatkowski"** ma **Broń białą 10** i **„Bardzo dużą broń białą" (4k6)** z katalogu
  oraz ranę **„Złamana noga"** z Celowania — para gotowa do sprawdzania połowy pancerza. Żeton
  wrócił na (2000, 1500).
- **Żeton „Automatyczna wieżyczka"** ma w profilu bojowym ranę **„Odcięta dłoń"** (2k6 = 3)
  i **Percepcję 12** na liście Umiejętności. Oba wpisy zostają świadomie: to jedyna figura
  **bez karty postaci**, na której widać sekcję „Rany" i sekcję „Testy" w pasku (31.08 —
  zdejmowanie rany z UI działa już od tej sesji, wcześniej było pozycją długu). PW 25/25,
  magazynek pełny. „Złamane żebra" nadano i wyleczono w trakcie oględzin 31.08 — na figurze
  ich już nie ma.
- **Kompendium ma o jeden wpis własny więcej** — „Test łaty 15" w Ranach krytycznych (23 zamiast
  22). Kasować nie trzeba: to jedyny wpis, na którym widać komplet pól rany z edytora.

**Od 27.08 w kampanii stoi „Rudy Kwiatkowski" — jedyna postać zrobiona kreatorem od zera.**
Fixer (Znajomości 4, PW 40, Człowieczeństwo 60), bez portretu i bez żetonu, właściciel „NPC (MG)".
Powstał przy odklikiwaniu 27c i **zostaje decyzją MG (27.08)**: to jedyny w bazie dowód, że pełny przebieg
kreatora dowozi komplet — 17 odpowiedzi Ścieżki Życia na stronie drugiej, „Wiedza lokalna:
Pacifica" i „Język: Angielski" na stronie pierwszej. Ta ostatnia rzecz jest dowodem na naprawę
z 27.08 (kreator gubił specjalizacje) — kasując go, tracisz jedyny egzemplarz do porównania.

**„Poligon bojowy" stoi na poziomie sklepu 2 (Zawodowe)** — przestawione 22.08 decyzją MG wprost
w bazie (`Campaign.shopTier`), bo migracja dawała każdej kampanii `shopTier = 1` i gracz nie kupił
by niczego droższego niż 50 ed. Przełącznik 1–4 jest w zakładce **„Kompendium"** pod chipami
kategorii; MG kupuje przez wszystkie poziomy niezależnie od niego. **Sprawdzone 22.08:** Kompendium pokazuje „Sklep: **Zawodowe** · Do 500 ed", a wpisy wyższych
poziomów są wyszarzone z powodem — wartość z bazy dociera do UI poprawnie.

## Jak się ogląda (procedura, nie stan)

Przeniesione z „Od czego zacząć" w `POSTEP.md` 10.09.2026 — to procedura, a nie stan sceny,
więc nie starzeje się razem z resztą tego pliku.

**Kampania „Poligon bojowy" jest oznaczona jako poligon** — chip „POLIGON" w górnym pasku
i krótkie pytanie przy kasowaniu. Flaga niczego nie blokuje i **nie rozchodzi się sama** po
podpiętych ekranach (patrz pułapki).

**Oględziny Roli robi się jedną kartą przestawianą kolejno na dziewięć Ról** — tak poszły
30a–30d 04.09 (decyzja MG), na „Franku", w kolejności Solo → Medyk → Technik → Stróż Prawa →
Korpo → Rocker → Fixer → Nomada → Media. Żadna karta na scenach testowych nie ma tych Ról
z siebie. **Od 29a wybór Roli ma wyłącznie MG**, więc oględziny Ról robi się
z sesji MG albo przestawia Rolę u MG i patrzy graczem. **Trzecia droga, tańsza i sprawdzona
30.08, 02.09 oraz 04.09:** kartę przygotowuje się wprost w bazie (`node --input-type=module` +
`node:sqlite` na `packages/server/dev.db`, przeładowanie karty przeglądarki przynosi nowy stan)
— patrz pułapki. **Nośnikiem bez skutków ubocznych jest „Frank"** (pusta karta poligonu, bez
Roli i bez ekwipunku); 02.09 dostał na czas sesji właściciela `Tester` i wrócił do `NPC (MG)`.
Kopia wszystkich kart sprzed tamtej sesji: `data/private/backups/characters-2026-09-02.json`.
**Kartę nośną dla innego etapu trzeba potem przywrócić**: „Test 27x" jest netrunnerem poligonu
Sieci i po 29b wróciła do Interfejsu 7 (`poligon.md`).

## Stan po sesji 05.09 (druga — etap 35: ping, ramka, kopia)

**Poligon wrócił do stanu sprzed sesji i po raz pierwszy jest to sprawdzone różnicowo.**
Serwer robi od 05.09 kopię przy starcie, więc `snapshot-2026-09-05-1123/db.sqlite` jest
dokładnym zdjęciem sceny sprzed oględzin — porównanie kolumn `x`, `y`, `hidden`, `statuses`,
`statusData` i `publicName` wszystkich trzynastu żetonów dało **zero różnic**, przy zgodnych
licznikach: 13 żetonów, 9 kart, 6 scen, 23 wpisy księgi, 1 walka (ta z „Jhonnym" i „Vexem" na
innej scenie). **To jest odtąd najtańszy sposób sprzątania po oględzinach** — szybszy i pewniejszy
niż odtwarzanie pozycji z pamięci.

Zrobione i cofnięte w tej sesji: **dwie kopie „Rudego Kwiatkowskiego"** („Rudy Kwiatkowski 2"
i „3", jedna gestem Alt+przeciągnięcia, druga guzikiem „⧉ Duplikuj") — skasowane koszem
grupowym; **tryb turowy** włączony na potrzeby sprawdzenia bramki ruchu grupowego i wyłączony
(kolejka „PRZED WALKĄ" wraca jednym kliknięciem, tak jak było); **pozycje trzech żetonów**
(„Tony" 900/1400, „Automatyczna wieżyczka" 1200/1700, „testowy 2x2" 1200/1900) przesunięte
ruchem grupowym i przywrócone wprost w bazie przy zatrzymanym serwerze.

**Ślad zerowy także w czacie** — i to jest samo w sobie potwierdzenie kryterium etapu: ping nie
zostawia po sobie ani wiersza czatu, ani niczego w bazie. Operacje grupowe (ukrycie, naklejki,
kosz) też nie piszą do czatu.

**Do oględzin z konta gracza użyty był `Tony`, nie `Tester`** — Tester nie ma na Strzelnicy
żadnej figury, a kryterium „gracz z ramką na całą mapę dostaje pod kontrolę wyłącznie swoje
figury" wymaga, żeby jakąś miał. Tony ma dokładnie jedną z siedmiu widocznych i to właśnie ona
jako jedyna złapała się w ramkę.

## Stan kart po oględzinach 29b (30.08, trzecia sesja)

**Karta „Test 27x" była w trakcie oględzin przestawiona na Solo 4 z 400 PD, a potem na Nomadę
z Solo jako poprzednią Rolą — i została przywrócona.** Po sesji stoi z powrotem jako
**Netrunner, Interfejs 7, 0 PD, `formerRoles: []`**, z cyberdekiem na miejscu; wiersz rejestru
awansów, który powstał przy zakupie Roli, został skasowany. Poligon Sieci (żeton „Kolec"
podpięty do tej karty) jest nienaruszony. **Do następnych oględzin wieloklasowości trzeba tę
sytuację odtworzyć od nowa** albo zrobić kartę osobną — „Test 27x" jest nośna dla etapów 26x.

**Zastane, nie z tej sesji: karta `avatar9` ma Rolę `solo` z rangą 1**, choć `POSTEP.md` opisuje
avatar9 jako netrunnera. Netrunnerem jest **„Test 27x"** (to ona ma cyberdek) — obie należą do
konta `avatar9` i stąd pomyłka w notatce.

## Stan kart po sesji 28.08 (pakiet A+B — ekonomia i chrom)

**avatar9 jest od 28.08 jedyną postacią w bazie z chromem** i zostaje taki celowo: to jedyny
egzemplarz, na którym widać rozbicie gniazd z 27c i księgę Człowieczeństwa z 23a. Ma
**dwie Cyberręce** (prawa: „Pazury" + „Chwytna Dłoń", lewa pusta), **„Ciężką kurtkę kuloodporną"**
(OB 13, kara −2) w pancerzu, **Człowieczeństwo 28/44**, **EMP w grze 2** (chip „EMP 2 · Na
granicy" na liście postaci) i **200 ed**. Saldo po drodze podbiła korekta MG do 3000 ed, żeby
starczyło na cztery montaże — bez niej nie było czego klikać.

**Tony wrócił do stanu sprzed sesji** (50 ed, jeden pusty wiersz sprzętu). Kupiona mu
„Apteczka polowa" została skasowana omyłkowym kliknięciem kosza — opis w `pulapki-dev.md`;
zakup zdążył zostać potwierdzony w bazie, na karcie i kartą na czacie.

**Kopia wszystkich dziewięciu kart sprzed sesji:**
`data/private/backups/characters-2026-08-28.json` (gitignore). Jeśli chrom avatar9 zacznie
przeszkadzać w innych oględzinach, stan wraca stamtąd jednym `UPDATE Character SET data = …`.

## Stan po ostatnich oględzinach (22.08, trzecia sesja tego dnia)

Przywrócone: tryb turowy wyłączony, rana zdjęta, wszystkie ściany i okna skasowane, widoczność
z powrotem „Pełna". Zostawione świadomie: punkt dostępu odsłonięty, „Kolec" u avatar9, avatar9
dwie kratki niżej z naklejką „Onieśmielony" i +50 ed z testowego przelewu.

## Stan po oględzinach 22.08 (piąta sesja tego dnia)

Bez zmian względem opisu wyżej. W trakcie sesji Poligon był używany do odklikania zaległości
i **przywrócony**: tryb turowy wyłączony (kolejka skasowana), „Kolec" wrócił pod punkt dostępu,
osłona **„Samochód 25/25"** odtworzona presetem w tym samym miejscu po sprawdzeniu kosza „usuń
wszystkie osłony", tymczasowa ściana przy Tonym skasowana, wpis testowy w kompendium i dodany
wiersz broni Tony'ego usunięte. Scena testowa **„Korytarz 16e"** (ściany, trzy żetony, w tym
figura 2×2) powstała na czas oględzin i została skasowana razem z zawartością — jeśli będzie
znów potrzebna, zbuduj ją od nowa: scena z widocznością „Dynamiczna", ściana w kształcie L,
żeton 1×1 z profilem bojowym i paskiem HP oraz żeton 2×2.

## Scena „Efekty 23x" (23.08, sesja triażu zaległości)

Osobna scena w tej samej kampanii, zbudowana **zamiast ruszania Strzelnicy** (decyzja MG).
Widoczność `open`, pusta siatka 100 px, dwie figury 1×1:

- **Strzelec 23x** — statysta (profil bojowy): Umiejętność 10, Unik 2, pancerz OB 0,
  broń **Granatnik**, magazynek wystrzelany do 0/2 (przeładowanie kosztuje Akcję).
- **Cel 23x** — statysta: pancerz **OB 6** (zaczynał od 7, ablacja zdjęła jeden), PW 33/35.

Do czego służy: efekty walki z 27i (wybuch odklikany, **zostają gaz i wyładowanie strefy**)
i wszystko, co wymaga trybu turowego bez dotykania Strzelnicy. Walka jest zakończona, scena
stoi w podglądzie — aktywna jest z powrotem „Strzelnica". Do gazu trzeba wpisu amunicji
gazowej w magazynku, do wyładowania — strefy „Podłoga elektryczna" narzędziem stref.

**Naprawione 26.08:** karta ataku statysty **ma już przycisk „Obrażenia"** — rzut obrażeń
obszarowych nie wymaga figury z kartą postaci. Na tej scenie to sprawdzano (pakiet P1);
po oględzinach magazynek Granatnika wrócił do **0/2**, a „Cel 23x" do **PW 33/35, OB 6**.

## Stan po oględzinach 23.08 (etap 27k — edycja sceny)

**Rozjazd z opisem wyżej, zastany na starcie sesji (nie spowodowany przez 27k):**

- **⚠ „Podłogi elektrycznej" nie ma na Strzelnicy.** Licznik stref w pasku pokazywał „brak stref"
  jeszcze zanim cokolwiek w tej sesji ruszono. Opis z 26f jest w tym punkcie nieaktualny.
- **Osłony „Samochód 25/25" też nie ma.** Licznik osłon startował od zera. Poprzedni wpis
  (22.08, piąta sesja) mówi, że została odtworzona presetem — od tego czasu zniknęła.
- **Punktów dostępu jest sześć, nie jeden.** Opis z 22.08 wymienia jeden odsłonięty „Punkt
  dostępu"; pięć kolejnych doszło później.
- **Na Strzelnicy leży ściana w kształcie L** (3 segmenty). Opis z 22.08 mówi „wszystkie ściany
  skasowane" — ta jest zostawiona po testach figury 2×2 z 23.08.

**Przywrócone po oględzinach 27k:** wszystko, czego dotknęła ta sesja. Kasowanie i `Ctrl+Z`
sprawdzono na siedmiu rodzajach obiektów; każdy albo wrócił cofnięciem, albo był stworzony na
potrzeby testu i został skasowany. Stan końcowy Strzelnicy: **6 gniazd, 3 segmenty ściany,
0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków.** Zaznaczenie żetonu jest lokalne i nic nie
zapisuje. Scena **„Efekty 23x" nietknięta**.

## Scena „Karty 24x" (24.08, etap 27l — karty obiektów sceny)

Trzecia scena testowa w tej samej kampanii, znów zbudowana **zamiast ruszania Strzelnicy**.
Widoczność „Ręczna mgła", siatka 100 px, mapa pusta — na scenie stoi **po jednym obiekcie
każdego z siedmiu rodzajów**, dokładnie po to, żeby dwuklik w każdy z nich otwierał kartę:

| rodzaj  | co konkretnie                                                                       |
| ------- | ----------------------------------------------------------------------------------- |
| ściana  | pionowy odcinek (zwykła ściana)                                                     |
| drzwi   | ukośny odcinek, **otwarte, gracze mogą otwierać, bez rygla** — przestawione z karty |
| osłona  | „Samochód 25/25", przesunięta i przeskalowana uchwytami                             |
| strefa  | ⚠ „Podłoga elektryczna" 20 PW, uzbrojona                                            |
| światło | lampa różowa, **zgaszona** (przestrojona z karty)                                   |
| notatka | pinezka 📌 „Za drzwiami czeka zasadzka"                                             |
| rysunek | etykieta „Magazyn B" — literówka poprawiona z karty, warstwa **wspólna**            |

Do czego służy: wszystko, co robi karta obiektu — zmiana rodzaju przegrody, rygiel,
„gracze mogą otwierać", naprawa osłony, przestrojenie lampy, treść etykiety, przeniesienie
rysunku między warstwami — plus **uchwyty**: przeciągnięcie obrysu przesuwa, róg prostokąta
i koniec ściany skalują, `Ctrl` wyłącza przyciąganie do kratki.

Aktywna jest z powrotem **„Strzelnica"**; ta scena stoi w podglądzie. Strzelnica po tej sesji:
**6 gniazd, 3 segmenty ściany, 0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków** — czyli
dokładnie tak, jak ją zostawiło 27k. Scena **„Efekty 23x" nietknięta**.

## Konto testowe gracza `Tester` (27.08) — zamiast konta-śmiecia

Cztery zaległości typu „strona gracza nieodklikana" miały jedną przyczynę: dołączenie do stołu
**nowym imieniem** zakładało w kampanii kolejne konto-śmiecia, więc nikt tego nie robił. Od 27.08
w bazie dev siedzi na stałe gracz **`Tester`** — członek **wszystkich** kampanii, **bez żadnej
postaci** (to jego zadanie: pokazuje pusty stan listy postaci z 27f).

- **Wejście na konto:** `http://localhost:5173/join/tester-dev` → na ekranie dołączenia kliknij
  **„Tester"** (zaproszenie o stałym adresie, ważne do sierpnia 2027, przypięte do „Poligonu bojowego" — nie do aktywnej kampanii,
  sprawdzone 13.09).
  Gracze **nie mają haseł** — `routes/auth.ts` loguje wyłącznie MG — więc link zaproszenia jest
  całą procedurą i dlatego może stać jawnie w repo: prowadzi do lokalnej bazy dev, a `dev.db`
  jest w `.gitignore`.
- **Tym samym ekranem wraca się na dowolne inne konto** (Tony / avatar9 / Marcin) — imię, które
  już jest w kampanii, to ten sam użytkownik, nie nowy.
- **Dwie sesje naraz w jednym Chrome** działają jak dotąd: `localhost:5173` i `[::1]:5173`
  (`127.0.0.1` **nie działa** — Vite tam nie słucha; sprawdzone 27.08). Który host trzyma MG,
  a który gracza, zależy od ciasteczek — sprawdź nagłówek okna, nie zakładaj.
- **Seed był jednorazowy, skryptu nie ma w repo** (decyzja MG): konto i zaproszenie żyją w bazie.
  Gdyby `dev.db` kiedyś zniknęło, wystarczy dołączyć do stołu imieniem `Tester` i nie dawać mu
  żadnej postaci.

## Stan po oględzinach 27.08 (pakiet A+B+X1)

Sesja pracowała na **„Strzelnicy"** i **wszystko po sobie posprzątała** — scena wróciła do stanu
z 27l: **4 żetony** (Tony, avatar9, Automatyczna wieżyczka, testowy 2x2), **0 rysunków**,
biblioteka grafik żetonów znów ma **4 pozycje** (avatar22, avatar14, avatar11, avatar9).
Po drodze były i zniknęły: żeton „Tester 27x" (właściciel `Tester`, status Nieprzytomny),
dwie grafiki testowe w bibliotece i trzy rysunki (jeden gracza, dwa MG — w tym jeden na warstwie MG).
Status **„Onieśmielony" na żetonie avatar9 jest zastany**, nie z tej sesji.

## Stan po oględzinach 27.08 (pakiet Sieci A+B) — Strzelnica ma teraz komplet pod Sieć

**Rozjazd zastany na starcie: żetonu „Kolec" nie było w bazie w ogóle** (opis na górze tego
pliku obiecywał go od 22.08; zniknął gdzieś między 23.08 a 27.08). **Odtworzony** — i przy okazji
wyszło, że **z UI nie da się dorobić żetonu skasowanej postaci**: `token:create` przyjmuje
`characterId`, ale jedynym miejscem, które go wypełnia, jest kreator postaci (`creation.ts`),
a panel „Tokeny" stawia wyłącznie puste żetony. Żeton odtworzono zdarzeniem `token:create`
z konsoli; pomysł na przycisk „Postaw na scenie" przy wierszu postaci → `POMYSLY.md`.

Scena **„Strzelnica"** po tej sesji — **wszystko, co doszło, zostawiono świadomie**, bo dopiero
z tym kompletem Sieć da się przeklikać bez budowania czegokolwiek od nowa:

| co                              | gdzie / stan                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| żeton **„Kolec"**               | world 1500 × 700, właściciel `avatar9`, karta **„Test 27x"** (Netrunner, Interfejs 7), PW 35/35 — tuż przy odsłoniętym „Punkcie dostępu" (1537 × 761)                                        |
| gniazdo **„Gniazdo za ścianą"** | id 10, world 1600 × 2400, **odsłonięte**, podpięte do „siec klub" — leży po **drugiej stronie** pionowego segmentu ściany L (x = 1700), więc `NET_WALL_BLOCKS` jest odklikywalne w dwa ruchy |
| **drzwi #59**                   | world 2400 × 1900–2200, zamknięte, bez rygla — podpięte do „Węzła ochrony" jako urządzenie **„Brama serwerowni"** (rodzaj „Drzwi lub winda")                                                 |

Reszta bez zmian: **5 żetonów** (Tony, avatar9, Automatyczna wieżyczka, testowy 2x2, Kolec),
3 segmenty ściany, 0 świateł, 0 osłon, 0 stref, 0 notatek, 0 rysunków, **7 punktów dostępu**.
Tryb turowy **wyłączony** (kolejka skasowana), żadnego runu w bazie.

**Architektura „siec klub" przywrócona do czterech pięter** — w trakcie sesji dokładano do niej
Zabójcę (piętro 2), Krakena (piętro 1), drugiego Demona i dwa piętra-atrapy pod pasek „Uwagi";
wszystko zdjęte. Została **tylko** trzecia pozycja urządzeń na „Węźle ochrony" (drzwi).

**Karta „Test 27x" sprawdzona bajt po bajcie ze zrzutem sprzed sesji** — jedyna różnica to
`skillSpecialties: {}` zamiast braku klucza (normalizacja, którą robi każdy zapis karty).
Cyberdek wrócił w komplecie: Gumka, Pancerz, Miecz, Młot na wroga, Superklej, Szabloząb;
PW 35/35, bez ran krytycznych.

**Uwaga na przyszłość:** biblioteka grafik żetonów ma dziś **5 pozycji** (doszedł `avatar25`),
a nie 4, jak mówi notatka z 27.08 w `POSTEP.md` — nie ruszała tego ta sesja.

## Stan po oględzinach 28.08 (pakiet A) — Strzelnica ma teraz komplet stref

**Pięć stref bronionych zostaje na scenie świadomie**, tą samą decyzją, którą 27.08 zostawiło
komplet pod Sieć: dopiero z nimi 26f i efekty z 27i da się przeklikać bez budowania czegokolwiek
od nowa. **Wszystkie są uzbrojone i ukryte** (`hidden = 1`, więc gracz ich nie widzi, dopóki nie
zda Percepcji PT 17 z 4 m) — **żeton, który na nie wejdzie, naprawdę oberwie**.

| id  | strefa                      | world (x, y, szer., wys.) | co robi                                                                        |
| --- | --------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| 7   | ⚠ Automatyczna wieżyczka    | 1549, 1251, 296 × 300     | strzela żetonem **„Automatyczna wieżyczka"** (pole „Stanowisko"), WB 14        |
| 4   | ⚠ Podłoga elektryczna       | 2346, 1652, 296 × 299     | 6k6 przez pancerz przy wejściu i na koniec każdej Tury na obszarze             |
| 8   | ⚠ Ślizgawka                 | 1949, 2359, 296 × 295     | każdy **ruch** na obszarze wymusza Atletykę PT 15, porażka = Powalony          |
| 5   | ⚠ Maź                       | 2346, 2452, 296 × 296     | RUCH −2k6 i naklejka „Spowolniony", dopóki figura nie zejdzie z obszaru        |
| 6   | ⚠ Winda z gazem usypiającym | 2346, 2849, 296 × 296     | wchodzi **pierwszym miejscem do Kolejki Inicjatywy**; odpala ją MG w jej Turze |

Wieżyczka jest tu **dwa razy** i to jest zaleta, nie pomyłka: ten sam żeton jest urządzeniem
„Grzechot" na „Węźle ochrony" w architekturze „siec klub", więc netrunner może go wyłączyć
z Sieci, a strefa przestaje strzelać (`zoneDisarmedByNetrunner`). To jedyne miejsce na Poligonie,
gdzie Sieć i mapa spotykają się w jednym obiekcie.

**Przywrócone po sesji:** Tony (900 × 1500, bez statusów, PW 35/35, dwie bronie — Granatnik
z gazem był dodany na czas oględzin i został skasowany), Rudy Kwiatkowski (2000 × 1500),
magazynek wieżyczki 25/25, tryb turowy **wyłączony** (kolejka razem z wierszem pułapki skasowana).
Reszta bez zmian: 6 żetonów, 3 segmenty ściany, 7 punktów dostępu, 0 świateł, 0 osłon,
0 notatek, 0 rysunków.

**Rozjazdy z opisem wyżej, zastane na starcie sesji:** (1) **„Rudy Kwiatkowski" ma żeton**
(2000 × 1500) — akapit z 27.08 mówi „bez żetonu"; postawił go kreator, bo `creation.ts` jako jedyny
wypełnia `characterId` przy `token:create`. (2) Żetonów jest **sześć**, nie pięć.

## Scena „Korytarz 16e" (28.08, sesja pakietu A+B+D+E) — **czwarta scena stała**

Zbudowana od nowa i **zostawiona na stałe** decyzją MG z 28.08. Do tej pory powstawała i ginęła
przy każdej sesji, która potrzebowała dynamicznej widoczności (ostatnio 22.08), i za każdym
razem płaciliśmy za nią drugi raz. Poligon nie miał ani jednej stałej sceny z widocznością
`dynamic` — a to jest jedyny tryb, w którym da się oglądać cień ścian, przerwania marszu
i „ktoś wychodzi zza rogu". (Trzecim powodem był najgorszy przypadek wydajności dla etapu 27g;
**27g wycofano 01.09**, scena zostaje z dwóch pierwszych.)

**Ustawienia:** widoczność **Dynamiczna**, pamięć eksploracji **włączona**, ciemna scena
wyłączona, siatka 100 px, mapa pusta.

**Geometria:** jeden łańcuch ścian w kształcie **litery L** — odcinek poziomy przez środek
sceny i krótszy pionowy w górę z jego prawego końca. Wystarczy do trzech rzeczy naraz:
cień z jednej strony, obejście rogu i „ktoś wychodzi zza rogu".

**Figury:** `avatar9` (postać gracza, po lewej pod murem) i **„Rudy Kwiatkowski"** (NPC,
początkowo za murem — niewidoczny dla gracza; w trakcie oględzin przeciągnięty na stronę
gracza i tam został). Obie postawione **nowym przyciskiem ⊕ „Postaw na scenie"**, nie kreatorem.

**Aktywna z powrotem jest „Strzelnica"** — ta scena stoi w podglądzie, jak „Efekty 23x"
i „Karty 24x". Strzelnica po tej sesji ma **drugą figurę Rudego** (postawioną przy sprawdzaniu
przycisku ⊕, właściciel przestawiony na **avatar9** przy sprawdzaniu pustego paska gracza) —
zostawiona świadomie: to jedyna figura w bazie, na której widać zdanie „Ta figura ma kartę
postaci, ale nie jest przypisana do ciebie".

**Kampania „Poligon bojowy" jest od 28.08 oznaczona jako poligon** (`sandbox = true`) — chip
„POLIGON" w górnym pasku i krótkie pytanie przy kasowaniu. Nie zdejmuj tej flagi bez powodu:
to jedyna kampania, na której wolno wszystko zepsuć.

**Handout „Kto zostawił krążek na Poligonie?"** (screamsheet z wgraną grafiką) został jako
dowód odbitki gazetowej z 24c — jedyny screamsheet w kampanii ze zdjęciem.

## Stan po sesji 01.09.2026 (etap 31 — dodatki do broni)

Karta **avatar9** została świadomie zmieniona, żeby dało się obejrzeć dodatki bez przygotowań:

- **„Arasaka Minami 10"** ma **magazynek bębnowy** i **złącze smartguna** (trzy gniazda zajęte),
  więc magazynek to **50**, nie 30. Stan naboi po oględzinach: 23/50.
- **„Militech Dragon"** — **nowy wiersz** dopisany z katalogu; nosi **bagnet** i **granatnik
  podwieszany** (trzy gniazda zajęte), a pod nim dwa wiersze `↳`. Magazynek karabinu 25/25,
  granatnika **0/1** (jeden granat wystrzelony w oględzinach, pudło z odchyleniem).
- **Wszczepiony „Uchwyt podskórny"** (prawa cyberręka) — **bez niego złącze smartguna nie daje
  +1**, więc to on jest warunkiem obejrzenia tej reguły. Człowieczeństwo zapłacone: **28 → 26**,
  maksimum spadło z 42 na 40 (dalej „Na granicy”).

To jest komplet potrzebny do trzech nieoglądanych pozycji z `zaleglosci.md` (noktowizor w dymie,
luneta od 51 m, demontaż przycinający naboje) — nie kasuj go, dopóki nie zostaną odhaczone.
Ślad w logu czatu: trzy karty ataku avatar9 z 01.09.

## Stan po sesji 01.09.2026 (druga) — pasek dodatków i domknięcie oględzin 31

Poligon **przywrócony do stanu z pierwszej sesji 01.09**, opisanego w akapicie wyżej — z jednym
wyjątkiem i kilkoma śladami w logu czatu.

**Przywrócone po oględzinach:** dym rozwiany („Rozwiej cały dym" w panelu osłon), rana
**„Złamana noga"** zdjęta z **Automatycznej wieżyczki**, a jej PW cofnięte do **25/25** guzikiem
„Cofnij" na karcie obrażeń; dopisany na czas oględzin wiersz broni **„Granatnik"** (z „Amunicją
dymną") skasowany z karty avatar9; **„Celownik noktowizyjny"** zdjęty z Arasaki, a **„Magazynek
bębnowy"** wrócił na swoje miejsce — Arasaka stoi z powrotem na **23/50** ze złączem smartguna
i bębnem; żeton avatar9 wrócił na swoje pole z **PW 35/35**. Militech Dragon **25/25**,
granatnik podwieszany **0/1**, „testowy 2x2" **PW 35/35**, Rudy Kwiatkowski **40/40**.

**Ślady zostawione świadomie:** karty w logu czatu z tej sesji — siedem strzałów z Celowaniem
(noga) z Arasaki, atak bagnetem i strzał z granatnika podwieszanego, granat dymny z odchyleniem
oraz karta rany „Celowanie (noga): Złamana noga" u wieżyczki wraz z wierszem „Cofnięte — MG".
Historii czatu się nie sprząta.

**Do zapamiętania przy oględzinach ran krytycznych u figur bez karty:** statysta
**„testowy 2x2" ma OB 13**, więc 2k6 nigdy go nie przebije i rana krytyczna nie ma jak powstać.
Figurą, na której to widać, jest **„Automatyczna wieżyczka"** — OB 0.

**Do zapamiętania przy oględzinach dymu:** chmury nie da się postawić narzędziem. Trzeba wiersza
broni ze wzorcem `grenade` (Granatnik, Granat) i naboju **„Amunicja dymna"** wybranego listą przy
wierszu. **Od 02.09 listę ma też broń podwieszana** — granatnik pod karabinem strzela dymem
i gazem jak każdy inny, więc dopisywanie osobnego wiersza „Granatnik" z katalogu nie jest już
potrzebne.

## Stan po sesji 02.09 (druga tego dnia — trzy błędy z 31 i 32)

Zmienione i **zostawione**: **„Militech Dragon" avatar9** ma w granatniku podwieszanym wybraną
**„Amunicję dymną"**, magazynek **1/1** (karabin bez zmian, **25/25**). To stan przygotowany pod
następne oględziny dymu — jeden klik „Atak" i chmura stoi.

Posprzątane: dym z tej sesji **rozwiany** guzikiem „Rozwiej cały dym" (panel narzędzia osłon —
przy okazji sprawdzony i działa); **„Frank"** miał na czas testu odmowy podstawione
`formerRoles: [solo]` prosto w bazie i **wrócił do stanu sprzed** (`roleId: null`,
`formerRoles: []`) — kopia w scratchpadzie sesji.

**Ślady zostawione świadomie:** karta strzału z granatnika podwieszanego „nabój: Amunicja dymna
· obszar 10×10 m · odchylenie…" w logu czatu.

## Oględziny 38b (06.09.2026) — scena wrócona do stanu sprzed sesji

Do sprawdzenia przenoszenia przedmiotów poligon dostał na czas sesji: **„Frank" z właścicielem
`Tester`** (trzy stimpaki, 120 ed) z figurą postawioną **1 m** od ciała, oraz **„Rudy
Kwiatkowski" jako ciało** (0 PW, Zgrzyt 9 12/30, Kurtka Kevlarowa OB 7/11, Stimpak ×2, 500 ed).
**Wszystko przywrócone po oględzinach** ze snapshotu startowego
(`data/private/backups/snapshot-2026-09-06-1056/db.sqlite`): Frank znów jest `NPC (MG)` z pustą
kartą i zerowym saldem, Rudy ma 40 PW, 500 ed i samą „Bardzo dużą broń białą", a figura
`tok-frank-38b` została skasowana.

**Co zostało po sesji i zostać musi:** dwa wiersze w `LedgerEntry` („do: Frank" / „od: Rudy
Kwiatkowski", 500 ed) i kilka kart czatu rodzaju `inventory`. Audyt jest z założenia
tylko-do-dopisywania, a historii czatu i tak się nie sprząta.

**Przepis na powtórzenie tego układu** (gdy MG będzie chciał odklikać menu figury): karta bez
właściciela z ekwipunkiem i `hpCurrent: 0`, figura gracza w promieniu 2 m — nic więcej nie trzeba,
bo o wszystkim rozstrzyga `ownerId`, stan figury i odległość.

## Oględziny 34 (06.09.2026) — dwie tabele testowe, które zostają

Poligon ma od tej sesji **dwie tabele losowe** (zakładka MG „Tabele") i **zostają na stałe**, bo
są najtańszym sposobem sprawdzenia podrzutu bez odtwarzania czegokolwiek:

- **„Bronie uliczne"** (`1d10`, tylko MG) — 1–6 średni pistolet niskiej jakości, 7–10 rozpruwacze;
- **„Łup z kieszeni"** (`1d10`, tylko MG) — 1–5 zmięte eddiesy, **6–10 „Broń przy ciele"
  z podrzutem do „Broni ulicznych"**.

Drugi wiersz „Łupu" jest całym testem zagnieżdżenia: jedno kliknięcie „Losuj" ma dać na czacie
kartę z **dwoma** krokami. Do sprawdzenia widoczności wystarczy „Pokaż stołowi" przy dowolnej
karcie — publiczna kopia ma być jedyną, którą `Tester` widzi po przeładowaniu.

**Ślady zostawione świadomie:** kilka kart czatu rodzaju `gmrolltable` i jedna `rolltable`
(pokazana stołowi). Czatu się nie sprząta.
