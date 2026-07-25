# Prompty botów — gdzie mieszkają i co o nich wiemy

## Gdzie jest szablon

Jedynym źródłem prawdy jest **`packages/shared/src/bots/prompt.ts`** (funkcja `compileBotPrompt`),
a nie ten katalog. Powód: ten sam kod składa prompt na serwerze (żądanie do gatewaya) i u klienta
(podgląd w zakładce „Prompt" edytora bota) — MG widzi dokładnie to, co dostaje model.
Wersję szablonu trzyma stała `BOT_PROMPT_VERSION` (obecnie **1**); zmiana treści = podbicie wersji.

Guardrails (sanityzacja odpowiedzi i detektor wypadnięcia z roli): `packages/shared/src/bots/guardrails.ts`.
Uruchamia je `packages/server/src/realtime/bot-chat.ts` (`runBotTurn`) — ten sam kod obsłuży czat sesji w etapie 11.

## Jak zbudowany jest prompt (etap 10)

```
system:  compileBotPrompt()   → kim jest, czego chce, jak mówi, co wie, sekrety, wnioski, żelazne zasady
user/assistant: historia rozmowy (wypowiedzi ludzi z prefiksem „Imię: ")
system:  buildRoleAnchor()    → krótkie przypomnienie roli + 2 najnowsze wnioski
```

Dlaczego kotwica na końcu: model 9B trzyma się znacznie lepiej tego, co przeczytał ostatnie —
przy dłuższej rozmowie sam system prompt przestaje wystarczać.

Dodatkowo w żądaniu jadą `stop` = `"\nImię:"` dla uczestników przy stole, żeby model nie dopisywał
kwestii graczy.

## Trzymanie roli — trzy warstwy

1. **Zasady w promptcie** — numerowane, krótkie („nigdy nie mówisz, że jesteś AI", „nie mówisz za
   inne postacie", „nie znasz zasad gry").
2. **Sanityzacja wyjścia** (`sanitizeBotReply`) — usuwa etykietę własnego imienia, didaskalia w
   gwiazdkach, całe linie w nawiasach, ucina dialog dopisany za innych, przycina długość.
3. **Detekcja + jedna automatyczna powtórka** (`detectBotBreak` → `buildRetryAnchor`) — gdy model
   przyzna się do bycia AI, wyjdzie poza grę, zacznie mówić o mechanice albo odpowie nie po polsku.
   Jeśli powtórka też wypadnie z roli, MG dostaje ostrzeżenie przy wypowiedzi i może jednym
   kliknięciem zamienić wpadkę we wniosek.

Detektor działa na **surowej** odpowiedzi (przed sanityzacją) — inaczej sprzątanie zamiatałoby
wpadki pod dywan i powtórka nigdy by się nie uruchomiła.

## Uwagi z sesji etapu 10 (2026-07-25)

- `\w` w JS **nie łapie polskich liter** — pierwsza wersja detektora przepuszczała „jestem sztuczną
  inteligencją" (wzorzec `sztuczn\w+`). Wszystkie wzorce mają teraz klasy `[\p{L}]` i flagę `u`.
- Wzorce „mechaniki" celowo są wąskie (`1d10`, `k10`, `DV 15`, „test umiejętności"), żeby nie łapać
  klimatycznych zdań w stylu „sektor D4". Fałszywy alarm kosztuje jedną powtórkę, nie wypowiedź.
- Asystent MG (`gm_assistant`) ma osobny zestaw zasad: wolno mu mówić o mechanice i sekretach,
  sprawdzamy tylko pustkę i język. Ma też twardą zasadę „nie zmyślasz zasad ani liczb" — to reakcja
  na pomiar z etapu 09 (model wymyślał nazwy testów i DV). Docelowo rozwiązuje to RAG w etapie 19.

## Do sprawdzenia w etapie 11

- Ile ostatnich wiadomości sceny mieści się w budżecie tokenów (licząc tokenizerem, nie znakami).
- Czy kotwica roli wystarcza przy 6+ wymianach z kilkoma botami w scenie.
- Czy `stop` z imionami graczy nie ucina wypowiedzi, w których bot cytuje kogoś po imieniu.
