# Etap 20a — Akcje botów: structured output, tryby autonomii, rzuty poza walką

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 11 (boty na czacie), 08 (rzuty z karty), 19c

> **Podział (uzgodniony 08.08.2026):** pierwotny etap 20 obejmował naraz nową zdolność
> gatewaya (structured output), nowy model danych i UI (tryby autonomii, karta propozycji),
> całą warstwę taktyczną walki (stan taktyczny, „graj turę", atak i ruch) oraz bezpieczniki —
> cztery niezależne kawałki architektury. Wydzielono:
> [20b — tura bota w walce](etap-20b-tura-bota-w-walce.md).
> Tutaj zostaje fundament plus jeden pionowy plaster, który go weryfikuje: bot rzuca kośćmi
> poza walką.

## Cel sesji

Bot przestaje tylko mówić i zaczyna **działać** — na razie poza walką. MG pisze na czacie
„Barman, rzuć na Percepcję", a bot (zależnie od trybu) sam wykonuje rzut albo proponuje go
kartą z przyciskami „Zatwierdź / Odrzuć". Rzut idzie **tą samą ścieżką serwera co rzut
gracza** (`character:roll`), więc karta na czacie wygląda dokładnie jak każda inna.

## Rozstrzygnięcia sesji (przed kodem)

1. **Gramatyka nie dotyka polszczyzny.** Structured output (`json_schema` → GBNF) obsługuje
   **wyłącznie przebieg decyzyjny** — wywołanie maszyna-do-maszyny, w którym nie ma prozy do
   zepsucia. Wypowiedź NPC-a zostaje swobodnym tekstem ze wszystkim, co zbudowały etapy 10–12
   (kotwica roli, wykrywanie wyjścia z roli, sanitizer, TTS). To rozstrzyga napięcie między
   wskazówką etapu 20 („structured output") a lekcją z 19c („9B pisze wiersz tekstu pewniej
   niż poprawny JSON"): jedno i drugie jest prawdą, tylko o innych wywołaniach.
2. **Domyślny tryb nowego bota: „propozycja".** Żadna akcja nie wykonuje się bez wiedzy MG,
   dopóki MG świadomie nie przełączy bota na automat.
3. **Zatwierdza MG, opcjonalnie też wskazany gracz.** Profil bota ma pole „steruje nim" —
   gdy wskazuje gracza, ten też widzi kartę propozycji i jej przyciski.
4. **Gracze nie widzą, że rzucił bot.** Karta rzutu wygląda jak każda inna (zgodnie z decyzją
   etapu 11: wypowiedź bota jest nie do odróżnienia od `/jako` MG); ślad decyzji — co bot
   wybrał, czym to uzasadnił, ile trwało — idzie do MG osobnym zdarzeniem, jak `bot:trace`
   z 19b/19c.
5. **Bot rzuca tylko własną kartą postaci.** Bez przypisanej karty (`BotProfile.characterId`)
   nie ma czym rzucać i karta propozycji mówi to wprost. Statyści z profilem bojowym (16b)
   dochodzą w 20b razem z atakiem.

## Zakres

- [x] **Structured output w gatewayu** — `ChatRequest.json_schema` → `response_format`
      w llama-server; rozumowanie wymuszone na off przy gramatyce; testy pytest
- [x] **Schemat akcji bota** (`shared/bots/actions.ts`) — płaski, mały, enum akcji zamiast
      wariantów; lista umiejętności bota **wchodzi do enuma w schemacie**, więc nieistniejąca
      umiejętność jest niemożliwa już na poziomie gramatyki; walidacja i tak powtórzona w kodzie
- [x] **Tryby autonomii per bot** — `automat` / `propozycja` / `kontrolowany` w profilu
      (bez migracji, jak głos z etapu 12), przełącznik w edytorze i szybki w panelu sesji
- [x] **Wykrywanie prośby o akcję** (`shared/bots/requests.ts`) — wąski, testowany detektor
      polskich zwrotów; MG ma zawsze przycisk „Poproś o akcję" jako ścieżkę pewną
- [x] **Wykonanie rzutu istniejącą ścieżką** — `performCharacterRoll` wydzielone z
      `character:roll`; bot woła to samo, co gracz
- [x] **Karta propozycji na czacie** — nowy rodzaj wiadomości `proposal`, dostarczany
      wyłącznie MG i sterującemu graczowi; przyciski „Zatwierdź / Odrzuć", stan zapisany
      w wiadomości (`chat:update`), więc przeżywa restart
- [x] **Bezpieczniki** — whitelist akcji, tylko własna karta bota, jedna szansa poprawki po
      odrzuceniu przez walidację, potem pas
- [x] **Log decyzji** — pełny prompt i odpowiedź do pliku debug (strojenie będzie iteracyjne)

## Poza zakresem

- Wszystko, co dotyczy walki: stan taktyczny, „graj turę", atak, ruch, przeładowanie,
  ekonomia akcji — [etap 20b](etap-20b-tura-bota-w-walce.md)
- Bot inicjujący akcje sam z siebie (bez prośby) — poza planem
- Statyści bez karty postaci jako aktorzy rzutów — 20b

## Kryteria ukończenia

- MG pisze na czacie „Barman, rzuć na Percepcję": bot w trybie **propozycja** odpowiada kartą
  z uzasadnieniem i przyciskami; po „Zatwierdź" na czacie ląduje normalna karta rzutu z
  rozbiciem, po „Odrzuć" nie dzieje się nic
- Przełączenie bota na **automat** → następna prośba wykonuje się od razu, bez karty
- Tryb **kontrolowany** → bot odpowiada słowami, mechaniki nie rusza
- Bot z wymuszoną złą odpowiedzią modelu (nieistniejąca umiejętność, cudza karta postaci)
  **nie wykonuje akcji** — potwierdzone testem
- Z zatrzymanym gatewayem prośba o akcję wraca po polsku, a czat działa normalnie

## Wskazówki techniczne

- Gramatyka JSON w llama.cpp bywa kapryśna przy dużych schematach — schemat płaski i mały
- 9B lepiej wybiera z gotowych opcji („możliwe umiejętności: …") niż wymyśla identyfikatory
- Decyzję loguj w całości (prompt + odpowiedź) — strojenie będzie iteracyjne
