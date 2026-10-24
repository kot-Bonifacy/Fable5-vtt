# Etap 60 — Czytelny czat: „to dotyczy mnie”, ikony rodzaju, kolor gracza

**Faza:** przed betą (zlecenie MG z 24.10 spoza planu) · **Wymaga etapów:** 55 · **Stan:** ⬜
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

- [ ] `involvement(message, userId, isGm): 'mine' | 'forMe' | 'awaitingMe' | null` w
      `packages/shared/src/chat.ts` (czysta funkcja — rdzeń, bez importów z `systems/cpred`),
      z testami vitest dla każdego rodzaju wiersza z `ChatKind` i dla MG.
- [ ] `FullMessageRow` / wiersze kart dostają klasę `chat-row--mine` / `--for-me` / `--awaiting-me`
      w jednym miejscu (opakowanie), nie w każdym z ~20 komponentów osobno.
- [ ] Styl w `styles/02-chat-dice.css` z tokenów motywu (`:root`, jasny i ciemny), bez stałych
      kolorów w komponentach; istniejące paski szeptu i rzutu do MG nie zderzają się z nowym paskiem
      (szept do mnie = pasek „do mnie”, fiolet zostaje na etykiecie).
- [ ] Piąty przycisk filtra **„Ja”** (`chatFilterStore`): włączony zwija w grupy wszystko, czego
      `involvement` zwraca `null`, tym samym mechanizmem co dziś; `isPending` dalej wygrywa.
      Zapamiętany lokalnie jak pozostałe kategorie.
- [ ] Umowa `czat` „Nowy rodzaj wiersza czatu ma PIĘĆ miejsc” → **sześć**: szóste to gałąź
      w `involvement`.
- [ ] Oględziny: MG w Chromium, gracz w Firefoksie (Playwright), drugi gracz w trzecim kontekście —
      rzuty, szept, obrażenia i wezwanie do Testu widziane z trzech stron.

## 60b — ikona rodzaju i grupowanie kolejnych wierszy

- [ ] Mała ikona na początku nagłówka każdej karty, ta sama co w pasku filtrów (`HudIcon`:
      `chat-bubble`, `d10`, `crossed-swords`, `notebook`), wybrana przez `chatCategoryOf(kind)` —
      jedno źródło prawdy z filtrem.
- [ ] Grupowanie: kolejne wiersze **tego samego autora i tej samej kategorii** w odstępie do 2 min
      tracą powtórzony nagłówek (nick, portret, godzina w dymku `title`). Karta rzutu, karta
      czekająca na decyzję i każdy wiersz `forMe` cudzego autora zawsze przerywają grupę.
- [ ] Grupowanie liczy się po filtrach (na `feed`), więc rozwinięcie ukrytej grupy go nie psuje.
- [ ] Oględziny jak w 60a; dodatkowo długa historia (doładowanie starszych wiadomości u góry nie
      rozrywa ani nie skleja grup błędnie).

## 60c — kolor gracza

- [ ] Kolumna `CampaignMember.color String?` (migracja Prismy). `null` = kolor z palety według
      kolejności dołączenia (`joinedAt`); MG ustawia go ręką w „Graczach” kampanii (`CampaignPlayers`).
- [ ] Paleta 8 kolorów w `packages/shared` (rdzeń), dobrana tak, by pary sąsiednie były
      rozróżnialne przy deuteranopii i protanopii i miały kontrast ≥ 3:1 z tłem czatu w obu
      motywach; MG ma kolor stały spoza palety (bursztyn akcentu).
- [ ] `ChatMessageView.authorColor?: string` — serwer wpisuje go przy budowie widoku (historia
      **i** dostarczenie), także dla wiadomości graczy nieobecnych. Linia NPC (`botId`) nie dostaje
      koloru u nikogo — jej znakiem zostaje portret; NPC w kolorze MG zlewałby się z wypowiedziami
      samego MG.
- [ ] Na karcie: cienki pasek autora po lewej (pod paskiem `mine`/`forMe`, nie zamiast niego) i
      kropka z inicjałem przy nicku.
- [ ] Kopie kampanii (57a): kolor jedzie w paczce ZIP i wraca przy wczytaniu; biała lista eksportu.
- [ ] Testy dymne: zmiana koloru przez MG, kolor w historii po restarcie serwera.
- [ ] Oględziny jak w 60a, plus podgląd palety w obu motywach.

Pomysły na później (do `POMYSLY.md`, nie do tego etapu): ten sam kolor na liście graczy, na
obwódce figury i przy pingu mapy.

## Kryteria ukończenia

- [ ] Gracz w Firefoksie, przy czacie z co najmniej 50 wierszami od trzech osób, wskazuje swoje
      rzuty i rzeczy skierowane do niego bez czytania nicków (oględziny MG).
- [ ] Filtr „Ja” zwija wszystko poza moimi wierszami i sprawami do mnie; nic czekającego na decyzję
      nie znika.
- [ ] Kolor gracza jest ten sam na każdym ekranie i przetrwa restart serwera oraz kopię kampanii.
- [ ] Testy `involvement` w `shared` przechodzą; `pnpm test:e2e --grep @szybkie` przechodzi.
- [ ] Umowa `czat` zaktualizowana (sześć miejsc nowego rodzaju wiersza, `authorColor`).

## Do potwierdzenia przez MG na starcie 60a

1. Czy MG ma mieć podświetlenie `mine`/`forMe` u siebie (propozycja: tak, w wersji opisanej wyżej),
   czy tylko gracze.
2. Czy kolor gracza ma być przypisany do **miejsca w kampanii** (propozycja: tak, `CampaignMember`),
   czy do postaci — gracz z dwiema postaciami miałby wtedy dwa kolory.
