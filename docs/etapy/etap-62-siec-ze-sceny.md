# Etap 62 — Sieć ze sceny

**Faza:** przed betą (zlecenie MG z 28.10 spoza planu) · **Wymaga etapów:** 26a–26e (Sieć,
węzły i urządzenia), kamery przejęte w Sieci (20.10), ikony urządzeń na figurach (28.10)

## Skąd ten etap

MG (28.10): „w grze zauważyłem, że mimo tego, że gracz (netrunner na 1 poziomie z podstawowym
wyposażeniem) widział punkt dostępowy i mógł się z nim połączyć, to nie widział żadnych
elementów na danej scenie, np. kamer”. Dopytany: kamery stały na mapie **tylko jako figury**,
a MG „nie wie, jak mógł dopiąć kamery”.

Odczyt VPS (28.10, tylko odczyt): kampanie `mg_primo` nie mają ani jednej Architektury, oba
gniazda „restauracji Mariana” są niepodpięte (`architectureId` puste), tabela `NetRun` jest
pusta. Serwer odmawiał podłączenia do takiego gniazda („Nie ma tu punktu dostępu do Sieci.”),
a karta gniazda wyszarzała „Podłącz się”. Żeby kamera trafiła do Sieci, MG musiał przejść
cztery ukryte kroki: Architektura w bibliotece → piętro „Węzeł kontrolny” → urządzenie z figurą
z listy → Architektura na karcie gniazda.

## Decyzje MG z 28.10 (pytania na starcie)

1. **Figura z ikoną urządzenia sama trafia do Sieci.** Kamera, wieżyczka, dron, robot, czujnik
   i terminal — mina nie.
2. **Gniazdo bez Architektury składa prostą Sieć ze sceny:** piętro wejścia i węzeł kontrolny
   ze wszystkimi urządzeniami sceny, bez haseł i LOD-ów, PT z poziomu „Standardowy” (albo 8).
3. **Architektura MG z niepodpiętymi figurami na scenie:** dochodzą do pierwszego węzła.
4. **Lista urządzeń od razu po podłączeniu — nazwa i rodzaj.** Bez PW, PT, przycisków i miejsca
   na mapie; władzę i kadr daje dalej Kontrola węzła, szyb zostaje zakryty („?”).

## Rozstrzygnięcia bez pytań (do słowa MG)

- **Sieć ze sceny zostaje zapisana** jako zwykła Architektura „Sieć: <scena>” i gniazdo zostaje
  do niej podpięte na stałe — MG widzi ją w bibliotece i może przebudować. Nie składa się drugi
  raz.
- **Dopinanie dzieje się przy podłączeniu** (po wszystkich odmowach: zasięg, ściana, run w toku).
  Figura postawiona w trakcie runu dojdzie przy następnym podłączeniu.
- **Figura podpięta w innej Architekturze kampanii nie wchodzi drugi raz.** Żeby figura nie
  weszła do Sieci, MG zdejmuje jej ikonę albo podpina ją gdzie indziej — usunięcie urządzenia
  w edytorze nie wystarczy, przy następnym podłączeniu wróci.
- **Węzeł mieści 6 urządzeń** (`NET_DEVICES_PER_NODE_MAX`): nadmiar idzie do następnego węzła,
  a gdy wolnego nie ma — na dół trzonu staje nowy węzeł z PT pierwszego.
- **Rodzaj z ikony:** robot = dron (strzela), czujnik i terminal = system środowiskowy
  (przełącznik). Nazwa urządzenia = nazwa figury.
- **Nazwa na liście gracza** to nazwa stołu figury (#37); figura ukryta albo bez figury —
  sam rodzaj („Kamera”). Nazwa z edytora wychodzi dopiero z Kontrolą, jak dotąd.
- **„Martwe gniazdo” znika:** opcja na karcie gniazda nazywa się „— Sieć ze sceny —”, mapa nie
  rysuje już szarego gniazda, a MG widzi pod przyciskiem podpowiedź, co się stanie.

## Zakres

- [x] `shared`: `systems/cpred/netscene.ts` — `NET_DEVICE_KIND_BY_GLYPH`, `netSceneDevices`,
      `netSceneArchitecture`, `netAdoptSceneDevices`, `netWiredTokenIds`; `NetRunView.sightedDevices`
- [x] Serwer: `realtime/net-scene.ts` (`sceneNetArchitecture`) w `netrun:start`,
      `sightedDevicesOf` w `netrun-io.ts`
- [x] Klient: sekcja „Urządzenia w tej Sieci” w oknie runu, karta gniazda bez blokady
- [x] Testy: `netscene.test.ts` (shared), `net-scene.test.ts` (serwer), E2E
      `47-siec/t62-siec-sceny.spec.ts` (Ola w Firefoksie)

## Kryteria ukończenia

- [x] Netrunner podłącza się do gniazda bez Architektury i od razu widzi kamerę i wieżyczkę
      sceny (nazwa i rodzaj); mina i ludzie poza listą; nazwa ukrytej figury nie wycieka.
- [x] Po zjeździe i Kontroli węzła oba urządzenia mają przyciski, a kamera daje widok jej oczami.
- [x] Do Architektury MG niepodpięta figura dochodzi w pierwszym węźle; figura podpięta w innej
      Sieci — nie.
- [ ] MG ogląda to przy stole na VPS (wymaga wdrożenia ikon urządzeń z 28.10 i tego etapu).
