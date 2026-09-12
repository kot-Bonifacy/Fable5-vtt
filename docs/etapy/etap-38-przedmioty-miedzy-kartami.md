> **ROZDZIELONY 05.09.2026 na 38a i 38b.** Odpowiedź MG na pytanie „gdzie mieszka łup statysty"
> brzmiała **„statysta dostaje pełną kartę postaci"** — czyli odwrotnie, niż proponuje ten opis
> i niż rozstrzygnął etap 16b. To jest refaktor na całą sesję, więc powstał
> `etap-38a-statysta-jako-karta.md` (**zrobiony 05.09**), a ten plik opisuje odtąd **38b**:
> przekazanie, łup i przeszukanie na jednym, już wspólnym modelu ekwipunku.
>
> **Trzy rozstrzygnięcia MG z 05.09 obowiązują 38b:**
>
> 1. **Przyjęcie wymaga potwierdzenia odbiorcy** — przekazanie trafia do odbiorcy jako oczekująca
>    propozycja (wzorem wezwania do Testu z etapu 32) i wchodzi na kartę dopiero po „Przyjmij".
> 2. **Cel musi być widoczny** — ten sam warunek, którym rozwiązano `Ustabilizowanie` w 14e.
> 3. **Łup statysty to jego ekwipunek**, bo statysta ma od 38a kartę. Punkt „lista łupu na
>    `combatProfile`" z zakresu niżej jest **nieaktualny** — kolumna nie istnieje.

# Etap 38 — Przedmioty między kartami: przekazanie, łup, przeszukanie

**Faza:** H — Świat CP RED · **Wymaga etapów:** 13 (kompendium), 23b (ekonomia),
16b (profil bojowy statysty)

> **Pochodzenie:** przegląd z 02.09.2026. Każdy VTT z ekwipunkiem umie przeciągnąć przedmiot
> z karty na kartę; tutaj `economy:transfer` przenosi **wyłącznie eurodolce**
> (`shared/src/protocol.ts:353` — `fromCharacterId`, `toCharacterId`, `amount`).

## Cel sesji

Drużyna po walce stoi nad ciałem z pistoletem maszynowym i dwoma magazynkami, a VTT nie ma na
to żadnej ścieżki: MG dopisuje przedmiot ręcznie na karcie jednego gracza i ręcznie kasuje
u drugiego (albo nigdzie, bo statysta nie ma karty i nosi tylko `combatProfile`). To samo przy
najzwyklejszym „daj mi ten stimpak".

Etap dokłada **ruch przedmiotu**: między dwiema kartami, z ciała do plecaka i z powrotem.

## Do rozstrzygnięcia z MG przed kodem

1. **Czy przyjęcie wymaga zgody?** Propozycja: gracz oddaje bez pytania (to jego rzecz),
   ale **wzięcie z cudzej karty** może wyłącznie MG. Inaczej pierwsza kłótnia przy stole
   rozgrywa się przez interfejs.
2. **Czy łup statysty to nowa lista, czy karta postaci?** Propozycja: lista łupu na
   `combatProfile` (JSON, jak reszta profilu) — statysta nadal nie jest osobą i nie dostaje
   karty tylko po to, żeby mieć kieszenie.
3. **Czy zasięg ma znaczenie?** Podręcznik przy przekazywaniu przedmiotu nie podaje zasięgu;
   `Ustabilizowanie` z 14e ma ten sam problem i rozwiązano go „cel musi być widoczny".

## Zakres

- [x] `inventory:give` — wiersze ekwipunku (`weapons`, `armor`, `gear`) z karty na kartę,
      z ilością przy wierszach stosowalnych; na kartę z właścicielem wchodzi jako **propozycja**
- [x] Wiersz czatu rodzaju `inventory` u obu stron — dopisany w **sześciu** miejscach
      (`ChatKind`, `ChatMessageView`, `chatCategoryOf`, `toChatMessageView`, `visibleTo`,
      `FullMessageRow` + `isPending`)
- [x] ~~Lista łupu na `combatProfile`~~ — **nieaktualne**: od 38a łupem jest ekwipunek karty
      figury. „Przeszukaj…" siedzi w menu figury u MG, a gracz dobiera źródło w oknie „Wymiana"
- [x] `inventory:take` — wzięcie pozycji z figury, która leży albo nie żyje; pozycja znika
      ze zwłok. Plus **„Zabierz wszystko"** i **gotówka z kieszeni** (przez `applyBalance` z 23b)
- [x] Przy przekazywaniu broni jadą z nią magazynek i zamontowane dodatki (etap 31), a przy
      pancerzu — zużyte SP (etap 15); pancerz przychodzi **zdjęty**
- [x] Uprawnienia: gracz oddaje ze swojej karty, MG przenosi w dowolną stronę; podrobione
      żądanie (cudza karta jako źródło) wraca odmową
