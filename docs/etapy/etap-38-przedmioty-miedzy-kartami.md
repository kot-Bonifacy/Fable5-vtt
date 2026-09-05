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

- [ ] `inventory:transfer` — jeden wiersz ekwipunku (`gear`, `weapon`, `armor`, amunicja)
      z karty na kartę, z ilością przy wierszach stosowalnych
- [ ] Wiersz czatu o przekazaniu u obu stron (rodzaj `inventory`, dopisany w dwóch czystych
      funkcjach `shared/src/chat.ts`)
- [ ] Lista łupu na `combatProfile` statysty (edytowalna z karty figury) i „Przeszukaj"
      w menu figury martwej albo nieprzytomnej
- [ ] `inventory:loot` — wzięcie pozycji z listy łupu na wskazaną kartę; pozycja znika ze zwłok
- [ ] Przy przekazywaniu broni jadą z nią magazynek i zamontowane dodatki (etap 31), a przy
      pancerzu — zużyte SP (etap 15)
- [ ] Uprawnienia: gracz oddaje ze swojej karty, MG przenosi w dowolną stronę; podrobione
      żądanie (cudza karta jako źródło) wraca odmową
- [ ] Testy: przeniesienie zachowuje stan wiersza (magazynek, dodatki, zużycie), pozycja nie
      duplikuje się przy dwóch żądaniach naraz, gracz nie zabierze nic z cudzej karty

## Poza zakresem

- **Kontenery na scenie** (skrzynka, bagażnik jako obiekt sceny z listą rzeczy) — osobna sesja,
  bo to nowy obiekt scenerii wraz z kartą i uprawnieniami
- **Udźwig i zajmowane miejsce** — podręcznik ich nie liczy, a VTT nie ma ich udawać
- **Handel między postaciami za pieniądze** — od tego jest `economy:transfer` obok
- **Automatyczne zdejmowanie z ciała po śmierci** — łup wybiera człowiek

## Kryteria ukończenia

- [ ] Gracz oddaje stimpak drugiemu graczowi; przedmiot znika z jednej karty, pojawia się na
      drugiej i obie strony widzą wiersz na czacie
- [ ] Broń przekazana z magazynkiem 12/30 i celownikiem trafia na drugą kartę z tym samym
      magazynkiem i tym samym celownikiem
- [ ] MG wpisuje statyście dwa przedmioty do łupu, a po jego śmierci gracz je zabiera
- [ ] Gracz próbujący zabrać przedmiot z karty innego gracza dostaje odmowę, a karta źródłowa
      nie zmienia się o nic
- [ ] Pancerz o zużytym SP przenosi swój stan, a nie wraca do wartości katalogowej

## Wskazówki techniczne

- **Wiersz ekwipunku jest już samowystarczalny** — `CpredGearRow` i krewni niosą własne
  `compendiumId`, stan i cenę (patrz komentarze w `systems/cpred/character.ts`), więc
  przeniesienie to przeniesienie obiektu, nie odtwarzanie go z katalogu.
- **Dwie karty zapisuje jedna transakcja.** `queueCharacterSave` po stronie klienta łata
  optymistycznie (pułapka z 14.08 o zgubionych edycjach) — przeniesienie musi być jednym
  zdarzeniem serwera, nie dwiema łatami z dwóch okien.
- **Statysta nie dostaje karty postaci.** Lista łupu idzie do `combatProfile` tą samą opaque-JSON
  umową, którą profil zawarł w 16b.
