# Etap 18 — Pamięć botów: RAG, dziennik, relacje + asystent MG

**Faza:** F — Boty zaawansowane · **Wymaga etapów:** 11, 12

## Cel sesji

Pamięć długoterminowa botów zgodnie z ankietą: baza wiedzy kampanii z RAG, streszczenia sesji, relacje NPC↔gracze — oraz asystent MG odpowiadający na pytania o zasady z podręcznika.

## Zakres

- [ ] Gateway — moduł RAG: model embeddingów wielojęzyczny sprawdzony na polskim (bge-m3 albo multilingual-e5; przetestuj oba na 10 przykładowych zapytaniach o zasady i wybierz), wektorowa baza lokalna (sqlite-vec lub Chroma), endpointy `index` i `search`
- [ ] Kolekcje: (1) podręcznik CP RED — chunkowanie tekstu z etapu 12 z metadanymi (rozdział/sekcja), dane tylko lokalnie; (2) baza wiedzy kampanii — notatki MG, opisy miejsc/frakcji/NPC (edytor wpisów w UI); (3) streszczenia sesji
- [ ] Streszczenia sesji: przycisk MG „zakończ sesję" → LLM streszcza czat sesji (mapowanie-redukcja przy długich logach) → wpis w dzienniku kampanii (edytowalny przez MG) → indeksowany w RAG
- [ ] Relacje NPC↔postacie: struktura w DB (wartość sympatia/wrogość, notatka „skąd"), edycja ręczna przez MG + propozycja aktualizacji po streszczeniu sesji (MG zatwierdza); relacje wstrzykiwane do promptu bota, gdy rozmawia z daną postacią
- [ ] Kontekst botów rozszerzony: przy odpowiedzi bota gateway dokleja top-k wyników RAG z bazy kampanii i streszczeń (filtr: to, co bot może wiedzieć — sekcja „kontekst wiedzy" profilu wskazuje kolekcje/tagi)
- [ ] Asystent MG: bot typu `asystent_mg` z `reasoning: true`, pytania o zasady → RAG po podręczniku → odpowiedź z cytatem i wskazaniem sekcji; dostępny tylko dla MG (lub wg ustawień)
- [ ] Budżet promptu: RAG + historia + profil muszą mieścić się w kontekście i limicie ~15 s — ustal liczby (top-k, długości) pomiarem

## Poza zakresem

- Akcje mechaniczne botów (etap 19), automatyczna aktualizacja relacji bez zatwierdzenia MG, pamięć epizodyczna per bot ponad streszczenia (POMYSLY.md)

## Kryteria ukończenia

- Asystent MG poprawnie odpowiada po polsku na 5 testowych pytań o zasady (np. o ablację pancerza) ze wskazaniem sekcji podręcznika
- NPC zapytany o wydarzenie z poprzedniej (streszczonej) sesji odwołuje się do niego sensownie; NPC „wrogi" postaci mówi do niej inaczej niż „przyjazny" (relacje działają)
- Indeksowanie podręcznika odbywa się wyłącznie lokalnie; nic z treści nie trafia do repo

## Wskazówki techniczne

- Embeddingi i wektory żyją w gatewayu (Python) — serwer VTT tylko woła API; backup bazy wektorowej nie jest krytyczny (odtwarzalna z danych źródłowych)
- Chunkowanie podręcznika: sekcjami logicznymi (nagłówki), 300–600 tokenów z zakładką; tabele trzymaj w całości
- Bloki think asystenta: pokaż MG opcjonalnie (zwijane „rozumowanie"), nigdy graczom
