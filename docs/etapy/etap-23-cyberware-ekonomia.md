# Etap 23a — Cyborgizacje i człowieczeństwo

**Faza:** H — Świat CP RED · **Wymaga etapów:** 13 (kompendium i pipeline importu)

> **Podział (uzgodniony 09.08.2026):** pierwotny etap 23 obejmował naraz cztery niezależne
> podsystemy — cyborgizacje z człowieczeństwem, cyberpsychozę, ekonomię z lifestyle'em i
> reputację z Facedownem. Sam pierwszy wymaga rozszerzenia pipeline'u importu o dwa rozdziały
> podręcznika (~100 wpisów), nowego rodzaju wiersza na karcie i matematyki, która dotyka
> **każdego rzutu na EMP w grze**. Wydzielono:
> [23b — ekonomia, zakupy i lifestyle](etap-23b-ekonomia-lifestyle.md) oraz
> [23c — reputacja i Facedown](etap-23c-reputacja-facedown.md).
> Tutaj zostaje ciało edgerunnera; portfel i sława idą osobno.

## Cel sesji

Chrom kosztuje. Po tym etapie cyborgizacja instalowana z kompendium sama rzuca na Utratę
Człowieczeństwa, karta pokazuje spadek EMP wynikający z tej straty, a MG widzi, kto stoi na
granicy cyberpsychozy — bez liczenia czegokolwiek w pamięci.

## Zakres

- [x] **Pipeline i schemat kompendium** — cyborgizacje z podręcznika (rozdz. 7 i pełne listy
      z rozdz. 17): typ (8 rodzin), montaż (Galeria/Klinika/Szpital), UC stałe i kostkowe,
      gniazda modyfikacji (dawane i zajmowane), wymagana cyborgizacja podstawowa, cena
- [x] **Cyborgizacje na karcie** — sekcja zainstalowanego sprzętu z podziałem na rodziny,
      wiersz niosący własną kopię UC i kary do maksimum Człowieczeństwa
- [x] **Instalacja z kompendium** — serwer rzuca UC wg notacji z wpisu, karta rzutu ląduje na
      czacie, Człowieczeństwo spada, wiersz trafia na kartę jedną drogą (bez ręcznego dopisywania)
- [x] **EMP pochodne od Człowieczeństwa** — EMP na karcie zostaje wartością bazową, mechanika
      liczy EMP bieżące = ⌊Człowieczeństwo / 10⌋ i **to ono wchodzi do rzutów** (s. 229)
- [x] **Maksymalne Człowieczeństwo** — −2 za cyborgizację, −4 za borgizację, 0 za sprzęt bez UC
      (s. 230); usunięcie wszczepu zdejmuje karę
- [x] **Cyberpsychoza** — progi po EMP bieżącym (3+ / 2 / 1 / 0 / 0 przy ujemnym Człowieczeństwie),
      widoczne dla MG, ostrzeżenie na karcie
- [x] **Terapia** — MG przywraca 2k6 (zwykła) albo 4k6 (ekstremalna) straconego Człowieczeństwa,
      nigdy ponad maksimum
- [x] Testy: matematyka Człowieczeństwa i EMP, kary do maksimum, progi cyberpsychozy,
      instalacja i usunięcie, gniazda modyfikacji

## Poza zakresem

- **Eurodolce i zakupy** — instalacja pokazuje cenę, ale jej nie pobiera → 23b
- **Efekty mechaniczne poszczególnych cyborgizacji** (+2 do Inicjatywy z Kerenzikova, OB 11
  z pancerza podskórnego) — na start efekty opisowe i ręczne modyfikatory; automatyzację
  wybranych sztuk dopisz do POMYSLY.md
- Utrata Człowieczeństwa z urazów psychicznych (tabela s. 231) poza ręcznym wpisem MG
- Wymogi operacji (PT montażu, Medyk, „nie możesz sam sobie wszczepić") — proza w opisie wpisu

## Kryteria ukończenia

- [x] Instalacja cyborgizacji z kompendium: rzut UC na czacie, Człowieczeństwo spada na karcie
      zgodnie z notacją wpisu (test jednostkowy przelicznika)
- [x] Postać z EMP 6, która straciła 14 punktów Człowieczeństwa, rzuca na Perswazję z EMP 4 —
      i widać to w rozbiciu rzutu
- [x] Maksymalne Człowieczeństwo spada o 2 za każdy wszczep z niezerowym UC; usunięcie go podnosi
- [x] Karta postaci z EMP bieżącym 1 pokazuje ostrzeżenie o cyberpsychozie, a MG widzi je na liście
- [x] Terapia MG przywraca 2k6 Człowieczeństwa i nie przekracza maksimum

## Wskazówki techniczne

- **EMP jest pochodną Człowieczeństwa, ale maksimum Człowieczeństwa jest pochodną EMP** — pętla
  rozcina się tylko w jedną stronę: `stats.emp` to wartość **bazowa** (nietykana przez instalację),
  a EMP bieżące jest wyliczane. Nigdy nie zapisuj wyliczonego EMP z powrotem do `stats`.
- Człowieczeństwo **może zejść poniżej zera** (s. 232, „Ostra cyberpsychoza") — walidacja karty
  z etapu 07 tego nie dopuszczała, trzeba ją poluzować
- UC z podręcznika ma dwie postacie: stałą przy tworzeniu Postaci i kostkową w trakcie gry
  („7 (2k6)"), a część wpisów połowi wynik („2 (1k6/2, zaokrąglij w górę)") — schemat musi
  unieść obie
- Wiersz na karcie trzyma **własną kopię** UC i kary (wzorzec z 14c/15): edycja katalogu nie
  przepisuje wszczepu, który już siedzi w ciele
- **Licencja:** wpisy cyborgizacji to treść podręcznika → `data/private/`, nigdy do repo