- [x] Zasięg ramienia (`CPRED_MELEE_REACH_M`) mierzony **wszystkim, MG włącznie**
- [x] Testy: przeniesienie zachowuje stan wiersza (magazynek, dodatki, zużycie), propozycja
      zamyka się dokładnie raz, gracz nie zabierze nic z cudzej karty

## Poza zakresem

- **Kontenery na scenie** (skrzynka, bagażnik jako obiekt sceny z listą rzeczy) — osobna sesja,
  bo to nowy obiekt scenerii wraz z kartą i uprawnieniami
- **Udźwig i zajmowane miejsce** — podręcznik ich nie liczy, a VTT nie ma ich udawać
- **Handel między postaciami za pieniądze** — od tego jest `economy:transfer` obok
- **Automatyczne zdejmowanie z ciała po śmierci** — łup wybiera człowiek

## Kryteria ukończenia

- [x] Gracz oddaje stimpak drugiemu graczowi; przedmiot znika z jednej karty, pojawia się na
      drugiej i obie strony widzą wiersz na czacie
- [x] Broń przekazana z magazynkiem 12/30 i celownikiem trafia na drugą kartę z tym samym
      magazynkiem i tym samym celownikiem
- [x] MG wpisuje statyście dwa przedmioty na kartę, a po jego śmierci gracz je zabiera
- [x] Gracz próbujący zabrać przedmiot z karty innego gracza dostaje odmowę, a karta źródłowa
      nie zmienia się o nic
- [x] Pancerz o zużytym SP przenosi swój stan, a nie wraca do wartości katalogowej

## Wskazówki techniczne

- **Wiersz ekwipunku jest już samowystarczalny** — `CpredGearRow` i krewni niosą własne
  `compendiumId`, stan i cenę (patrz komentarze w `systems/cpred/character.ts`), więc
  przeniesienie to przeniesienie obiektu, nie odtwarzanie go z katalogu.
- **Dwie karty zapisuje jedna transakcja.** `queueCharacterSave` po stronie klienta łata
  optymistycznie (pułapka z 14.08 o zgubionych edycjach) — przeniesienie musi być jednym
  zdarzeniem serwera, nie dwiema łatami z dwóch okien.
- **Statysta nie dostaje karty postaci.** Lista łupu idzie do `combatProfile` tą samą opaque-JSON
  umową, którą profil zawarł w 16b.

## Jak wyszło (06.09.2026)

Zrobione w całości; testy 1913 / 1040 / 97 zielone. **Zasada, na której stoi cały etap, jest
zasługą 38a:** od tamtej sesji ganger ma prawdziwą kartę, więc „zdejmuję pistolet z ciała"
i „oddaję ci stimpak" to **jedna** operacja na dwóch `CpredCharacterData` — jedna czysta funkcja
(`cpredMoveItems`) i jedna ścieżka zapisu na serwerze. Gdyby łup mieszkał na żetonie, byłyby dwie.

