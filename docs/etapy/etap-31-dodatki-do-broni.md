# Etap 31 — Dodatki do broni

**Faza:** H — Świat CP RED · **Wymaga etapów:** 13 (kompendium), 16 (strzelanie),
16g (amunicja specjalna)

> **Pochodzenie:** dopisany 29.08.2026 po audycie zgodności z podręcznikiem głównym (decyzja MG).

## Cel sesji

`attachmentSlots: 3` siedzi w danych od etapu 13 i nie ma czym ich zapełnić — **katalogu dodatków
nie ma wcale**, a `parse-manual.py` używa nagłówka „Dodatki do broni" wyłącznie jako granicy
sekcji.

## Zakres

Osiem pozycji z s. 342–344:

- [ ] **Bagnet** — broń biała doczepiona do długiej; dotyka `halvesArmor` z 29.08
- [ ] **Magazynek bębnowy** i **wydłużony magazynek** — zmieniają `ammoMax` broni
- [ ] **Granatnik podwieszany** i **strzelba podwieszana** — druga broń na tej samej sztuce
- [ ] **Celownik noktowizyjny** — wchodzi w ciemność z 18b
- [ ] **Snajperska luneta** — modyfikuje PT z dystansu (tabela z etapu 16)
- [ ] **Złącze smartguna** — wiąże się z **gotową już** amunicją inteligentną z 16h
- [ ] Parser: sekcja dodatków w `parse-manual.py` (dziś tylko granica), wpisy w kompendium
- [ ] UI: gniazda przy wierszu broni na karcie, montaż i demontaż
- [ ] Testy: wpływ każdego dodatku na rachunek ataku albo magazynka

## Poza zakresem

- Ulepszenia Sprzętowe cyberdeków — to rozdział 11 i etap 26a, inna lista
- Jakość broni (poor/excellent) — `parse-manual.py` czyta ceny, ale schemat trzyma jedną cenę
  na wpis (wpis w `POMYSLY.md`)

## Kryteria ukończenia

- [ ] Broń z trzema gniazdami daje się uzbroić z UI, a rachunek ataku to widzi
- [ ] Złącze smartguna zmienia zachowanie naboju inteligentnego z 16h
- [ ] Katalog dodatków wjeżdża importem, nie ręcznym wpisywaniem

## Wskazówki techniczne

- **Umowa kodu, o której łatwo zapomnieć:** nowe pole typu broni dopisuje się **razem** do
  `CpredWeaponTypeInput` i do białej listy `schema_fields` w `parse-manual.py` — pominięta lista
  wycina pole po cichu (tak zginęły `explosive` i `ammoPatterns`)
- Podwieszany granatnik to najprawdopodobniej **druga `ResolvedWeapon`** na jednym wierszu karty,
  a nie modyfikator — przemyśl to przed kodem
