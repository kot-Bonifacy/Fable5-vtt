# Otwarte zaległości (dług oględzin i drobne braki)

**Główny ekran (25.09, ósma sesja) — do obejrzenia ręką MG:** baner figury **bez portretu** (widziany tylko atrapą w DOM — niski pasek z inicjałem), baner u gracza z „Kończę turę” nad nim, kadr 4:3 portretów o nietypowych proporcjach (`object-position: 50% 22%` trzyma górę kadru) i pas filtrów czatu na iPadzie (`@container` od Safari 16).

**Pas kolejki i „Kończę turę” (25.09) — do obejrzenia ręką MG:** przycisk gracza na górze lewego panelu i „✓” w zwiniętym (widziane tylko atrapą w DOM — MG go nie dostaje, a sesji gracza nie było), podwójny klik przy dwóch figurach gracza pod rząd w kolejce, pas przy 10+ uczestnikach (przewijanie kółkiem, dojazd do aktywnego) i na iPadzie (`@container` od Safari 16).

**Oględziny handlu 38c (23.09) — nieobejrzane:** przeciąganie palcem na iPadzie (`touch-action: pan-y`, poziomy gest do pola) i handel dwóch graczy w przeglądarce (pokryty testem serwera). Pierwsze przeciągnięcie kabla u MG z automatu nie wylądowało przy poprawnej geometrii, drugie tak — jeśli MG zobaczy to ręką, zacząć od `startDrag`/przechwycenia wskaźnika w `TradeWindow.tsx`.

Lista rzeczy **otwartych**, przenoszona między etapami; wyprowadzona z `POSTEP.md` 22.08.2026,
żeby nie obciążała pliku czytanego na starcie każdej sesji. Czytaj ją, gdy siadasz do
odhaczania zaległości albo dotykasz etapu, który tu występuje — nie rutynowo.

Zamknięte pozycje — z całą diagnozą i opisem naprawy — są w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 25.09 (dziewiąta sesja): strzykawka bezigłowa, `ruff format`, wyszarzona karta
czekająca na MG.** Zastrzyk siłą (s. 150) działa z karty guzikiem „Siłą” — obejrzany na
kampanii-śmieciu (pudło, dawka została). Po drodze wyszedł **błąd spoza listy**: okno edycji
żetonu z rozwiniętymi „Statystykami bojowymi” miało ~1100 px i chowało „Zapisz” pod krawędzią
ekranu — naprawione dla wszystkich dialogów (`.dialog` z limitem wysokości i przewijaniem).
Wsparcie 10 zostaje decyzją MG. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 24.09 (druga sesja): zaległości lokalnego LLM — na nowym modelu Qwen3.8-27B.**
MG przełączył model z Qwythos-9B Q8_0 na **Qwen3.8-27B UD-Q3_K_XL** (build 10735); wszystkie
oględziny poszły na nim. Odhaczone na żywym modelu: 19a (obie), 19b, 19c (obie — map-reduce na
sztucznym logu 2432 linii), 20a (tryb kontrolowany), **cały 20b** i 24c (obie ścieżki).
Znalezione i naprawione **trzy błędy**: gateway nie egzekwował budżetu myślenia na nowym buildzie
(pytanie o zasady — 30 s i pusta odpowiedź), **bot w walce przechodził przez ściany i siatki
stojące na liniach kratki** (podwójne pół kratki w `canStep` od 23.08) oraz niegramatyczna kotwica
relacji przy ±3. Do tego dwie poprawki promptów z A/B na żywo (relacja + podpis konta gracza,
zakaz powtarzania zdań) i nagłówek screamsheetu zwykłą pisownią (decyzja MG). Maszynopis zawężony
do tempa. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Dług oględzin — naprawa 3b (17.09, druga sesja).** Obejrzane w Chrome: półki Medyka i Solo,
rozwinięty podgląd broni i pancerza, okno strat przy zmianie Roli, wyjątek MG na żywo (znikający
wpis, zdanie w koszyku, brak w podsumowaniu, powrót na „Automatycznie”) i karta wpisu u gracza.
**23.09:** półki Netrunnera (cyberdeki, Bariera, obwody ze znacznikiem) i Nomady (strzelby, kusza,
wyrzutnia haków), rozwinięty podgląd w motywie dziennym i rozwijanie klawiaturą (Enter/Spacja,
fokus zostaje). **Nie obejrzane:** motyw dzienny karty wpisu w Kompendium, wąskie okno
i powiększenie nowego wiersza sklepu, zakup z Kompendium przy wyjątku MG u gracza z pieniędzmi
(pokryty testem serwera).

