# Etap 03 — Rdzeń realtime i czat

**Faza:** A — Fundament · **Wymaga etapów:** 02

## Cel sesji

Wzorzec synchronizacji stanu, na którym stanie cała reszta VTT (server-authoritative + rooms + resync), oraz pierwszy realny moduł: czat z szeptami.

## Zakres

- [ ] Architektura zdarzeń: klient wysyła intencję → serwer waliduje (rola, uprawnienia) → mutuje stan → broadcast do pokoju; konwencja nazw `domena:czynnosc`
- [ ] Rooms Socket.IO: pokój kampanii + pokój sceny; dołączanie po uwierzytelnieniu
- [ ] Wersjonowanie stanu (licznik sekwencji per pokój) + pełny resync po reconnect (zdarzenie `state:sync`)
- [ ] Czat: wiadomości wspólne, zapis w DB, historia z paginacją (doładowanie przy scrollu)
- [ ] Szepty: `/w <imię> treść` — widzi tylko nadawca i adresat; filtrowanie po stronie serwera
- [ ] Parser komend czatu (rozszerzalny — `/r` dojdzie w etapie 06); nieznana komenda → podpowiedź
- [ ] Lista obecności (kto online, rola) w panelu bocznym
- [ ] Testy: filtrowanie szeptów, resync po symulowanym rozłączeniu

## Poza zakresem

- Rzuty kośćmi (etap 06), wiadomości botów (etap 11), formatowanie rich-text

## Kryteria ukończenia

- Dwie przeglądarki (MG + gracz w trybie incognito) widzą wiadomości na żywo; szept nie dociera do trzeciego uczestnika — również na poziomie payloadów sieciowych (sprawdzone w devtools)
- Po ubiciu i restarcie serwera klient sam się łączy i odtwarza historię czatu
- Lista obecności aktualizuje się przy wejściu/wyjściu

## Wskazówki techniczne

- To etap ustanawiający wzorce — poświęć czas na czysty moduł `realtime` (rejestr handlerów zdarzeń z deklaracją roli), bo każdy kolejny etap będzie go używał
- Nie buduj generycznego CRDT/state-sync frameworka — proste „intencja → mutacja → broadcast + pełny resync" wystarczy przy tej skali
- Timestampy z serwera, nie z klienta
