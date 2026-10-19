# Etap 56 — Walka z zauważenia wroga wzorem Foundry VTT

**Faza:** przed betą (zlecenie MG z 19.10 spoza planu) · **Wymaga etapów:** 14 (inicjatywa),
18 (widzenie), 45 („Ruch graczy”, oczy drużyny), 50a (starcie „Przed walką”), 52 (marsz po
trasie serwera), 55 (komunikaty)

## Skąd ten etap

MG (19.10): „stwórz mechanikę automatycznego przechodzenia drużyny graczy z trybu eksploracji
na tryb turowy w sytuacji, gdy któryś z graczy zobaczy token oznaczony przez MG jako wrogi;
u MG powinna się wtedy pojawić zakładka walka albo inny element, który umożliwia mu wskazanie
tokenów biorących w danej chwili udział w walce, ale też dołączanie kolejnych tokenów później.
Wzoruj się na Foundry VTT”.

Przed etapem: starcie zakładał wyłącznie MG („⚔ Do starcia”, „Załóż starcie” — 50a), figura
nie miała postawy, a NPC dołożony w trakcie walki stał na dole kolejki bez inicjatywy.

## Decyzje MG z 19.10 (pytania na starcie)

1. **Postawa wzorem Foundry (Disposition):** Przyjazna / Neutralna / Wroga na figurze. Nowa
   figura NPC-a jest **Neutralna** — walkę wyzwala tylko to, co MG świadomie oznaczy.
2. **Wyzwalacz:** serwer sam zakłada starcie „Przed walką” (runda 0) z drużyną i zauważonymi
   wrogami, a gracze tracą ruch. MG dobiera / odznacza figury i klika „⚔ Rozpocznij walkę”
   albo „Odwołaj” (skradanie, rozmowa) — wtedy drużyna wraca do Eksploracji.
3. **Marsz:** figura staje od razu na polu, z którego zobaczyła wroga (reszta trasy przepada),
   marsze kolegów też stają; ruch wraca w turach albo po „Odwołaj”.
4. **Wróg zauważony w trwającej walce** dołącza sam z inicjatywą rzuconą przez serwer (gra w tej
   Rundzie, jeśli jego miejsce jeszcze nie minęło); MG dostaje informację. To samo przy ręcznym
   dołożeniu NPC-a w trakcie walki.
5. **Panel MG:** bursztynowy pasek nad mapą („Vex widzi wroga: Bandzior, Zbir” z „⚔ Rozpocznij
   walkę” i „Odwołaj”), a prawy panel sam przeskakuje na „Walka”: uczestnicy z „✕”, pod nimi
   „Dołącz do walki” — wrogie na górze, pola wyboru i „Dodaj zaznaczone”.
6. **Kto widzi:** to, co ma na ekranie którykolwiek gracz (mgła, ściany, światło, zasłony, oczy
   drużyny) — liczone dla właścicieli figur na scenie, także niepodłączonych.
7. **Bez pętli:** wrogowie widziani w chwili „Odwołaj” / końca walki (i usunięci przez MG ze
   starcia) są uspokojeni, dopóki nie znikną drużynie z oczu. MG zawsze założy starcie ręcznie.
8. **Postawę widzi tylko MG** — gracze nie dostają jej z serwera.

## Zakres

- [x] Kolumna `Token.disposition` (null — samo: figura gracza Przyjazna, NPC Neutralny),
      `Combat.sighting` (kto zobaczył kogo; zamraża drużynę w rundzie 0)
- [x] Postawa w menu figury, w pasku grupy i znaczek u MG na mapie
- [x] Serwer: wykrycie zauważenia po każdej zmianie tego, co widzą gracze (klatka marszu,
      ruch MG, mgła, ściany, światła, zmiana figury), tylko w trwającej sesji na aktywnej scenie
- [x] Zatrzymanie marszów drużyny na polu zauważenia (`token:halt`), odmowa ruchu w rundzie 0
      starcia z zauważenia (`COMBAT_PENDING`: marsz, trasa, skok)
- [x] Dołączanie w trwającej walce z inicjatywą od serwera (`combat:joined` dla MG), także przy
      ręcznym „Dodaj” NPC-a
- [x] Uspokojenie przy „Odwołaj” / końcu walki / usunięciu ze starcia
- [x] Klient MG: pasek wezwania, przełączenie na „Walka”, „Dołącz do walki” z postawą i wyborem
- [x] Testy serwera, oględziny w Firefoksie

**Odstępstwa 56 (19.10):** postawę widzi MG w trzech miejscach naraz — przyciski w menu figury
(na całą zaznaczoną grupę, jak „Do starcia”), lista w pasku grupy i pole w oknie edycji — a na mapie
jako kolor obwódki NPC-a (Wroga czerwona jak dotąd, Neutralna szaroniebieska, Przyjazna morska;
gracze widzą każdego NPC-a na czerwono). Starcie zakłada się tylko w trwającej sesji. Gdy wroga
zobaczą w rundzie 0 starcia założonego ręką MG, gracze też stają. Zatrzymany marsz nie płaci
puli Eksploracji. Pamięć „uspokojonych” wrogów żyje w procesie serwera. Z dwóch klatek marszu,
które przyszły naraz, zatrzymanie bierze tę, która pierwsza weszła do sprawdzenia (najwyżej
jedno pole różnicy). **Poza planem, z oględzin:** zatrzymanie idzie do stołu jako lądowanie
(`emitTokenMoveFrame`) — upsert nie przesuwał figury w marszu u gracza; idący staje na polu,
z którego wroga naprawdę widać (przyciągnięte pole klatki albo następne pole trasy) — przyciągnięcie
o pół pola wstecz chowało wroga za róg, „Odwołaj” go nie uspokajał i pierwszy krok zakładał starcie
od nowa.
