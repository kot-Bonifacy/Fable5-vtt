# Etap 02 — Baza danych, użytkownicy, role

**Faza:** A — Fundament · **Wymaga etapów:** 01

## Cel sesji

Trwała warstwa danych (SQLite + Prisma) oraz logowanie zgodne z ankietą: MG hasłem, gracze linkiem zaproszenia. Role MG/Gracz egzekwowane na serwerze.

## Zakres

- [ ] Prisma + SQLite, pierwsza migracja; plik bazy poza repo
- [ ] Modele: `User` (nazwa, rola MG|GRACZ, hash hasła opcjonalny), `Campaign`, `Invitation` (token, wygaśnięcie, przypisanie do kampanii), szkielety `Character` i `Scene` (rozwijane w etapach 04 i 07)
- [ ] Auth: logowanie MG hasłem (bcrypt/argon2), wejście gracza przez link `/join/<token>` z wyborem/utworzeniem imienia; sesja w podpisanym cookie httpOnly
- [ ] Middleware ról: endpointy i zdarzenia socketowe deklarują wymaganą rolę; Socket.IO uwierzytelniany tym samym cookie przy handshake'u
- [ ] Minimalny panel MG: utworzenie kampanii, generowanie/unieważnianie linków zaproszeń, lista graczy
- [ ] Ekran logowania po polsku (proste, czytelne — szlif wizualny w etapie 26)
- [ ] Testy dymne: logowanie, dołączenie z linku, odrzucenie akcji MG wykonanej przez gracza

## Poza zakresem

- Odzyskiwanie haseł, e-maile, 2FA — prywatna platforma dla znajomych
- Wielu MG, uprawnienia szczegółowe (wystarczą 2 role z ankiety)

## Kryteria ukończenia

- MG loguje się hasłem i tworzy kampanię; gracz wchodzi świeżym linkiem, nadaje sobie imię i ląduje w kampanii
- Zaproszenie da się unieważnić — stary link przestaje działać
- Gracz próbujący wywołać akcję MG (HTTP i socket) dostaje odmowę — potwierdzone testem

## Wskazówki techniczne

- Jedna aktywna sesja/kampania naraz (ankieta) — model `Campaign` może mieć flagę `active`; nie buduj przełączania wielu kampanii w UI, tylko zostaw miejsce w schemacie
- Cookie: `@fastify/cookie` + `@fastify/session` lub podpisany token — wybierz prostsze; HTTPS wymusi się w etapie 27
- Wszystkie identyfikatory jako cuid/uuid (łatwiejszy późniejszy eksport/backup)
