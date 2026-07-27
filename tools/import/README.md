# Pipeline importu kompendium (etap 13)

Zamienia materiały do Cyberpunka RED na dane kompendium VTT. **W repo są tylko
skrypty — nigdy treść.** Wszystko, co wyprodukuje ten pipeline, ląduje w
`data/private/` (gitignore), bo podręcznik jest objęty prawem autorskim.

Materiały dzielą się na dwa źródła i mają rozdzielone role:

| Źródło                              | Co z niego bierzemy                                                                  | Skrypt                |
| ----------------------------------- | ------------------------------------------------------------------------------------ | --------------------- |
| **Podręcznik główny (PL)**          | tabele bazowe: umiejętności, typy broni, PT zasięgów, pancerze, rany krytyczne, ceny | `parse-manual.py`     |
| Darmowe DLC RTG (EN) + Easy Mode PL | broń markowa (nazwy, ceny, jakość, opisy) i statbloki NPC                            | `parse-compendium.py` |

Podręcznik jest **źródłem prawdy dla wartości bazowych**. Skrypt DLC nie pisze
już `weapon-types.json` ani `armor.json` — zamiast tego porównuje swoje
wnioski ze statbloków z tabelami podręcznika i wypisuje rozbieżności w raporcie.

## Kroki

```bash
# 1. PDF -> tekst (data/private/rulebook/pdf -> .../text)
uv run --with pdfplumber python tools/import/extract-pdf-text.py

# 2. podręcznik główny -> umiejętności, typy broni, pancerze, rany krytyczne
python tools/import/parse-manual.py

# 3. DLC -> broń markowa (+ kontrola zgodności z podręcznikiem)
uv run --with pdfplumber python tools/import/parse-compendium.py

# 3.5. opisy EN -> PL lokalnym modelem (wymaga uruchomionego llama-servera)
uv run --with httpx python tools/import/translate-descriptions.py

# 4. walidacja schematami z @vtt/shared (to samo, co robi serwer przy starcie)
packages/server/node_modules/.bin/tsx tools/import/validate-compendium.ts
```

Krok 2 wymaga wcześniejszego zbudowania markdownowego zrzutu podręcznika —
patrz `tools/rulebook/README.md`.

## Podręcznik główny (`parse-manual.py`)

Czyta **markdown**, nie PDF: zrzut z `tools/rulebook/build-manual.mjs` jest
deterministyczny, diffowalny i ma już naprawione ligatury, dzielenie wyrazów i
kapitaliki. Czego nie naprawia, to układ tabel — kolumny sklejają się w jeden
ciąg (`3k68(C. Pistolet)21TAK100 ed(Premium)`), więc każda tabela jest cięta po
etykietach wierszy, a wartości czytane z odcinka między dwoma etykietami.

Zapisuje:

| Plik                                                      | Zawartość                                             |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `data/private/cpred/skills.json`                          | 66 umiejętności: cecha, mnożnik (×2), kategoria, opis |
| `data/private/cpred/compendium/weapon-types.json`         | 18 typów broni z tabelą PT zasięgów                   |
| `data/private/cpred/compendium/weapons-base.json`         | broń kupowalna: 16 typów bazowych + 14 egzotycznych   |
| `data/private/cpred/compendium/armor.json`                | 9 pancerzy z modyfikatorami i cenami                  |
| `data/private/cpred/compendium/critical-injuries.json`    | obie tabele 2k6 (korpus i głowa)                      |
| `data/private/cpred/compendium/import-report-manual.json` | liczby, ceny wg jakości, zdolności ról, ostrzeżenia   |

Umiejętności ładuje serwer z `data/private/cpred/skills.json`, a gdy tego pliku
nie ma — z `data/public/cpred/skills.json` (41 pozycji Easy Mode, w repo). Plik
prywatny **zastępuje** publiczny, nie dokleja się do niego. Karta postaci trzyma
`skillId → poziom` i pomija nieuczone umiejętności, więc podmiana listy dokłada
wiersze na poziomie 0 i nie rusza żadnej postaci.

### Kotwice i uzupełnienia ręczne

- `terms.py` — słownik nazw: typy broni, pancerze, kategorie umiejętności i
  mapowanie nazwa → id. To nadal słownik, nie treść: identyfikatory są
  angielskie, tak jak wszędzie w repo, a 41 nazw umiejętności leży w
  `data/public` od etapu 07.
