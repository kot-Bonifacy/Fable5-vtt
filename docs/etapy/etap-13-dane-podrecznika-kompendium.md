# Etap 13 — Dane z podręcznika i kompendium

**Faza:** D — Walka · **Wymaga etapów:** 07

⚠️ **Wymaga materiałów od Ciebie:** przed sesją przygotuj skonwertowany na tekst polski podręcznik CP RED (przynajmniej rozdziały: umiejętności, broń/ekwipunek, pancerze, zasady walki z tabelami DV).

## Cel sesji

Pipeline danych: tekst podręcznika → ustrukturyzowany JSON → baza; kompendium w UI z możliwością nadawania przedmiotów postaciom. Fundament danych dla etapów 15, 16, 19, 23, 25, 26.

## Zakres

- [x] Schematy danych (`shared/systems/cpred/compendium.ts` — ręczna walidacja z komunikatami PL, jak reszta repo; bez zod, patrz POSTEP): broń (typ, umiejętność, obrażenia, ROF, magazynek, ręce, ukrywalność, cena, tabela DV per zasięg), pancerz (SP, kara, lokacja), ekwipunek ogólny, pełna lista umiejętności, role i zdolności ról
- [x] Skrypty importu w `tools/import/`: parsowanie dostarczonego tekstu (regex/heurystyki + ręczne poprawki w plikach pośrednich) → JSON walidowany schematami → zapis do `data/private/`
- [x] Ładowanie danych przy starcie serwera z `data/private/` (pełne dane) z fallbackiem na `data/public/` (kilkanaście przykładowych, wymyślonych wpisów do dev/testów i dla publicznego repo)
- [ ] ~~Podmiana roboczej listy umiejętności z etapu 07 na pełne dane~~ — **niewykonalne z darmowych materiałów**: statbloki DLC wymieniają umiejętności spoza Easy Mode, ale nigdy nie podają cechy, z której się je rzuca, a bez cechy BAZA na karcie jest bezużyteczna. Zostaje 41 umiejętności Easy Mode
- [x] Kompendium UI: przegląd wg kategorii, wyszukiwarka, karta przedmiotu ze statystykami po polsku (OBR./OB/LA/PT)
- [x] **Poza pierwotnym zakresem (decyzja z sesji):** edytor wpisów kompendium dla MG — bez niego brakujących typów broni nie dałoby się w ogóle wprowadzić
- [x] Nadawanie przedmiotów: przycisk „Dodaj postaci” na karcie przedmiotu; wiersz ekwipunku trzyma `compendiumId` (drag&drop nie powstał — przycisk wystarcza, bo kompendium jest w panelu bocznym, a karta w pływającym oknie)
- [x] Kontrola licencyjna: `packages/server/src/licensing.test.ts` (4 testy — sprawdza też pliki jeszcze niezacommitowane)

## Poza zakresem

- Automatyka walki (etapy 15–16), cyberware i ekonomia (etap 23), tabele lifepath (etap 25), netrunning (etap 26) — ale schematy projektuj tak, by dało się je dodać

## Kryteria ukończenia

- [x] Import broni i pancerzy z materiałów przechodzi walidację — 12 typów broni, 4 pancerze, 35 broni markowych, 52 wpisy razem; **kryterium przeformułowane**: darmowe materiały nie mają zbiorczej tabeli, więc „liczba zgodna z oczekiwaną” zastąpiona raportem z liczbą statbloków potwierdzających każdą wartość (`import-report.json`)
- [x] W kompendium znajdujesz broń po nazwie i dodajesz ją postaci; przedmiot widoczny na karcie z pełnymi statystykami
- [x] Świeży klon repo (bez `data/private/`) uruchamia się na danych przykładowych bez błędów — pokryte testami dymnymi (`dataPrivateDir` celowo wskazuje nieistniejący katalog)

## Wskazówki techniczne

- Nie goń za w pełni automatycznym parserem PDF — 80% skryptem, 20% ręcznych poprawek w JSON-ach pośrednich jest szybsze i pewniejsze
- Identyfikatory wpisów kompendium: stabilne slugi (np. `weapon.heavy-pistol`) — będą referencjonowane przez karty, boty i RAG
- Tabele DV broni to klucz do etapu 16 — zadbaj o ich strukturę (zasięg w metrach → DV)
