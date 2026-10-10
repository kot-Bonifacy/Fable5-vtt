# Etap 47 — Cennik domowy: ed jak euro

**Faza:** przed betą (zlecenie MG z 09.10 spoza planu, przed refaktoryzacją) · **Wymaga etapów:**
23b (eurodolce), 25c (kreator: zakupy), 46a (handlarze), 46c (zapas amunicji)

## Skąd ten etap

MG (09.10): „ceny przedmiotów powinny być około 10x większe niż obecnie (przy takiej samej sumie na
start). ed to dla mnie odpowiednik euro albo dolarów z doliczeniem małej inflacji”. Diagnoza:
podręcznik ma **tani sprzęt i realne życie**. Czynsz (kawalerka 1500 ed/mies.), Poziom życia
(100–1500 ed) i amunicja (10 ed za 10 naboi) już dziś wyglądają jak euro, a broń, pancerz,
elektronika i chrom są od nich ~10× tańsze. Płaskie ×10 dałoby kawalerkę za 15 000 ed i strzał za
10 ed, więc cennik jest zróżnicowany.

## Decyzje MG z 09.10

1. **Zróżnicowanie:** sprzęt trwały ×10 (broń, dodatki, pancerze, cyborgizacja, sprzęt i programy
   Netrunnera, obrona Sieci, sprzęt ogólny od pasma Premium); amunicja i sprzęt ogólny z pasm
   Tanie / Codzienne / Drogie (10–50 ed) ×3, **Komputer** wyjątkiem ×10; montaż znalezionej
   cyborgizacji ×10 (1000 / 5000 / 10 000); terapia ×2 (1000 / 2000); czynsz, Poziom życia, zakup
   mieszkania ×1.
2. **Pasmo zostaje przy przedmiocie** — od niego zależą PT i czas Wytwarzania, zasięg Fixera
   i poziom sklepu. Zmienia się tylko kwota w ed.
3. **Gotówka startowa bez zmian** (2550 / 500 ed), ale **Kompletny Pakiet dostaje gratis podstawowe
   wyposażenie Roli** (inaczej Netrunner nie kupi deku i sprzęgu). Lista z wartościami
   w `data/private/cpred/cennik-x10.md`; wartości celowo nierówne — ma działać Rola.
4. **Wypłaty za zlecenia bez zmian** — sprzęt ma być celem na miesiące.
5. **Globalnie dla całej instancji**, nie per kampania.
6. Stałe spoza katalogu wg zasady trwałe/eksploatacja: partia Farmaceutyków 200 → 600 ed (×3),
   naprawa pojazdu Taboru (Moto) 500 bez zmian (usługa), ulepszenie 1000 → 10 000 ed (×10),
   opłata manipulacyjna i premia Korpo bez zmian (pensje i usługi).
7. **Salda istniejących postaci zostają** (wypłaty ×1, więc już są w „nowej walucie”).
8. **Podział:** 47a — cennik w kodzie, wyposażenie Roli, testy jednostkowe i serwera, notka dla
   asystenta zasad, oględziny; 47b — łańcuch E2E i specyfikacje startujące z jego stanów.

## Zakres

### 47a — cennik w kodzie (✅ 10.10)

- [x] `systems/cpred/pricing.ts`: mnożniki, `cpredCatalogPriceScale`, `cpredScaledEntry`,
      `cpredScaleCatalogPrices`, `formatEddies` (przeniesione z `economy.ts`), notka dla asystenta
- [x] Katalog z plików przeliczany raz przy wczytaniu (`loadCompendium`); wpisy MG z bazy — nie
- [x] `entryPrice`: cena z samego pasma = drabina podręcznika × mnożnik rodzaju wpisu
- [x] Poziomy sklepu porównują cenę cofniętą do podręcznika (`rulebookPrice` w `shop.ts`)
- [x] Stałe: montaż ×10, terapia ×2, Farmaceutyki ×3, ulepszenie Moto ×10, czas Wytwarzania
      „na każde 100 000 ed”; `formatCost` grupuje tysiące
- [x] Wyposażenie Roli gratis: `roleKits` w `creation.json` (prywatny i próbka), `kitChoice`
      w szkicu, sekcja w kroku „Wyposażenie”, karta przy „Utwórz postać” bez wiersza w historii,
      chrom w „Czego kreator nie wydaje”; `parse-creation.py` przenosi `roleKits` przy imporcie
- [x] Asystent zasad dostaje cennik domowy jako 7. żelazną zasadę
- [x] Testy jednostkowe i serwera, lint, `tsc`, szybkie E2E, oględziny w Firefoksie

### 47b — łańcuch E2E i gołe ręce z urzędu

**Decyzje MG z 10.10 (start 47b, wszystkie zgodne z rekomendacją):**

1. **Kowal (Krawędziarz, 500 ed)** kupuje w kreatorze tylko 2 paczki zwykłej (60 ed, zostaje
   440); B.C. Pistolet, Średnią broń białą i Średnią kurtkę kuloodporną daje mu MG „Dodaj za
   darmo” po „Przyjmij do gry” (pakiet Roli Krawędziarza dokłada MG — umowa 47a).
