# Etap 04 — Mapa i sceny

**Faza:** B — Stół MVP · **Wymaga etapów:** 03

## Cel sesji

Renderer mapy w Pixi.js: MG wgrywa grafikę mapy, konfiguruje siatkę, aktywuje scenę — gracze widzą to samo.

## Zakres

- [ ] Integracja Pixi.js v8 z Reactem: komponent canvas zarządzający własnym cyklem życia, dane sceny z zustand
- [ ] Viewport: pan (przeciąganie/środkowy przycisk), zoom do kursora (scroll), granice sceny
- [ ] Model `Scene` w Prisma: nazwa, obraz tła, wymiary, konfiguracja siatki (rozmiar kratki w px i w metrach, offset X/Y, kolor, widoczność), tryb `grid|gridless`, flaga aktywności
- [ ] Upload obrazu tła (`@fastify/multipart` → `uploads/`), serwowanie statyczne, walidacja typu/rozmiaru
- [ ] Warstwa siatki rysowana w Pixi (Graphics) zgodnie z konfiguracją; tryb bez siatki ją wyłącza
- [ ] Zarządzanie scenami: lista scen MG, tworzenie/edycja/usuwanie, aktywacja (gracze automatycznie przełączani na aktywną scenę — zdarzenie `scene:activate`)
- [ ] Skala sceny: kratka = X metrów (domyślnie 2 m jak w CP RED) — fundament pod linijkę i DV w etapie 15

## Poza zakresem

- Tokeny (etap 05), fog of war i rysowanie (etap 16), oświetlenie (etap 17)

## Kryteria ukończenia

- MG wgrywa mapę, dopasowuje siatkę suwakami/inputami na żywo, zapisuje scenę
- Aktywacja sceny natychmiast przełącza widok u wszystkich graczy
- Pan/zoom płynne (60 fps) na mapie 4096×4096; stan viewportu nie resetuje się przy zdarzeniach czatu

## Wskazówki techniczne

- `pixi-viewport` oszczędza dużo pracy przy pan/zoom — sprawdź kompatybilność z Pixi v8, w razie problemów własna implementacja jest prosta (transform kontenera)
- Od razu ustal porządek warstw (kontenerów Pixi): tło → siatka → [rysunki] → [tokeny] → [oświetlenie] → [fog] → [UI/overlay] — kolejne etapy tylko dokładają kontenery
- Duże obrazy: wczytuj przez `Assets.load`, pokaż spinner; nie skaluj w dół po stronie klienta bez potrzeby
