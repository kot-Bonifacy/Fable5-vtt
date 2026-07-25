# Etap 11 — Boty NPC na czacie 🏁 MVP z ankiety komplet

**Faza:** C — Boty MVP · **Wymaga etapów:** 10

## Cel sesji

Aktywne boty stają się uczestnikami czatu sesji: rozmawiają po polsku jako NPC i towarzysze, pamiętają bieżącą scenę, odpowiadają w limicie ~15 s.

## Zakres

- [x] Boty jako uczestnicy czatu: własne imię, portret i wyróżnienie wizualne wiadomości bota
      _(decyzja MG: wypowiedź bota wygląda identycznie jak kwestia NPC-a wpisana przez MG przez `/jako` — imię + portret, zero plakietki „bot"; diagnostykę widzi tylko MG)_
- [x] Wywoływanie: wzmianka `@imię` zawsze (także bez `@` i w odmianie: „Vexa", „Doktorze Kość"); dodatkowo tryb „w scenie" — bot przypięty do scenki podtrzymuje rozmowę, gdy ktoś odpowiada na jego ostatnią kwestię w ciągu 2 min
- [x] Kontekst rozmowy: historia czatu bieżącej scenki przycinana tokenizerem modelu (`POST /tokenize`), każda kwestia podpisana imieniem, szepty oznaczone „(szeptem)"
- [x] Wskaźnik „bot pisze…", streaming odpowiedzi do czatu (prowizoryczny bąbel), kolejka widoczna gdy kilku botów czeka
- [x] Szept do bota: `/w @imię` — prywatna rozmowa gracz↔bot (widoczna też dla MG)
- [x] MG mówi jako bot (override): komenda `/jako <imię> <treść>` oraz pole „Mów jako" w panelu „Boty"
- [x] Awaryjne „stop" MG: `bot:stop` przy wypowiedzi w czacie i przycisk „Przerwij wszystkie"
- [x] Strojenie jakości polszczyzny: iteracja nad promptami na 3 różnych profilach; wnioski w `ai-gateway/prompts/NOTES.md`

## Poza zakresem

- Pamięć między sesjami, RAG, relacje (etap 19); rzuty i ruch tokenów przez boty (etap 20); mowa botów — TTS (etap 12); STT/szept głosowy (etap 21)

## Kryteria ukończenia

- [x] **Test scenki:** rozmowa 6+ wymian z NPC-fixerem: bot trzyma styl i fakty podane w profilu, odpowiada naturalną polszczyzną, nie wypada z roli, pierwszy token odpowiedzi < 5 s, całość ≤ ~15 s _(pomiar: 7 wymian, pierwszy token 130–730 ms, całość 0,7–1,8 s)_
- [x] Dwa boty w scenie: odpowiada wywołany, nie obaj; kolejka działa
- [x] Szept do bota niewidoczny dla innych graczy; MG widzi
- [x] Gateway offline: wzmianka o bocie daje komunikat o niedostępności, czat działa dalej

## Wskazówki techniczne

- Wiadomości botów zapisuj w DB jak zwykłe wiadomości (autor = bot) — historia sceny jest jednocześnie pamięcią krótkoterminową bota
- Do budowy kontekstu licz tokeny realnie (tokenizer po stronie gatewaya), nie znakami
- Ogranicz max tokenów odpowiedzi (NPC mówi 1–4 zdania) — krótsze odpowiedzi to też szybsze odpowiedzi i lepszy klimat (a od etapu 12 również krótsza synteza mowy)
- Payload wiadomości bota zaprojektuj tak, by dało się do niego dołożyć `audioUrl` **po fakcie** — w etapie 12 audio dochodzi asynchronicznie i tekst nie czeka na dźwięk
