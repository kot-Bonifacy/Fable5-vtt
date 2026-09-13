# Etap 42b — Bariera: SP dla strzałów i wybuchów

**Faza:** D — Walka · **Wymaga etapów:** 42a, 15 (obrażenia i pancerz), 16b (linia strzału),
16d (obszary)

> **Pochodzenie:** zlecenie MG z 13.09.2026 (patrz 42a) — bariera „blokuje częściowo (na różnych
> poziomach pancerza) strzały".

## Cel sesji

Bariera z 42a przepuszcza kule bez zmian. Ten etap daje jej **SP**: strzał i wybuch przez barierę
tracą obrażenia, zanim dotrą do pancerza celu.

## Zasada domowa — świadome odstępstwo od podręcznika

Podręcznik nie zna częściowej osłony („Nie ma czegoś takiego jak »częściowa« osłona", s. 179),
a osłona ma PW, nie SP (etap 16c). SP bariery to **decyzja MG z 13.09.2026** — wpis stoi
w `decyzje-i-uproszczenia.md`, żeby nikt nie „naprawiał" jej jako błędu mechaniki.

## Decyzje MG (13.09.2026)

1. **Dwie warstwy:** obrażenia minus SP bariery, reszta w pancerz celu i PW jak dotąd.
   Przykład: 20 obrażeń, siatka SP 7, kurtka SP 11 → 20 − 7 = 13 → 13 − 11 = 2 PW.
2. **SP bariery się nie zużywa.** Pancerz celu zużywa się jak dotąd — gdy obrażenia przebiły *jego*.
3. **Sama liczba SP** — pole na pasku rysowania i na karcie segmentu; 0 = strzały przechodzą bez
   zmian (zachowanie z 42a).
4. **Wybuch za barierą odejmuje SP jak strzał** — linia od środka obszaru do figury.
5. Przyjęte bez osobnego pytania: brak zwolnienia „przy barierze" (strzelający tuż przy siatce też
   strzela przez nią); dwie bariery na linii — każda odejmuje swoje SP; premia +5 rany krytycznej
   przechodzi jak przy pancerzu; rzucony nóż jest atakiem dystansowym.

**Dopytane w trakcie sesji (13.09.2026):**

6. **„Zastosuj" przestawione na inną figurę niż cel ataku przelicza linię na żywo** — od miejsca,
   w którym strzelec stoi *teraz* (przy wybuchu: od krateru). Cel nazwany przez atak dostaje SP
   zmierzone w chwili strzału.
7. **Pasek pamięta ostatnio wpisane SP** do przeładowania strony; start 0.
8. **Karta ataku nic nie mówi o barierze** — SP pokazuje dopiero karta obrażeń.
9. **Seria odejmuje SP bariery raz**, od całej sumy (2k6 × mnożnik), tak jak pancerz celu.

## Zakres

- [x] Kolumna `Wall.armor` (liczba nieprzezroczysta dla rdzenia; CP RED czyta ją jako SP),
      migracja `20260913190000_stage42b_wall_armor`, eksport/import (`archive.ts`)
- [x] Rdzeń: `barrierArmorAlong` — suma pancerza barier przeciętych odcinkiem (zamknięta brama tak,
      otwarta nie; ściana, drzwi i okno nigdy); `sanitizeWallArmor`, `WALL_ARMOR_MAX`
- [x] `CpredAttackMeta.barrierSp` liczone **na serwerze** przy ataku (`CpredAttackContext.barrierSp`),
      nigdy z żądania → `CpredRollRequest` → `RollDamageMeta.system` → `SheetDamageRequest` →
      `resolveCpredDamage` (nowe wejście `barrierSp`, pierwsza warstwa)
- [x] Obszar (granat, śrut): SP per figura i per osłona (`RollAreaTarget.barrierArmor`)
- [x] Osłona trafiona przez barierę — strzałem i wybuchem (`applyDamageToCover`)
- [x] ~~Podgląd obrażeń u klienta liczy tą samą funkcją~~ — w UI nie ma podglądu obrażeń
      (odstępstwo niżej); wiersz karty obrażeń „− bariera OB n" i nagłówek „Bariera zatrzymała cios"
