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

- [x] **Bagnet** — broń biała doczepiona do długiej; dotyka `halvesArmor` z 29.08
- [x] **Magazynek bębnowy** i **wydłużony magazynek** — zmieniają `ammoMax` broni
- [x] **Granatnik podwieszany** i **strzelba podwieszana** — druga broń na tej samej sztuce
- [x] **Celownik noktowizyjny** — wchodzi w ciemność z 18b
- [x] **Snajperska luneta** — modyfikuje PT z dystansu (tabela z etapu 16)
- [x] **Złącze smartguna** — +1 do Testu, warunkowane chromem
- [x] Parser: sekcja dodatków w `parse-manual.py` (dziś tylko granica), wpisy w kompendium
- [x] UI: gniazda przy wierszu broni na karcie, montaż i demontaż
- [x] Testy: wpływ każdego dodatku na rachunek ataku albo magazynka

## Poza zakresem

- Ulepszenia Sprzętowe cyberdeków — to rozdział 11 i etap 26a, inna lista
- Jakość broni (poor/excellent) — `parse-manual.py` czyta ceny, ale schemat trzyma jedną cenę
  na wpis (wpis w `POMYSLY.md`)

## Kryteria ukończenia

- [x] Broń z trzema gniazdami daje się uzbroić z UI, a rachunek ataku to widzi
- [x] ~~Złącze smartguna zmienia zachowanie naboju inteligentnego z 16h~~ →
      **kryterium poprawione 01.09**, bo stało na pomyłce: podręcznik wiąże amunicję
      inteligentną z **Celownikiem optycznym** (s. 347), a złącze smartguna ze **Złączami
      interfejsu / uchwytem podskórnym** (s. 344). To dwa niezależne tory. Wspólny jest
      **mechanizm**, i on jest tym, co etap dowozi: jedna funkcja `hasRequiredCyberware`
      pyta kartę o chrom, a obie reguły przez nią przechodzą — złącze daje +1 tylko
      podpiętemu, a nabój inteligentny **nie wystrzeli** bez Celownika optycznego
      (`AMMO_NEEDS_CYBERWARE`). Do 16h była to proza, bo modelu chromu jeszcze nie było —
      przyszedł w 23a.
- [x] Katalog dodatków wjeżdża importem, nie ręcznym wpisywaniem

## Wskazówki techniczne

- **Umowa kodu, o której łatwo zapomnieć:** nowe pole typu broni dopisuje się **razem** do
  `CpredWeaponTypeInput` i do białej listy `schema_fields` w `parse-manual.py` — pominięta lista
  wycina pole po cichu (tak zginęły `explosive` i `ammoPatterns`)
- Podwieszany granatnik to najprawdopodobniej **druga `ResolvedWeapon`** na jednym wierszu karty,
  a nie modyfikator — przemyśl to przed kodem

## Jak to wyszło (01.09.2026)

Wskazówka o drugiej `ResolvedWeapon` była trafna i tak jest zrobione: `secondary` na wpisie
dodatku niesie **id typu broni**, nie kopię jego liczb, a `resolveAttachmentWeapon` składa
z niego pełną broń. Planer podmienia broń w jednej linijce i od tego miejsca w dół każda reguła
(zasięg, zwarcie, tryby ognia, połowa pancerza, magazynek) działa, bo dotyczy **broni**, a nie
dlatego, że ktoś dopisał gałąź o podwieszanych.

Trzy rzeczy, których plan nie przewidział:

- **Kolumny magazynków siedzą na typie broni**, nie na dodatku: tabela z s. 344 czyta się bronią
  („bębnowy" znaczy 50 dla PM-a i 16 dla strzelby). Stąd `magazineExtended`/`magazineDrum`
  w `WeaponTypeDefinition` — i stąd wpis obu na białą listę `schema_fields`.
- **Podwieszana broń potrzebuje własnego magazynka na karcie** (`attachmentAmmo`), inaczej jeden
  granat kosztowałby dwadzieścia pięć naboi karabinowych.
- **`attachmentIds` jedzie zwykłą łatą karty**, więc reguły montażu musiały stanąć po stronie
  **odczytu** (`fittedAttachmentsFor` sądzi listę przy każdym czytaniu). Sprawdzanie ich przy
  zapisie trzeba by powtórzyć w każdej ścieżce piszącej kartę; tak jest jedno miejsce do
  zapomnienia, a karta, pod którą MG zmienił kompendium, leczy się sama.

## Domknięcie oględzin (01.09.2026, druga sesja)

Etap zamknięto po pierwszej sesji z długiem: sześć rzeczy z ośmiu obejrzanych i jedna dziura
w kodzie. Druga sesja tego dnia domknęła jedno i drugie.

**Dziura:** `cpredHotbarSlots` budowało sloty wyłącznie z `sheet.weapons`, więc bagnet i broń
podwieszana były osiągalne **tylko z karty postaci** — pasek nad mapą ich nie znał. Naprawione:
katalog dodatków wchodzi do `hotbarSlotsFor`, a `weaponOptionKey(rowId, attachmentId)` niesie
tożsamość „wiersz + dodatek" do czterech miejsc, które dotąd kluczowały na samym wierszu.

**Trzy ostatnie ścieżki, odklikane:**

- **Celownik noktowizyjny** — ten sam strzał przez tę samą chmurę: bez niego rozbicie ma wiersz
  **„Dym −4"**, z nim tego wiersza **nie ma** (+11 → +15). Kara znika, a nie jest kompensowana.
- **Luneta dalekiego zasięgu** — strzał z Celowaniem z **19 m** dopisał **+1**, choć do 51 m
  brakowało: bonus wchodzi z tytułu Celowania, nie odległości.
- **Demontaż przycinający naboje** — Arasaka przeładowana do **50/50**, po zdjęciu bębna
  **30/30**.

**Zostało jako zaległość:** broń podwieszana nie ma wyboru amunicji — wiersz `↳` ma samo ⟳,
a `weapon:reload` z `attachmentId` nie przyjmuje `ammoId`. W praktyce znaczy to, że
z podwieszanego granatnika nie wystrzelisz dymu ani gazu.
