# Etap 30 — Zdolności Specjalne dziewięciu Ról (rozdzielony)

**Faza:** H — Świat CP RED

> **Rozdzielony 2026-08-29 na 30a–30d.** Ten plik jest rozdrożem, nie zakresem do zrobienia.
> Zakres mieszka w czterech plikach niżej.

## Dlaczego rozdzielony

Dziewięć Zdolności to dziewięć **niezależnych** mechanik — sama tabela Wsparcia ma pięć
poziomów ze statblokami, a Twórca cztery Specjalizacje z jedenastoma skutkami Ulepszania.
Wskazówka techniczna pierwotnego etapu mówiła to wprost („To nie jest jedna sesja"), więc
podział zapadł przed pierwszą linijką kodu, a nie w jej trakcie.

Granice poszły po **maszynerii, nie po Rolach**: razem siedzą te Zdolności, które piszą się
tym samym kodem.

| etap                                   | Zdolności                                                      | co je łączy                                 |
| -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `etap-30a-zmysl-walki.md`              | **Zmysł Walki** (Solo) + szkielet dla reszty                   | jedyna Zdolność wchodząca w rachunek walki  |
| `etap-30b-medycyna-tworca.md`          | **Medycyna** (Medyk), **Twórca** (Technik)                     | Specjalizacje kupowane po dwie przy awansie |
| `etap-30c-wsparcie-praca-zespolowa.md` | **Wsparcie** (Stróż Prawa), **Praca Zespołowa** (Korpo)        | obie stawiają NPC ze statblokiem na mapie   |
| `etap-30d-charyzma-znajomosci-moto.md` | **Efekt Charyzmy**, **Znajomości**, **Moto**, **Wiarygodność** | tabela poziomów + jeden rzut + proza        |

**Interfejs** (Netrunner) nie ma tu swojego wiersza, bo jest zrobiony od etapu 26a
(`netrun.ts`, `netcombat.ts`) — to on jest wzorcem, którym idą pozostałe.

## Poprawione przy podziale (29.08.2026)

Pierwotny opis etapu miał trzy błędy, wszystkie sprawdzone w podręczniku i w
`data/public/cpred/roles.json`:

- **Zmysł Walki ma sześć zdolności, nie pięć** — brakowało „Wyjścia z opresji" (s. 146),
  jedynej, która dotyka silnika kości (ignorowanie Krytycznej porażki w Teście ataku)
- **Trzy Zdolności były przypisane do złych Ról** — jest: Media → **Wiarygodność** (s. 151),
  Korpo → **Praca Zespołowa** (s. 153), Stróż Prawa → **Wsparcie** (s. 158). W opisie stało
  „Wsparcie (Media)", „Wiarygodność (Lawman/Exec)" i „Praca Zespołowa (Netrunner)"
- **„Lawman/Exec wg podręcznika"** — polskie wydanie nazywa te Role Stróżem Prawa i Korpo,
  a `roles.json` używa tych nazw od etapu 13

## Kryterium wspólne (zostaje w mocy)

Każda z dziewięciu Zdolności ma mieć skutek w grze **albo jawnie zapisane**
w `decyzje-i-uproszczenia.md`, dlaczego zostaje prozą.
