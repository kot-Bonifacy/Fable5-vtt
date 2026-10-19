# Postęp prac

Aktualizowany na koniec każdej sesji. Statusy: ⬜ nierozpoczęty · 🟨 w toku · ✅ ukończony · ⛔ wycofany.

**Ten plik czytasz w całości na starcie każdej sesji, więc ma zostać krótki.** Szczegóły mieszkają
w plikach obok — czytaj je **na żądanie, nigdy rutynowo**:

| plik                               | co w nim                                                           | kiedy czytać                                           |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `umowy-kodu.md`                    | gdzie dopisuje się nową rzecz — sekcja na obszar, każda z indeksem | **zanim** dołożysz coś w danym obszarze                |
| `pulapki-dev.md`                   | pułapki, które kosztowały czas — sekcje o tych samych nazwach      | **zanim** zaczniesz szukać błędu w danym obszarze      |
| `zaleglosci.md`                    | otwarte zaległości (dług oględzin, drobne braki)                   | gdy odhaczasz zaległości albo ruszasz etap z tej listy |
| `poligon.md`                       | stan sceny testowej „Poligon bojowy" i procedura oględzin          | przed oględzinami w przeglądarce                       |
| `decyzje-i-uproszczenia.md`        | świadome odstępstwa od podręcznika — **to nie są zaległości**      | gdy coś wygląda na błąd w mechanice CP RED             |
| `POMYSLY.md`                       | pomysły spoza zakresu etapów                                       | gdy masz pomysł do zapisania albo szukasz drobiazgu    |
| `archiwum/tabela-etapow.md`        | pełna tabela etapów (numer, nazwa, status, data), wyprowadzona 18.09 | gdy chcesz wiedzieć, co kryje się pod numerem etapu    |
| `archiwum/od-czego-zaczac.md`      | pełne akapity o zamkniętych etapach, wyprowadzane stąd (10.09, 18.09) | gdy wracasz do świeżo zamkniętego etapu                |
| `archiwum/dziennik-sesji.md`       | pełne notatki starszych sesji                                      | gdy potrzebujesz szczegółu konkretnej sesji            |
| `archiwum/zamkniete-zaleglosci.md` | zamknięte zaległości z diagnozą i opisem naprawy                   | gdy wraca coś, co już raz naprawiono                   |
| `archiwum/uwagi-etapow.md`         | kolumna „Uwagi" z tabeli niżej (jedno zdanie na etap, do 28)       | gdy chcesz szybkie „co było w etapie N"                |

| stan         | etapy                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------- |
| ⬜ otwarty   | **28** Wdrożenie na VPS (🟨 działa na `https://vtt.tatanga.eu` z botami od 18.10; zostały off-site, utwardzenie, monitoring); **43b**, **43c** (UI walki); T10; refaktoryzacja odłożona (MG 18.10) |
| ✅ ukończone | 01–11, 13–20b, 23a–27f, 27h–27l, 29a–30d, 31–35, 37–42c, 43a, 44a–44d, 45, 46a1, 46a2, 46c1, 46c2, 46b1, 46b2, 47a, 47b, 48a, 48b, 48c, 49a, 49b, 50a, 50b, 50c, 51, 52, 53, 54, 55, 56 (ostatni zamknięty: 56, 2026-10-19) |
| ⛔ wycofane  | 12, 21, 22 (głos), 27g (wydajność), 36 (makra); 27, 29, 30, 38 rozdzielone na etapy literowane |

Pełna tabela z nazwami i datami: `archiwum/tabela-etapow.md`.

## Od czego zacząć

**Etap 28 — VTT stoi na VPS od 18.10 (czwarta sesja): `https://vtt.tatanga.eu`, boty przez
Tailscale.** Kontenery `vtt-server` i `vtt-web` w `/opt/docker-apps/vtt`, dane w `/opt/docker-apps/vtt-data`,
NPM → `vtt-web:80`. Gateway na PC słucha na `0.0.0.0:8100` z kluczem (zapora: tylko 100.64.0.0/10);
klucz ma też lokalny serwer i E2E (pułapka na górze `boty`). **Źródłem prawdy jest VPS** — lokalny
`pnpm dev` niczego nie synchronizuje. Wydanie: push z PC, na VPS `./deploy.sh`. Zostało z etapu 28
(lista na końcu `docs/DEPLOY.md`): test odtworzenia na VPS (z MG, bez graczy), fail2ban i unattended-upgrades (VPS czeka
też na restart po aktualizacji jądra), monitoring. Już jest: SSH tylko kluczem (`ssh vps`), kopia
off-site na PC (`deploy/pull-backup.ps1`, zadanie „VTT pull backup”, `D:\kopie-vtt`). Potem T10 → T11.
Otwarta zaległość: jedno lokalne odtworzenie kopii padło (`zaleglosci.md`, 18.10).

**Etap 56 „Walka z zauważenia wroga” (zlecenie MG z 19.10) zamknięty 19.10 — dalej etap 28, potem
T10.** Figura ma postawę wzorem Foundry (Przyjazna / Neutralna / Wroga; NPC startuje Neutralny,
zna ją tylko MG — kolor obwódki, menu figury, pasek grupy, okno edycji). Gdy ktoś z drużyny
zobaczy wroga (ta sama miara, co lista figur gracza), serwer w trwającej sesji zakłada starcie
„Przed walką”, marsze drużyny stają na polu zauważenia, a gracze stoją (`COMBAT_PENDING`); MG ma
nad mapą „⚔ Rozpocznij walkę” / „Odwołaj”, a prawy panel sam przechodzi na „Walka” z „Dołącz do
walki” (wrogie na górze, wybór wielu). W trwającej walce zauważony wróg i NPC dołożony ręką
dostają inicjatywę od serwera. „Odwołaj” i koniec walki uspokajają widocznych wrogów, dopóki nie
znikną drużynie z oczu (pamięć w procesie). Plik etapu: `etap-56-walka-z-zauwazenia.md`, umowa na
górze `tura`, reszta w `POMYSLY.md`.

**Skok (zlecenie MG z 19.10) — dalej etap 28, potem T10.** Slot „Skok” w lewym pasku: dwie kratki
w jednym z ośmiu kierunków ponad barierą i osłoną za 8 m ruchu (w rundzie z dystansu tury, poza walką
z puli Eksploracji), pola lądowania liczy serwer (`token:jump-options`). Rozstrzygnięcia przyjęte bez
pytań (furtka blokuje, bez Akcji, przez wroga nie) czekają na słowo MG. Umowa na górze `tura`.

**Pytanie MG przed przekroczeniem budżetu tury (zlecenie MG z 19.10) — dalej etap 28, potem T10.**
Wydatek NPC-a MG, który nie mieści się w turze (Akcja, metry, LA, Bieg bez ruchu), staje: nad mapą
pasek „Poza budżetem tury” z „Wykonaj poza budżetem” / „Anuluj”, a „Wykonaj” powtarza intencję na
serwerze z licznikiem przekroczeń jak dawniej. Figura gracza w ręku MG i boty — bez pytania.
Umowa na górze `tura`.

**Zaległości zamknięte 18.10 (druga sesja) — dalej refaktoryzacja całości pod osłoną suity, potem
T10.** Pełny domyślny przebieg z gatewayem 370/379 (3 wpisy konsoli przy restarcie instancji, powtórka
zielona), `40-odpornosc` zielona, punkty `po-T3`…`po-T6` odbudowane **z krokami `@llm`**. Linia
bazowa refaktoryzacji to ten przebieg. Otwarta zaległość została jedna: paczka AI dla innych MG
(po becie). Pomiary marszu gracza w `t7c-mapa` liczą od 18.10 postoje puli Eksploracji.

**Plansza „Wszyscy zginęli” (zlecenie MG z 17.10) — dalej refaktoryzacja całości pod osłoną suity,
potem T10.** Gdy każda figura graczy na scenie ma stan Martwy, stół zasłania plakat logowania
ze sloganem „Night City nie wybacza.” i przyciskiem „Teraz możesz bezpiecznie
wyłączyć komputer” (gracza wylogowuje, MG zamyka planszę). Gdy w walce zginą wszyscy spoza
drużyny, MG dostaje nad mapą pasek „Przeciwnicy pokonani” z „Zakończ walkę” / „Jeszcze nie”
(walka sama się nie kończy). Umowy na górze `ui` i `tura`.

**Etap 55 „Komunikaty wzorem Foundry” (zlecenie MG z 17.10) zamknięty 17.10 (55a + 55b) — dalej
refaktoryzacja całości pod osłoną suity, potem T10.** Komunikat dla jednej osoby to pasek w jednej
kolumnie na górze-środku nad mapą (`notices.ts`: `notifyInfo` / `notifyRefusal` / `notifyChoice` /
`noteAck` / `clearNotices`, rysuje `NoticeColumn`), nie notka w czacie ani zdanie w oknie — w czacie
zostały boty i komendy `/…`. Od 55b odmowy i wyniki **kliknięć** w oknach (Wymiana, Sieć, karty
obiektów, panele karty, Kompendium, Kopie) też idą do kanału; na miejscu zostają tylko błędy
**formularzy z polami** i dialogów (`.auth-error` w skórze paska z nagłówkiem „Błąd”) oraz **stany**
(`InlineNotice`). Unik i „Czeka na MG” to bursztynowe paski-wezwania. Granica i lista okien —
„Rozstrzygnięcia 55b” w `etap-55-komunikaty.md`, umowa na górze `ui`.

