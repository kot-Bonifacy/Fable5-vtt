# Pipeline importu kompendium (etap 13)

Zamienia materiały do Cyberpunka RED na dane kompendium VTT. **W repo są tylko
skrypty — nigdy treść.** Wszystko, co wyprodukuje ten pipeline, ląduje w
`data/private/` (gitignore), bo podręcznik jest objęty prawem autorskim.

## Trzy kroki

```bash
# 1. PDF -> tekst (data/private/rulebook/pdf -> .../text)
uv run --with pdfplumber python tools/import/extract-pdf-text.py

# 2. tekst -> JSON kompendium (-> data/private/cpred/compendium)
uv run --with pdfplumber python tools/import/parse-compendium.py

# 2.5. opisy EN -> PL lokalnym modelem (wymaga uruchomionego llama-servera)
uv run --with httpx python tools/import/translate-descriptions.py

# 3. walidacja schematami z @vtt/shared (to samo, co robi serwer przy starcie)
packages/server/node_modules/.bin/tsx tools/import/validate-compendium.ts
```

## Tłumaczenie opisów

Materiały RTG są po angielsku, a przy stole gramy po polsku, więc opisy
przechodzą przez model z etapu 09 (`translate-descriptions.py`). Nic nie
opuszcza komputera. Oryginał zostaje w polu `descriptionOriginal` i jest do
podejrzenia na karcie przedmiotu („Oryginał (EN)”), więc każde tłumaczenie da
się zweryfikować bez wracania do PDF-a.

**Model 9B nie wystarcza sam z siebie.** Przy pierwszym przebiegu mylił typy
broni („ciężki pistolet” dla pistoletu maszynowego), kalkował angielski
(„kolanówka” zamiast kabury na kostkę) i tłumaczył wciągnięte do opisu nagłówki
stron. Stąd dwie decyzje:

- parser **wycina z opisu zdanie o typie i jakości** („An Excellent Quality
  Heavy Pistol.”) — te wartości są w polach strukturalnych i widać je na
  karcie, a w tekście tylko kusiły model do przekręcenia nazwy typu;
- `translations-override.json` trzyma **ręczne poprawki kluczowane id wpisu**.
  Mają pierwszeństwo przed modelem i przeżywają każdy kolejny import. Dziś
  siedzi tam komplet 35 opisów broni po korekcie.

Ponowne uruchomienie skryptu nie płaci za to, co już przetłumaczone: wyniki są
cache'owane po skrócie treści w `translations.json`, a wpisy z override
stosują się natychmiast.

Serwer czyta wynik przy każdym starcie: najpierw `data/public/cpred/compendium`
(przykłady wymyślone, w repo), potem `data/private/cpred/compendium` — pliki
prywatne wygrywają przy kolizji identyfikatorów. Brak katalogu prywatnego nie
jest błędem: świeży klon repo wstaje na danych przykładowych.

## Skąd biorą się liczby

Darmowe materiały **nie zawierają** zbiorczej tabeli broni — te są w płatnym
podręczniku. Zamiast zgadywać, parser zbiera **dowody** i je agreguje:

- **statbloki NPC** z darmowych DLC podają broń i pancerz przy każdej postaci
  (`PQ Heavy Pistol (ROF2) 3d6`, `Body: Kevlar® SP 7`). Kilkadziesiąt statbloków
  daje wartość dominującą dla każdego typu bazowego wraz z liczbą potwierdzeń;
- **Easy Mode PL** dokłada tabelę PT zasięgów i polskie nazwy — a jego karty
  postaci podają magazynki, których statbloki nie mają;
- **DLC ze sprzętem** (Toggle's Temple, Woodchipper's Garage, 12 Days of Gunmas)
  dają broń markową: nazwę, cenę, jakość i typ bazowy, do którego się odwołuje.

`import-report.json` pokazuje dla każdej wartości, ile statbloków ją potwierdza,
z jakich plików i gdzie źródła się nie zgadzają. Warto go przejrzeć po imporcie.

### Uzupełnienia ręczne

`data/private/rulebook/manual/overrides.json` (gitignore) trzyma wartości,
których żaden regex nie wyciągnie — strony kart postaci w Easy Mode są obrócone
o 90°, więc ekstrakcja tekstu daje z nich śmieci. Każda pozycja ma tam pole
`source` z dokładnym miejscem, z którego została odczytana. Overrides mają
pierwszeństwo przed agregacją.

## Czego brakuje i co z tym zrobić

Darmowe materiały nie zawierają pistoletów maszynowych ciężkich, karabinów
snajperskich, łuków, kusz ani broni ciężkiej. Broń markowa odwołująca się do
tych typów jest przy imporcie odrzucana (raport wypisuje ile i jakich).
Uzupełnia się je **edytorem kompendium w UI** (zakładka „Kompendium” → „+ Własny
wpis”); takie wpisy trafiają do bazy kampanii, nie do plików.

Wpisy z niepełnymi danymi mają `incomplete: true` i widoczne ostrzeżenie na
karcie przedmiotu — lepiej to niż cicho zmyślona wartość przy stole.

## Dodanie nowego materiału

1. Wrzuć PDF do `data/private/rulebook/pdf/`.
2. Jeśli ma broń markową w dwóch kolumnach — dopisz go do `NAMED_WEAPON_SOURCES`
   w `parse-compendium.py`.
3. Nowe nazwy własne (typ broni, pancerz) dopisz w `terms.py`; bez wpisu w
   słowniku parser je pominie, zamiast zgadywać tłumaczenie.
4. Przelej kroki 1–3 z góry i sprawdź `import-report.json`.