2. **Iskra (Kompletny Pakiet)** dostaje dek, sprzęg i złącza gratis, za gotówkę kupuje Agenta
   i Radiokomunikator (2000 ed, zostaje 550); sprzęg i złącza wszczepia MG „Dodaj za darmo”
   (rzut 2k6 na Utratę Człowieczeństwa, w E2E skryptowany 1 + 1).
3. **T6a:** na początku MG wypłaca Kowalowi 1000 ed za „Knajpę” (korekta na karcie). Ola wycenia
   Cyberoko na 1100 ed (domyślnie 1000), Marek zatwierdza. Handel 350 ed i Ronin od Pasera za
   400 ed (targ spod lady) bez zmian.
4. **Gołe ręce z urzędu (zlecenie MG w tej sesji):** Bijatyka na każdej karcie poza pojemnikiem,
   Sztuki walki przy Umiejętności Sztuki walki ≥ 1; **stały wiersz broni** (nie da się go
   usunąć, przemianować, oddać, sprzedać, włożyć do skrzyni ani położyć na mapie), wszystkie
   karty poza pojemnikami (gracze, towarzysze, NPC-e).

- [x] Gołe ręce: `systems/cpred/barehands.ts` (`normalizeCharacterData` dokłada, łata zdejmuje,
      `cpredTakeRows` / `cpredInventoryView` pomijają), karta bez pól i kosza przy tym wierszu,
      Kompendium i półka kreatora bez „Kup” dla tych wpisów; testy `shared` i serwera

- [x] T3a–T6b pod nowe ceny (Kowal w kreatorze: 2 paczki zwykłej do B.C. Pistoletu to dziś 60 ed,
      nie 20; budżet Krawędziarza 500 ed), odbudowa `po-T3`…`po-T6` pełnym przebiegiem z LLM
- [x] `t46a-wymiana-sklepy`, `t46c-amunicja`, `t46b-pojemniki`, `t7a-handel-kreator`,
      `t6a-handel-rozwoj` — kwoty w asercjach
- [x] Pełny domyślny przebieg zielony

## Kryteria ukończenia

- Ceny w Kompendium, kreatorze, u handlarzy, przy montażu i terapii są w cenniku domowym; pasma
  i poziomy sklepu bez zmian.
- Kompletny Pakiet dostaje wyposażenie Roli za darmo; Solo musi wybrać broń.
- Asystent zasad wie, że ceny z podręcznika trzeba przeliczyć.
- Testy jednostkowe, serwera, lint, `tsc` czyste; łańcuch E2E i pełny przebieg zielone (47b).
- Oględziny kreatora w Firefoksie.

## Wykonanie 47a (10.10.2026)

Kryteria 47a spełnione. Odstępstwa i ustalenia w trakcie:

- **Błąd w pierwszym cenniku:** pasma 50 i 500 ed miały zamienione nazwy (po polsku 50 ed to
  „Drogie”, 500 ed — „Kosztowne”). Kwoty były dobre; poprawione w cenniku i opisach.
- **Chrom z wyposażenia Roli nie jest montowany w kreatorze** (kreator nie montuje cyborgizacji
  w ogóle — Utratę losuje montaż). Należy się za darmo; MG wszczepia go przyciskiem „Dodaj za
  darmo” w Kompendium, a kreator mówi o tym w „Czego kreator nie wydaje”.
- **Próbka:** Grzechotnik (karabin z próbki) potaniał z 500 na 50 ed w danych, żeby test
  narzędzi Roli Solo mieścił się w 500 ed Krawędziarza po przeliczniku.

## Wykonanie 47b (10.10.2026)

Kryteria 47b spełnione. Ustalenia w trakcie:

- **Gołe ręce z urzędu (zlecenie MG w tej sesji, `50b62c6`)** — decyzja 4 wyżej. W łańcuchu Iskra
  bije Bijatyką z urzędu zamiast własnego wpisu MG „Pięści” (T4a/T4b), a martwy Zbir po „Zabierz
  wszystko” zostaje z samą Bijatyką.
- **Kwoty po cenniku domowym w E2E:** T3a (Kowal 440 ed, Iskra 550 ed, pakiet Roli od MG, chrom
  Iskry −4 Człowieczeństwa), T6a (wypłata 1000 ed, wytrychy 60 ed, Cyberoko 1000 → wycena 1100 ed),
  `t46a` (Kowal 5000 ed na starcie; latarka 72 ed u Pasera, kurtka 1200 ed, Kevlar 600 ed, Agent
  1000 ed), `t46c` (paczka zwykłej 30 ed, nabój 3 ed; MG w kreatorze bierze Kompletny Pakiet,
  bo Średni pistolet zjada 500 ed Krawędziarza). `t46b` i `t7a-handel-kreator` bez zmian.
- **#72 (zaległość z 04.10) naprawione po decyzji MG:** zapis i usunięcie tabeli losowej nie
  czekają na kości stołu (`emitTableAck`); na nowym `po-T6` test padał stale.
- **Nowa zaległość:** okno handlarza pisze kwoty bez grupowania tysięcy (`zaleglosci.md`).