**Nieprzytomny i Martwy oddają turę sami (zlecenie MG z 17.10) — dalej refaktoryzacja całości
pod osłoną suity, potem T10.** Po hookach startu tury serwer przekazuje kolejkę dalej, a czat
mówi „Tura oddana — Nieprzytomny/Martwy”; zaległy Test Przeżywalności najpierw pada. Umowa na górze
`tura`.

**Etap 54 „Ruch wzorem BG3” (zlecenie MG z 17.10) zamknięty 17.10 — następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** Poza walką zaznaczenie nie rysuje trasy,
a jeden klik w podłoże rusza figurę (gracz i MG). W turze figury podgląd z pasami zostaje: zielony
— jeden klik, bursztyn — drugi klik **wydaje Akcję na Bieg** (`extra` w `token:walk` i lądowaniu,
serwer księguje Bieg dopiero, gdy metry wyjdą poza Ruch), szary i mgła — drugi klik idzie do
granicy zieleni. W cudzej turze nic. Odznaczanie `Esc` / prawy klik w puste. **E2E:** `walkOnMap`
/ `walkWorld` klikają drugi raz tylko przy `__vttE2E.walkTargetPending()`, a `clickWorld` czeka,
aż kamera stanie. Plik etapu: `etap-54-ruch-wzorem-bg3.md`, umowa na górze `tura`.

**Śmiertelnie Ranny i Ustabilizowanie (zlecenie MG z 17.10) poprawione 17.10 — dalej
refaktoryzacja całości pod osłoną suity, potem T10.** Śmiertelnie Ranny gra turę dopiero po
Teście Przeżywalności: gracz rzuca kubkiem (do tego czasu bez Akcji, Ruchu i „Kończę turę”),
NPC i boty dostają rzut od serwera na starcie tury. Trafienie atakiem daje mu Ranę Krytyczną
i +1 do Testów do Ustabilizowania. Runda trwa 3 s (minuta = 20 rund). Umowy na górze `tura`,
`atak`, `czas`.

**Etap 53 „Konto administratora” (zlecenie MG z 17.10) zamknięty 17.10 — następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** Serwer prowadzi konto roli `ADMIN`
(**`pantosz`**, zakładane z `.env`: `VTT_ADMIN_LOGIN`/`VTT_ADMIN_PASSWORD`, hasło tymczasowe do
zmiany przy pierwszym wejściu, potem `.env` go nie nadpisuje). Nie siada przy stole: ma panel
z sesjami (trwające z graczami przy stole, „Zakończ sesję”, dziennik `GameSession`), kontami MG
(hasło tymczasowe z wymuszoną zmianą, link resetu, AI, blokada, usunięcie z kampaniami),
AI właściciela, przełącznikiem rejestracji i kopiami całej bazy. **Konto MG z `.env` już nie
zarządza** (decyzja MG): bez panelu kont, znaczka „AI” i kopii całej bazy, ale jego kampanie
mają AI zawsze. **`pantosz` w `dev.db` ma nietknięte hasło tymczasowe MG — nie loguj się nim do
oględzin** (pułapka na górze `ogledziny`; panel ogląda się na instancji E2E kontem `admin-e2e`).
Plik etapu: `etap-53-konto-administratora.md`, umowa na górze `serwer`.

**Etap 52 „Ruch gracza wyłącznie klikiem” (zlecenie MG z 15.10) zamknięty 15.10 — następna jest
refaktoryzacja całości pod osłoną suity, potem T10; zaległość: T5b i długie specyfikacje
odporności przy gatewayu (`zaleglosci.md`).** Gracz nie przeciąga figur: zaznacza figurę, klik
w podłoże wskazuje cel (podświetlone pole), drugi klik w to samo pole rusza (także MG i w walce;
`Esc` odwołuje). Serwer zatwierdza całą trasę z góry (`token:walk`), a klatki marszu gracza
rzutuje na nią, więc widzenie i pamięć mapy rosną tylko z legalnej drogi. Przez widoczną figurę
spoza drużyny nie przejdziesz, na zajętym polu nie staniesz. „Ruch graczy” ma **Stop
i Eksplorację** (Swobodny usunięty, migracja `free` → `explore`), a „Rozpocznij sesję” stawia
aktywną scenę w Stop. Marsz dłuższy niż pula łapie oddech na jej granicy i sam idzie dalej.
Plik etapu: `etap-52-ruch-gracza-klikiem.md`, umowa na górze `tura`, pułapka w `testy`.

**Etap 51 „Przegląd stref bronionych” (zlecenie MG z 15.10) zamknięty 15.10 — następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** U MG ukryta strefa ma przerywany obrys
i „ukryta” w podpisie (kartę otwiera dwuklik przy narzędziu ⚠). Gracz dostaje strefę bez PW
i przełącznika, a pułapka, która go złapała, staje mu się widoczna. Efekt `area` bije wszystkich
na obszarze, zniszczony dywan puszcza, a wieżyczka z przypiętą figurą liczy PW na figurze.
Plik etapu: `etap-51-strefy-bronione-przeglad.md`, umowa w `siec`, reszta przeglądu w `POMYSLY.md`.

**Etap 50 „Start walki, prowadzenie figury i celowanie wzorem Foundry” (zlecenie MG z 10.10)
zamknięty 11.10 (50a–50c) — następna jest refaktoryzacja całości pod osłoną suity, potem T10.**
Od 50a starcie zakłada „⚔ Do starcia”, „⚔ Rozpocznij walkę” rzuca NPC-om inicjatywę; od 50b MG
w walce prowadzi jedną figurę (tura NPC-a ją daje, klik w inną celuje albo pokazuje, inną bierze
się z pasa albo „🕹 Prowadź tę figurę”). **Od 50c figura ma trwały cel:** `T` nad figurą albo
podwójny prawy klik (menu figury łapie drugi klik) — prowadzona figura mierzy w tamtą, jej grot
stale wskazuje cel każdemu, kto widzi obie figury, prowadzący ma bledsze narożniki na celu,
a broń z paska od razu ładuje kubek na cel (ponowny klik — kolejny strzał, `Esc` odkłada).
Cel należy do figury, nie do konta (decyzja MG 11.10), żyje w pamięci serwera
(`realtime/target.ts`, `token:target`, `targets` w `state:sync`) i schodzi ze zmianą sceny,
końcem walki i skasowaniem figury. Decyzje — `etap-50-walka-wzorem-foundry.md`, umowy w `tura`.

**Etap 49 „Szybkie tworzenie NPC-ów i wrogów przez MG” (zlecenie MG z 10.10) zamknięty 10.10
(49a + 49b) — następna jest refaktoryzacja całości pod osłoną suity, potem T10.** Od 49b okno ma
„🎲 Losuj z Roli” (wymaga Roli): 1k10 na wiersz Cech, Umiejętności z tabeli Ulicznika z rozrzutem,
broń, pancerz i tarcza z pakietu Roli (`creation:random-npc`, karta `gmroll`; dane `streetrat`
w `creation.json` — przepisane z PDF-a, `parse-creation.py` ich nie nadpisuje). Od 49a **rzuty
kreatora MG widzi tylko MG** (`gmroll`), a MG ma na górze „Postaci” jedno okno „＋ Nowa postać…”
(`NpcCreateWindow`) z typem: **Statysta** (karta-wzorzec — każda figura postawiona z niej
dostaje własną kopię karty „Nazwa 1, 2…”), **Nazwany NPC** (jedna karta) i **Postać gracza**
(kreator). Statblok buduje `cpredNpcSheet`; przełącznik wzorca „⧉” w wierszu NPC-a; grupy
„Wzorce statystów” i „Statyści z wzorców”. Formularz „Imię + Utwórz” usunięty. Przeciąganie
z listy niesie okrągły portret 56 px. Decyzje — `etap-49-npc-mg.md`, umowy w `statysta`.

**Etap 48 „Ekwipunek gracza: skąd przybywają rzeczy” zamknięty 10.10 (48a–48c) — następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** **Od 48c karta nie ma pustych wierszy** —
także u MG: rzeczy przychodzą z zakupu, wymiany, łupu, kreatora i od MG („Dodaj za darmo”; rzecz
fabularną MG zakłada własnym wpisem w Kompendium, sekret pisze w uwagach wiersza — wpis widzi cały
stół). Gracz pisze tylko uwagi, wyrzuca, zużywa (ilość w dół), zakłada pancerz i umieszcza wszczep;
nazwa, Obrażenia, LA, OB, kara, ↻ i ⊕ Ulepszanie są MG. Serwer: `ITEM_LOCKED`
(`cpredPlayerItemPatchProblem`, `itemlocks.ts`) — **nowe pole wiersza, które gracz zmienia sam,
dopisz do listy `*_FREE`**. Dodatek do broni to towar (montaż z Wyposażenia, zdjęty wraca),
„Znaleziony — montaż” wszczepu wymaga wiersza w Wyposażeniu (MG: „Do Wyposażenia”). Od 48b dek
i Programy to towar (`character:deck`, umowa w `siec`); od 48a przypomnienie o zakupach w kreatorze
gracza i Zakwaterowanie Korpo wg Pracy Zespołowej. Decyzje — `etap-48-ekwipunek-gracza.md`, umowy
w `ekwipunek`, `siec`, `postac`, `ui`.