- [x] Pole SP na pasku (nowa bariera i brama) i na karcie segmentu
- [x] Wpis w `decyzje-i-uproszczenia.md`
- [x] Testy: `shared/walls-armor.test.ts` (12), `damage.test.ts` (9: dwie warstwy, zużycie tylko
      pancerza celu, krytyk, głowa, połowa pancerza, `ignoreArmor`), planer ataku (3), serwer —
      `barrier-armor.test.ts` (8: strzał, przestawione „Zastosuj", samochód, seria, dwie bariery,
      SP 0, otwarta brama, granat z samochodem), `walls.test.ts` (OB bramy nie trafia do gracza),
      `archive.test.ts` (OB przeżywa eksport i import)

## Kryteria ukończenia

1. Strzał za 20 przez barierę SP 7 w cel z kurtką SP 11 zabiera 2 PW i zużywa kurtkę do 10;
   bariera zostaje przy 7. ✅ silnik (przykład dosłownie) i serwer (2k6 + 18 przez obie warstwy)
2. Granat za barierą SP 5 zabiera figurze za nią o 5 PW mniej niż figurze przed nią. ✅
3. Bariera SP 0 i otwarta brama nie zmieniają obrażeń. ✅
4. Karta czatu mówi, ile SP bariery odjęto. ✅ `DamageLogEntry.barrierSp` → „rzut 20 − bariera OB 7
   − OB 11"; rysunek karty — oględziny w przeglądarce

## Odstępstwa od planu

**Podglądu obrażeń u klienta nie ma i nie było.** Punkt planu stał na komentarzu nagłówka
`shared/systems/cpred/damage.ts` („ta sama funkcja liczy podgląd u klienta"), a klient nigdzie
`resolveCpredDamage` nie woła. Komentarz poprawiony; nic do zrobienia po stronie klienta poza kartą.

**„Zastosuj" przestawione na inną figurę mierzy linię na żywo** (decyzja 6). Karta rzutu obrażeń
niesie `barrierFrom`: przy wybuchu punkt krateru (ze sceną), przy strzale i stożku — **żeton**
strzelca, bo liczy się jego obecne miejsce. Strzelec zdjęty z mapy albo stojący na innej scenie nie
daje linii i nie daje bariery. Kolejność zaufania siedzi w jednej funkcji, `barrierSpOfHit`.

**Obrażenia, których pancerz nie zatrzymuje (`ignoreArmor`), nie tracą też nic na barierze**
— przyjęte bez pytania: bariera jest pancerzem stojącym na drodze.

**SP bariery nie jedzie do gracza.** `visibleOpeningsFor` i ack `opening:toggle` zerują `armor`
tak, jak zerują rygiel — brama, którą gracz może otworzyć, nie mówi mu, ile zjada.

**Odcinki łańcucha stykające się w punkcie przecięcia liczą się raz** (większe SP). Płot rysowany
z przyciąganiem do siatki ma węzły na przecięciach kratek, a strzał po przekątnej między środkami
pól przechodzi dokładnie przez takie przecięcia — bez tego jedna siatka brałaby SP dwa razy.

**Retyp zeruje SP**, gdy przegroda przestaje być barierą albo bramą; bariera ↔ brama je zachowuje.
Liczba zostaje schowana w wierszu tylko wtedy, gdy ktoś wpisze ją do bazy ręką — i wtedy
`toWallView` i tak jej nie przepuszcza.

**Napis na mapie „BARIERA"** zamiast „PANCERZ", gdy trafienie w całości zjadła siatka — drobiazg
spoza listy, jedna linia w `damageMapFx`.

## Co zostało

- **Oględziny w przeglądarce** (`zaleglosci.md`): pole OB na pasku ścian (bariera i brama), pole
  na karcie segmentu, karta obrażeń z „− bariera OB n" i nagłówkiem „Bariera zatrzymała cios",
  napis „BARIERA" na mapie.
