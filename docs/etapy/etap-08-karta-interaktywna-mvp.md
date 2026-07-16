# Etap 08 — Karta interaktywna i integracja 🏁 Grywalny stół

**Faza:** B — Stół MVP · **Wymaga etapów:** 05, 06, 07

## Cel sesji

Spięcie stołu w całość: klik w umiejętność wykonuje rzut z modyfikatorami, token jest powiązany z kartą, HP płynie między nimi. Po tym etapie da się rozegrać prostą scenę.

## Zakres

- [ ] Klik w umiejętność/statystykę na karcie → rzut `1d10 + STAT + umiejętność` przez silnik z etapu 06, wynik na czacie z opisem („Rebeka: Percepcja (INT) = 17")
- [ ] Okno rzutu przed wykonaniem: modyfikator sytuacyjny ad hoc, rzut publiczny/prywatny; zapamiętywanie ostatniego wyboru
- [ ] Automatyczne modyfikatory stanu: poważnie ranny (kary wg zasad CP RED) doliczane i pokazywane w rozbiciu rzutu
- [ ] Punkty szczęścia (LUCK): pula na karcie, wydawanie punktów przy rzucie (dodawane do wyniku), odnawianie puli przyciskiem MG/sesyjnie
- [ ] Powiązanie token ↔ karta: token wskazuje postać; pasek HP tokenu czyta z karty; zmiana HP na karcie/tokenie aktualizuje oba
- [ ] Dwuklik na tokenie otwiera kartę (z uprawnieniami: gracz — swoją; MG — każdą; cudzy token gracza → podgląd ograniczony lub brak)
- [ ] Szybka zmiana HP z tokenu (+/-) dla MG
- [ ] Przegląd całości i naprawa najgrubszych zgrzytów UX zgłoszonych podczas testu (patrz kryteria)

## Poza zakresem

- Automatyczne aplikowanie obrażeń z rzutów (etap 14), inicjatywa (etap 13), zasięgi (etap 15)

## Kryteria ukończenia

- **Test grywalności:** rozegraj z drugą przeglądarką mini-scenę: 2 postacie z kartami i tokenami na mapie, kilka testów umiejętności z modyfikatorami, wydanie LUCK, obrażenia wpisane ręcznie widoczne na pasku HP tokenu — bez zaglądania do konsoli i bez restartów
- Kary od ran widoczne w rozbiciu wyniku rzutu
- Rzut z karty gracza jest niemożliwy dla cudzej postaci (serwer odrzuca)

## Wskazówki techniczne

- Opis rzutu (etykieta umiejętności, składniki) buduj w `shared/systems/cpred` — boty w etapie 19 użyją dokładnie tej samej funkcji
- To etap milowy — zostaw godzinę na świadome „pogranie" i notatki do POMYSLY.md zamiast dociskania nowych funkcji
