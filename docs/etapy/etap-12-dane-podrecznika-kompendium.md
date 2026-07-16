# Etap 12 — Dane z podręcznika i kompendium

**Faza:** D — Walka · **Wymaga etapów:** 07

⚠️ **Wymaga materiałów od Ciebie:** przed sesją przygotuj skonwertowany na tekst polski podręcznik CP RED (przynajmniej rozdziały: umiejętności, broń/ekwipunek, pancerze, zasady walki z tabelami DV).

## Cel sesji

Pipeline danych: tekst podręcznika → ustrukturyzowany JSON → baza; kompendium w UI z możliwością nadawania przedmiotów postaciom. Fundament danych dla etapów 14, 15, 18, 22, 24, 25.

## Zakres

- [ ] Schematy danych (zod w `shared/systems/cpred`): broń (typ, umiejętność, obrażenia, ROF, magazynek, ręce, ukrywalność, cena, tabela DV per zasięg), pancerz (SP, kara, lokacja), ekwipunek ogólny, pełna lista umiejętności, role i zdolności ról
- [ ] Skrypty importu w `tools/import/`: parsowanie dostarczonego tekstu (regex/heurystyki + ręczne poprawki w plikach pośrednich) → JSON walidowany schematami → zapis do `data/private/`
- [ ] Ładowanie danych do DB przy starcie serwera z `data/private/` (pełne dane) z fallbackiem na `data/public/` (kilkanaście przykładowych, wymyślonych wpisów do dev/testów i dla publicznego repo)
- [ ] Podmiana roboczej listy umiejętności z etapu 07 na pełne dane
- [ ] Kompendium UI: przegląd wg kategorii, wyszukiwarka, karta przedmiotu ze statystykami po polsku
- [ ] Nadawanie przedmiotów: drag z kompendium na kartę postaci / przycisk „dodaj"; ekwipunek postaci referencjuje wpisy kompendium (nie kopiuje wszystkich pól)
- [ ] Kontrola licencyjna: test/lint sprawdzający, że `data/private/` nie jest śledzone przez git

## Poza zakresem

- Automatyka walki (etapy 14–15), cyberware i ekonomia (etap 22), tabele lifepath (etap 24), netrunning (etap 25) — ale schematy projektuj tak, by dało się je dodać

## Kryteria ukończenia

- Import broni i pancerzy z Twojego materiału przechodzi walidację; liczba zaimportowanych wpisów zgodna z oczekiwaną
- W kompendium znajdujesz broń po nazwie i dodajesz ją postaci; przedmiot widoczny na karcie z pełnymi statystykami
- Świeży klon repo (bez `data/private/`) uruchamia się na danych przykładowych bez błędów

## Wskazówki techniczne

- Nie goń za w pełni automatycznym parserem PDF — 80% skryptem, 20% ręcznych poprawek w JSON-ach pośrednich jest szybsze i pewniejsze
- Identyfikatory wpisów kompendium: stabilne slugi (np. `weapon.heavy-pistol`) — będą referencjonowane przez karty, boty i RAG
- Tabele DV broni to klucz do etapu 15 — zadbaj o ich strukturę (zasięg w metrach → DV)
