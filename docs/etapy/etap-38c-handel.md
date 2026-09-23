# Etap 38c — Handel między figurami: pola wymiany i dwie zgody

**Faza:** H — Świat CP RED · **Wymaga etapów:** 38b (przedmioty między kartami), 23b (ekonomia)

> **Pochodzenie:** zlecenie MG z 23.09.2026 poza etapem 28: „mechanika wymiany przedmiotów
> i pieniędzy między tokenami, która umożliwi handel przez umieszczanie (przeciągnięcie) w polach
> wymiany widocznych dla stron; po umieszczeniu rzeczy przez obie strony i zatwierdzeniu przez obie
> strony — wymiana". 38b umiało wyłącznie „daję ci" z przyjęciem po drugiej stronie.

## Rozstrzygnięcia MG (23.09.2026, przed kodem)

1. **Strony:** gracz ↔ gracz **i** gracz ↔ NPC. Stronę NPC-a prowadzi MG; stronę gracza wyłącznie
   gracz.
2. **Zasięg:** na wyciągnięcie ręki (`CPRED_MELEE_REACH_M`, jak w 38b). Karty bez wspólnej sceny —
   bez warunku. Mierzony przy zaproszeniu, jego przyjęciu i wykonaniu.
3. **Czat w oknie handlu: nie.** MG zrezygnował z niego po namyśle („funkcjonalność niepotrzebna") —
   strony dogadują się zwykłym czatem albo szeptem.
4. **MG:** podgląd każdego handlu i jego przerwanie, bez zgody za gracza.
5. **Start:** zaproszenie + zgoda drugiej strony; okno otwiera się obu dopiero po „Przyjmij".
6. **Zmiana oferty kasuje OBIE zgody** (jak Item Piles w Foundry).

## Zakres

- [x] `cpredSwapItems` (shared) — obie strony najpierw zdejmują, potem obie kładą; limit wierszy
      liczony na stanie końcowym, stos nie połyka sztuk, które właśnie przyszły
- [x] `cpredOfferViews` — oferta sprawdzona z kartą, zawsze z jawną ilością
- [x] `shared/src/trade.ts` — stan handlu: operator strony, wersja, zgody, widok per widz (gracz
      nie dostaje `characterId` karty NPC-a)
- [x] Zdarzenia `trade:partners`, `trade:invite`, `trade:respond`, `trade:offer`, `trade:accept`,
      `trade:cancel`, `trade:list`; rozgłoszenie `trade:update` przycięte per widz
- [x] Wykonanie w **jednej transakcji** (dwie karty + wpisy historii eurodolców), ponowne sprawdzenie
      ofert z bazą (`OFFER_STALE`), zasięgu i właścicieli
- [x] Karta czatu `inventory` rodzaju `trade` — „A daje: …", „B daje: …", przeżywa przeładowanie
- [x] Okno handlu: ekwipunek + dwa pola, przeciąganie na zdarzeniach wskaźnika (działa na dotyku),
      strzałki jako wejście z klawiatury, pole ilości i gotówki, „Zgadzam się", „Przerwij handel"
- [x] Dok w rogu mapy: zaproszenie (dźwięk „przedmiot do przyjęcia"), zwinięte handle, ślad
      po zakończonym; u MG wszystkie handle z „Podgląd" i „Przerwij"
- [x] Wejścia: „🤝 Handluj…" w menu cudzej figury (gracz), „🤝 Handluj jako NPC…" (MG), „Handel…"
      na zakładce ekwipunku karty
- [x] Testy: shared (swap, oferta, stan handlu), serwer (dymny na gniazdach), klient (magazyn)

## Poza zakresem

- **Czat w oknie handlu** — decyzja MG (rozstrzygnięcie 3)
- **Handel bota LLM** (NPC sam wycenia i się zgadza) — `POMYSLY.md`
- **Kontenery na scenie** — nadal `POMYSLY.md` z 38b

## Kryteria ukończenia

- [x] Gracz przeciąga przedmiot do swojego pola, druga strona widzi go w swoim oknie
- [x] Zmiana w dowolnym polu zdejmuje obie zgody; zgoda na starszą wersję przepada
- [x] Dwie zgody wymieniają rzeczy i gotówkę naraz; wpis w historii eurodolców i karta czatu u obu
- [x] MG prowadzi stronę NPC-a, nie zatwierdzi za gracza, przerwie każdy handel
- [x] Handel przeżywa przeładowanie strony (wraca do doku)

## Jak wyszło (23.09.2026)

Zrobione w całości; testy 2202 / 1219 / 279 zielone. **Stan negocjacji mieszka w pamięci serwera,
nie w bazie** — dopóki obie strony się nie zgodzą, nic się w świecie nie wydarzyło; restart
serwera zamyka otwarte handle (dok je gubi po `trade:list`). Faktem jest dopiero wykonana wymiana.

**Rzecz, która zmieniła stan między zgodą a wykonaniem, nie jedzie** — zużyty stimpak, wystrzelany
magazynek: `OFFER_STALE` zdejmuje zgody zamiast wysłać przedmiot w stanie, na który druga strona
się nie godziła. Okno ostrzega o tym wcześniej, licząc to samo `cpredOfferViews` na karcie klienta.

**Dwie rzeczy znalezione po drodze:**

- **Błąd z 38b:** „Gotówka →" w oknie „Wymiana" nie działało — serwer odrzucał pustą listę rzeczy
  (`NO_ITEMS`). Naprawione i pokryte testem (na starym kodzie test pada).
- **Karta przekazania zapisuje się w historii także u właściciela karty źródłowej**, gdy odbiorca
  nie ma adresu (np. MG z karty gracza na kartę NPC-a) — `postInventoryCard` dostał `fromOwnerId`.

**Oględziny w Chrome (23.09)** na kampanii „Oględziny 12.09”, gracz `Tester` („Oględziny Stym”)
↔ nowy NPC „Paser Oględzin”; aktywna kampania wróciła potem na „Test2”. Odklikane: menu figury
gracza, zaproszenie w doku MG, okno u obu, **przeciąganie myszą** (po poprawce — pierwsza wersja
gubiła szybkie puszczenie, pułapka w `ui`), ilość i gotówka wpisane z klawiatury, zdjęcie zgody
gracza przez zmianę pola MG, wykonanie, karta czatu, przeładowanie w trakcie handlu, lista partnerów
MG i odrzucenie zaproszenia. Konsola czysta. **Nieobejrzane:** dotyk (iPad) i handel dwóch graczy
w przeglądarce (pokryty testem serwera — na poligonie jest jedno konto gracza).
