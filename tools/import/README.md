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

# 2.5. podręcznik główny -> dane tworzenia postaci (etap 25a)
python tools/import/parse-creation.py

# 2.6. podręcznik główny -> tabele Ścieżek Życia (etap 25b)
python tools/import/parse-lifepath.py

# 2.7. podręcznik główny -> główna lista osprzętu (etap 25c)
python tools/import/parse-gear.py

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

## Tworzenie postaci (`parse-creation.py`)

Czyta te same rozdziały co `parse-manual.py` i zapisuje jeden plik —
`data/private/cpred/creation.json` — z którego kreator z etapu 25a bierze
szablony Cech (10 ról × 10 rzutów × 10 Cech), listy 20 umiejętności Ról, listę
umiejętności podstawowych, pule punktów i limity. Próbka **własnego autorstwa**
leży w `data/public/cpred/creation.json`, więc świeży klon ma działający kreator
bez podręcznika; plik prywatny ją zastępuje, tak jak przy `skills.json`.

Dwie tabele wymagają czegoś więcej niż regexa i obie mają własną kontrolę:

- **Szablony Cech** (s. 74–77) w zrzucie są strumieniem cyfr, w którym numery
  rzutów sklejają się z wartościami (`…684 677657667757 7765677666 8…`). Parser
  wyrzuca białe znaki i czyta „numer rzutu 1–10, po nim dokładnie dziesięć
  cyfr”. Ten kształt nie ma już żadnej niejednoznaczności.
- **Listy umiejętności Ról** (s. 88–89) to jeden ciąg nazw bez separatorów
  (`AtletykaAtletykaAtletyka…`). Parser tnie go po znanym słowniku umiejętności,
  a pięć kolumn odtwarza z dwóch niezmienników, których książka pilnuje:
  **kolumna jest posortowana alfabetycznie** i **każda Rola ma dokładnie 20
  pozycji**. Tabela Krawędziarza zgubiła w zrzucie jedną komórkę (Solo, drugi
  wiersz): brakującą nazwę podaje przykład drukowany na tej samej stronie,
  a **pierwszy wiersz tabeli Ulicznika** (s. 86, ta sama zawartość) rozstrzyga,
  które z dwóch pasujących ułożeń jest prawdziwe. Skrypt mówi o tym wprost
  w ostrzeżeniach — jeśli kiedyś przestanie, znaczy, że zrzut się zmienił.

## Ścieżki Życia (`parse-lifepath.py`)

Czyta rozdział „Uliczne opowieści” (s. 43–70) i zapisuje
`data/private/cpred/lifepath.json`: **19 tabel ogólnych** (kultura pochodzenia
z listą języków, osobowość, ubiór, fryzura, znaki szczególne, wartości, tło
i kryzys rodzinny, środowisko, przyjaciele, trzy kolumny wrogów, słodka zemsta,
tragiczne miłości, cele życiowe) i **52 tabele rolowe** — razem 522 wiersze.
Próbka **własnego autorstwa** leży w `data/public/cpred/lifepath.json`.

Cztery rzeczy trzeba odzyskać ze zrzutu, bo każda tabela jest w nim jednym
ciągiem tekstu:

- **Gdzie tabela się zaczyna** — na słowie `Wynik`, nagłówku kolumny wyników,
  a nie na zdaniu „Rzuć 1k10 lub wybierz…”. Tabela Wrogów tego zdania nie ma
  („rzucając raz w każdej kolumnie poniższej tabeli”) i przy kotwiczeniu na
  zdaniu przepada razem z dwiema sąsiednimi.
- **Numery wierszy** — czytane po kolei (najpierw `1`, potem `2` za nim), każdy
  poprzedzony spacją i zakończony wielką literą. To jedyne, co odróżnia numer
  wiersza od „(1k6/2) przyjaciółmi” i „odejmij 7, by sprawdzić”. Skan kończy
  się tam, gdzie brakuje następnej liczby, więc nikt nie musi mówić parserowi,
  że dana tabela jest na k6.
- **Kolumny** sklejone bez separatora (`Dawny przyjacielStrata twarzy`) — szew
  mała→WIELKA litera, i tylko przylegający. Dopuszczenie spacji rozcina
  „Przedstawiciel Korpo” na pół, więc szew ze spacją wchodzi dopiero wtedy,
  gdy przylegających jest za mało. Ile kolumn ma tabela i z której strony ciąć,
  mówi `GENERAL_SPECS` — zgadywanie tego wierszami zawodzi.
- **Koniec ostatniego wiersza**, który wchodzi w tekst drukowany obok: pytanie
  następnej tabeli, nazwa Roli kapitalikami, rozstrzelona zakładka
  `z e s p ó ł`, przypis „patrz str. 329”. Obcinane po kształcie; czego kształt
  nie złapie, poprawia sekcja `lifepath` w `manual-overrides.json` (tak samo jak
  `roleSkills` w `parse-creation.py`). Parser wypisuje takie wiersze jako
  ostrzeżenie „Podejrzanie długi ostatni wiersz”.

Tabele Ról przypisuje się do Roli **po numerze strony**, prosto ze spisu, który
książka drukuje na s. 53 („MEDIA STRONA 62KORPO STRONA 63…”). Kapitalikowe
banery Ról do tego nie służą — zrzut stawia je **po** pierwszej tabeli bloku.

## Osprzęt (`parse-gear.py`)

Czyta sekcję „Główna lista osprzętu” z rozdziału „Nowa Ekonomia Uliczna”
(s. 351–356) i zapisuje **53 wpisy** kategorii `gear` do
`data/private/cpred/compendium/gear.json`. Do etapu 25c kompendium miało **pięć**
pozycji sprzętu, więc sklep startowy w kreatorze nie miałby czym handlować.

Sekcja ma dwie połowy i parser potrzebuje obu:

- **Tabela cen** przeżywa zrzut jako jedna długa linia `Nazwa CENA ed (Pasmo)`
  bez separatorów — ale po każdej nazwie stoi cena, więc **cena jest
  separatorem**. Dopasowywanie nazwy byłoby zgadywaniem: „Cyberdek (doskonałej
  jakości)” ma własne nawiasy.
- **Opisy** są drukowane prozą pod tabelą, jako `Nazwa: opis`. Parser zna już
  nazwy z tabeli cen, więc dzieli prozę po nazwach, którym ufa, a nie po
  domysłach o wielkich literach.

Obie połowy sprawdzają się nawzajem: nazwa bez akapitu i cena, która nie pasuje
do swojego pasma na drabinie z s. 342, wychodzą jako ostrzeżenie. Dziś są dwa —
„Czip pamięci” i „Radioodtwarzacz” po prostu nie mają akapitu w książce.

**Uwaga na granicę sekcji:** tabela Mody (s. 356) zaczyna się w tej samej sekcji
bez własnego nagłówka, więc bez znacznika `MODA Nogi` opis ostatniego przedmiotu
połyka dziewięć kolumn cen ubrań.

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
