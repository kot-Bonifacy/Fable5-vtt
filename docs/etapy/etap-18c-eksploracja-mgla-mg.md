# Etap 18c — Pamięć eksploracji i ręczna mgła nad widocznością

**Faza:** E — Widoczność · **Wymaga etapów:** 18a, 18b

> Wydzielone z etapu 18b (decyzja z 30.07.2026): pierwotny 18b mieścił światła,
> eksplorację, nadpisanie mgły i mechanikę drzwi — za dużo na jedną sesję.

## Cel sesji

Mapa raz zobaczona zostaje na planie — bez tokenów, które z niej wyszły — a MG
może ręcznie zakryć albo odsłonić dowolny fragment mimo ścian i świateł.

## Zakres

- [x] Tryb „eksploracja" (przełącznik sceny, działa w trybie `dynamic`): obszar
      raz zobaczony zostaje odsłonięty — **sama mapa, bez tokenów** — a aktualne
      pole widzenia pokazuje się jaśniej
- [x] Stan eksploracji trwały per scena; przycisk MG „zapomnij eksplorację"
- [x] Zapisywana jest **widoczność faktyczna**: w ciemnej scenie zapamiętuje się
      tylko to, co było oświetlone (zasięg latarki), nie cały korytarz
- [x] Ręczna mgła z 17a jako **nadpisanie MG** nad dynamiczną widocznością:
      pociągnięcie „zakryj" trzyma obszar czarny mimo ścian i świateł,
      pociągnięcie „odsłoń" pokazuje go mimo braku linii wzroku
- [x] Nadpisanie działa też na filtrowanie tokenów po stronie serwera (zakryte
      ręcznie = token nie trafia do payloadu)

## Poza zakresem

- Otwieranie drzwi z dystansu, zamki, zaglądanie przez okna — **etap 18d**
- Eksploracja osobna per gracz (decyzja: wspólna dla drużyny, patrz niżej)

## Kryteria ukończenia

- [x] Obszar odwiedzony pozostaje odsłonięty (mapa), ale NPC znika z niego, gdy
      token gracza wyjdzie — i nie ma go w payloadzie
- [x] Eksploracja przeżywa przeładowanie strony i restart serwera
- [x] W ciemnej scenie przejście korytarzem z latarką zapamiętuje pas o
      szerokości latarki, a nie cały korytarz
- [x] „Zakryj" pędzlem MG chowa graczowi oświetlony, widoczny fragment mapy;
      „odsłoń" pokazuje fragment za ścianą

## Wskazówki techniczne

- Pierwotna wskazówka etapu 18 brzmiała „lista kształtów, nie bitmapa" (jak mgła
  z 17a). **Rozważ odstępstwo:** zapis „widoczności faktycznej" to przecięcie
  wielokąta widzenia z wielokątami świateł o innych środkach, czego lista
  kształtów nie wyraża bez klipowania wielokątów. Siatka komórek (pół kratki)
  zamienia to na test punktu, ma stały rozmiar i jest idempotentna
- Wygładzenie krawędzi: małą teksturę komórek skaluj liniowo do rozmiaru scen,
  zamiast rysować tysiące prostokątów
- Kolejność kompozycji jest już opisana w `MapRenderer`: rysunki → tokeny →
  światło → mgła/ciemność → nakładka UI

## Co doszło poza pierwotnym zakresem (decyzje MG w trakcie sesji)

- **„Zapal pomieszczenie"** — `light:create`/`light:update` z `fitRoom`: serwer mierzy
  pokój raycastem (drzwi traktowane jak zamknięte) i dobiera promienie lampy.
  Powód: stawianie lamp po jednej z ręcznym wpisywaniem zasięgu to ta część
  przygotowań, którą MG przestaje robić — a nieużywana ciemność jest bezużyteczna
- **Poświata przycinana ścianami u MG** — gracz ma płachtę ciemności, która
  przycina wyciek za róg; MG nie ma nic, więc lampa w zamkniętym pokoju wylewała
  kolor przez ściany. MG ma ściany lokalnie, więc klip liczy ten sam raycast
- **Okno tłumi światło** (`LIGHT_WINDOW_COST`) — okno przepuszcza światło (bo nie
  jest w zbiorze blokerów), ale za szybą lampa zużywa resztę zasięgu dwa razy
  szybciej. Domknięcie tematu okien należy do 18d; tutaj wszedł tylko ich wpływ
  na światło
- **Wygładzenie gradientu światła** — maska ma trzy poziomy, więc samo skalowanie
  zostawiało dwa widoczne pierścienie wokół każdej lampy. Nadpróbkowanie ×6 plus
  rozmycie zamienia je w jedną rampę; format na drucie bez zmian
