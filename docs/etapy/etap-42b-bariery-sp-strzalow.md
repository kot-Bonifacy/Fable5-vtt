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
a osłona ma PW, nie SP (etap 16c). SP bariery to **decyzja MG z 13.09.2026** — w tym etapie idzie
wpis do `decyzje-i-uproszczenia.md`, żeby nikt nie „naprawiał" jej jako błędu mechaniki.

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

## Zakres

- [ ] Kolumna `Wall.armor` (liczba nieprzezroczysta dla rdzenia; CP RED czyta ją jako SP),
      migracja, eksport/import (`archive.ts`)
- [ ] Rdzeń: suma „pancerza" barier przeciętych odcinkiem (zamknięta brama tak, otwarta nie)
- [ ] `CpredAttackMeta.barrierSp` liczone **na serwerze** przy ataku, nigdy z żądania → karta →
      `SheetDamageRequest` → `resolveCpredDamage` (nowe wejście, pierwsza warstwa)
- [ ] Obszar (granat, śrut): SP per figura (`RollAreaTarget`); osłona trafiona przez barierę też
- [ ] Podgląd obrażeń u klienta liczy tą samą funkcją; wiersz karty czatu „przez barierę: OB n"
- [ ] Pole SP na pasku (nowa bariera) i na karcie segmentu
- [ ] Wpis w `decyzje-i-uproszczenia.md`
- [ ] Testy: `damage.test.ts` (dwie warstwy, zużycie tylko pancerza celu, krytyk), serwer (strzał,
      seria, obszar, dwie bariery, otwarta brama)

## Kryteria ukończenia

1. Strzał za 20 przez barierę SP 7 w cel z kurtką SP 11 zabiera 2 PW i zużywa kurtkę do 10;
   bariera zostaje przy 7.
2. Granat za barierą SP 5 zabiera figurze za nią o 5 PW mniej niż figurze przed nią.
3. Bariera SP 0 i otwarta brama nie zmieniają obrażeń.
4. Karta czatu mówi, ile SP bariery odjęto.
