# Etap 60 — Czytelny czat: „to dotyczy mnie”, ikony rodzaju, kolor gracza

**Faza:** przed betą (zlecenie MG z 24.10 spoza planu) · **Wymaga etapów:** 55 · **Stan:** 🟨 (60a, 60b, 60c ✅ 24.10 — czeka na oględziny MG z pierwszego kryterium)
Trzy podetapy po jednej sesji: 60a → 60b → 60c (60b i 60c niezależne od siebie, oba po 60a).

## Skąd ten etap

MG (24.10): część graczy skarży się na mało przejrzysty czat. Przy dużej ilości treści gracz musi
czytać nicki, żeby znaleźć swoje rzuty, Testy i rozmowy. Cel: gracz **bez czytania** odnajduje
wzrokiem to, co go dotyczy.

Stan przed etapem (24.10):

- Karty czatu różnią się prawie wyłącznie treścią. Kolor niosą tylko: szept (`.chat-message--whisper`,
  pasek `--whisper`), rzut do MG (`.chat-roll--gm`, ten sam fiolet) i nick NPC
  (`.chat-message--npc`). Mój rzut i cudzy rzut wyglądają identycznie.
- Gracz nie ma żadnego koloru — `CampaignMember` nie ma takiej kolumny, a `ChatMessageView` zna
  tylko `authorId` i nazwy.
- Filtr ma cztery kategorie (`Rozmowy`, `Rzuty`, `Walka`, `Stół`) i zwija wiersze spoza filtra
  w klikalne grupy; wiersze czekające na decyzję (`isPending`) zostają zawsze na wierzchu.

## Zasady całego etapu

1. **Trzy warstwy, każda z jednym zadaniem:** „dotyczy mnie” (względne — inne na każdym ekranie),
   kolor gracza (tożsamość — wspólna dla stołu), ikona rodzaju (co to za wiersz — kształtem,
   nie kolorem).
2. **Najwyżej dwa sygnały kolorowe na karcie:** pasek autora i ewentualnie podświetlenie
   „moje / do mnie”. Barwy sukcesu, porażki i krytyka zostają wyłącznie na plakietkach wyniku.
3. **Kolor nigdy nie jest jedynym nośnikiem:** obok paska stoi znaczek („▶ Ty”), kropka z inicjałem
   albo ikona — czytelne także przy daltonizmie.
4. **Bez nowych ustawień dla gracza** (pamięć: minimum kontrolek). Jedyny nowy przełącznik to
   przycisk filtra „Ja” w istniejącym pasku filtrów.
5. **Nic nowego nie wychodzi z serwera do gracza poza kolorem autora.** „Dotyczy mnie” liczy klient
   z pól, które już dostaje, porównując je wyłącznie z własnym id.

## 60a — „to dotyczy mnie” i filtr „Ja”

Trzy stany wiersza względem patrzącego:

| stan            | kiedy                                                                                         | wygląd                                                                 |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `mine`          | jestem autorem (`authorId`) — moja wypowiedź, szept, rzut, akcja, przekazanie                 | delikatnie podświetlone tło karty + gruby pasek z lewej (akcent)       |
| `forMe`         | dotyczy mojej postaci albo mnie: szept do mnie (`recipientId`), obrażenia (`damage.targetOwnerId`), wezwanie do Testu (`check.ownerId`), przekazanie (`inventory.toOwnerId`), operacja (`surgery.patientOwnerId` / `surgeonOwnerId`), prywatny zastrzyk (`recipientId`), handout do mnie | pasek z lewej + znaczek „▶ Ty” w nagłówku                              |
| `awaitingMe`    | `forMe` i `isPending` — czeka na moje kliknięcie                                              | jak `forMe` + pulsująca obwódka (wyłączona przy `prefers-reduced-motion`) |

