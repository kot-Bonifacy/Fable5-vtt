# Rejestr błędów testów przed betą

Założony w T1 (26.09.2026). Plan, wagi i bramka bety są w `testy.md` (sekcje 7 i 9). Jeden wiersz
na błąd; test, który go znalazł, zostaje w suicie z `test.fail()` i identyfikatorem stąd, dopóki
poprawka nie przejdzie retestu.

Wagi: **B0** bloker · **B1** krytyczny · **B2** poważny · **B3** drobny. Statusy: nowy · potwierdzony ·
naprawiony · retest OK · odrzucony (z powodem).

## Błędy

| id  | etap | waga | obszar | tytuł                                                   | kroki odtworzenia                                                                | dowód (test, zrzut, log)                                                                                                   | status    | poprawka (commit) |
| --- | ---- | ---- | ------ | ------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------- |
| 1   | T1   | B0   | serwer | Build produkcyjny serwera (`dist/main.js`) nie startuje | `pnpm --filter @vtt/server build`, potem `node dist/main.js` w `packages/server` | `ERR_MODULE_NOT_FOUND: Cannot find package 'sqlite'`; tsup zdejmował `node:` z `node:sqlite` (`snapshots.ts`, od etapu 33) | retest OK | `ed681a8`         |
| 2   | T3a  | B2   | postac | Gracz zmienia własne Cechy po „Przyjmij do gry”         | po przyjęciu karty ▲ przy Cesze na karcie (albo `character:update` z `data.stats`) — CHA 7 → 8 zapisane, choć w kreatorze Cechę rzuca się raz, a przerzut daje tylko MG | test `3.8 gracz nie podnosi sobie Cechy po przyjęciu (#2)` (`test.fail`); umowa „pola z ceną” (`postac`) nie wymienia Cech — **do triażu MG**: B1 („akcja MG”), B2 albo odrzucony jako świadome | potwierdzony |                   |
| 3   | T3a  | B3   | czas   | Data startowa świeżej kampanii zgłasza zaległe rozliczenie | nowa kampania (zegar 1.01.2045) → „Ustaw” 14.03.2045 → „Minął pierwszy dzień miesiąca — i jeszcze 1. Ostatnio rozliczono 2045-01” i „Odpoczynek — minęły 72 doby”; bez postaci „Rozlicz” czyści za darmo, ale data ustawiona po dołączeniu postaci pobrałaby czynsz za miesiące sprzed kampanii | zrzut `.playwright-mcp/t3-06-zegar.png` (lokalnie); krok 3.2 obchodzi „Rozlicz” | potwierdzony |                   |
| 4   | T3a  | B3   | czat   | Karta rzutu Ścieżki Życia pokazuje wynik „1”             | dowolna tabela Ścieżki kubkiem → karta czatu: kość 5, duża liczba 1; `total` = liczba odpowiedzi (`creation.ts`, 25b), a od 24.09 rzuca się po jednej tabeli | test `#4 karta rzutu Ścieżki Życia…` (`test.fail`)                                                                     | potwierdzony |                   |
| 5   | T3a  | B3   | dane   | Wymyślona próbka z repo stoi w kompendium obok podręcznika | instancja z `data/private` → sklep kreatora: „Zgrzyt 9”, „Zardzewiak”, „Kurtka warsztatowa”; deki: „Dek przykładowy”; Programy „Iskra”, „Parasol”, „Osa”, „Tasak”, „Dziurkacz”; amunicja `sample-*` — `loadCompendium` łączy `data/public` i `data/private` celowo (prywatne wygrywa po id) | test `#5 kompendium z podręcznika…` (`test.fail`) — 50 wpisów `sample.json`                                          | potwierdzony |                   |
| 6   | T3a  | B3   | ui     | MG bez kampanii dostaje radę o zakładce „Sceny”          | pusta instancja → MG loguje się → mapa: „Brak sceny — utwórz i aktywuj ją w zakładce „Sceny””, a pierwszym krokiem jest kampania w „Panel MG” | zrzut `.playwright-mcp/t3-01-mg-pusto.png` (lokalnie)                                                                  | potwierdzony |                   |
| 7   | T3a  | B3   | postac | Brak „Wpisz nazwę darmowego języka” przy polu-liście     | kreator, Ścieżka Życia bez języka → „N braków — pokaż” → „Wpisz nazwę darmowego języka kultury pochodzenia.”, a pole „Język ojczysty” jest listą wyboru | zrzut `.playwright-mcp/t3-20.png` (lokalnie)                                                                           | potwierdzony |                   |
| 8   | T3a  | B3   | postac | Ekran końcowy kreatora nie wie o przyjęciu do gry        | gracz tworzy postać i zostawia kreator otwarty → MG „Przyjmij do gry” → kreator dalej: „Teraz czeka na zatwierdzenie MG: do tego czasu karta jest tylko do podglądu” i „Żeton stanie… gdy MG przyjmie” | zrzut `.playwright-mcp/t3-35-marek-po.png` (lokalnie)                                                                  | potwierdzony |                   |

Poprawkę #1 zrobiono w sesji T1 **za zgodą MG** (wyjątek od zasady „sesja testowa tylko notuje”:
błąd blokował samą infrastrukturę, bo instancja E2E startuje z `dist/`). Retest: `00-baseline`
i cała suita zielone cztery razy z rzędu; pułapka w `pulapki-dev.md`, sekcja `serwer`.

## Zadania dla innych etapów (nie błędy)

Rzeczy, które test wykazał, ale plan każe je zapisać jako zadanie, a nie błąd.

| id  | etap | dla etapu | tytuł                                                   | co wykazał test                                                                                                                                                                                                     |
| --- | ---- | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Z1  | T1   | 28        | Brak ostrzeżenia o próbce kompendium bez `data/private` | Serwer z `dist/` i `DATA_PRIVATE_DIR` wskazującym pusty katalog loguje tylko `compendium loaded` (50 pozycji próbki) i wstaje bez słowa ostrzeżenia. Kryterium etapu 28: ostrzeżenie w logu przy starcie na próbce. |

## Starsze notatki sesji testowych

_(pusto — notatki wyparte z sekcji 12 `testy.md` trafiają tu w całości)_
