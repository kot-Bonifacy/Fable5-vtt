# Etap 36 — Makra i pasek własnych akcji

**Faza:** I — Wykończenie · **Wymaga etapów:** 06 (kości), 16f (pasek akcji i HUD),
32 (wezwanie do Testu) · **Lepiej po:** 34 (tabele losowe)

> **Pochodzenie:** przegląd z 02.09.2026 oraz wpis w `POMYSLY.md` z 31.07.2026 („sloty paska
> akcji przypisywane przez użytkownika, jak w Foundry"). W Foundry pasek makr 1–9 jest
> fundamentem pracy MG; tutaj pasek akcji generuje się wyłącznie z tego, co postać naprawdę
> potrafi, i nie da się na nim położyć niczego własnego.

## Cel sesji

Pasek z 16f odpowiada na pytanie „co ta postać może teraz zrobić" i **taki ma zostać** — to jego
wartość. Brakuje drugiego paska, odpowiadającego na pytanie „co ja robię co pięć minut": rzut
`/r 1k6` na losową drobnicę, wezwanie Percepcji na PT 15, kwestia barmana rzucana `/jako`,
losowanie z tabeli spotkań.

Etap dokłada **makro jako obiekt kampanii** i **własny pasek** obok paska akcji.

## Zakres

- [ ] Model `Macro` w Prismie: kampania, właściciel, nazwa, ikona, rodzaj, treść, widoczność
      (prywatne / dla stołu)
- [ ] Rodzaje makr: **tekst na czat** (w tym `/r`, `/w`, `/jako`), **rzut z karty**
      (Umiejętność albo Cecha z modyfikatorem), **wezwanie do Testu** z gotowymi parametrami
      (GM only), **losowanie z tabeli** (jeśli etap 34 zrobiony)
- [ ] `macro:upsert`, `macro:delete`, `macro:run` — z pełnym sprawdzeniem uprawnień po stronie
      serwera: makro **nie jest** obejściem roli, gracz nie wywoła nim `check:call`
- [ ] Pasek makr jako druga listwa (albo `Shift`+1..9), żeby nie odbierać klawiszy paskowi akcji
- [ ] Edytor makra w oknie z podglądem tego, co poleci na czat
- [ ] Makro typu „rzut z karty" **ładuje kubek** — to jest prawdziwy rzut i ma mieć gest;
      makro typu „tekst" i „tabela" kubka nie dotykają (umowa z etapu 34)
- [ ] Przeciąganie na pasek: makro z listy, a docelowo także wiersz kompendium
- [ ] Testy: makro z `/r` przechodzi tym samym `parseChatInput`, gracz nie uruchomi makra MG,
      makro rzutu na cudzą kartę wraca odmową

## Poza zakresem

- **Makra skryptowe** (kod w treści makra, jak Foundry) — dziura bezpieczeństwa i osobny świat
  problemów; makro jest **danymi**, nie kodem
- **Sekwencje makr** („zrób trzy rzeczy po kolei") — pierwsza wersja wykonuje jedną rzecz
- **Makra botów** — bot ma własną drogę przez `bot:act`
- **Zmiana zachowania paska akcji z 16f** — on zostaje dokładnie taki, jaki jest

## Kryteria ukończenia

- [ ] MG zakłada makro „Percepcja PT 15" i jednym klawiszem wystawia wezwanie wskazanej postaci
- [ ] Gracz zakłada makro `/r 1k6+2 obrażenia z pięści` i rzuca nim z paska
- [ ] Makro rzutu z karty ląduje w kubku i czeka na gest, jak każdy inny rzut
- [ ] Makro tekstowe **nie czyści** kubka ani nie zdmuchuje czekającego wezwania
- [ ] Gracz nie uruchomi makra typu „wezwanie do Testu" nawet po podrobieniu żądania

## Wskazówki techniczne

- **Serwer sprawdza uprawnienia przy wykonaniu, nie przy zapisie.** Makro jest tekstem w bazie;
  jedyne, co je odróżnia od wpisania tego samego w pole czatu, to wygoda — i tak ma zostać.
- **`hotbarSlotsFor` (CP RED) nie ma o makrach wiedzieć.** Pasek makr jest rdzeniem VTT i stoi
  obok, nie w środku — inaczej pierwszy inny system RPG dostanie w spadku cudzy pasek.
- **Ikony biorą się z `UiIcons`/`MapIcons`**, nie z uploadów — makro nie potrzebuje własnej
  biblioteki obrazków.