U MG: `mine` = linie MG **bez** `botId` (NPC-e to praca MG, nie „jego” wiersze — inaczej
podświetliłby się cały czat); `forMe` = szept do MG i sprawy czekające na MG (prośba o Test,
zgłoszona karta, propozycja bota).

- [x] `involvement(message, userId, isGm): 'mine' | 'forMe' | 'awaitingMe' | null` w
      `packages/shared/src/chat.ts` (czysta funkcja — rdzeń, bez importów z `systems/cpred`),
      z testami vitest dla każdego rodzaju wiersza z `ChatKind` i dla MG. *Zrobione jako
      `chatInvolvement(message, userId, isGm, tokenIds?)` — czwarty argument to figury gracza
      (strzał, starcie, unik); testy w `chat-involvement.test.ts`.*
- [x] `FullMessageRow` / wiersze kart dostają klasę `chat-row--mine` / `--for-me` / `--awaiting-me`
      w jednym miejscu (opakowanie), nie w każdym z ~20 komponentów osobno. *Opakowanie
      `.chat-row` w `FeedRow`; `awaitingMe` ma obie klasy `--for-me --awaiting-me`.*
- [x] Styl w `styles/02-chat-dice.css` z tokenów motywu (`:root`, jasny i ciemny), bez stałych
      kolorów w komponentach; istniejące paski szeptu i rzutu do MG nie zderzają się z nowym paskiem
      (szept do mnie = pasek „do mnie”, fiolet zostaje na etykiecie). *Tokeny `--self`,
      `--self-rgb`, `--self-ink` w `theme.css`.*
- [x] Piąty przycisk filtra **„Ja”** (`chatFilterStore`): włączony zwija w grupy wszystko, czego
      `involvement` zwraca `null`, tym samym mechanizmem co dziś; `isPending` dalej wygrywa.
      Zapamiętany lokalnie jak pozostałe kategorie. *Klucz `vtt.chat.mineOnly`.*
- [x] Umowa `czat` „Nowy rodzaj wiersza czatu ma PIĘĆ miejsc” → **sześć**: szóste to gałąź
      w `involvement`. *Po `isPending` (pułapka z 38b) wyszło **siedem** — umowa i pułapka
      poprawione.*
- [x] Oględziny: MG w Chromium, gracz w Firefoksie (Playwright), drugi gracz w trzecim kontekście —
      rzuty, szept, obrażenia i wezwanie do Testu widziane z trzech stron.

**Rozstrzygnięcia 60a (24.10, bez pytań — do potwierdzenia przez MG przy oględzinach):**

- **„Moje” u MG to tylko to, co MG pisze sam:** `say`, `whisper`, `roll`/`gmroll` **bez**
  `roll.actor`, `check`, `handout`, `journal`, `rolltable`/`gmrolltable` — i nigdy z `botId`.
  Rzut z karty NPC-a i karty wystawiane przez serwer kontem MG (zegar, strefy, obrażenia, Sieć,
  akcje) nie są „jego” — inaczej u MG świeciłby się cały czat.
- **Figury liczą się u gracza, nie u MG.** Strzał w moją figurę, granat, który mnie objął, ogień
  zaporowy z moim Testem, obrona w starciu przeciwstawnym i przegrana Konfrontacja są „do mnie”;
  czekający Unik, „Broń się” i wybór po Konfrontacji — „czeka na mnie”. U MG figury to NPC-e,
  więc strzał w NPC-a nie jest sprawą „do MG”.
- **„Czeka na mnie” wygrywa z filtrem kategorii tak jak `isPending`** — Unik schowany pod
  zgaszonymi „Rzutami” zawisłby tak samo jak wezwanie.
- **Notatka lokalna przechodzi przez „Ja”** (powstała tylko na tym ekranie, więc jest „do mnie”),
  ale nie dostaje paska.
- **Kolejność przy remisie:** „czeka na mnie” > „moje” > „do mnie” — pacjent jest autorem prośby
  o operację, a wycena wraca do niego; trafienie własnym granatem to nadal mój rzut.
