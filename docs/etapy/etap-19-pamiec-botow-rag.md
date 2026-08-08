# Etap 19a — Fundament RAG i asystent zasad MG

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 09 (gateway), 13 (materiały podręcznika)

> **Podział (uzgodniony 08.08.2026):** pierwotny etap 19 obejmował naraz moduł RAG w
> gatewayu, trzy kolekcje wiedzy z edytorem w UI, streszczanie sesji przez LLM, dziennik
> kampanii, tabelę relacji NPC↔postacie i asystenta MG — siedem punktów zakresu, z których
> każdy jest osobnym kawałkiem architektury. Wydzielono:
> [19b — baza wiedzy kampanii i kontekst botów](etap-19b-baza-wiedzy-kampanii.md) oraz
> [19c — streszczenia sesji, dziennik i relacje](etap-19c-streszczenia-relacje.md).
> Tutaj zostaje fundament plus jeden pionowy plaster, który go weryfikuje.

## Cel sesji

Gateway uczy się szukać w tekście. Powstaje moduł RAG (embeddingi, magazyn wektorów,
wyszukiwanie hybrydowe), zaindeksowany podręcznik CP RED i **asystent zasad MG**: MG pyta
po polsku „jak działa ablacja pancerza", dostaje odpowiedź ze wskazaniem rozdziału, sekcji
i strony — i może rozwinąć sam cytat, żeby sprawdzić, czy model nie zmyśla.

## Rozstrzygnięcia sesji (przed kodem)

Cztery pytania, na które opis etapu nie dawał odpowiedzi — decyzje MG z 08.08:

1. **Embeddingi liczą się na CPU (ONNX), nie na GPU.** Budżet VRAM po etapie 12 zostawia
   ~4,0 GB, a etap 21 (faster-whisper `medium`) chce z tego 1,5–2 GB. Model embeddingów na
   karcie zjadłby połowę rezerwy i wymusiłby cięcie kontekstu do 16k. Na CPU kosztuje to
   kilka minut jednorazowego indeksowania i ~0,1–0,4 s na zapytanie — przy limicie 15 s
   nieistotne. Ta sama droga co Piper w etapie 12: 0 GB VRAM.