**Etap 47 „Cennik domowy” zamknięty 10.10 (47a + 47b) — następna jest refaktoryzacja całości pod
osłoną suity, potem T10.** Ed to mniej więcej euro: katalog z plików mnoży się **przy wczytaniu**
(`systems/cpred/pricing.ts`: sprzęt trwały ×10, amunicja i drobny sprzęt ×3; czynsz, Poziom
życia, wypłaty i gotówka startowa bez zmian; pasma i poziomy sklepu bez zmian). Kompletny Pakiet
dostaje **gratis wyposażenie Roli**, a Krawędziarzowi pakiet Roli daje MG „Dodaj za darmo”.
**Od 47b każda karta poza pojemnikiem ma stały wiersz „Bijatyka”** (i „Sztuki walki” od
Umiejętności 1) na końcu broni — nie da się go usunąć ani oddać (`barehands.ts`, umowy w `atak`
i `ekwipunek`). **Łańcuch E2E liczy w nowych cenach** (Kowal z pakietem Roli od MG, wypłata
1000 ed w T6a), `po-T3`…`po-T6` odbudowane 10.10; stare punkty w `.e2e/checkpoints-bak-47a`.
Zapis tabeli losowej nie czeka już na kości (#72). Decyzje w `etap-47-cennik.md`, cennik
z pozycjami: `data/private/cpred/cennik-x10.md`.

**Etap 46 „Wymiana, sklepy, amunicja, pojemniki” zamknięty 09.10 (46b2 ostatnia).** Pojemnik to karta NPC-a z polem `container`
i figurą: MG stawia skrzynię, bagażnik albo schowek narzędziem „📦” w pasku mapy (rodzaj, klik —
otwiera się kompaktowa karta: zamek, PT, Umiejętności, „Wydaj klucz”, „Pozwól spróbować znowu”,
zawartość); karty pojemników siedzą w „Postaciach” w zwiniętej grupie „Pojemniki”. Gracz podwójnym
klikiem albo „📦 Otwórz…” z menu figury dostaje okno „Wymiana” w trybie `container`: „Otwórz”,
„🔑 Otwórz kluczem” albo „Otwórz zamek” (wezwanie do Testu, kubek otwiera się sam, jedna próba na
postać), po otwarciu „←”, „Zabierz wszystko”, „→”. **„Stos”** powstaje z wiersza przeciągniętego
na mapę — z ikonki wiersza na karcie (cały wiersz) albo z „Mój ekwipunek” w oknie (ilość z pola)
— i znika pusty. Zawartość nieotwartego nie opuszcza serwera (kanarek w T2c i `t46b-`). Decyzje MG
i odstępstwa — w pliku etapu (sekcje 46b), umowy w `ekwipunek` i `mapa`.

**Etap 46c „Zapas amunicji” zamknięty 09.10 (46c1 + 46c2).** **Przeładowanie zużywa naboje z pudełek w ekwipunku** na kartach drużyny
(gracz, towarzysz-bot); NPC i statysta MG są „bez dna”, dopóki MG nie zaznaczy „Licz amunicję”.
Pudełko to wiersz wyposażenia z `ammo` (kaliber = pole „Amunicja” typu broni), kupowany paczkami
(10 kul / 1 granat) w Kompendium, w kreatorze i u handlarza; granat ręczny bez magazynka bierze
sztukę przy rzucie, gracz naboi ręką tylko odejmuje (`AMMO_LOCKED`). **Łańcuch E2E liczy amunicję
od 46c2:** Kowal kupuje w kreatorze 2 paczki zwykłej do B.C. Pistoletu (230 ed), po walce T4b
retest #82 (granat bez zapasu → `NO_AMMO`, pudełko od MG → 2/2), w T5a MG daje 2 paczki
przeciwpancernej z Kompendium, T5b 5.9 zmienia rodzaj z zapasu; **`po-T3`…`po-T6` odbudowane
pełnym przebiegiem 09.10**. Pudełka w E2E rozdaje `giveAmmo` z `fixtures/kompendium.ts`. **T3b i T5b
zakładają już „oczy drużyny” z etapu 45** (Ola widzi oczami Kowala; marsz Kowala obchodzi kuchnię
tarasem). Decyzje MG w pliku etapu (sekcja 46c), umowy w `atak` i `ekwipunek`. Jedno okno
„Wymiana” z 46a — kontekst w `archiwum/od-czego-zaczac.md`.

**Etap 44 „Konta MG” zrobiony i odebrany — T9b zamknięty 04.10** (`t9b-dwie-grupy` 15/15 dwa razy
— środkowy z trzech przebiegów padł tylko na filtrze konsoli, zero B0–B2, trzy B3 #79–#81 czekają na triaż MG; wynik w `testy.md` 6.5). **Następna jest
refaktoryzacja całości pod osłoną suity, potem T10.** T9b gra AI na atrapie gatewaya z dziennikiem
żądań (`fixtures/fake-gateway.ts`, tryb `reply`), a progi slotów i karencji skraca env. Kampanie i sesje jak w 44c
(kampania **otwarta** u MG, sesja zajmuje jeden z dwóch slotów, gracz bez sesji ma „Między
sesjami”). **AI właściciela:** zwykły MG prosi w Panelu MG, a decyduje **od etapu 53 administrator**
w swoim panelu (do 53 — każde konto z flagą przez znaczek „AI” w górnym pasku; konto gracza
dalej dostaje flagę w „Ustawienia → Konto” hasłem właściciela, ale daje ona już tylko obecność). AI dostaje kampania właściciela zawsze, a kampania MG
ze zgodą — gdy właściciel jest obecny i ma włączone „Udostępniam AI” (gaśnie samo 2 min po jego
ostatniej karcie i po restarcie). **AI trzyma jedna trwająca sesja** (pierwsza uprawniona; koniec
przekazuje dalej; „Przejmij AI” tylko dla własnej sesji właściciela), przygotowanie dostaje AI, gdy
nikt go nie trzyma. Każde żądanie AI idzie przez bramę kampanii (`campaignAi`, umowa w `boty`),
odmowa to `AI_UNAVAILABLE` z powodem. Decyzje MG z 04.10 na końcu `etap-44d-ai-wlasciciela.md`.
**W `dev.db` zostało konto MG `ogledziny-b` (hasło `ogledziny-b-haslo`) z kampanią „Oględziny 44d
(MG-B)”, zgodą na AI i graczem „Właściciel”** — śmieci z oględzin, wolno skasować.

**Kolejność (MG 03.10, korekty 08.10, 09.10 i 10.10): 44a → 44b → T9a → 44c → 44d → T9b → 45 → 46a1 → 46a2 → 46c1 → 46c2 → 46b1 → 46b2 → 47a → 47b → 48a → 48b → 48c → 49a → 49b → 50a → 50b → 50c → refaktoryzacja → T10 → 28 → T11.** (50a i 50b zamknięte 10.10, 50c — 11.10.) **Korekta MG 18.10: refaktoryzacja odłożona, najpierw próbne wdrożenie 28, potem T10 → T11.**

**Etap 43a zamknięty 26.09 (zlecenie MG spoza planu):** zakładka „Walka” to portrety z ranami od
dołu, ikonami efektów i akcjami grającego pod jego kartą; inicjatywa (rzut, remis, wpis, kubek
gracza, kolejność) żyje tylko na czarnym pasie; **odsetek PW widzi cały stół** (`hpShare`, decyzja
MG — obrączka na cudzych żetonach), „Postacie” w dwa wiersze. **43b** (animacja trafienia, iskry,
cięcie wręcz) i **43c** (plamy krwi na serwerze) rozpisane — MG wybrał „43a teraz, potem T4b”, więc
kolejność 43b/43c względem testów ustala MG. Umowy w `ui` i `mapa`.

**Otwarty jest tylko etap 28 (wdrożenie na VPS).** Przed nim idą **testy przed betą** (`testy.md`,
rejestr `testy-rejestr.md`): **T1, T2, T3a–T6c zamknięte** — **T6c 01.10: pełny przebieg od zera 196/196 dwa razy z rzędu (~31,5 min)** po dwóch poprawkach: kreator T3a skryptuje kości Cech Kowala, gateway ogranicza bufor promptów llama-server (`--cache-ram 2048`, wcześniej 8 GB w RAM-ie dusiło PC); T6b 30.09 (efekt na Cesze co do minuty, Ustabilizowanie obejściem krótką walką — **#42 B1: poza walką nie ma go w UI**, doba i odpoczynek, dziennik z kanarkiem, streszczenie i screamsheet botem, eksport, kopia z harmonogramu odtworzona na czystym katalogu, import na pustej instancji; nowe #42–#45, dopisek do Z10), T6a 29.09 (handel, sklep, Paser, PD,
Ola Medykiem operuje Kowala; zadanie Z10 — brak importu kampanii), T5b 27.09 (walka druga na „Bramie”: wieżyczka ze strefy, Demon, Kruk, przejęcie węzła, pad gatewaya w turze bota przez pośrednika TCP, F5 w Sieci, amunicja przeciwpancerna; sześć nowych błędów #34–#39), T5a 27.09 (przygotowanie „Bramy”, Skaner, run do Pliku; jego błędy #28–#33 naprawione i retestowane tego samego dnia), T4b 27.09 (granat, rana
krytyczna, Test Przeżywalności, Pochwycenie, wezwanie, łup i przekazanie; T4a przekalibrowany pod
obecne `po-T3`, retest #16, #19, #20 OK). **27.09 naprawione i retestowane:** #15, #17, #18, #23–#27
(`574cf4d`) oraz #28–#33 z T5a (`77e0f6f`; wagi w rejestrze dalej „do triażu MG”). **29.09 naprawione i retestowane #34–#39** (`8277386`), **30.09 — #40 i #41** (`21cbedd`:
gracz wskazuje po id tylko drużynę; operacja u Medyka innego gracza to prośba z ceną Medyka) oraz
retest #21 i #22. **01.10 naprawione i retestowane #10–#13 oraz #42–#45** (`a551f3a`) — #1–#45 zamknięte; **01/02.10 naprawione i retestowane #46 i #47** (`1e6f5dd`: limit odpowiedzi modelu w turze bota to `AI_TIMEOUT`, zapis karty nie cofa figury w marszu — umowy w `boty` i `mapa`) — **02.10 naprawione i retestowane #48 i #49** (`715df2b`: rzuty doganiają stół, karta niesie `revision` — umowy w `kosci` i `karta`), **02/03.10 naprawione i retestowane #50–#52** (`17f42a4`: figura łapie klik tylko na swoich polach, zmiana sceny zwalnia grafiki Pixi i pulę, kości zwalniają klony geometrii — umowy w `mapa` i `kosci`) — **rejestr bez otwartych błędów**; limity tempa, sesja gniazda i uploady za logowaniem (umowa w `serwer`), sesja i link zaproszenia ważne rok; zadania Z2–Z4, Z7 (reszta), Z9–Z11 dla etapów 28 i „Konta MG”. Suita `packages/e2e` (`pnpm test:e2e`)
stawia izolowaną instancję z `dist/` na :3101/:4173 i nie dotyka `dev.db`; **T6 podzielony na T6a/T6b/T6c** (decyzja MG z 29.09); **T7a zamknięty 01.10** (sieć, restart, dwie karty, degradacja AI — `pnpm test:e2e 40-odpornosc`,
poza domyślnym przebiegiem, od 02.10 z T7b i T7c 42 testy); **T7b zamknięty 02.10** (obciążenie stołu,
długi czat, rozmiar bazy — liczby w `testy.md` 6.3; **#48** stół minuty za serwerem przy częstych
rzutach, **#49** spóźnione echo zapisu karty gubi dopiski — triaż MG 02.10: B2 i B0, naprawione tego samego dnia); **T7c zamknięty 02.10**
(wydajność mapy na scenie 4096 i wyciek pamięci — `t7c-mapa`, `t7c-pamiec`, liczby w `testy.md` 6.3:
mapa 60 kl./s wszędzie poza Firefoksem gracza w marszu na Dynamicznej, serwer bez wycieku;
**#50** bufory Pixi po przełączeniu sceny, **#51** geometrie kości 3D, **#52** klik pod cudzą figurą
łapie jej podpis — to był „marsz Sowy”); **T8a zamknięty 03.10** (decyzja MG: T8 przed refaktoryzacją, podział T8a/T8b/T8c — `specs/50-przegladarki`,
macierz silników, ekrany 1920 × 1080 i 2560 × 1440, motyw, konsola; nowe #53–#55 — **03.10 triaż MG: #53 naprawiony** (szew sprite'a zasłony, `isRenderGroup`, umowa w `mapa`), **#54 i #55 odrzucone** — rejestr znów bez otwartych błędów);
**T8b zamknięty 03.10** (pierwszy kontakt: nowy gracz od linku do strzału w ~20 min bez pytań o UI; #56–#71 w rejestrze) i **tego samego dnia nowa zasada stołu (decyzja MG): obrażenia za kartę ataku rozliczają się same, Unik przed obrażeniami, jeden rzut na trafienie, grot za celownikiem** (`029cd36`, umowy w `atak` i `mapa`) — **03.10 (druga sesja): retest T5b → T6b z gatewayem zielony, triaż #57–#71 zrobiony (12 naprawionych w `120646b`, #66/#68/#71 B3 czekają), grot celowania widzi cały stół (`token:aim`, umowa w `mapa`), pełny przebieg 240/240**; **T8c zamknięty 03.10 (trzecia sesja)** — pobieżna regresja obszarów spoza scenariusza: `pnpm test:e2e t8c-` 31 testów z `po-T6` (mapa i „Lombard”, UI i ustawienia, tabele, asystent zasad, baza wiedzy, siedem Zdolności Ról, Reputacja, styl życia; lista w `testy.md` 6.4), nowe #72–#78; **03.10 (czwarta sesja) triaż MG i poprawki #66, #68, #71–#78** (`b9873e8`, retest `00-baseline` + `t8c-` 36/36) — **rejestr znów bez otwartych błędów**; **refaktoryzacja pod osłoną suity przesunięta za etap 44 (decyzja MG 03.10)** (pomiary T7b/T7c i T8a to jej linia bazowa). **Pełny przebieg puszczaj we własnym oknie konsoli, a gateway — w terminalu MG** (pułapka w `testy`).
Kolejność (decyzja MG z 26.09, korekta 01.10):
**T3–T6 → T7a–T7c → T8a–T8c (korekta 03.10) → 44a → 44b → T9a → 44c → 44d → T9b (korekta 03.10, piąta sesja) → 45 → 46a → 46c → 46b (korekta 08.10) → refaktoryzacja całości pod osłoną suity → T10 (z powtórką automatu T8a) → 28 → T11**.
Refaktoryzację odłożono 05.09 — od tamtej pory doszło sześć etapów i naprawa kreatora.
Nie proponuj makr (36 wycofany) ani głosu (12, 21, 22). Największe pliki do pocięcia przy
refaktoryzacji: `MapRenderer.ts` (294 KB), `CharacterSheet.tsx` (172 KB), `socket.ts` (152 KB),
`roleability.ts` (121 KB), `CharacterCreator.tsx` (111 KB) — czytaj je fragmentami (`grep` + zakres).

**Stan UI (20.09):** cały chrom i karta postaci są „starą kartką” — `chrome.css`, `sheet.css`,
tokeny papieru w `theme.css`, kafle UI z maski karty (`tools/art/chrome-paper.py`), wspólna paleta `--cp-*`; MG odrzuca
wszystko ciemniejsze od papieru („żadnego brudu”). Dzień od 24.09 w tonie tapety logowania,
z własną maską (wyblaknięcia + pognieciona kartka) i przypalonym brzegiem (`assety-chrom.md`). Poza skórą: Sieć, pasek mapy, screamsheet,
logowanie. **Od 25.09 kolejka inicjatywy to czarny pas nad mapą, a „Kończę turę” gracza stoi na
górze lewego panelu** (umowa w `ui`). **Od 25.09 (piętnasta) MG ma w prawym górnym rogu mapy
znacznik „Czeka na MG”** z listą spraw, kaflem i licznikiem w tytule karty, a baner portretu
ma własny kadr albo bierze kadr żetonu (umowy w `ui`). **Safari i iPada nie testujemy ani nie dostosowujemy** (decyzja MG z 25.09). **`styles.css` jest od
18.09 spisem `@import` 19 plików w `styles/`** — czytaj plik obszaru, nie całość (umowa w `ui`).

**Naprawa kreatora (`naprawa_karty_postaci.md`) zamknięta 18.09** (etapy 1, 2a–2c, 3a–3d, odbiór
obu metod). **Od 24.09 rzuty kreatora idą po jednej kości przez kubek** (zlecenie MG z 17.09 —
gracz rzuca Cechę raz, przerzut daje MG), a **nowa postać gracza wymaga zgody MG, przeczytanych
zasad i zatwierdzenia** („Przyjmij do gry” od 24.09 blokuje kartę); **od 25.09 zgoda niesie
warunki** — metodę, Rangę Postaci i pulę umiejętności (zasada domowa, podręcznik: 86). Dalsza praca przy kreatorze wychodzi z `POMYSLY.md`
i `zaleglosci.md`. Co obowiązuje w kodzie — sekcja `postac` w umowach; kontekst —
`archiwum/od-czego-zaczac.md`.

**Model lokalny to od 24.09 Qwen3.8-27B UD-Q3_K_XL** (build 10735 w `C:/AI/llm/llama-prism/`,
~50 tok/s, VRAM 15,5 / 16,3 GB przy 32k — na GPU nic nie dokładamy). Qwythos-9B jest skasowany
z dysku; pomiary obu w `ai-gateway/README.md`. Zaległości „na żywy model” zamknięte 24.09.

**Zaległości (18.10, druga sesja): tylko paczka AI dla innych MG (po becie)** — T6b 6.6b, łańcuch z gatewayem, odporność i #79–#81 zamknięte (archiwum). Co ocenia się tylko przy stole (kafel papieru,
sesja zero w kreatorze, pełny ekran, polszczyzna Qwen, Wsparcie 10) — pierwszy wpis `POMYSLY.md`.
**Playwright MCP jest włączony** (MG w Chromium, gracz w Firefoksie, stan sceny z konsoli przez
`await import('/src/socket.ts')` — pułapki w `ogledziny`). Kampania-śmieć „Oględziny 12.09” ma członka `Tester`;
**zaproszenie `tester-dev` jest unieważnione od 17.09** — wchodzi się ważnym zaproszeniem
aktywnej kampanii (`poligon.md`).

**Sceny testowe — pięć.** Aktywna **„StrefaPrzemysłowa”** (kratka 36,2 px, 40 × 30) z **włączonym
trybem turowym** (RUNDA 1: Marcin, Tony — decyzja MG z 12.09, wyłącza tylko jego ręka; „✕” woła
gołego `window.confirm`, pułapka w `ogledziny`). „Korytarza 16e” **nie kasuj** — jedyna scena
z widocznością Dynamiczną. Konta, współrzędne, procedura oględzin: `poligon.md`.

**Pułapki, które wracają przy stole:**

- „Gracz nie może chodzić” — najpierw znaczek „⚠” i przełącznik „Ruch graczy” w górnym pasku MG
  (`Scene.playerMove`: Stop / Eksploracja; nowa scena i **każdy start sesji** stawiają Stop, MG nie
  dotyczy), potem to, że gracz nie przeciąga figury (52), od 54 rusza ją **jednym klikiem**
  (w swojej turze poza zielonym pasem — dwoma), a przez widocznego wroga nie przejdzie; dalej ręczna mgła: od 14.09
  gracz chodzi tylko po odsłoniętym (`refuseWalkIntoFog`, umowa w `mapa`), potem `Token.ownerId`.
- `>=` przy PT jest błędem, nie wariantem (decyzja z 28.08 cofnięta; wyjątek: Test Lojalności,
  s. 154) — przeczytaj `decyzje-i-uproszczenia.md`, **zanim** to ruszysz.
- Kara za rany ma jedno miejsce: `cpredWoundPenaltyRows(cpredSheetWoundCondition(sheet))`; nowe
  zawieszenie kary dopisuje się w `cpredWoundSuspensionSource` (umowa w `kosci`).
- `requireCallableRequest` (`realtime/checks.ts`) to **biała lista** — nowe pole `CpredRollRequest`
  trzeba do niej dopisać, inaczej ginie po cichu między prośbą gracza a rzutem.
- `data/private/cpred/compendium/` bywa starsze niż parser — `python tools/import/parse-manual.py`
  przed szukaniem błędu. `shop-tiers.json` i `weapon-icons.json` (24.09) też są poza gitem i jadą na VPS z kompendium.
- Pozycje z `POMYSLY.md` sprawdź w kodzie, zanim je ruszysz (29.08 cztery były nieaktualne);
  triaż z 28.08 w `decyzje-i-uproszczenia.md` nie wraca jako nowe odkrycia.
- Karty czatu piszą alias figury (`Token.publicName`) wyłącznie przez `tokenTableName` (umowa
  w `czat`); odmowa broni spoza rąk idzie przez `cpredDrawFits` (umowa w `atak`).

**Git:** `main` na GitHubie zrównany z dyskiem 14.09. Push publikuje całą historię — przed każdym
`git log --name-only --format= origin/main..HEAD` nie może pokazać `data/private/`, `uploads/`,
`.env` ani baz.

**Testy na koniec ostatniej sesji:** 19.10 (trzecia — etap 56): **2512** `shared` (+4), **1507** serwer (+12 `foe-sighting.test.ts`, `combat.test.ts` — posiłki z inicjatywą), **416** klient (+3); `tsc`, ESLint, Prettier czyste w zmienionych plikach; E2E — tylko tymczasowy spec oględzin (żadna suita nie dotyka postawy; NPC dołożony w walce ma teraz inicjatywę — łańcuch T4b–T6b niepuszczony). Wcześniej 18.10 (druga — zaległości): **2492** `shared` (nie ruszany), **1481** serwer (+1 `walk-approval.test.ts` — koniec trasy przyciąga się jak lądowanie, rozszerzony `ai-access.test.ts` — #79; oba czerwone bez poprawki), **404** klient (+2 `chat-store.test.ts` — #81); `tsc` w kliencie, serwerze i e2e, ESLint i Prettier czyste w zmienionych plikach; E2E z gatewayem: T6b od `po-T6a` **18/18**, łańcuch T5b → T6a → T6b od `po-T5a` **59/59**, `t9b-` **15/15**, T3a od zera **17/17**, **pełny domyślny przebieg 370/379** (55,3 min; padły tylko wpisy konsoli przy restarcie instancji — 44d obrazek logowania w Firefoksie, dym 53 `NS_ERROR_CONNECTION_REFUSED`, T9a `ERR_CONNECTION_REFUSED`; 6 dalszych kroków dymu 53 nie poszło), powtórka `01-dym` + `t9a-izolacja` **35/35**; `40-odpornosc` **34 zielone** + `t7c-mapa` po poprawce `centreOn` **9/9** (pierwszy przebieg: 1 czerwony, 7 wariantów nie poszło). Punkty `po-T3`…`po-T6` zapisane na nowo **z krokami `@llm`**. Wcześniej 18.10 (zaległości): **2492** `shared` (separator U+00A0 w pięciu testach), **1480** serwer (+1 `bot-combat.test.ts` — przeładowanie innym rodzajem, +1 `tokens.test.ts` — naklejka rany przy postawieniu i przepięciu; oba czerwone bez poprawki), **402** klient (+1 `notices.test.ts`); `tsc` w kliencie i `shared`, ESLint i Prettier czyste w zmienionych plikach; E2E: T6a od `po-T5` **13/13** (1 `@llm` pominięty; 6.1 „Wymienione” i 6.3 kwoty; `po-T6a` zapisany na nowo), T6b od nowego `po-T6a` **3/18 — pada 6.6b** (`MOVE_PACE`, nowa zaległość, reszta nie poszła), `t46a-` + `t46b-` 25 zielonych + 46a.15 (znane migotanie menu Pasera; powtórka `t46a-` **17/17**), `@szybkie` **57/58** (T9a „konsola” — zerwane gniazdo Firefoksa; powtórka `t9a-konta` **7/7**); **T5b, T6b od 6.6b, `t7*` niepuszczone**. Wcześniej 17.10 (etap 55b): **401** klient (bez nowych — sam przepływ UI; `exchange-store.test.ts` bez `lastClosed`); `shared` i serwer nie ruszane; `tsc` w kliencie i e2e, ESLint, Prettier czyste; E2E `@szybkie` 57/58 (T9a „konsola” — znane zerwane gniazdo Firefoksa, powtórka `t9a-konta` **7/7**), `t46a-` + `t46b-` + `t46c-` + `t8c-zdolnosci` zielone (46a.2 padł raz na `chatLine` łapiącym kartę „Handel” — nowe asercje czytają wyłącznie `.notice`, powtórka `t46a-` + `t8c-zdolnosci` **30/30**); **T5a (#31 czyta `.notice[data-notice-topic="net"]`), T6a (6.1, 6.4, 6.5) i T6b (import kopii) przepięte, ale niepuszczone**. Wcześniej 17.10 (etap 55a): **401** klient (+8 `notices.test.ts`); `shared` i serwer nie ruszane; `tsc` w kliencie i e2e, ESLint, Prettier czyste; E2E `@szybkie` 57/58 (T9a „konsola” — zerwane gniazdo Firefoksa MG, znana pułapka; powtórka `t9a-konta` **7/7**), `t45-` + `t8c-mapa` + `t8c-narracja` **19/19** (2 `@llm` pominięte), T4a z `po-T3` zielone, T4b + T5a z `po-T4a` **43/43** (po poprawce wyścigu w `nextTurn` — martwy Zbir oddaje turę, zanim fikstura doczyta bazę; `po-T4`, `po-T5a` zapisane na nowo); **T5b, T6a, T6b, `t46*`, `t7*` niepuszczone**. Wcześniej 17.10 (oddawanie tury): **2478** `shared` (+1 `statuses.test.ts`), **1477** serwer (+2 `turn-effects.test.ts`, +1 `damage.test.ts`; `grapple.test.ts` — nieprzytomny bandzior nie dostaje już tury, przed chwytem MG przywraca mu PW); `tsc` w czterech pakietach, ESLint, Prettier czyste; E2E T4b z `po-T4a` **20/20** (4.7: Zbir ginie w Teście i oddaje turę sam; `po-T4` zapisany na nowo); reszty łańcucha nie puszczano. Wcześniej 17.10 (etap 54): **2477** `shared` (+3 Bieg z marszu w `turn.test.ts`), **1474** serwer (+1 `walk-approval.test.ts`; `turn-effects.test.ts` przestał migotać), **392** klient (+8 `walk-click.test.ts`); `tsc` w czterech pakietach, ESLint, Prettier czyste; E2E `00-baseline` + `01-dym` + `t45-` **33/33** (1 `@llm` pominięty; t45 z nowym testem jednego kliku), `t8a-macierz` **16/16** (marsz w walce w obu układach silników), T4a z `po-T3` zielone, T4b z `po-T4a` **20/20** (po poprawce kamery w `clickWorld` i 4.7 przepiętym na Test Przeżywalności od serwera — **4.7 był czerwony od `86b54be`**; `po-T4` zapisany na nowo), `t7c-marsz-pod-figura` + `t7a-walka-siec` + `t8c-` + `t46b-` **52/52** (2 `@llm` pominięte); **T3b, T5a, T5b (wymaga gatewaya), T6a, T6b, `t7b-`, `t7c-mapa`, `t46a-`, `t46c-` niepuszczone** — wołają `walkOnMap` w trybie `auto`. Wcześniej 17.10 (etap 53): **2471** `shared`, **1469** serwer (+10 `admin.test.ts`, +2 `ai-access`), **384** klient (+2 `admin-format.test.ts`); `tsc` w czterech pakietach, ESLint, Prettier czyste; E2E `00-baseline` + `01-dym` + `t2d-` zielone (1 `@llm` pominięty), `t53-` + `t9a-` + `t9b-` **42/42**; **`t6b-` i `t7b-` niepuszczone** (przepięte na administratora: 6.9a i kopia przez `adminApi()`); domyślny przebieg ma teraz **+6** testów (`t53-admin`). Wcześniej 15.10 (etap 52): **2470** `shared` (+19 `walk-route.test.ts`), **1457** serwer (+11 `walk-approval.test.ts`, `sessions.test.ts` — Stop na start; `paceTesting.off` w 11 plikach), **366** klient; `tsc` w czterech pakietach, ESLint, Prettier czyste; E2E: `00-baseline` + `01-dym` + `t45-` zielone (t45 8/8 z nowym testem UI), łańcuch od `po-T3a` T3b–T5a **56 + 23** zielone (`po-T3`…`po-T5a` odbudowane **bez `@llm`**, gateway wyłączony), T6a + T6b od starego `po-T5` **28/28** (4 `@llm` pominięte), `t46a- t46b- t46c- t8a- t8c- t9a- t9b- sesje` **152/152**, `t7c-marsz-pod-figura` + `t7a-handel-kreator` 5/5; **T5b, `t7a-walka-siec`, `t7b-`, `t7c-mapa` niepuszczone** (zaległość). Wcześniej 15.10 (gotowość stołu): **366** klient, **1446** serwer; E2E `sesje` 4/4, `t9a-izolacja` 14/14, `t9b-` 15/15 (szczegóły w notatce). Wcześniej 14.10 (komunikaty walki, kubek obrażeń): **2451** `shared`, **1442** serwer, **355** klient (+6 `attack-damage-call.test.ts`; `theme.test.ts` już zielony); `tsc` i ESLint czyste; E2E `t8a-macierz` **16/16** (oba układy), T4a + T4b **33/33** z `po-T3` (`po-T4a`, `po-T4` odbudowane 14.10); **T5b niepuszczony do końca — start wymaga AI Gateway** (przepięty #38 niesprawdzony). Wcześniej 11.10 (50c): **1442** serwer (+3 w `tokens.test.ts`: cel dla widzących obie figury i w `state:sync`, ukryta figura nie wycieka i odmowy, zejście z końcem walki; skasowanie figury zdejmuje cel; macierz izolacji z `token:target`), **347/348** klient (+6 `target-store.test.ts`; dalej tylko znany `theme.test.ts`); `shared` bez nowych testów (same typy); `tsc` w czterech pakietach, ESLint i Prettier czyste w zmienionych plikach; E2E `00-baseline` + `t8a-macierz` **21/21** (oba układy silników); łańcucha i pełnego przebiegu nie puszczano (bez celu nic się nie zmienia poza rozmiarem narożników celownika). Wcześniej 10/11.10 (50b): **341/342** klient (+12: `combat-steer.test.ts` 8, `map-click.test.ts` 4; dalej tylko znany `theme.test.ts`); serwer i `shared` nie ruszane; `tsc` w kliencie i e2e, ESLint i Prettier czyste w zmienionych plikach; E2E: 10/11.10 łańcuch T4a → T5b przeszedł (punkty `po-T4a`…`po-T5` zapisane 11.10, 00:13–00:29; czy z gatewayem — nie zapisano), a T6a 6.2 padł dwa razy — **nie przez 50b**: od `bcc3716` (10.10) gracz nie widzi na półce Kompendium rzeczy ponad poziom sklepu, a krok szukał wyszarzonego „Kup” przy Roninie; krok sprawdza teraz brak wiersza i odmowę gniazda. Po poprawce 11.10 bez gatewaya: T6a od `po-T5` **13/13** (1 `@llm` pominięty), T6b od nowego `po-T6a` **15/15** (3 `@llm` pominięte) — **`po-T6a` i `po-T6` odbudowane 11.10 bez kroków `@llm`**; specyfikacje z `po-T6` (`t46*`, `t8c-`) i pełnego przebiegu nie puszczano. Wcześniej 10.10 (50a): **1439** serwer (+2 w `combat.test.ts`: starcie z „Do starcia” z drużyną, inicjatywa NPC-ów przy starcie rundy 1), **329/330** klient (dalej tylko znany `theme.test.ts`); `shared` nie ruszany; `tsc` w kliencie, serwerze i e2e, ESLint i Prettier czyste w zmienionych plikach; E2E `t8a-macierz` **16/16** (oba układy silników, nowy `beginFight`); T4a, T5b, T6b i T7b przepięte na `beginFight`/„Załóż starcie”, ale nie puszczane. Wcześniej 10.10 (49b): **2451** `shared` (+6: `creation.test.ts` 4 — pakiety i losowanie, `npc.test.ts` 2 — tarcza i Ranga), **1437** serwer (+2 `npc-create.test.ts`; macierz izolacji z `creation:random-npc`), **329/330** klient (dalej tylko znany `theme.test.ts`); `tsc` w trzech pakietach, ESLint i Prettier czyste w zmienionych plikach; E2E nie puszczane (49b nie rusza ścieżek suity). Wcześniej 10.10 (49a): **2445** `shared` (+5 `npc.test.ts`), **1435** serwer (+4 nowy `npc-create.test.ts`; `creation.test.ts` — rzut Ścieżki Życia MG jest `gmroll` i nie dochodzi do gracza), **329/330** klient (pada tylko znany `theme.test.ts` — `--top-bar-control`, sprzed sesji); `tsc` w trzech pakietach i e2e, ESLint i Prettier czyste w zmienionych plikach; E2E: `t46c-amunicja` **10/10** (46c.8 otwiera kreator kontem MG — fikstura `openCreator` idzie przez „Nowa postać” → „Postać gracza”); łańcucha i pełnego przebiegu nie puszczano. Wcześniej 10.10 (siódma — zaległości): **2431** `shared` (+4: `combat.test.ts` 3, `merchant.test.ts` 1), **1430** serwer (+12: nowy `gm-care.test.ts` 11, `bot-combat.test.ts` +1), **330** klient; ESLint, Prettier i `tsc` czyste w zmienionych plikach; E2E: nowy `t8c-leczenie` 3/3, `t46a-` + `t46b-` + `t46c-` + `00-baseline` **41/41** z gatewayem (46c.9 na żywym modelu), po poprawce Bijatyki `t46a-` 17/17; domyślny przebieg ma teraz **+3** testy (`t8c-leczenie`), pełnego nie puszczano. Wcześniej 10.10 (48c): **2423** `shared` (+13 `itemlocks.test.ts`), **1417** serwer (+4: dodatek bez Wyposażenia i z niego, „Znaleziony” z Wyposażenia w montażu i w prośbie do Medyka; przygotowanie stanu łatą MG zamiast gracza w 5 plikach), **331** klient; ESLint, Prettier i `tsc` czyste; E2E z gatewayem: T3a **17/17** (nowy krok 3.8 — 48c), łańcuch od nowego `po-T3a`: T3b–T6a **112/112** + T6b **18/18** (pierwszy przebieg padł w T6b 6.6a — asercja czytała czat jednym odczytem przed wierszem „Efekty wygasły”; poprawiona na `expect.poll`, punkty `po-T3a`…`po-T6` odbudowane 10.10), `t46a-` + `t46b-` + `t46c-` **36/36**. Wcześniej 10.10 (48b): **2410** `shared` (+17: `cyberdeck.test.ts`, kreator z dekiem), **1413** serwer (+1 `character:deck` w `netrunning.test.ts`, kreator Netrunnera i macierz izolacji poprawione), **331** klient; ESLint (pakiety), Prettier i `tsc` czyste; E2E z gatewayem: T3a **16/16**, łańcuch T3b–T6b od nowego `po-T3a` **130/130** (punkty `po-T3a`…`po-T6` odbudowane 10.10), `t46a-` + `t46b-` + `t46c-` + `00-baseline` 40/41 (46a.15 — menu figury Pasera nie otworzyło się prawym klikiem, migotanie; powtórka `t46a-` 17/17, pułapka w `testy`). Wcześniej 10.10 (48a): **2393** `shared` (+5: przypomnienie o zakupach, Zakwaterowanie Korpo), **1412** serwer (+2: brak zakupów gracza, `HOUSING_LOCKED`; helper `allocateRemaining` zaznacza „Ruszam bez zakupów”), **331** klient; ESLint, Prettier i `tsc` czyste; E2E `@szybkie` 52/53 (T9a „konsola” — zerwane gniazdo Firefoksa, znana pułapka z 47a; powtórka `t9a-konta` 7/7); łańcucha i pełnego przebiegu nie puszczano (T3a kupuje w kreatorze, więc nowy brak go nie dotyczy). Wcześniej 10.10 (47b): **2388** `shared` (+11 `barehands.test.ts`), **1410** serwer (+1 gołe ręce w `inventory.test.ts`, asercje list broni w 6 plikach), **331** klient; ESLint, Prettier i `tsc` czyste w czterech pakietach (poza starymi ostrzeżeniami Prettiera w `e2e/fixtures/brama.ts` i `wydajnosc.ts`); łańcuch T3a–T6b zielony kawałkami z gatewayem (T3a 16/16, T3b–T4a, T4b–T5b, T6a + T6b 32/32), `t46a` + `t46b` + `t46c` 35/35 i `t46c` 10/10 po poprawce, `t7a-handel-kreator` 3/3; **pełny domyślny przebieg z gatewayem dwa razy** (369 testów): 365 + #72 + szew zasłony (migotanie), po poprawce #72 **366/369** (52,3 min; 6.9c — przerwany obrazek w Firefoksie, dwa testy za nim nie poszły), potem `t6b-` 18/18 i `00-baseline` + `t8c-` 37/37. Wcześniej 10.10 (47a): **2377** `shared` (+10: `pricing.test.ts`, wyposażenie Roli, zasady domowe asystenta), **1409** serwer (+3 wyposażenie Roli; kwoty w 8 plikach pod cennik domowy), **331** klient; ESLint i `tsc` czyste w czterech pakietach; E2E `@szybkie` 51/52 (T9a „konsola” — zerwane gniazdo Firefoksa, powtórka 7/7); **łańcuch T3a–T6b i specyfikacje z jego stanów czerwone do 47b**; domyślny przebieg bez nowych testów (**367**). Wcześniej 09.10 (46b2): **2367** `shared`, **1406** serwer, **331** klient (bez nowych testów jednostkowych — zmiany w kliencie i E2E); E2E `t46b-` **9/9 trzy razy z rzędu** (nowy `specs/46-wymiana/t46b-pojemniki`), `t46b-` + `t46a-` + `00-baseline` + `01-dym` + `t2c-` (nowy kanarek skrzyni) **50/50**; ESLint i `tsc` czyste w czterech pakietach; domyślny przebieg ma teraz **367** testów (+9 `t46b`), pełnego nie puszczano. Wcześniej 09.10 (46b1): **2367** `shared` (+18 `container.test.ts`), **1406** serwer (+11 `containers.test.ts`, macierz izolacji z pięcioma nowymi zdarzeniami), **331** klient; E2E `00-baseline` + `01-dym` **20/20**, `t46a-` **17/17**; ESLint, Prettier i `tsc` czyste; domyślny przebieg bez zmian (**358**). Wcześniej 09.10 (46c2): **pełny domyślny przebieg od zera z gatewayem
354/358** (49,5 min; padły 46c.9 ze zbyt ostrą asercją — poprawiona — i znane migotanie T8c #72,
dwa `@llm` T8c po nim nie poszły), potem od nowego `po-T6`: `t46c-` + `t8c-narracja` **16/16**
i `t46c-` **10/10 trzy razy z rzędu** (z 46c.9 na żywym modelu); wcześniej łańcuch kawałkami
(T3a 15/15, T3b–T4a, T4b–T5a, T5b 27/27); kodu aplikacji nie ruszano, więc jednostkowych nie
puszczano; domyślny przebieg ma teraz **358** testów (+#82 w T4b, +46c.9). Wcześniej 09.10 (46c1): **2349** `shared`, **1395** serwer, **331** klient; E2E `t46c-` **9/9 trzy razy z rzędu** (nowy `specs/46-wymiana/t46c-amunicja`), `00-baseline` + `01-dym` + `t46a-` 36 zielonych (1 pominięty bez gatewaya); **łańcucha T4a–T5b i pełnego przebiegu nie puszczano — do 46c2 są czerwone z założenia**; domyślny przebieg ma teraz **356** testów (+9 `t46c`). Wcześniej 08.10 (46a2): **2318** `shared`, **1386** serwer, **331** klient; E2E `t46a-` **17/17 trzy razy z rzędu** (plus kolejne zielone po poprawkach z oględzin), T4b od `po-T4a` 19/19 (zapisał na nowo `po-T4` — stan równoważny), T6a od `po-T5` 12/12 (1 `@llm` pominięty, bez bramki), `t7a-handel-kreator` 3/3, `00-baseline` + `01-dym` + `35-bezpieczenstwo` 89 zielonych + T9b krok 4 (szept między grupami — migotanie, powtórka T9b 15/15); pełnego przebiegu nie puszczano — domyślny przebieg ma teraz **347** testów (+17 `t46a`). Wcześniej 08.10 (46a1): **2317** `shared`, **1385** serwer, **321** klient; E2E `00-baseline` + `01-dym` 19/19 (jeden pominięty bez gatewaya), T2b + T9a **38/38** (12,5 min, macierz ról, śmieci i izolacja z nowymi zdarzeniami); domyślny przebieg ma tyle testów co po 45 (46a1 nie dodała E2E). Wcześniej 08.10 (etap 45): **2276** `shared`, **1369** serwer, **321** klient; E2E `00-baseline` + `01-dym` + `45-druzyna` 27/27 (jeden pominięty bez gatewaya), potem `45-druzyna` 8/8 drugi raz; pełnego przebiegu nie puszczano — domyślny przebieg ma teraz **330** testów (T3b, T5a i T9a ruszone tylko w miejscu blokady mapy, nieprzebiegnięte). Wcześniej 04.10 (jedenasta — T9b): E2E `t9b-` **15/15 dwa razy** (~5,5 min, atrapa gatewaya; przebieg pomiędzy padł tylko na filtrze konsoli — 500 pośrednika przy restarcie, poprawione); kodu aplikacji nie ruszano, więc jednostkowych i pełnego przebiegu nie puszczano — domyślny przebieg ma teraz **322** testy. Wcześniej 04.10 (dziesiąta — 44d): **2267** `shared`, **1358** serwer, **321** klient; **pełny domyślny przebieg E2E 307/307** z gatewayem (42,5 min, nowy `01-dym/t44d-ai-wlasciciela` 4). Wcześniej 04.10 (dziewiąta — 44c): **2267** `shared`, **1347** serwer, **321** klient; pełny przebieg E2E **303 testy** (300 zielonych + migotanie T8c #72, powtórka zielona). Wcześniej 04.10 (ósma sesja — T9a): **pełny domyślny przebieg E2E 299/299** z gatewayem w 41,5 min (nowe `t9a-konta` 7 i `t9a-izolacja` 14), kodu aplikacji nie ruszano. Wcześniej **2264** w `shared`, **1337** na serwerze, **319** u klienta (04.10, siódma sesja — 44b; E2E `00-baseline` + `01-dym` + `35-bezpieczenstwo` 59/59, `t3a-` 15/15; wcześniej 03.10, szósta sesja — 44a; E2E: `00-baseline` + `01-dym` + `35-bezpieczenstwo` z nowym `t2d-konta-mg`, domyślny przebieg ma teraz **278** testów); **63** w gatewayu (03.10, czwarta sesja: `00-baseline` + `t8c-` 36/36 z gatewayem po poprawkach #66–#78; domyślny przebieg ma teraz **272** testy — pełnego od zera z T8c jeszcze nie puszczano; trzecia — T8c — `t8c-` 31/31; E2E drugiej sesji: **pełny domyślny przebieg 240/240 w 36,4 min** z gatewayem, wcześniej T5b 27/27 i T6a + T6b 31/31; dalej stan starszy:)
**61** w gatewayu (01.10, `--cache-ram`), **240** E2E w domyślnym przebiegu (196 + 44 T8a z 03.10: `t8a-` 44/44 po poprawce #53; wcześniej 42/42 dwa razy, `@szybkie` 30/30) + **42** odporności T7a–T7c poza nim (02/03.10 po poprawkach #50–#52: `t7c-` 16/16 w 53,7 min z progami wycieku, `00-baseline` 5/5; 02.10 T7c: `t7c-mapa` 9/9, `t7c-pamiec` 4/4 w 43,7 min, `t7c-marsz-pod-figura` 2/2 z jednym `test.fail` #52, `00-baseline` 5/5; wcześniej 26 bez `test.fail`; po poprawkach #48/#49 `40-odpornosc` 26/26 w pełnej skali, 24,1 min) (02.10 T7b — `t7b-obciazenie` 3/3 w pełnej skali, `t7b-czat-baza` 5/5; 02.10 — `40-odpornosc` 17/17 dwa razy, T4a → T4b od `po-T3` 34/34; 01.10 T6c — pełny przebieg od zera 196/196 dwa razy z rzędu, 31,5 i 31,6 min; 01.10 — T2 od `po-T3` 41/41, T6b od `po-T6a` 18/18; 30.09 — T6b od `po-T6a` trzy razy, T6a → T6b od `po-T5` 30/30, T6a od `po-T5` 13/13 cztery razy, T2 od `po-T3` 41/41; 29.09 — T4a → T5b od `po-T3` 84/84; 27.09 system zabił procesy w tle z braku pamięci — przyczyną był bufor promptów llama-server) — sumy w starszych notatkach są zaniżone, nie poprawiaj ich w dół. ESLint, Prettier
i `tsc --noEmit` czyste w trzech pakietach. **Nie puszczaj `pnpm format` na `POSTEP.md`,
`POMYSLY.md` ani `00-przeglad.md`** — Prettier przelałby kilkaset wierszy szumu do commita.

## Zanim dotkniesz obszaru — co przeczytać

Indeksy umów kodu i pułapek dev **wyprowadzone stąd 10.09.2026** (ważyły 62 KB ze 107 KB tego
pliku i rosły z każdym etapem). `umowy-kodu.md` i `pulapki-dev.md` są pocięte na **te same sekcje,
w tej samej kolejności**, a każda sekcja zaczyna się własnym indeksem — czytasz **jedną sekcję**,
nie cały plik:

```
grep -n '^## atak' docs/etapy/umowy-kodu.md docs/etapy/pulapki-dev.md
```

Umowa mówi, **gdzie dopisuje się nową rzecz** — czytaj przed dokładaniem czegokolwiek w obszarze.
Pułapka mówi, **gdzie już raz zniknął czas** — czytaj, zanim zaczniesz szukać błędu. Nową umowę
albo pułapkę dopisujesz do sekcji jej obszaru (wiersz na górę indeksu, pełny wpis pod spodem),
a nie do tego pliku.

| obszar      | co obejmuje                                                    | umów | pułapek |
| ----------- | -------------------------------------------------------------- | ---- | ------- |
| `mapa`      | figury, zaznaczanie, narzędzia, obiekty sceny, ściany, efekty  | 66   | 27      |
| `czat`      | rodzaje wierszy, `visibleTo`, filtr, `seq`                     | 8    | 3       |
| `serwer`    | Prisma i migracje, zdarzenia gniazda, zapisy karty, uploady    | 24   | 21      |
| `ui`        | okna pływające, `z-index`, motyw, skróty, dostępność, wejście  | 36   | 15      |
| `kosci`     | kubek, `rollFormula`, wezwania i prośby o Test, tabele losowe  | 22   | 2       |
| `tura`      | budżet Akcji i metrów, kolejka, trasa, ruch przez ściany, skok, walka z zauważenia, pytanie MG o przekroczenie | 26   | 6       |
| `atak`      | broń i dodatki, amunicja, obrażenia, pancerz, rany krytyczne   | 48   | 8       |
| `statysta`  | figura z kartą, `statBlock`, Wartość bojowa, `token:stat`, wzorce | 17   | 3       |
| `karta`     | strony i zakładki, panele, `sheet.css`, walidacja list         | 10   | 12      |
| `postac`    | kreator, PD i awanse, Role i Zdolności, cyborgizacje, ekonomia | 51   | 3       |
| `ekwipunek` | wiersze wyposażenia, przekazanie, łup, handel, sklepy, zasięg  | 33   | 3       |
| `czas`      | zegar świata, kalendarz, `statEffects`, leczenie po dobie      | 18   | 2       |
| `siec`      | Programy, LOD, demony, piętra architektury, dek jako towar, strefy bronione | 9    | 3       |
| `boty`      | llama-server, RAG, reindeks, dziennik i baza wiedzy, brama AI  | 10   | 10      |
| `dane`      | `parse-manual.py`, kompendium poza repo, tabele z podręcznika  | 8    | 12      |
| `kopie`     | `snapshot`, `archive`, rotacja, eksport i import               | 8    | 2       |
| `ogledziny` | CDP i Playwright MCP, zrzuty, dwie sesje, `window.confirm`    | 0    | 114     |
| `testy`     | vitest, migotanie, `tsc --noEmit`, środowisko dev              | 0    | 147     |


## Notatki z dwóch ostatnich sesji

Starsze — w całości w `archiwum/dziennik-sesji.md`.

### Sesja 19.10, piąta (po `9dc6d84`) — zlecenie MG: pytanie przed przekroczeniem budżetu tury

**Zlecenie MG:** ostrzeżenie dla MG, który łatwo i przypadkiem przekracza budżet tury.
**Decyzja MG (pytanie na starcie):** pytanie przed wydatkiem, nie informacja po fakcie i nie sam
znak na slocie. **Zrobione:** `applySpend` rzuca `OverspendAsk` dla NPC-a MG, gdy wydatek się nie
mieści; rejestr zapamiętuje zdarzenie i wysyła `combat:overspend-ask`, a `combat:overspend` je
powtarza bez pytania (licznik i plakietka jak dawniej). Pytanie obejmuje każdą ścieżkę Tury (pasek
akcji, atak, przeładowanie, zwarcie, Sieć, marsz, skok). **Rozstrzygnięte bez pytań (do słowa MG):**
figura gracza w ręku MG i boty grające kontem MG — bez pytania; pytanie wygasa po 2 min, nowe
zastępuje stare; „Anuluj” nic nie wysyła. Umowa na górze `tura`.

**Weryfikacja:** `shared` 2515/2515, serwer 1525/1525 (`combat-actions`, `movement`, `grapple`
przepięte na potwierdzenie, `campaign-isolation` z nowym zdarzeniem), klient 416/416; `tsc` w trzech
pakietach, ESLint i Prettier czyste w zmienionych plikach. **Oględziny:** tymczasowy spec E2E
(usunięty) z `po-T6`, MG w **Firefoksie**: „Bieg” bez ruchu → pasek, „Anuluj” nic nie wydaje,
„Wykonaj” daje Bieg z +1; marsz 24 m przy 16 m → figura wraca, pasek „Za daleko o 8 m…”, „Wykonaj”
przenosi ją z +2 i plakietką na czacie. Nieużywany przez spec plik `grapple-turns.test.ts`
(nieśledzony, sprzed sesji) przechodzi i nie wszedł do commita.

### Sesja 19.10, czwarta (po `517b945`) — zlecenie MG: bariera i osłona w podglądzie strzału

**Zlecenie MG:** sprawdzić, jak system liczy trafienie i obrażenia celu za barierą i osłoną oraz
czy strzelający gdzieś się o tym dowiaduje. **Przegląd:** rachunek spójny — osłona (16c) odmawia
strzału z wyborem „Ostrzelaj osłonę” / „Strzelaj mimo osłony”, bez kary (RAW s. 179), i gracz widzi
ją już w dymku; bariera (42b/42c) odejmuje OB przed pancerzem i daje karę „zasłania figury”
(najgorsza z przeciętych), ale do tej sesji podgląd jej nie znał — kara wychodziła dopiero na karcie
wyniku, OB na karcie obrażeń. **Zrobione:** flaga `barrier` na odcinkach `blockers` gracza
(`WalkBlocker`, `walkBlockerOf`), `AttackPreview.barrier` w `attack-targeting.ts` — MG dostaje liczby
serwera (kara w modyfikatorze kubka, OB w tytule), gracz „OB i karę zna MG”; wiersz „Bariera”
w dymku celownika, „· przez barierę” w tytule kubka. **Decyzja MG:** karta ataku na czacie dalej
milczy o OB (decyzja 8 z 42b zostaje). Umowa na górze `atak`.

**Weryfikacja:** `shared` 2515/2515 (+3: flaga przez cięcie mgły, `walkBlockerOf`), serwer 1507/1507
(`walls.test.ts` przepięty na odcinki z flagą), klient 416/416; `tsc` w trzech pakietach, ESLint
i Prettier czyste w zmienionych plikach. **Oględziny:** tymczasowy spec E2E (usunięty) z `po-T5a` —
Ola w **Firefoksie**: Iskra → Wieżyczka przez wschodni odcinek bariery „Bariera · OB i karę zna
MG”, Iskra → Strażnik przez otwartą bramę bez wiersza; MG w Chromium tą samą linią „OB 20 · kara
−4”, kubek „… · PT 20 · przez barierę OB 20”, modyfikator 7.