**Zamknięte 13.09 (piąta sesja): zasłona figur 42c w komplecie i przerwany marsz cofający figurę
za róg.** Oględziny 42c domknięte na „Test Brak sceny": obejście końca bariery pod mgłą
i w Dynamicznej, odznaczenie „Zasłania figury" z karty. Po drodze wyszedł błąd spoza listy —
przerwanie „ktoś w polu widzenia" zaokrąglało figurę wstecz za róg, więc gracz utykał na końcu
bariery; naprawione (lądowanie na polu, w które figura wchodziła) i obejrzane. Z 42a i 42b
odhaczone: klamka bramy u gracza (z daleka, na kłódkę, otwarcie i zamknięcie), trasa
w Dynamicznej, zmiana rodzaju z karty segmentu i wygląd otwartej bramy na warstwie MG, brak pola OB
na karcie ściany, drzwi i okna. Decyzja MG do `POMYSLY.md`: planer gracza pod mgłą ma chodzić tylko
po odsłoniętym (kod na inną sesję). Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09 (czwarta sesja): planer gracza bez zwykłych ścian poza Dynamiczną.** Ściany jadą do
planera, pod mgłą przycięte do odsłoniętej podłogi (decyzja MG). Oględziny 42a–42c w tej samej sesji
wykazały **dwa regresy z 42c** — gracz na mgle albo scenie otwartej tracił trasę kliknięciem, a F5
obok bariery zasłaniającej gubił przeszkody planera — i usterkę układu pola „Zasłania figury";
wszystko naprawione i obejrzane. Trzy pozycje barier zawężone niżej (pozycja 42c przeniesiona z tego
nagłówka do „Pozycji"). Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**11.09 — decyzje MG do rzeczy zgłoszonych po sesji kamery (żeby nie wracały jako pytania):**

- **„Ani piksela czerni" zostaje.** Gracz przy maksymalnym oddaleniu nie obejmie całej mapy
  40 × 30 na szerokim oknie i **tak ma być** — „może sobie poprzesuwać albo odpowiednio rozciągnąć
  okno". Nie proponuj powrotu do wariantu „cała mapa z czarnymi pasami".
- **Mapa powitalna zostaje bez wyznaczanego punktu startu** — zawsze środek dolnej krawędzi.
  Tło nie ma wiersza w bazie, w którym MG mógłby punkt zapisać, i nikomu to nie przeszkadza.
- **Czarne pole gracza pod nieodsłoniętą mgłą jest zachowaniem, nie usterką** — ale czyta się jak
  awaria: MG sam „miał obawy, że jest zepsuta", patrząc na własną scenę z widocznością `fog`.
  Nic z tym nie robimy; warto o tym pamiętać przy oględzinach i przy pierwszej sesji z drużyną.
- **Usterka „MG widzi «Brak sceny» po własnej aktywacji" zostaje na tej liście** (wpis niżej) —
  MG ją przyjął; **naprawiona i obejrzana 12.09** — zamknięta, opis w archiwum.
- **Pełny plik „StrefyPrzemysłowej" (2896 × 2176) — nie teraz (decyzja MG z 12.09).** Siatka jest
  poprawiona wpisem „40 kolumn" (36,2 px) na obecnym pliku 1448 × 1086. Wgranie większego pliku
  **przesunie całą scenę**: wgranie ustawia rozmiar sceny na wymiary pliku, a figury, ściany, mgła,
  rysunki i światła leżą w pikselach świata — bez przeskalowania ×2 wszystko zjedzie do lewej
  górnej ćwiartki. Do tego ten plik nie dzieli się równo (72,4 px w poziomie, 72,53 w pionie).

**Zamknięte 13.09 (trzecia sesja): cztery drobne usterki z oględzin 13.09 i jeden błąd spoza listy.**
Odmowa strzału bronią spoza rąk ma dwa zdania — „Broń jest w kaburze — dobądź ją (bez Akcji)", gdy
broń mieści się w wolnych rękach (także obok jednoręcznej broni w drugiej ręce), i dotychczasowe, gdy
trzeba coś odłożyć (decyzja MG). Notka „Instaluję…" w kompendium czeka na odpowiedź serwera, a przy
odmowie mówi to samo co czat — dotyczy też „Dodaj za darmo". Drugi szkic screamsheetu nadpisuje pola,
ale pustym leadem niczego nie kasuje (decyzja MG). Szybki edytor 38a mówi prawdę o PW bez „Paska HP"
i przy Wartości bojowej blokuje Umiejętność, Unik i poziomy Testów — **Cechy zostają**, bo REF liczy
Inicjatywę. Spoza listy: okno edycji żetonu zawieszało „Zapisywanie…" po odmowie zasięgu widzenia.
**Nic z tego nie było oglądane w przeglądarce** — nowa pozycja niżej. Diagnozy w
`archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09 (druga sesja): nazwa figury w kartach czatu, zdanie „Minęła minuta" i „bez ran"
u gracza.** Karty czatu piszą alias figury u wszystkich, MG też (decyzja MG), a przy pustym aliasie
„Nieznajomy"; przy okazji okno przeszukania przestało pisać graczowi prawdziwą nazwę, a Czarny LOD
gubił alias przez zawężony typ żetonu. Zdanie „Minęła minuta … wraca: …" ma test na żywych gniazdach.
„Bez ran" obejrzane z konta Tony'ego w jego turze na „StrefiePrzemysłowej" — kolejka nieruszona.
Tej samej sesji na kampanii-śmieciu obejrzane: alias na czacie oczami gracza, szybki edytor 38a
z koszem pojedynczym, wyszarzony slot z 41 i odmowa `MISSING_FOUNDATION` u gracza — pozycje 38a,
41 i odmów montażu zostają otwarte z zawężonym zakresem. Cztery nowe drobne usterki w „Pozycjach".
Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 13.09: cyberdek netrunnera Korpo i „Dodaj za darmo".** Pracownik z HR-u dostaje
prawdziwy deck z Programami z kompendium, a Programy bez wpisu lądują w notatkach karty. „Dodaj za
darmo" przy cyborgizacji zostaje, jak jest (decyzja MG), a tooltip mówi, że wszczep wchodzi bez Testu
montażu, ale z rzutem na Utratę Człowieczeństwa. Diagnozy w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 12.09 (siódma sesja): Stym** — razem z Edytorem bólu (decyzja MG) i z błędem spoza
listy: stan ran statysty liczony z BC i SW zamiast z wydrukowanych PW. Oba obejrzane w przeglądarce
na kampanii-śmieciu; diagnozy w `archiwum/zamkniete-zaleglosci.md`. **Żadna nowa pozycja nie została
otwarta.** Dwie istniejące dostały dopisek z weryfikacji: „Dodaj za darmo" (w dużej części
nieaktualne) i cyberdek netrunnera Korpo (w bazie nie ma zespołów).

**12.09 (pełny ekran, zlecenie MG poza etapami): NIEOBEJRZANY w widocznym oknie.** Przełącznik
„Pełny ekran" (⚙ Ustawienia → Widok, `fullscreen.ts`) jest zrobiony i pokryty testami. W przeglądarce
odklikane: pole, podpowiedź w wariancie „przytrzymaj Esc", zapis w `localStorage`, guzik „⛶ Wróć do
pełnego ekranu" oraz wywołania `requestFullscreen` z automatu (klik i klawisz) przy aktywnym geście.
**Samego pełnego ekranu automatyka nie zobaczy** — Chrome odmawia schowanej karcie (pułapka
w `ogledziny`). Do sprawdzenia ręką, najlepiej na koncie gracza w Chrome:
(1) zaznaczenie pola wchodzi od razu, odznaczenie wychodzi;
(2) krótkie Esc zamyka rzeczy w VTT (np. zdejmuje zaznaczenie figury), a przytrzymane wychodzi
z pełnego ekranu **bez** schodzenia po całej drabinie;
(3) F5 → pierwszy klik wraca do pełnego ekranu, ale po wyjściu przytrzymanym Esc kolejne kliknięcia
**nie** wciągają z powrotem;
(4) wylogowanie wychodzi, zalogowanie i dołączenie wchodzą;
(5) okno `window.confirm` i wybór pliku portretu — czy zdejmują pełny ekran (niesprawdzone, może
zależeć od przeglądarki);
(6) Firefox: Esc wychodzi od razu, a podpowiedź pola mówi to wprost.
Na `http://217.154.210.181:8088` Keyboard Lock nie działa (brak HTTPS) i Esc wychodzi od razu —
to nie regres; zadziała na `vtt.tatanga.eu` po etapie 28.

**12.09 (etap 41): została JEDNA ścieżka — dymek pod celownikiem.** Etap przeszedł oględziny 12.09
(okno oględzin u MG i u gracza, dokładne oględziny z prośby, „Pokaż wszystko", „Dobądź / Schowaj
(Akcja) / Upuść"; po drodze naprawiony błąd, przez który dokładne oględziny nie działały — patrz
archiwum). **13.09 obejrzany wyszarzony slot paska** na kampanii-śmieciu, z konta `Tester`: po
„Schowaj (Akcja)" oba wiersze broni („Pistolet oględzinowy" i jego „Przeładuj") dostają
`hud-slot--refused` (przezroczystość 0,4), a karta zamienia plakietkę „✊ W rękach" na „Dobądź".
Przy okazji wyszła usterka tekstu odmowy — poprawiona 13.09 (trzecia sesja). **Zostaje:** dwie linijki w dymku
pod celownikiem — `onAimHover` nie budzi się od syntetycznego ruchu kursora (pułapka z 10.09), więc
to jedyna droga przez rękę MG.

**05.09 (etap 38a — statysta jako karta postaci): został JEDEN kosz — grupowy.** Zmigrowane figury
poligonu przeszły przez przeglądarkę 05.09. **13.09 obejrzany szybki edytor** na kampanii-śmieciu
(„Figura testowa" bez karty): przełącznik „Statystyki bojowe (figura dostaje własną kartę)", pola
profilu, „Wartość bojowa zamiast Cech" z podpowiedzią i „Nie unika pocisków (s. 158)" — wszystko
mieści się w oknie, a zapis **założył kartę** (`statBlock`: Wartość bojowa 4, `noBulletDodge`,
`hpMax` 10). **Kosz pojedynczy** pyta dwa razy: „Usunąć token „Figura testowa"?" i „Usunąć też
kartę „Figura testowa"? Zostanie w kampanii, jeśli odmówisz." — obie odpowiedzi „tak" usunęły żeton
i kartę. Dwie drobne uwagi do słów edytora — poprawione 13.09 (trzecia sesja). **Zostaje:** pytanie o kartę
przy **koszu grupowym** z 35 — na scenie nie zostały dwie figury z kartami.

**05.09 (etap 39 — efekty czasowe na Cechach):** etap **zamknięty w komplecie z oględzinami**
w tej samej sesji — pozycja „nie był oglądany" żyła kilkanaście minut. Przez przeglądarkę przeszły
wszystkie trzy kawałki UI (panel na karcie, małe pole „z" pod Cechą, chipy w pasku figury), obie
role (MG i `Tester` przez `[::1]:5173`), obie drogi liczby (wpisana i notacja `−1k6`), podłoga
Cechy, zdejmowanie ⌫, wygasanie skokiem zegara i **przeliczanie odliczania przy ruchu zegara**.
Znaleziona i naprawiona **jedna usterka układu**: pole „ile" miało 4,5 rem, przez co podpowiedź
„−2 albo −1k6" ucinała się na „−1k" — czyli gubiła dokładnie tę połowę, która mówi, że wolno
wpisać notację. **Żadna nowa pozycja nie została otwarta.** Ścieżka Czarnego LOD-u (Nerwosol
nakładający się sam) **nie była klikana w przeglądarce** — stoi na teście na żywych gniazdach
w `netcombat.test.ts`, a obejrzenie jej wymagałoby zbudowania na poligonie Sieci architektury
z Programem `statDrain`; uznane za nieopłacalne wobec pokrycia testem.

**05.09 (etap 33 — kopie zapasowe):** **żadna nowa pozycja nie została otwarta**, a etap
zamknięto w komplecie z oględzinami. Naprawiony po drodze **jeden błąd** (polski znak w nazwie
pobieranego pliku wywracał trasę eksportu błędem 500) i **jedna usterka układu** (polecenie
`restore` w podpowiedzi łamało się w środku słowa). Do sprzątnięcia ręką MG: dwa katalogi
`przed-przywroceniem-*` w `data/private/backups/`, zostawione po teście przywracania — kosz na
nie został w trakcie sesji odrzucony.

**04.09 (trzecia sesja):** zamknięte **trzy pozycje z `POMYSLY.md`** o cyborgizacjach — PT
montażu z Testem Chirurgii, odmowy „nie ma w co tego wszczepić" i EMP nazywający dwie wyłączone
cyborgizacje. Otwarte **dwie** pozycje, obie niżej: odmowy nieoglądane na koncie gracza oraz
„Dodaj za darmo", które omija cały montaż. Naprawione przy okazji **dwa błędy**: Borgizacje
liczone jak rodzina wymagająca podstawy (karta pisała nad Ramownicą „brak cyborgizacji
podstawowej") i **„Cofnij" zostawiające zegar statusu w `statusData`** po zdjętej naklejce.

**Zamknięte 04.09 (druga sesja):** paczka **„oczy i uszy"** — **wybuch i chmura gazu na mapie**,
**rzut obrażeń obszaru z 16d**, **„usuń wszystkie osłony" z 16c** i **przechylenie figury dla
stanu „nieprzytomny"**. Piąta pozycja — **dźwięki walki** — jest zmierzona, ale czeka na ucho MG
i została w `POMYSLY.md`. Przy okazji naprawiono **dwa błędy** (guzik „Obrażenia" przy amunicji
bez obrażeń; importer wycinający `thrown`, `maxRangeM` i `ammoIds`) oraz **jedno losowe
migotanie testu** (`bot-actions.test.ts` porównywał cuid z „bot"). Diagnozy i opisy napraw —
w `archiwum/zamkniete-zaleglosci.md`; **żadna nowa pozycja nie została otwarta**.

**Zamknięte 04.09:** **wszystkie cztery pozycje „etap 30x nie był oglądany w przeglądarce"**
— 30a, 30b, 30c i 30d przeszły przez przeglądarkę w komplecie, jedną kartą („Frank")
przestawianą kolejno na dziewięć Ról. Sześć znalezionych błędów naprawiono w tej samej sesji;
diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`. Jedna pozycja została otwarta —
**cyberdek pracownika Korpo**, niżej.

**Zamknięte 03.09 (trzecia sesja tego dnia):** **farmaceutyki bez zapasu dawek**
i **Ustabilizowanie bez zasięgu**. Przy okazji doszło naturalne leczenie PW, którego projekt nie
miał wcale (wpis z `POMYSLY.md`). Diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`;
jedna pozycja została otwarta — **Stym**, niżej.

**Zamknięte 03.09 (druga sesja tego dnia):** oba długi higieny — **czerwony `tsc --noEmit`**
na serwerze i **losowo padający zestaw testów**. Migotanie miało **cztery** przyczyny, nie jedną;
diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`.

**Zamknięte 02.09 (druga sesja tego dnia):** trzy błędy z oględzin etapów 31 i 32 — wybór
amunicji dla broni podwieszanej, nazwa dodatku w chmurce nad celem i odmowa `character:update`
zostawiająca na karcie wartość, której nie ma w bazie. Wszystkie naprawione **i obejrzane
w przeglądarce**; diagnozy i opisy napraw w `archiwum/zamkniete-zaleglosci.md`.

## Pozycje

- **24–25.09: zgoda MG na nową postać, warunki i zatwierdzenie — UI prawie nieobejrzane.**
  25.09 obejrzany (bez klikania) tylko wiersz szkicu Mary w panelu MG: edytor warunków
  (metoda, „Postać początkująca — 62 pkt Cech”, pole puli umiejętności), „Zatwierdź warunki”
  i „Wyrzuć szkic” mieszczą się w wąskim panelu. Serwer
  pokryty testami (prośba, odmowa, zgoda, zasady, `DRAFT_EXISTS`, wyrzucenie szkicu przez MG,
  blokada karty i żeton przy przyjęciu). **Nie obejrzane**, bo na „Test2” grała Mara i nie
  przełączałem kampanii: przycisk prośby i napis „Czekasz na zgodę MG” u gracza, okno zasad,
  sekcja próśb i „🗑 Wyrzuć szkic” / „Na pewno?” w panelu MG, napis „Szkic wyrzuca tylko MG”
  w stopce kreatora, pas „Czeka na MG” na karcie gracza. **Znane ograniczenie:** przyciski karty
  czekającej na MG nie były wyszarzone — **od 25.09 są** (decyzja MG): `<fieldset disabled>`
  wokół treści karty u właściciela. Sprawdzone atrapą w DOM na karcie „dar” u Mary (182 kontrolki
  wyłączone, zakładki i ✕ działają); **żywej karty czekającej na MG nikt jeszcze nie oglądał**.

- **24.09: rzuty kreatora przez kubek — do oceny MG przy stole.** Obejrzane automatem (łańcuch
  Cech i Ścieżki, przerzut MG, skrót MG). **Zostają ręką MG:** (1) **dźwięk „kubek gotowy” po
  każdym rzucie łańcucha** — gra przy każdym ponownym załadowaniu, czyli ~10 razy przy Cechach;
  jeśli męczy, wyciszyć go dla `chain` w `DiceCup.tsx` (`notificationKey`); (2) tempo sesji zero
  z ~25 osobnymi kartami na czacie (10 Cech + ~15 tabel Ścieżki); (3) prawdziwy gest ręką —
  automat rzucał jednym przeciągnięciem.

- **18.09: skóra chromu „stara kartka” — obejrzana tylko automatyką.** W Chrome (MG, Poligon,
  1568×781): dzień i noc, okno ustawień, Panel MG, górny pasek z kolejką inicjatywy. **Zostało ręką
  MG:** handout, okno wymiany i oględzin, karta obiektu sceny (belka czarna w dzień), dialogi
  (`.dialog`), menu kontekstowe figury, kompendium i pozostałe zakładki panelu, ekran gracza;
  **Safari/iPad** — `background-blend-mode` na kaflu i `filter: drop-shadow` na oknach z przewijaną
  treścią (płynność); siła kafla (`DAY`/`NIGHT` w `tools/art/chrome-paper.py`) do oceny MG.

- **16.09: skórka „stara kartka” karty i kreatora (naprawa 2c) — dwie rzeczy nieobejrzane.**
  Obejrzane w Chrome: karta (4 zakładki), kreator (7 kroków, okno strat), oba motywy, okna 1708×882
  i 1102×576; **18.09 (odbiór 3d):** portret na papierze w obu motywach — wytarcia go omijają.
  Zostało: (1) **Safari/iPad** — maska `mask-mode: luminance` i `:is()` w selektorach;
  (2) **płynność przewijania** długiej karty i kroku Umiejętności na słabszym laptopie gracza
  (warstwa z maską nad całą stroną). Prawdziwe powiększenie przeglądarki 125/150% ręką MG —
  **zdjęte 18.09 decyzją MG** („ze zmian w tym elemencie rezygnuję”).

- **14.09: pod ręczną mgłą gracz chodzi tylko po odsłoniętym — nieobejrzane straże lądowania
  i pełny marsz.** Obejrzane 14.09 na „Test Brak sceny" z konta `Tester`: serwer dev odmawia ruchu
  w czerń (`MOVE_REFUSED`), figura stojąca środkiem w czerni dostaje trasę na odsłonięte, nad czernią
  trasy nie ma, a odsłonięcie MG dochodzi do planera bez przeładowania. Trasę do celu za barierą
  planer prowadzi dookoła po odsłoniętym — odtworzona w Node tym samym kodem przechodzi oba
  sprawdzenia serwera, a stara prosta przez barierę pod mgłą odpada. **Zostają:** (1) **przycięcie
  budżetem w walce** pod mgłą — ostatni krok, na który starcza metrów, nie może stanąć w czerni
  (`clipToBudget` z `enforcedFloor`); (2) **przerwanie „ktoś w polu widzenia"** przy krawędzi
  odsłoniętego (`marchLanding`); (3) **marsz do końca** długą trasą i zgoda serwera na lądowanie —
  w schowanej karcie automatyki marsz idzie ok. 1 klatkę na sekundę, więc przerwano go Esc po kilku
  pikselach. Najlepiej ręką MG w widocznym oknie. Stan sceny — `poligon.md`.

- **13.09: OB bariery (etap 42b) — zostały karta obrażeń i napis na mapie.** Obejrzane 13.09 (czwarta
  sesja): pole „OB” na pasku przy „Bariera” i „Brama”, liczba zostaje po przełączeniu rodzaju tam
  i z powrotem, ściana narysowana zaraz po siatce ma OB 0 (sprawdzone w bazie); karta segmentu
  zapisuje „OB bariery” przy wyjściu z pola (5 → 7, serwer odesłał 7) i zmienia zdanie pod nim.
  **13.09 (piąta sesja):** karta segmentu ściany przestawiona kolejno na Drzwi, Okno, Barierę
  i z powrotem na Ścianę — pole „OB bariery” jest wyłącznie przy Barierze i Bramie, a ściana wróciła
  w bazie bez zmian. **Zostają:** (1) **karta obrażeń** — „rzut N − bariera OB n − OB m” i nagłówek
  „Bariera zatrzymała cios” przy trafieniu słabszym od siatki; (2) napis **„BARIERA”** na mapie
  zamiast „PANCERZ”. Przepis na ustawienie sceny — `poligon.md`.

- **13.09: bariera i brama (etap 42a) — zostały zamknięte okno z bliska i wręcz.** Obejrzane 13.09
  (czwarta sesja): pięć rodzajów mieści się w rzędzie paska, oko „gracze mogą otwierać” stoi przy
  bramie; na warstwie MG bariera fioletowa, brama z 🚧; karta segmentu pisze „Bariera”, „Brama —
  zamknięta” i „Brama — otwarta”; trasa gracza pod ręczną mgłą omija siatkę, zanim padnie klik.
  **13.09 (piąta sesja):** trasa gracza w **Dynamicznej** omija siatkę dołem; **klamka bramy**
  u `Tester` — z trzech kratek „Za daleko — podejdź do bramy (na jedną kratkę).”, z bliska na ryglu
  „Brama zamknięta na kłódkę — nie ustąpi.”, bez rygla otwiera (`open = 1`, „Za bramą” widoczne)
  i zamyka; **zmiana rodzaju z karty** na wszystkie pięć i **wygląd otwartej bramy** na warstwie MG
  (znak przygaszony, wyraźnie inny niż przy zamkniętej). **Zostają:** (1) trasa gracza przy
  **zamkniętym oknie z bliska** w Dynamicznej; (2) **odmowa wręcz** pod celownikiem przez siatkę —
  dymek budzi tylko ręka MG.

- **Odmowy montażu u gracza — została `SELF_INSTALL`.** `MISSING_FOUNDATION` obejrzana 13.09,
  `POOL_FULL` i `NO_SLOTS` 23.09 z konta `Tester` (szczegóły w archiwum). Zostaje `SELF_INSTALL`,
  do którego gracz potrzebuje Medyka z Chirurgią; `NO_SURGERY_SKILL` jest z UI nieosiągalne
  z założenia (lista chirurgów w Kompendium pokazuje wyłącznie karty z Chirurgią).

- **13.09 (trzecia sesja): cztery poprawki — zostały dwie połówki.** 25.09 obejrzane na
  kampanii-śmieciu: podpowiedź wyszarzonego slotu schowanej broni („Nóż testowy — Broń jest
  w kaburze — dobądź ją (bez Akcji).”), szybki edytor 38a (bez „Paska HP” pisze „karta ma PW
  25/25”, przy „Wartości bojowej” Umiejętność i Unik tracą strzałki, Cechy zostają), okno edycji
  żetonu (zasięg `0` → błąd, „Zapisz” aktywne) i „Dodaj za darmo” u MG (notka po odpowiedzi
  serwera). **Zostają:** (1) z karabinem w rękach pistolet ma dostać stare „schowaj tamto”,
  a odmowa pod celownikiem — tylko ręką MG (dymek); (2) „Zainstaluj” **gracza** na karcie bez
  podstawy — pod guzikiem zdanie odmowy (wpisy „Zawodowe” są u gracza wyszarzone progiem
  sklepu, więc trzeba wpisu z „Ulicznych” albo przestawić próg).

- **Wsparcie poziomu 10 nie pamięta „tej samej sprawy". 25.09: MG — zostaje na liście, nie ruszamy.** RAW: „po tym pierwszym wezwaniu na
  kolejne przybywają **ci sami** dwaj funkcjonariusze, dopóki wezwanie dotyczy tej samej
  »sprawy«, aż do jej zamknięcia lub śmierci tych funkcjonariuszy" (s. 159). VTT stawia za
  każdym razem nowe figury z pełnymi PW. Wymaga pojęcia „sprawy", którego projekt nie ma —
  najbliżej jest wątek dziennika kampanii z 24b. Zapisane, bo to jedyna kategoria, w której
  ciągłość jest zasadą, a nie kolorytem.

- **Maszynopis wypowiedzi NPC-a (09.08) — zostało tylko tempo, do oceny MG.** Obejrzane 24.09
  automatem w widocznej karcie MG (kampania-śmieć, Qwen3.8-27B): tekst przyrasta porcjami po
  kilka–kilkanaście znaków, czyli całymi wyrazami (2); przy dwóch botach wezwanych jednym zdaniem
  druga wypowiedź stoi pusta, dopóki pierwsza się nie dopisze (3); po F5 linie z historii mają
  pełną długość od pierwszej klatki (4). **Zostaje (1) tempo** — 15 zn/s z limitem
  `MAX_DURATION_MS` = 12 s na linię; wypowiedź 27B (300–450 znaków) pisała się 8–9 s. Jeśli przy
  stole za wolno albo za szybko, zmienia się `CHARS_PER_SECOND` w `packages/client/src/typewriter.ts`.

- **24.09: polszczyzna Qwen3.8-27B UD-Q3_K_XL — do obserwacji przy stole, nie kodu.** Wyraźnie
  lepsza niż w 9B (streszczenie 2432 linii bez jednego błędu), ale Q3 zostawia potknięcia odmiany
  i słowa-widma: „z mojej baru”, „ten piwo”, „serce Babcie Ruth”, „to cywil, a nie targe”,
  „ty szkodzie”; w screamsheecie (T 0,9) „zdołały odparta atak”, „kulebionych pocisków”,
  „zwykła napad”. Obniżka temperatury screamsheetu do 0,7 pomagała niewiele (A/B po 3 próbki),
  więc została 0,9; nagłówek pisze się od 24.09 zwykłą pisownią (decyzja MG). Dźwignie, gdyby
  przeszkadzało: lekcja bota („Mów poprawną polszczyzną”), mocniejszy kwant, gdy zwolni się VRAM.
  Notatkę relacji pisz **do bota w drugiej osobie** („Stym uratował ci bar”) — model przepisuje
  notatkę w trzeciej osobie i potrafi mówić o rozmówcy jak o kimś obok.

- **Etap 20a — gdy bot „nie chce rzucić", zajrzyj do dziennika decyzji.** Przy oględzinach „Kolec, rzuć
  na Wygadanie" wróciło jako „rozmowa" — i słusznie: **„Wygadanie" nie jest umiejętnością CP RED**, a Kaya
  nie ma żadnej umiejętności perswazji. `data/private/bot-decisions.jsonl` (gitignore, jedna linia JSON
  na decyzję) ma pole `options` z pełnym menu, które bot dostał — to zwykle wystarcza za diagnozę.

- **⚠️ ZANIM ODHACZYSZ COKOLWIEK NIŻEJ: przeczytaj `docs/testy/sesja-testow-walki-2026-08-08.md`.**
  Sesja 08.08 zbudowała **gotowy poligon testowy** (kampania „Poligon bojowy", scena
  „Strzelnica", pięć uzbrojonych figur — nie buduj go od nowa) i **odklikała dużą część list
  poniżej**: całe 16d (**wraz z rzutem obrażeń obszaru — odklikanym 04.09**), punkty 1–6 z 16g, tryb turowy u MG, ruch
  i budżet, atak z mapy, PT z odległości, obrażenia, ablację pancerza, „Cofnij", ogień ciągły
  i zaporowy oraz menu kontekstowe tokenu. Plik zawiera też **plan dokończenia** (16h, osłony,
  zwarcie, Test Przeżywalności, strona gracza), trzy znalezione błędy i — ważne — **korektę
  dwóch „pułapek dev"**: menu kontekstowe _działa_ (nie dowozi go tylko `right_click` z CDP),
  a `window.confirm` da się przechwycić i nie zawiesza sterowania.
  **Druga sesja tego samego dnia** domknęła: resztę 16h (usypiająca, EMP, dym, „Minęła
  minuta", poprawka naboju inteligentnego, formularz amunicji w kompendium), **całe osłony
  16c u MG** (**wraz z „usuń wszystkie" — odklikanym 04.09, z Ctrl+Z**), **etap 15 — śmiertelne rany, Test Przeżywalności,
  śmierć i Ustabilizowanie od zera**, **Pochwycenie z „Broń się"** z 14d, monity początku
  tury z 14e i zakładkę „AI". Doszły błędy **#7** (etykieta odchylenia granatu) i **#8**
  (klik narzędziem osłon przecieka do warstwy gry) — **oba naprawione 22.08**.
  Ustalenie ważne dla reszty list: **odmowy statusowe są u MG niesprawdzalne** —
  `realtime/movement.ts:216` zwalnia MG z blokad, więc wszystko, co „ma odmówić ruchu",
  trzeba oglądać na koncie gracza.
  **Odklikane 27.08 na koncie `Tester`:** żeton gracza ze statusem **Nieprzytomny** nie ruszył
  się z miejsca, na czacie stanęło „Nieprzytomny token nie może się poruszać.", a wszystkie
  Akcje w panelu postaci były wyszarzone.