**Czwarte rozstrzygnięcie MG, dołożone przed kodem 06.09: zasięg ramienia zamiast samej
widoczności.** Decyzja z 05.09 mówiła „cel musi być widoczny, wzorem `Ustabilizowania` z 14e" —
tylko że 14e dostało od tamtej pory **`CPRED_MELEE_REACH_M`**, więc dosłowne wykonanie tamtego
zdania rozjechałoby dwie czynności, które są tą samą czynnością (dotknięciem kogoś obok).
MG wybrał zasięg ramienia. **Mierzony wszystkim, MG włącznie** — ten sam wyjątek od „MG omija
blokady", co w 14e. Furtka jest jedna i świadoma: **gdy karty nie stoją na żadnej wspólnej
scenie, warunku nie ma** (przerwa między scenami, „daj mi to" w barze). Przy `inventory:take`
furtki nie ma — nie da się przeszukać ciała, przy którym się nie stoi.

**Z Item Piles (moduł Foundry, o którym wspomniał MG) weszły dwie rzeczy i obie były tanie:**
„Zabierz wszystko" (jeden guzik, bo `cpredAllItemRefs` już istniał na potrzeby podglądu)
i **gotówka w łupie** — ciało ma od 38a `eddies` na karcie, a `applyBalance` z 23b dowozi wpis
audytu po obu stronach, więc 350 ed z kieszeni gangera wygląda w historii tak samo, jak przelew.
**Skrzynia jako obiekt sceny została poza zakresem** (tak mówi opis etapu) — poszła do `POMYSLY.md`.

**Trzy rzeczy poza planem, wszystkie z tej samej rodziny „gdzie stoi prawda o stanie rzeczy":**

- **Pancerz przychodzi ZDJĘTY** (`equipped: false`). Podniesiona kurtka inaczej po cichu zmieniłaby
  OB odbiorcy w chwili podniesienia — a o tym, co się nosi, decyduje właściciel karty.
- **Wiersze wyposażenia z tej samej pozycji katalogu SKLEJAJĄ SIĘ** (`stacksWith`): warunkiem jest
  `compendiumId`, nie nazwa, bo dwa ręcznie wpisane „Notatnik" mogą być czymkolwiek. Bez sklejania
  trzy stimpaki z trzech ciał zjadłyby trzy z czterdziestu wierszy karty.
- **Id wiersza jest unikalne w obrębie KARTY, nie kampanii.** Kopia figury z etapu 35 dostaje kartę
  z przepisanym ekwipunkiem, więc dwie karty naprawdę potrafią nieść ten sam `rowId` — kolizję
  rozstrzyga nowe id (`landedRow`), nie nadpisanie cudzego wiersza.

**Jedna świadoma dziura, opisana w kodzie:** `ChatMessage` ma **jednego** adresata, więc gdy MG
przenosi między dwiema kartami **graczy**, wiersz historii zapisuje się u tego, kto dostaje;
drugi gracz widzi go na żywo i ma odświeżoną kartę, ale po przeładowaniu wiersza nie odzyska.
Dwa wiersze na jedno zdarzenie kłamałyby o tym, ile razy coś się stało — wybrane świadomie.

## Oględziny w przeglądarce (06.09.2026)

Dwie sesje naraz w jednym Chrome (MG na `localhost:5173`, gracz `Tester` na `[::1]:5173`), scena
**„Strzelnica"**, nośnikiem **Frank** (na czas oględzin właściciel `Tester`, figura postawiona
1 m od ciała) i **Rudy Kwiatkowski** jako ciało (0 PW, Zgrzyt 9 12/30, Kurtka Kevlarowa OB 7/11,
Stimpak ×2, 500 ed). Po wszystkim obie karty i figura **przywrócone ze snapshotu startowego**.

Odklikane:

- **Okno „Wymiana" z zakładki Ekwipunek** u MG (kotwica: karta Rudego) — lista „Skąd" z ośmioma
  figurami i **odległościami** („Frank — 1 m", „avatar9 — 64 m" z drugiej sceny), lista „Dokąd"
  z nazwami wszystkich kart.
- **MG → Frank (Zgrzyt 9)**: karta czatu „Przekazanie · Rudy Kwiatkowski → Frank" z guzikami
  u gracza, **nic się nie ruszyło** przed decyzją. Po „Przyjmij" u `Testera` — plakietka
  „PRZYJĘTE — TESTER", a broń **z magazynkiem 12/30** stanęła w pasku figury Franka.
- **Gracz przeszukuje ciało**: „Skąd" pokazuje mu **wyłącznie** „Rudy Kwiatkowski — 1 m"
  (bez stojącego obok „Wartownika" i bez kart graczy). **„Zabierz wszystko"** przeniosło pancerz,
  dwie fiolki i 500 ed jednym kliknięciem; ciało zostało z „Ta karta nie ma nic w ekwipunku",
  Frank z **620 ed**, **Stimpak ×5** (sklejone z jego trzema) i **pancerzem `equipped: false`**.
  W `LedgerEntry` dwa wiersze: „do: Frank" i „od: Rudy Kwiatkowski".
- **Karty czatu przeżyły przeładowanie** u gracza **i** u MG (grupa „Stół") — to była ta pozycja,
  na którą patrzyłem najuważniej, bo `visibleTo` jest białą listą rodzajów i zjadło już `time`
  i `recovery`.
- **Odmowa zasięgu**: przekazanie do „Tony" (20 m) → „Za daleko — przedmiot podaje się na
  wyciągnięcie ręki." Przekazanie do „Marcin" (bez figury na scenie) → przeszło jako propozycja.
- **Wycofanie**: karta wysłana przez `Testera` daje mu **wyłącznie** „Wycofaj" (nie „Przyjmij"),
  a po kliknięciu — „WYCOFANE — TESTER" i wyszarzenie.

Konsola czysta po obu stronach. **Nieoglądane: „🎒 Przeszukaj…" w menu figury** — prawym klikiem
z automatyki nadal nie da się otworzyć menu kanwy Pixi (ta sama przeszkoda, co w 38a). Pozycja
w `zaleglosci.md`; sama ścieżka jest tym samym komponentem, który przeszedł oględziny z karty.

**Dwie usterki znalezione i naprawione w trakcie oględzin:** odległość w liście źródeł liczyła się
od **pierwszej** figury karty na scenie, a serwer egzekwował od **najbliższej** (karta z dwiema
figurami pokazywała inną liczbę, niż stosowała); i komunikat „czeka na przyjęcie" padał także
wtedy, gdy nic nie czekało — stąd `InventoryGiveResult.pending` prosto z serwera.
