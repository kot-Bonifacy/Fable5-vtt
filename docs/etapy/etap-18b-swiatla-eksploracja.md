# Etap 18b — Źródła światła i eksploracja

**Faza:** E — Widoczność · **Wymaga etapów:** 18a

> Wydzielone z pierwotnego etapu 18 (decyzja z 29.07.2026). Etap 18a dostarczył ściany,
> drzwi i pole widzenia tokenów — ten etap dokłada światło i pamięć tego, co już zobaczono.

## Cel sesji

Ciemność jako element gry: token widzi tylko tam, gdzie coś świeci, a mapa raz zobaczona
zostaje na planie — bez tokenów, które z niej wyszły.

## Zakres

- [ ] Scena „ciemna": przełącznik oświetlenia sceny; w ciemnej scenie widać wyłącznie
      obszary oświetlone **i** w polu widzenia tokenu
- [ ] Źródła światła jako obiekty na mapie (MG): zasięg jasny/przyćmiony, kolor,
      opcjonalne migotanie; edycja i usuwanie
- [ ] Światło przypięte do tokenu (latarka): zasięg i kolor na tokenie, wędruje z nim
- [ ] Tryb „eksploracja": obszar raz zobaczony zostaje odsłonięty (sama mapa, bez tokenów),
      aktualne pole widzenia pokazuje się jaśniej; stan eksploracji trwały per scena
- [ ] Ręczna mgła z 17a jako **nadpisanie MG** nad dynamiczną widocznością (zakryj/odsłoń
      ręcznie mimo ścian) — to, czego świadomie nie zrobiono w 18a
- [ ] Renderowanie w Pixi: kompozycja światła i widoczności; cel 60 fps przy ~50 segmentach
      ścian i ~10 światłach — z pomiarem, nie „na oko"
- [ ] Filtrowanie serwerowe rozszerzone o światło: token w nieoświetlonym miejscu nie trafia
      do payloadu gracza, nawet jeśli leży w polu widzenia

## Poza zakresem

- Widzenie w ciemności jako cecha postaci (cyberoko — etap 23), osłony w walce ze ścian,
  pola widzenia stożkowe, elewacja/piętra

## Kryteria ukończenia

- [ ] Scenariusz z etapu 18: ciemny korytarz, zamknięte drzwi, NPC w pokoju za nimi —
      gracz nie widzi NPC (również w payloadach); otwarcie drzwi **i latarka** odsłaniają
      pokój i NPC
- [ ] Obszar odwiedzony pozostaje odsłonięty (mapa), ale NPC znika z niego, gdy token
      gracza wyjdzie
- [ ] 60 fps przy ruchu tokenu ze światłem na mapie testowej; brak zauważalnego laga syncu

## Wskazówki techniczne

- Światło i widzenie to ta sama geometria: wielokąt z `shared/vision.ts` liczony z innego
  środka i innego promienia — nie pisz drugiego raycastu
- Pamięć eksploracji to znów lista kształtów (jak mgła z 17a), a nie bitmapa: dopisuj
  wielokąt widoczności przy każdym zatwierdzonym ruchu i kompaktuj, gdy urośnie
- Migotanie rób w rendererze (alfa w tickerze), nie w danych — inaczej każde mrugnięcie
  to zdarzenie po sieci