- `data/private/rulebook/manual/manual-overrides.json` (gitignore) — wartości,
  których regex nie wyciągnie, oraz **nazwy własne broni egzotycznej**. Te
  ostatnie są jedyną klasą nazw, które byłyby czystą treścią podręcznika w
  repo, więc siedzą po stronie prywatnej. Overrides mają pierwszeństwo przed
  parserem i każdy wpis niesie własne `source`.

Znane miejsca, gdzie zrzut gubi dane (i dlatego są w overrides):

- **Pistolet maszynowy** — w tabeli s. 94 kolumny „LA” i „liczba rąk” sklejają
  się w jedną cyfrę; z podręcznika: LA 1, jednoręczny.
- **Broń biała** — podręcznik podaje „Liczba rąk: zależnie od rodzaju”, więc
  wartość w danych jest domyślną, a zastrzeżenie stoi w opisie typu.
- **Bijatyka i Sztuki walki** — obrażenia zależą od Budowy Ciała, a progi w
  zrzucie sklejają się (`7 – 1011 lub więcej`); drabinka jest w opisie.

## Broń markowa i statbloki (`parse-compendium.py`)

Darmowe DLC dają broń markową: nazwę, cenę, jakość i typ bazowy, do którego się
odwołuje. Broń odwołująca się do nieistniejącego typu jest odrzucana — dopóki
typy bazowe pochodziły ze statbloków, wypadało z importu ~35 pozycji (karabiny
snajperskie, łuki, kusze, granatniki, wyrzutnie rakiet, ciężkie PM-y). Po
imporcie podręcznika typy istnieją i **wchodzi komplet 70 broni markowych**.

`import-report.json` pokazuje, ile statbloków potwierdza każdą wartość, oraz
sekcję `rulebookDifferences` — miejsca, w których statbloki nie zgadzają się z
podręcznikiem. Rozbieżność nie musi być błędem (NPC może nosić broń niskiej
jakości), ale jest jedynym sygnałem, że któryś z parserów się pomylił.

## Tłumaczenie opisów

Materiały RTG są po angielsku, a przy stole gramy po polsku, więc opisy
przechodzą przez model z etapu 09 (`translate-descriptions.py`). Nic nie
opuszcza komputera. Oryginał zostaje w polu `descriptionOriginal` i jest do
podejrzenia na karcie przedmiotu („Oryginał (EN)”), więc każde tłumaczenie da
się zweryfikować bez wracania do PDF-a. Opisy z podręcznika są po polsku od
razu i tego kroku nie potrzebują.

**Model 9B nie wystarcza sam z siebie.** Przy pierwszym przebiegu mylił typy
broni („ciężki pistolet” dla pistoletu maszynowego), kalkował angielski
(„kolanówka” zamiast kabury na kostkę) i tłumaczył wciągnięte do opisu nagłówki
stron. Stąd dwie decyzje:

- parser **wycina z opisu zdanie o typie i jakości** („An Excellent Quality
  Heavy Pistol.”) — te wartości są w polach strukturalnych i widać je na
  karcie, a w tekście tylko kusiły model do przekręcenia nazwy typu;
- `translations-override.json` trzyma **ręczne poprawki kluczowane id wpisu**.
  Mają pierwszeństwo przed modelem i przeżywają każdy kolejny import.

Ponowne uruchomienie skryptu nie płaci za to, co już przetłumaczone: wyniki są
cache'owane po skrócie treści w `translations.json`, a wpisy z override
stosują się natychmiast.

## Ładowanie przez serwer

Serwer czyta wynik przy każdym starcie: najpierw `data/public/cpred/compendium`
(przykłady wymyślone, w repo), potem `data/private/cpred/compendium` — pliki
prywatne wygrywają przy kolizji identyfikatorów. Pliki `import-report*.json` są
pomijane, bo są raportem, nie danymi. Brak katalogu prywatnego nie jest błędem:
świeży klon repo wstaje na danych przykładowych.

## Dodanie nowego materiału

1. Wrzuć PDF do `data/private/rulebook/pdf/`.
2. Jeśli ma broń markową w dwóch kolumnach — dopisz go do `NAMED_WEAPON_SOURCES`
   w `parse-compendium.py`.
3. Nowe nazwy własne (typ broni, pancerz) dopisz w `terms.py`; bez wpisu w
   słowniku parser je pominie, zamiast zgadywać tłumaczenie.
4. Przelej kroki 1–3 z góry i sprawdź oba raporty importu.
