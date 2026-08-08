# Etapy wycofane z planu

Opisy etapów, które wypadły z projektu. Leżą tu **tylko jako zapis decyzji** — nie są planem
pracy i nie należy ich realizować. Bieżący plan: `docs/etapy/00-przeglad.md`.

## Głos (decyzja MG, 09.08.2026)

Trzy etapy, cała faza G plus mowa botów z fazy C:

| #   | Etap                         | Stan przed wycofaniem                    |
| --- | ---------------------------- | ---------------------------------------- |
| 12  | TTS — głos botów             | ukończony 26.07.2026, kod usunięty 09.08 |
| 21  | STT — polecenia głosowe      | nierozpoczęty                            |
| 22  | WebRTC — czat głosowy graczy | nierozpoczęty                            |

**Powód:** rezygnacja z głosowej komunikacji z botami w obie strony — ani mówienia do nich, ani
mowy syntetycznej z ich strony. Przy okazji wypadł też czat głosowy graczy: głosem przy stole
zajmuje się zewnętrzny komunikator (Discord itp.), a nie VTT.

**Co po etapie 12 zostało w kodzie:** wypowiedź NPC-a nie pojawia się na czacie w całości, tylko
dopisuje się słowo po słowie. Do wycofania rytm liczyło się z pliku audio i jechał w payloadzie
wiadomości; teraz to czysto kliencki efekt w stałym tempie czytania
(`packages/client/src/typewriter.ts`), z przełącznikiem w górnym pasku. Serwer o rytmie nie wie nic.

**Co zniknęło:** moduł `tts/` w gatewayu (Piper, Chatterbox, kolejka syntezy, alignment fonemów),
endpointy `POST /tts` i `GET /tts/voices`, `TtsClient` i cache audio na serwerze VTT, katalog
presetów głosu, wgrywanie próbek do klonowania, kolumna `Campaign.speechEnabled` (migracja
`20260809012500_remove_bot_speech`), sekcja „Głos" w profilu bota i w jego edytorze, zależność
`piper-tts`. Historia leży w gicie — commit sprzed 09.08.2026 przywraca całość.
