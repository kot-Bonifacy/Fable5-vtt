# Prompty botów — gdzie mieszkają i co o nich wiemy

## Gdzie jest szablon

Jedynym źródłem prawdy jest **`packages/shared/src/bots/prompt.ts`** (funkcja `compileBotPrompt`),
a nie ten katalog. Powód: ten sam kod składa prompt na serwerze (żądanie do gatewaya) i u klienta
(podgląd w zakładce „Prompt" edytora bota) — MG widzi dokładnie to, co dostaje model.
Wersję szablonu trzyma stała `BOT_PROMPT_VERSION` (obecnie **2**); zmiana treści = podbicie wersji.

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

## Jak zbudowany jest prompt na czacie sesji (etap 11)

Doszły dwa elementy zależne od miejsca rozmowy (`BotPromptMode`):

```
system:  compileBotPrompt({ mode: 'chat' | 'whisper', scene, participants })
         → dodatkowo: „Miejsce sceny: …", zasada „odpowiadasz WYŁĄCZNIE na ostatnią
           wypowiedź skierowaną do Ciebie" oraz „wypowiedzi podpisane (szeptem)
           usłyszałeś na osobności — nie powtarzasz ich publicznie"
user/assistant: historia czatu SCENY (nie całej kampanii), każda kwestia z prefiksem
           „Imię: "; szepty z prefiksem „Imię (szeptem): "
kotwica: buildRoleAnchor({ mode, lastOwnLine }) → j.w. + „nie powtarzaj zwrotu „X""
```

Budżet kontekstu liczy **tokenizer modelu**: `POST /tokenize` w gatewayu (proxy do
`/tokenize` w llama-server) → `AiGateway.countTokens()`. Historia przycinana pętlą
„zmierz → utnij 30% najstarszych → zmierz" (maks. 4 przebiegi, potem twarde cięcie).
Gdy gateway nie odpowie, zostaje oszacowanie po znakach — bot i tak się odezwie.

## Pomiary z żywego modelu (etap 11, 2026-07-25, Qwythos-9B-v2 Q8_0)

Scenka: 7 wymian z fikserką na czacie sesji, 3 profile (fikserka / ripperdoc / korpo).

- **Czasy:** pierwszy token **130–730 ms**, cała wypowiedź **0,7–1,8 s** (kryterium etapu:
  < 5 s / ≤ 15 s — z dużym zapasem). Kolejka: drugi bot startuje po zwolnieniu slotu.
- **Rozróżnianie profili działa mocno:** ten sam bodziec dał slang fikserki, ciepłą
  gadaninę ripperdoca i pełne „zgodnie z procedurą" korpo-menedżerki. Wystarczają sekcja
  „Jak mówisz" oraz odzywki — nie trzeba few-shotów.
- **Sekrety trzymane:** na pytanie o zakazany fakt („kto zabił Sashę?") bot konsekwentnie
  odpowiadał „nie wiem" w roli.
- **Powtarzalność to główna słabość modelu 9B.** Bez przeciwdziałania recyklinguje
  sekcję „Czego chcesz" w każdej wypowiedzi („żeby spłacić własne długi") i kończy
  5 z 7 kwestii tą samą odzywką. Co pomogło, w kolejności skuteczności:
  1. **`repeatedCatchphrase` w kotwicy** — jeśli poprzednia własna wypowiedź zawierała
     odzywkę, kotwica wymienia ją z nazwy i zakazuje powtórki (odzywka spadła
     z ~5/7 do ~3/7 wypowiedzi, bez powtórzeń pod rząd);
  2. **żelazna zasada 7** („nie powtarzasz zwrotów, odzywek ani wątków; o celach
     mówisz, gdy rozmowa na to schodzi");
  3. **jawny limit odzywek** w sekcji „Jak mówisz" („dosłownie użyj najwyżej jednej").

  Reszta zostaje dla MG: mniej odzywek w profilu albo wniosek z korekty.

- **Długość:** widełki „dwa do pięciu zdań" model traktował jak cel i dopychał do limitu;
  po zmianie na „dwa do czterech zdań" kwestie są krótsze bez utraty treści.
- **`stop` z imionami nie ucina cytatów** — bot swobodnie mówi „Johnny" w środku zdania,
  bo sekwencją stop jest `"\nImię:"` (na początku linii). Potwierdzone na 30+ wypowiedziach.

### Dwie pułapki wykryte na żywym modelu (naprawione)

- **Etykieta własnego imienia w odmianie.** Model podpisał się „Doktorze Kość:" (wołacz),
  a `sanitizeBotReply` porównywał etykietę dosłownie — prefiks poszedł na czat. Teraz
  etykieta jest dopasowywana tą samą heurystyką odmiany co wzmianki (`isNameOf`).
- **Zwykłe zdanie z dwukropkiem ginęło.** „Krótko: nie wchodzę w to." było traktowane jak
  cudza kwestia i **cała odpowiedź** znikała (bot milczał). Teraz za etykietę mówiącego
  uchodzi tylko imię kogoś obecnego przy stole — i dlatego lista uczestników
  (`campaignParticipants`) obejmuje też inne boty.