- **Wygląd:** pasek i podkład bez odcienia (jasny tusz w nocy, czarny w dzień), bo barwy niosą już
  szept, NPC, rzut do MG i wynik, a od 60c — kolor autora. Obwódka „czeka” pulsuje bursztynem
  przypomnienia tury (`--remind-rgb`), przy `prefers-reduced-motion` stoi.
- **Bez znaku zostają** karty bez pola właściciela: dzień odpoczynku (`recovery`, tylko nazwa
  postaci) i łup z mojego ciała (`inventory` nie zna właściciela źródła).

## 60b — ikona rodzaju i grupowanie kolejnych wierszy

- [x] Mała ikona na początku nagłówka każdej karty, ta sama co w pasku filtrów (`HudIcon`:
      `chat-bubble`, `d10`, `crossed-swords`, `notebook`), wybrana przez `chatCategoryOf(kind)` —
      jedno źródło prawdy z filtrem. *`FeedRow` podaje plik z `CATEGORY_BUTTONS` zmienną
      `--chat-kind-icon`, a rysuje ją `::after` nagłówka (`order: -1`, przed „▶ Ty”).*
- [x] Grupowanie: kolejne wiersze **tego samego autora i tej samej kategorii** w odstępie do 2 min
      tracą powtórzony nagłówek (nick, portret, godzina w dymku `title`). Karta rzutu, karta
      czekająca na decyzję i każdy wiersz `forMe` cudzego autora zawsze przerywają grupę.
      *`chatContinuations` / `chatHeaderKey` w `client/src/chat-grouping.ts` (+ testy); „ten sam
      autor” to tożsamość nagłówka — niżej.*
- [x] Grupowanie liczy się po filtrach (na `feed`), więc rozwinięcie ukrytej grupy go nie psuje.
      *Separator przerywa grupę, a rozwinięta grupa skleja się sama w sobie.*
- [x] Oględziny jak w 60a; dodatkowo długa historia (doładowanie starszych wiadomości u góry nie
      rozrywa ani nie skleja grup błędnie). *Ola w Firefoksie: 174 wiersze w czterech stronach,
      doklejone z pierwszej strony zostają, dwa przybywają w starszej historii, powtórka od zera
      daje ten sam zestaw.*

**Rozstrzygnięcia 60b (24.10, bez pytań — do potwierdzenia przez MG przy oględzinach):**

- **„Ten sam autor” to ten sam nagłówek, nie ten sam `authorId`.** Serwer wystawia kontem MG
  obrażenia, akcje, zegar i strefy, a nagłówek tych kart mówi co innego niż autor (cel z miejscem
  trafienia, tytuł handoutu, nazwa tabeli). Sklejają się więc tylko rodzaje z białej listy
  `chatHeaderKey`: wypowiedź i szept (konto + podpis + NPC + adresat — `/jako` za dwóch NPC-ów
  albo gracz z dwiema postaciami to dwa nagłówki), akcja tury (działający), odpoczynek i zastrzyk
  (czyje ciało) i zegar świata. Reszta — obrażenia, handouty, dziennik, wezwania, prośby,
  przekazania, oględziny, operacje, zgłoszone karty, losowania i rzuty — zawsze z nagłówkiem.
  Nowy rodzaj bez wpisu zostaje przy pełnym nagłówku, więc to **nie jest** ósme obowiązkowe
  miejsce z umowy `czat`.
- **Rodzaj w kluczu:** wypowiedź po szepcie (i szept po wypowiedzi) dostaje nagłówek z etykietą
  „szept do: …”, choć rubryka filtra ta sama.
- **Okno 2 min liczy się od poprzedniej karty grupy, nie od pierwszej** — ciąg rozmowy co minutę
  zostaje jedną grupą.
- **Karta przerywająca stoi osobno po obu stronach** — rzut, sprawa czekająca na kogokolwiek
  (`isPending`) i wiersz „do mnie” / „czeka na mnie” ani się nie doklejają, ani nic nie dokleja
  się do nich. Notatka lokalna też przerywa.
