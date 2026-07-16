# Etap 11 — Boty NPC na czacie 🏁 MVP z ankiety komplet

**Faza:** C — Boty MVP · **Wymaga etapów:** 10

## Cel sesji

Aktywne boty stają się uczestnikami czatu sesji: rozmawiają po polsku jako NPC i towarzysze, pamiętają bieżącą scenę, odpowiadają w limicie ~15 s.

## Zakres

- [ ] Boty jako uczestnicy czatu: własne imię, portret i wyróżnienie wizualne wiadomości bota
- [ ] Wywoływanie: wzmianka `@imię` zawsze; dodatkowo tryb „w scenie" — bot przypięty do sceny przez MG odpowiada, gdy wypowiedź jest skierowana do niego (heurystyka: wzmianka, odpowiedź na jego wiadomość, bezpośrednie pytanie — zacznij od wzmianek i odpowiedzi, nie przekombinuj)
- [ ] Kontekst rozmowy: historia czatu bieżącej sceny przycinana do okna kontekstu (budżet tokenów: system prompt + N ostatnich wiadomości), wyraźne oznaczanie kto mówi
- [ ] Wskaźnik „bot pisze…", streaming odpowiedzi do czatu, kolejka widoczna gdy kilku botów czeka
- [ ] Szept do bota: `/w @imię` — prywatna rozmowa gracz↔bot (widoczna też dla MG)
- [ ] MG mówi jako bot (override): wybór bota z listy i ręczne wpisanie kwestii w jego imieniu
- [ ] Awaryjne „stop" MG: przerwanie generowania odpowiedzi bota
- [ ] Strojenie jakości polszczyzny: iteracja nad promptami na 3 różnych profilach; spisz wnioski w `ai-gateway/prompts/NOTES.md`

## Poza zakresem

- Pamięć między sesjami, RAG, relacje (etap 18); rzuty i ruch tokenów przez boty (etap 19); STT/szept głosowy (etap 20)

## Kryteria ukończenia

- **Test scenki:** rozmowa 6+ wymian z NPC-fixerem: bot trzyma styl i fakty podane w profilu, odpowiada naturalną polszczyzną, nie wypada z roli, pierwszy token odpowiedzi < 5 s, całość ≤ ~15 s
- Dwa boty w scenie: odpowiada wywołany, nie obaj; kolejka działa
- Szept do bota niewidoczny dla innych graczy; MG widzi
- Gateway offline: wzmianka o bocie daje komunikat o niedostępności, czat działa dalej

## Wskazówki techniczne

- Wiadomości botów zapisuj w DB jak zwykłe wiadomości (autor = bot) — historia sceny jest jednocześnie pamięcią krótkoterminową bota
- Do budowy kontekstu licz tokeny realnie (tokenizer po stronie gatewaya), nie znakami
- Ogranicz max tokenów odpowiedzi (NPC mówi 1–4 zdania) — krótsze odpowiedzi to też szybsze odpowiedzi i lepszy klimat