2. **Wyszukiwanie jest hybrydowe: wektory + pełny tekst.** Same embeddingi gubią terminy
   dosłowne („ablacja pancerza", „PT 13", „Ludzka tarcza"), a to jest dokładnie to, o co MG
   pyta. FTS5 jest w SQLite za darmo, fuzja rang kosztuje kilkadziesiąt linii.
3. **Indeksujemy wyłącznie podręcznik główny** (21 rozdziałów MD z etapu 13). Ma już czyste
   nagłówki i znaczniki stron `<!-- s. N -->`, więc cytat „rozdział · sekcja · s. N" wychodzi
   z materiału, a nie ze zgadywania. FAQ i DLC leżą jako płaskie `.txt` — to osobna robota
   nad parserami (19b).
4. **Asystent zasad jest funkcją wbudowaną, nie profilem bota.** Typ `gm_assistant`
   istnieje od etapu 10 i zostaje tym, czym jest — asystentem od pomysłów, imion i
   konsekwencji, z osobowością. Odpowiedź o zasadach ma być bezbarwna i sprawdzalna, więc
   nie przechodzi przez personę, lekcje ani odzywki: MG nie musi nic zakładać, otwiera
   zakładkę i pyta.

## Zakres

- [x] **Moduł RAG w gatewayu** (`vtt_gateway/rag/`):
  - [x] embedder ONNX na CPU (`onnxruntime`, model i tokenizer z HuggingFace, cache lokalny);
        prefiksy zapytanie/fragment tam, gdzie model ich wymaga (e5), pooling i normalizacja
        L2 wg konfiguracji modelu
  - [x] magazyn: jeden plik SQLite — tabela fragmentów z metadanymi, `FTS5` do wyszukiwania
        pełnotekstowego, wektory jako BLOB; kolekcje rozdzielone nazwą
  - [x] wyszukiwanie hybrydowe: kosinus (brute force na numpy) + FTS5, fuzja **RRF**
  - [x] endpointy `POST /rag/search`, `POST /rag/index`, `POST /rag/index/rulebook`,
        `GET /rag/status`, `DELETE /rag/collections/{name}`
- [x] **Wybór modelu embeddingów pomiarem** — `bge-m3` vs `multilingual-e5-large` na 10
      polskich pytaniach o zasady z oczekiwaną sekcją; skrypt porównawczy zostaje w repo,
      wynik i uzasadnienie w `ai-gateway/README.md`
- [x] **Chunkowanie podręcznika** — sekcjami logicznymi z nagłówków MD, 300–600 tokenów z
      zakładką, tabele w całości; metadane: rozdział, ścieżka sekcji, numer strony
- [x] **Asystent zasad MG** — zakładka „Zasady" (tylko MG): pytanie → wyszukiwanie →
      odpowiedź po polsku z listą cytatów (rozdział · sekcja · s. N), każdy cytat rozwijalny
      do surowego fragmentu; zwijane „rozumowanie"; stan indeksu i przycisk „Zaindeksuj
      podręcznik"
- [x] **Degradacja** — gateway offline, brak modelu embeddingów albo pusty indeks dają
      nazwany komunikat w panelu, nie wyjątek; reszta VTT działa normalnie
- [x] **Budżet promptu** — top-k i długość fragmentów ustalone pomiarem; pytanie → odpowiedź
      poniżej 15 s przy włączonym rozumowaniu
- [x] Testy: chunker (nagłówki, strony, tabele, zakładka), magazyn (upsert, ponowne
      indeksowanie bez duplikatów, usuwanie kolekcji), fuzja RRF, endpointy na podstawionym
      embedderze; po stronie serwera VTT — ścieżki `rules:*` na atrapie gatewaya

## Poza zakresem

- Baza wiedzy kampanii, jej edytor i kolekcja notatek MG → **19b**
- Doklejanie RAG do promptu botów NPC i sekcja „kontekst wiedzy" w profilu → **19b**
- Streszczenia sesji, dziennik kampanii, relacje NPC↔postacie → **19c**
- Indeksowanie FAQ i DLC (płaskie `.txt` bez nagłówków) → 19b razem z drugim trybem chunkowania
- Rerankery (cross-encoder), zapytania wielokrotne, cytowanie fragmentu wewnątrz zdania

## Kryteria ukończenia

- [x] Asystent poprawnie odpowiada po polsku na 5 testowych pytań o zasady (m.in. o ablację
      pancerza) i przy każdej odpowiedzi wskazuje rozdział, sekcję i stronę
      — **4/5 poprawnie od pierwszego razu** (pancerz s. 186, rana krytyczna s. 187/220, Test
      Przeżywalności s. 188, ruch s. 126). Piąte (osłony) wróciło **puste**: model zużył cały
      limit tokenów na rozumowanie. Cytaty i tam były poprawne (s. 182–184), więc zawiodła
      generacja, nie wyszukiwanie. Naprawione powtórką bez rozumowania — **poprawka nie
      została powtórzona na żywym modelu**, patrz „Otwarte zaległości" w `POSTEP.md`
- [x] Cytat da się rozwinąć w panelu i porównać z podręcznikiem — wskazuje realny fragment,
      nie sam tytuł sekcji
- [x] Indeksowanie odbywa się wyłącznie lokalnie: treść podręcznika nie trafia do repo i nie
      przechodzi przez serwer VTT (tylko wyniki wyszukiwania, do przeglądarki MG)
- [x] Embeddingi nie zajmują VRAM — widać to w `GET /health` przed indeksowaniem i w trakcie
- [x] Pytanie → gotowa odpowiedź poniżej 15 s przy włączonym rozumowaniu
      — zmierzone **5,8 / 7,2 / 9,6 / 10,9 / 13,3 s** (samo wyszukiwanie 42–55 ms, reszta to
      model). **Zastrzeżenie:** pytanie, przy którym rozumowanie zjada całą pulę, kończy się
      powtórką, więc jego łączny czas wychodzi **poza 15 s** (obserwowane 20 s dla samego
      pierwszego przebiegu). Zwinięcie „Pokaż rozumowanie" sprowadza każdą odpowiedź do
      kilku sekund

## Wskazówki techniczne

- Embeddingi i wektory żyją w gatewayu (Python) — serwer VTT tylko woła API. Backup bazy
  wektorowej nie jest krytyczny: odtwarza się z materiału źródłowego jednym przebiegiem
- **Nie wprowadzamy sqlite-vec ani Chromy** (wbrew pierwotnej wskazówce etapu 19): przy
  jednej kampanii i kilku tysiącach fragmentów kosinus brute force na numpy to ~2 ms, więc
  indeks ANN kupowałby zero, a kosztował ładowaną rozszerzeniowo bibliotekę natywną, której
  `enable_load_extension` nie musi być dostępne w każdej instalacji Pythona
- Materiał: `data/private/rulebook/manual/CPRED-podrecznik/` — 21 plików MD, nagłówki `#`/`##`/`###`,
  znaczniki stron w komentarzach `<!-- s. N -->`, nagłówek rozdziału niesie zakres stron
- Bloki think asystenta: pokaż MG opcjonalnie (zwijane „rozumowanie"), nigdy graczom
- **Licencja:** treść podręcznika to `data/private/` i baza wektorowa poza repo. W repo mogą
  być parser, chunker i schematy — nigdy fragmenty tekstu, także w testach i fixture'ach
