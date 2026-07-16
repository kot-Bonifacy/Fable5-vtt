# Etap 10 — Edytor botów

**Faza:** C — Boty MVP · **Wymaga etapów:** 09

## Cel sesji

Serce wizji z ankiety: edytor, w którym przed grą tworzysz boty (NPC / towarzysze / asystent MG), nadajesz im profile psychologiczne i kontekst wiedzy, zapisujesz i aktywujesz w sesji na różnych jej etapach.

## Zakres

- [ ] Model `BotProfile`: nazwa, typ (`npc` | `towarzysz` | `asystent_mg`), portret/token, profil psychologiczny (osobowość, motywacje i cele, sekrety, styl wypowiedzi, przykładowe odzywki), kontekst wiedzy (co bot wie o świecie, kampanii i graczach — pola tekstowe), parametry generacji (temperatura, max długość odpowiedzi), powiązana postać/karta (opcjonalnie — dla towarzyszy)
- [ ] Kompilator profilu → system prompt po polsku: szablon składający pola profilu w spójną instrukcję (osobowość, wiedza, zasady zachowania, „mów naturalną polszczyzną, krótko, w konwencji Cyberpunk RED")
- [ ] Podgląd wygenerowanego system promptu w edytorze + przycisk „rozmowa testowa" (czat z botem w edytorze, poza sesją)
- [ ] Biblioteka szablonów: 10–15 gotowych archetypów CP RED po polsku (fixer, solo-ochroniarz, bramkarz klubu, ripperdoc, cop, nomad, netrunner, barman, dzieciak ulicy, korpo…) w `data/public/bot-templates/`; „nowy bot z szablonu" kopiuje szablon do edycji
- [ ] Zarządzanie: lista botów kampanii, duplikowanie, archiwizacja; aktywacja/dezaktywacja botów w bieżącej sesji (aktywne pojawią się na czacie w etapie 11)
- [ ] Dostęp do edytora tylko dla MG

## Poza zakresem

- Udział botów w czacie sesji (etap 11), pamięć długoterminowa i RAG (etap 18), akcje mechaniczne (etap 19)

## Kryteria ukończenia

- Tworzysz bota z szablonu „fixer", edytujesz osobowość, w rozmowie testowej bot odpowiada po polsku zgodnie z profilem (inny profil ⇒ wyraźnie inny styl odpowiedzi)
- Bot zapisany raz jest dostępny na liście po restarcie aplikacji; aktywacja per sesja działa
- Rozmowa testowa z wyłączonym gatewayem pokazuje czytelny komunikat zamiast błędu

## Wskazówki techniczne

- Szablon system promptu trzymaj w jednym miejscu (plik w `ai-gateway/prompts/` lub w `shared`) i wersjonuj — będzie strojony wielokrotnie; testuj na modelu docelowym, nie „na sucho"
- 9B to mały model: prompt ma być konkretny i zwięzły, unikaj ścian tekstu; przykładowe odzywki w profilu bardzo poprawiają utrzymanie stylu
- Typ `asystent_mg` ustawia `reasoning: true` (bloki think) — pozostałe typy false, zgodnie z ankietą
