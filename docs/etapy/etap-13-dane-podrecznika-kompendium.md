# Etap 13 — Dane z podręcznika i kompendium

**Faza:** D — Walka · **Wymaga etapów:** 07

⚠️ **Wymaga materiałów od Ciebie:** przed sesją przygotuj skonwertowany na tekst polski podręcznik CP RED (przynajmniej rozdziały: umiejętności, broń/ekwipunek, pancerze, zasady walki z tabelami DV).

## Cel sesji

Pipeline danych: tekst podręcznika → ustrukturyzowany JSON → baza; kompendium w UI z możliwością nadawania przedmiotów postaciom. Fundament danych dla etapów 15, 16, 19, 23, 25, 26.

## Zakres

- [x] Schematy danych (`shared/systems/cpred/compendium.ts` — ręczna walidacja z komunikatami PL, jak reszta repo; bez zod, patrz `archiwum/dziennik-sesji.md`): broń (typ, umiejętność, obrażenia, ROF, magazynek, ręce, ukrywalność, cena, tabela DV per zasięg), pancerz (SP, kara, lokacja), ekwipunek ogólny, pełna lista umiejętności, role i zdolności ról
- [x] Skrypty importu w `tools/import/`: parsowanie dostarczonego tekstu (regex/heurystyki + ręczne poprawki w plikach pośrednich) → JSON walidowany schematami → zapis do `data/private/`
- [x] Ładowanie danych przy starcie serwera z `data/private/` (pełne dane) z fallbackiem na `data/public/` (kilkanaście przykładowych, wymyślonych wpisów do dev/testów i dla publicznego repo)
- [x] Podmiana roboczej listy umiejętności z etapu 07 na pełne dane — **odblokowane 2026-07-27**, gdy pojawił się podręcznik główny. Wcześniej niewykonalne z darmowych materiałów: statbloki DLC wymieniają umiejętności spoza Easy Mode, ale nigdy nie podają cechy, z której się je rzuca. Dziś: 66 umiejętności z cechami, mnożnikami (×2), 9 kategoriami i opisami; karta grupuje je w zwijane bloki
- [x] Kompendium UI: przegląd wg kategorii, wyszukiwarka, karta przedmiotu ze statystykami po polsku (OBR./OB/LA/PT)
- [x] **Poza pierwotnym zakresem (decyzja z sesji):** edytor wpisów kompendium dla MG — bez niego brakujących typów broni nie dałoby się w ogóle wprowadzić
- [x] Nadawanie przedmiotów: przycisk „Dodaj postaci” na karcie przedmiotu; wiersz ekwipunku trzyma `compendiumId` (drag&drop nie powstał — przycisk wystarcza, bo kompendium jest w panelu bocznym, a karta w pływającym oknie)
- [x] Kontrola licencyjna: `packages/server/src/licensing.test.ts` (4 testy — sprawdza też pliki jeszcze niezacommitowane)

## Poza zakresem

- Automatyka walki (etapy 15–16), cyberware i ekonomia (etap 23), tabele lifepath (etap 25), netrunning (etap 26) — ale schematy projektuj tak, by dało się je dodać

## Uzupełnienie z podręcznika głównego (2026-07-27)

Etap domykany był na darmowych materiałach; po zdobyciu podręcznika dane zostały uzupełnione w osobnej sesji. Powstał drugi parser `tools/import/parse-manual.py` (markdown ze zrzutu podręcznika → dane), a `parse-compendium.py` oddał mu tabele bazowe i pilnuje teraz zgodności statbloków z podręcznikiem.

- [x] 66 umiejętności zamiast 41 (cechy, ×2, kategorie, opisy) — ładowane z `data/private`, fallback na 41 z `data/public`
- [x] 18 typów broni zamiast 12: doszły ciężki PM, karabin snajperski, łuk, kusza, granatnik i wyrzutnia rakiet; wszystkie z tabelą PT zasięgów, ceną i kategorią cenową
- [x] 70 broni markowych zamiast 35 — pozycje odrzucane wcześniej z braku typu bazowego mają teraz do czego się odwołać
- [x] 30 wpisów broni kupowalnej: 16 typów bazowych + 14 broni egzotycznych
- [x] 9 pancerzy zamiast 4, z modyfikatorami REF/ZW/RUCH i cenami (były `cost: null`)
- [x] Obie tabele Ran Krytycznych z podręcznika — **tabela głowy zastąpiła nieoficjalną** z materiałów MG (patrz etap 15)
- [x] Zweryfikowane nazwy Ról i Zdolności Specjalnych (poprawione: „Reporter” → „Media”, „Operator” → „Znajomości”)
- [x] Poprawione polskie etykiety kategorii cenowych — `costly`/`expensive` były zamienione miejscami

## Kryteria ukończenia

- [x] Import broni i pancerzy z materiałów przechodzi walidację — po uzupełnieniu z podręcznika: 21 typów broni, 11 pancerzy, 103 bronie, 144 wpisy razem, 0 wiszących odniesień; **kryterium przeformułowane** przy pierwszym domknięciu, bo darmowe materiały nie mają zbiorczej tabeli i „liczba zgodna z oczekiwaną” została zastąpiona raportem z liczbą statbloków potwierdzających każdą wartość (`import-report.json`)
- [x] W kompendium znajdujesz broń po nazwie i dodajesz ją postaci; przedmiot widoczny na karcie z pełnymi statystykami
- [x] Świeży klon repo (bez `data/private/`) uruchamia się na danych przykładowych bez błędów — pokryte testami dymnymi (`dataPrivateDir` celowo wskazuje nieistniejący katalog)

## Wskazówki techniczne

- Nie goń za w pełni automatycznym parserem PDF — 80% skryptem, 20% ręcznych poprawek w JSON-ach pośrednich jest szybsze i pewniejsze
- Identyfikatory wpisów kompendium: stabilne slugi (np. `weapon.heavy-pistol`) — będą referencjonowane przez karty, boty i RAG
- Tabele DV broni to klucz do etapu 16 — zadbaj o ich strukturę (zasięg w metrach → DV)
