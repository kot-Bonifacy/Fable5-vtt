# Etap 19b — Baza wiedzy kampanii i kontekst botów

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 19a (moduł RAG), 11 (boty na czacie)

> **Pochodzenie:** wydzielony z etapu 19 dnia 08.08.2026 (decyzja MG). 19a zbudował
> wyszukiwanie i zweryfikował je asystentem zasad; tutaj RAG zaczyna karmić **boty NPC**,
> a MG dostaje miejsce, w którym zapisuje świat.

## Cel sesji

Bot przestaje wiedzieć tylko to, co MG wkleił mu do profilu. Powstaje baza wiedzy kampanii
(miejsca, frakcje, NPC, notatki MG) z edytorem w UI, indeksowana w RAG — a przy każdej
wypowiedzi bota gateway dokleja do promptu to, co **ten** bot ma prawo wiedzieć.

## Zakres

- [x] **Kolekcja „baza wiedzy kampanii"** — model w DB (wpis: tytuł, treść, typ, tagi,
      widoczność), edytor MG w UI, indeksowanie przy zapisie (i reindeks całości na żądanie)
- [x] **Sekcja „kontekst wiedzy" w profilu bota** — które kolekcje i tagi bot może czytać;
      pusty zbiór = bot zna tylko to, co ma wpisane w profilu (zachowanie z etapu 11)
- [x] **Doklejanie top-k do promptu bota** — wyszukiwanie po ostatniej wypowiedzi rozmówcy,
      filtr po uprawnieniach bota, fragmenty jako osobna sekcja promptu; **bot nigdy nie
      cytuje źródła w wypowiedzi** (to NPC, nie asystent)
- [x] **Budżet promptu dla botów** — RAG + historia + profil w kontekście i w limicie czasu
      odpowiedzi z etapu 11; pomiar, nie oszacowanie
      (`packages/server/scripts/bot-context-budget.ts`, tabela w `ai-gateway/README.md`)
- [x] **Drugi tryb chunkowania: płaski tekst** — FAQ CP RED i DLC z `data/private/rulebook/text/`
      do kolekcji podręcznika (asystent zasad z 19a od razu na tym korzysta)
- [x] Testy: filtr uprawnień bota (fragment spoza jego kolekcji nie dociera do promptu),
      chunkowanie płaskiego tekstu, reindeks bez duplikatów

## Poza zakresem

- Streszczenia sesji, dziennik kampanii, relacje NPC↔postacie → **19c**
- Automatyczne wypełnianie bazy wiedzy przez model (MG pisze wpisy sam)
- Udostępnianie wpisów graczom jako handouty → etap 24

## Kryteria ukończenia

- [x] NPC zapytany o miejsce opisane wyłącznie w bazie wiedzy odpowiada zgodnie z wpisem
- [x] Ten sam NPC bez uprawnienia do danej kolekcji odpowiada, że nie wie — fragment nie
      pojawia się w jego prompcie (sprawdzalne w podglądzie promptu w edytorze botów)
- [x] Wpis zmieniony w edytorze jest widoczny w odpowiedzi bota bez restartu gatewaya
- [x] Odpowiedź bota mieści się w limicie czasu z etapu 11 mimo doklejonego RAG
      (zmierzone: 1,1 s na żywej kampanii, z czego wyszukiwanie 33–51 ms)

## Wskazówki techniczne

- Podgląd promptu w edytorze botów (etap 10) musi pokazywać także doklejone fragmenty —
  inaczej „dlaczego bot to powiedział" przestaje być sprawdzalne
- Uprawnienia bota są filtrem **po stronie gatewaya przy wyszukiwaniu**, nie obcinaniem
  wyników po fakcie: kolekcja, do której bot nie ma prawa, nie ma prawa go kosztować
- **Licencja:** treść wpisów kampanii to `data/private/`; w repo tylko schemat i parser
