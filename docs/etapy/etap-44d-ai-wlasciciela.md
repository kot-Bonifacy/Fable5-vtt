# Etap 44d — AI właściciela: prośba, zgoda, obecność, dzierżawa

**Faza:** przed betą · **Wymaga etapów:** 44c · Decyzje i kontekst: `etap-44-konta-mg.md`
(decyzje 9–11)

## Zakres

- [ ] **Model:** prośba o AI per konto MG (`requested`, `granted`, `rejected`, `revoked` i daty).
      Przełącznik „Udostępniam AI” i dzierżawa AI żyją **w pamięci serwera**, nie w bazie: restart
      i każde nowe wejście właściciela zaczynają od „wyłączony”.
- [ ] **MG bez własnego AI:** w panelu MG „Poproś o dostęp do AI właściciela” i stan prośby.
      Odnośnik do paczki instalacyjnej dopiero, gdy paczka powstanie (poza etapem).
- [ ] **Właściciel widzi prośby z każdego swojego konta**, także z konta gracza w cudzej
      kampanii: powiadomienie plus panel właściciela z „Zatwierdź”, „Odrzuć” i „Cofnij”. W panelu
      jest też przełącznik „Udostępniam AI”, „Przejmij AI” i informacja, która sesja trzyma AI.
      **Prośby nie dostaje nikt poza kontami właściciela** (kanarek w podsłuchu).
- [ ] **Prawo kampanii do AI** ma kampania właściciela albo kampania MG, który spełnia trzy
      warunki naraz: ma zgodę, przełącznik jest włączony, a właściciel jest obecny. Obecny znaczy:
      co najmniej jedno gniazdo konta z flagą. Po zniknięciu ostatniego przełącznik wyłącza się sam
      po 2 min.
- [ ] **Dzierżawa:** AI trzyma jedna trwająca sesja naraz, pierwsza uprawniona. Koniec sesji albo
      utrata prawa przekazuje AI drugiej uprawnionej, jeśli taka trwa. „Przejmij AI” właściciela
      odbiera AI bez cofania zgody.
- [ ] **Jedna brama przed gatewayem:** każde żądanie AI (rozmowa bota, tura bota, autonomia,
      streszczenie, screamsheet, asystent zasad, baza wiedzy, reindeks RAG) przechodzi przez
      sprawdzenie dzierżawy kampanii. Bez dzierżawy żądanie nie wychodzi i dostaje
      `AI_UNAVAILABLE` z powodem.
- [ ] **Status AI per kampania:** `ai:status` z powodem (offline, zajęte przez inną sesję, brak
      zgody, właściciel nieobecny). MG widzi powód, gracz tylko „boty niedostępne”.
- [ ] **Odebranie AI w trakcie tury bota albo strumienia** kończy się tak jak pad gatewaya
      w T5b: tura wraca do MG, a stół gra dalej.
- [ ] **RAG:** kolekcje pamięci i bazy wiedzy są per kampania. Sprawdzić i dopisać test, że
      zapytanie jednej kampanii nie czyta cudzej kolekcji. Podręcznik jest wspólny.
- [ ] **Testy serwera:** prawo do AI (wszystkie kombinacje warunków), karencja 2 min, dzierżawa
      i jej przekazanie, „Przejmij”, cofnięcie bez restartu, licznik żądań na atrapie gatewaya
      (`packages/e2e/fixtures/fake-gateway.ts` albo jej odpowiednik w testach serwera).

## Poza zakresem

Paczka instalacyjna AI dla innych MG i gateway innego MG (zaległości, poz. 3). Kanał VPS↔PC
(Tailscale) to etap 28.

## Kryteria ukończenia

- Bez zgody, bez przełącznika albo bez obecności właściciela boty MG-B są niedostępne, a do
  gatewaya nie wychodzi z kampanii MG-B ani jedno żądanie (licznik na atrapie, log gatewaya).
- Zgoda, przełącznik i obecność właściciela sprawiają, że boty MG-B odpowiadają. Zamknięcie
  ostatniej karty właściciela wyłącza je po 2 min.
- Gdy AI trzyma sesja MG-A, MG-B widzi „AI zajęte przez inną sesję” i gra dalej. „Przejmij”
  i cofnięcie działają bez restartu.
- Testy (z gatewayem w `uv run pytest`, jeśli zmienił się gateway), lint, `tsc` czyste. Pełny
  `pnpm test:e2e` zielony, w tym `@llm`.
- Oględziny w Firefoksie: prośba, panel właściciela, komunikaty statusu AI u MG-B.