- **Wygląd:** doklejona karta traci nagłówek i szczelinę feedu (`margin-top: -0.5rem`), więc
  paski „moje” kolejnych kart zlewają się w jeden; godzina w dymku całej karty. Ikona — maska
  0,8 rem w kolorze `--text-dim`.

## 60c — kolor gracza

- [x] Kolumna `CampaignMember.color String?` (migracja Prismy). `null` = kolor z palety według
      kolejności dołączenia (`joinedAt`); MG ustawia go ręką w „Graczach” kampanii (`CampaignPlayers`).
      *Migracja `20261024190000_player_color`; trasa `POST /api/campaigns/:id/players/:userId/color`
      (`registerPlayerColorRoute`), w „Graczach” kropka z inicjałem i lista „z kolejności (…)” + 8 nazw.*
- [x] Paleta 8 kolorów w `packages/shared` (rdzeń), dobrana tak, by pary sąsiednie były
      rozróżnialne przy deuteranopii i protanopii i miały kontrast ≥ 3:1 z tłem czatu w obu
      motywach; MG ma kolor stały spoza palety (bursztyn akcentu). *`shared/player-colors.ts` niesie
      **nazwy** (`PLAYER_COLORS`), barwy — `--player-*` w `theme.css`, osobno noc i dzień;
      pilnuje `client/src/player-palette.test.ts` (kontrast ≥ 3:1, ΔE76 sąsiadów ≥ 15 po symulacji
      Machado, także ósmy z pierwszym). Najniższy kontrast: 4,1:1 (limonka w dzień).*
- [x] `ChatMessageView.authorColor?: string` — serwer wpisuje go przy budowie widoku (historia
      **i** dostarczenie), także dla wiadomości graczy nieobecnych. Linia NPC (`botId`) nie dostaje
      koloru u nikogo — jej znakiem zostaje portret; NPC w kolorze MG zlewałby się z wypowiedziami
      samego MG. *`toChatMessageView` + `chatAuthorColor` (`shared/chat.ts`); członkowie kampanii
      jadą w `INCLUDE_CHAT_NAMES`, więc wszystkie 61 miejsc budowy widoku dostały kolor same.*
- [x] Na karcie: cienki pasek autora po lewej (pod paskiem `mine`/`forMe`, nie zamiast niego) i
      kropka z inicjałem przy nicku. *Zmienione po uwadze MG (24.10, „trzy poziomy pasków w jednym
      wierszu to za dużo”): przy krawędzi wiersza **jeden** pasek — biały „moje / do mnie” albo
      kolor autora. **Kropki z inicjałem nie ma** (MG 24.10, po oddaniu 60c: imię gracza nadał MG
      do rozpoznawania graczy, w rozgrywce ma go nie być) — obok paska stoi nick postaci.*
- [x] Kopie kampanii (57a): kolor jedzie w paczce ZIP i wraca przy wczytaniu; biała lista eksportu.
      *Jedzie w `members` eksportu. Wczytanie jako nowa kampania członków nie przenosi (57a: to cudze
      konta), więc „wraca” dotyczy cofnięcia (57b) — członkowie z kolorem zostają nietknięci.*
- [x] Testy dymne: zmiana koloru przez MG, kolor w historii po restarcie serwera.
      *`player-color.test.ts` (5) + wiersz w macierzy izolacji kampanii.*
- [x] Oględziny jak w 60a, plus podgląd palety w obu motywach.

Pomysły na później — w `POMYSLY.md` (24.10).

**Rozstrzygnięcia 60c (24.10, bez pytań — do potwierdzenia przez MG przy oględzinach):**

