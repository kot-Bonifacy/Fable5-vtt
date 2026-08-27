# Wzór ręcznej tabeli Ran Krytycznych

Ten plik jest **wzorem formatu**, a nie danymi do gry: rany niżej są wymyślone
(repo jest publiczne, treść podręcznika mieszka wyłącznie w `data/private/`).

Czyta go `tools/import/parse-critical-injuries.py` — ścieżka **awaryjna**, dla
kogoś, kto ma tylko darmowy Easy Mode. Easy Mode niesie sam korpus, więc tabelę
dla głowy trzeba wtedy wpisać ręcznie. **Mając podręcznik główny, nie
potrzebujesz tego pliku**: `parse-manual.py` czyta obie tabele z podręcznika
i to jego wynik stoi w kompendium.

Kopia do wypełnienia idzie tutaj (poza repo):

```
data/private/rulebook/manual/tabela-ran-krytycznych.md
```

## Zasady formatu

- Nagłówek sekcji musi zawierać słowo **„głowy"** — po nim skrypt szuka tabeli.
- Kolumny w kolejności: `2k6 | Rana | Efekt rany | Łatanie | Leczenie`.
- Wiersz zaczyna się od wyniku 2k6 (2–12); wiersze bez liczby są pomijane.
- Puste Łatanie albo Leczenie wpisz jako `brak` — skrypt pominie takie pole.
- Zdania rozpoznawane maszynowo (mechanika, nie proza) — pisz je dokładnie tak:
  - `+N do podstawowej trudności Testu Przeżywalności` → `deathSavePenalty`
  - `-N do Ruchu` → `movePenalty`
- Każdy wpis dostaje `source` mówiący, że pochodzi spoza oficjalnego PDF-a.

## Tabela dla głowy (wymyślona — do podmiany)

| 2k6 | Rana                | Efekt rany                                                  | Łatanie          | Leczenie      |
| --- | ------------------- | ----------------------------------------------------------- | ---------------- | ------------- |
| 2   | Rozcięta brew       | Krew zalewa oko: -2 do wszystkich Akcji.                    | Pierwsza pomoc   | brak          |
| 7   | Dzwoni w uszach     | -2 do Ruchu do końca walki.                                  | brak             | Chirurgia     |
| 12  | Pęknięta czaszka    | +2 do podstawowej trudności Testu Przeżywalności.            | Ratownictwo      | Chirurgia     |
