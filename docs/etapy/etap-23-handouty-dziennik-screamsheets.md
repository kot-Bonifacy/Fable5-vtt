# Etap 23 — Handouty, dziennik kampanii, screamsheets

**Faza:** H — Świat CP RED · **Wymaga etapów:** 11 (dla generatora LLM), 18 (dziennik korzysta ze streszczeń)

## Cel sesji

Narzędzia narracyjne MG: handouty dla graczy, przeglądowy dziennik kampanii i generator screamsheets (zajawek przygód w stylu nagłówków prasowych Night City).

## Zakres

- [ ] Handouty: MG tworzy handout (grafika z uploadu i/lub sformatowany tekst — markdown), udostępnia wszystkim lub wybranym graczom; u odbiorców popup/powiadomienie + stała zakładka „Handouty"; cofanie udostępnienia
- [ ] Dziennik kampanii UI: oś czasu wpisów — automatyczne streszczenia sesji (z etapu 18) + ręczne wpisy MG (markdown); edycja, wyszukiwanie pełnotekstowe; opcja „pokaż graczom" per wpis (domyślnie tylko MG)
- [ ] Screamsheets: generator zajawki — MG podaje temat/hasła → LLM generuje treść po polsku (nagłówek, lead, treść artykułu w konwencji brukowca Night City) → szablon graficzny screamsheet (HTML/CSS stylizowany na gazetę) → zapis i udostępnienie jak handout; edycja treści przed publikacją; działa też bez LLM (ręczne wypełnienie szablonu)
- [ ] Powiązania: wpis dziennika może linkować do handoutów i screamsheets
- [ ] Uprawnienia i filtrowanie serwerowe: gracz dostaje wyłącznie udostępnione mu materiały

## Poza zakresem

- Współdzielona edycja notatek przez graczy (POMYSLY.md), eksport dziennika do PDF, automatyczne screamsheets między sesjami

## Kryteria ukończenia

- MG udostępnia handout-grafikę dwóm z trzech graczy — wyskakuje tym dwóm, trzeci nie widzi go nawet w payloadach
- Dziennik pokazuje streszczenie ostatniej sesji; MG dopisuje wpis ręczny i oznacza go jako widoczny dla graczy
- Screamsheet wygenerowany z hasła „strzelanina w Kabuki" wygląda jak gazetowa zajawka po polsku i daje się udostępnić; przy wyłączonym gatewayu szablon działa ręcznie

## Wskazówki techniczne

- Szablon screamsheet zrób jako komponent HTML/CSS (druk gazetowy: wielki nagłówek, kolumny, stopka z datą Night City) — render do obrazka niepotrzebny, wystarczy widok
- Generacja LLM: `reasoning: false`, temperatura wyżej niż u NPC; screamsheet to dobre miejsce na kreatywność modelu
- Handouty to te same uploady co mapy — reużyj mechanizmu z etapu 04 z osobnym katalogiem