- **Jeden pasek przy krawędzi wiersza (uwaga MG w trakcie etapu):** wiersz „moje / do mnie” ma
  biały pasek z 60a, każdy inny wiersz z kolorem — pasek autora (3 px). Szept w kolorze autora
  traci własną fioletową kreskę. **Wewnętrzne kolorowe krawędzie kart zdjęte** (MG 24.10:
  „wewnętrzny czerwony pasek też już chyba nie będzie potrzebny”, „2 paski to po prostu za
  dużo”): rzut, eurodolce, propozycja bota, akcja, obrażenia, odpoczynek, zegar, losowanie,
  wezwanie, prośba o Test, przekazanie, operacja, zgłoszona karta, handout. Stany niesione
  dotąd kolorem krawędzi mają napis albo przygaszenie (`--cancelled`, `--closed`, `--refused`).
  Wiersz ma więc **najwyżej jeden** pasek; fioletowa kreska szeptu zostaje tylko w wierszu bez
  innego paska.
- **Paleta to nazwy, barwy daje motyw.** Jeden odcień nie trzyma 3:1 jednocześnie z czarnym
  kartonem i pożółkłym papierem, więc noc ma jasne odcienie, dzień ściemnione. Nazwy po polsku
  w „Graczach”: błękit, cynober, morska zieleń, róż, cytryna, lawenda, limonka, chaber.
- **Kolor MG** to bursztyn `--warn`, i to **tylko na tym, co MG pisze sam** (granica „moje u MG”
  z 60a). Karty serwera wystawione kontem MG i rzuty z kart NPC-ów są bez koloru — inaczej pół
  czatu miałoby pasek MG. Przy deuteranopii bursztyn zbliża się do cynobru, cytryny i limonki —
  wymóg dotyczy sąsiadów palety, a MG odróżnia nick „MG” w nagłówku.
- **Wybór MG nikogo nie przesuwa:** gracz bez wyboru bierze kolor z pozycji w kolejności
  dołączenia, więc dwóch graczy może mieć ten sam kolor, gdy MG tak wybierze — widać to w „Graczach”.
  Usunięcie gracza z kampanii przesuwa pozycje późniejszych (rzadkie; karty na ekranach poprawi
  przeładowanie).
- ~~Inicjał na kropce to gracz, nie postać~~ — **wycofane przez MG 24.10**: imiona graczy służą
  tylko MG, w rozgrywce się nie pojawiają. Kropka zniknęła z czatu, a imię gracza — z górnego
  paska u gracza (login MG u MG zostaje). Kropka z inicjałem została tylko w „Graczach” MG.
- **`chat:recolor`** (`{ userId, color }`, bez `seq`) do stołu i poczekalni — klient przemalowuje
  w miejscu karty tego autora, które już niosą kolor gracza.

## Kryteria ukończenia

- [ ] Gracz w Firefoksie, przy czacie z co najmniej 50 wierszami od trzech osób, wskazuje swoje
      rzuty i rzeczy skierowane do niego bez czytania nicków (oględziny MG).
- [x] Filtr „Ja” zwija wszystko poza moimi wierszami i sprawami do mnie; nic czekającego na decyzję
      nie znika.
- [x] Kolor gracza jest ten sam na każdym ekranie i przetrwa restart serwera oraz kopię kampanii.
- [x] Testy `involvement` w `shared` przechodzą; `pnpm test:e2e --grep @szybkie` przechodzi.
      *24.10: `shared` 2728/2728 (z `chat-involvement.test.ts`); `@szybkie` 67/68 — znany T9a „konsola”
      (zerwane gniazdo Firefoksa), powtórka `t9a-konta` 7/7.*
- [x] Umowa `czat` zaktualizowana (sześć miejsc nowego rodzaju wiersza, `authorColor`).

## Potwierdzone przez MG na starcie 60a (24.10)

1. **MG ma podświetlenie u siebie** — „podświetlenie ma działać też u MG”, w wersji opisanej wyżej.
2. **Kolor należy do gracza, nie do postaci** — `CampaignMember` (60c); gracz z dwiema postaciami
   ma jeden kolor.
