# Etap 14 — Obrażenia, pancerz, krytyki, Death Save

**Faza:** D — Walka · **Wymaga etapów:** 12, 13

## Cel sesji

Automatyczne rozliczanie obrażeń wg zasad CP RED: SP pancerza i ablacja, lokacje trafień, rany krytyczne z tabeli, stan śmiertelny i Death Save.

## Zakres

- [ ] Silnik obrażeń w `shared/systems/cpred` (czyste funkcje + testy): wejście (rzut obrażeń, lokacja, SP celu, modyfikatory) → wyjście (obrażenia po pancerzu, ablacja, flagi krytyka/śmierci) — dokładne reguły wg podręcznika (mnożnik trafienia w głowę, ablacja SP przy przebiciu itd.)
- [ ] Pancerz na karcie: założony pancerz (głowa/korpus) z bieżącym SP; ablacja automatycznie obniża SP, naprawa ręcznie
- [ ] Przepływ w UI: rzut obrażeń z karty/broni → karta wyniku na czacie z przyciskiem „zastosuj na celu" (wybrany token) → serwer liczy, aktualizuje HP i SP, loguje wynik na czacie („Przebicie: 7 obrażeń, SP korpusu 11→10")
- [ ] Progi stanu: poważnie ranny (≤ połowa HP) — automatyczny status i kary do rzutów (spięte z etapem 08); stan śmiertelny (HP 0) — status, kary, początek Death Save'ów
- [ ] Rany krytyczne: import tabeli ran krytycznych (dane z etapu 12), przy ≥2 szóstkach na kościach obrażeń — automatyczne losowanie/wybór rany, efekt jako status z opisem, dodatkowe obrażenia wg zasad
- [ ] Death Save: przycisk na karcie/trackerze, rzut wg zasad (próg BODY, narastająca kara za kolejne), wynik na czacie, MG oznacza stabilizację/śmierć
- [ ] Testy jednostkowe całej matematyki (pancerz, ablacja, głowa, progi, kary Death Save)

## Poza zakresem

- DV wg odległości i autofire (etap 15), leczenie/stabilizacja jako pełna mechanika (ręcznie przez MG; First Aid ewentualnie do POMYSLY.md)

## Kryteria ukończenia

- Scenariusz zautomatyzowany end-to-end: strzał → rzut obrażeń → „zastosuj" → SP ablatuje, HP spada, przy dwóch 6 pojawia się rana krytyczna ze statusem, zejście do 0 HP włącza Death Save — całość zalogowana czytelnie na czacie
- Kary poważnej rany i stanu śmiertelnego wliczają się w kolejne rzuty postaci
- Testy silnika obrażeń pokrywają przypadki brzegowe (SP > obrażenia, dokładna równość, głowa, brak pancerza)

## Wskazówki techniczne

- Wszystkie liczby i teksty reguł pobieraj z danych (etap 12), nie hardkoduj — w publicznym repo zostają tylko wzory
- „Zastosuj na celu" musi być odwracalne — przycisk „cofnij" na wpisie czatu (MG) oszczędzi wiele frustracji przy pomyłkach
