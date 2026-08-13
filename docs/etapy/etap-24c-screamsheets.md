# Etap 24c — Screamsheets

**Faza:** H — Świat CP RED · **Wymaga etapów:** 24a (handouty — publikacja i udostępnianie), 11 (boty na LLM)

> **Pochodzenie:** wydzielony z etapu 24 dnia 09.08.2026 (decyzja MG). Trzecia z trzech części.
> Screamsheet jest handoutem w gazetowym przebraniu, więc cała droga „zapisz i udostępnij"
> pochodzi z 24a — tutaj dochodzi generator treści i szablon graficzny.

## Cel sesji

Zajawka przygody w stylu brukowca Night City: MG podaje hasło („strzelanina w Kabuki"), model
pisze nagłówek, lead i treść po polsku, a szablon HTML/CSS podaje to jako wycinek z gazety.

## Zakres

- [x] **Generator LLM**: MG podaje temat/hasła → gateway zwraca nagłówek, lead i treść artykułu
      w konwencji brukowca; `reasoning: false`, temperatura wyżej niż u NPC
- [x] **Edycja przed publikacją** — wygenerowana treść ląduje w formularzu, nie od razu u graczy
- [x] **Szablon graficzny**: komponent HTML/CSS stylizowany na druk gazetowy (wielki nagłówek,
      kolumny, stopka z datą Night City)
- [x] **Zapis i udostępnienie jak handout** — screamsheet jest rodzajem handoutu z 24a, nie
      drugim bytem z własną listą odbiorców
- [x] **Działa bez LLM**: przy wyłączonym gatewayu MG wypełnia szablon ręcznie (degradacja
      wymagana przez CLAUDE.md)
- [x] Testy: parsowanie odpowiedzi modelu, degradacja z martwym gatewayem

## Poza zakresem

- Render screamsheetu do obrazka/PDF (wystarczy widok)
- Automatyczne screamsheets między sesjami

## Kryteria ukończenia

- Screamsheet wygenerowany z hasła „strzelanina w Kabuki" wygląda jak gazetowa zajawka po polsku
  i daje się udostępnić graczom tak samo jak handout
- Przy zatrzymanym gatewayu formularz działa ręcznie i mówi po polsku, dlaczego generator jest
  niedostępny

## Wskazówki techniczne

- Screamsheet to dobre miejsce na kreatywność modelu — inaczej niż asystent zasad z 19a
- Nie buduj drugiej listy udostępnień: `kind: 'screamsheet'` na handoucie z 24a wystarczy,
  jeśli tamten model przewidział pole rodzaju
