# Głosy TTS — pochodzenie i licencje

Modele głosu **nie są przechowywane w repozytorium** (370 MB). Manifest z adresami
i sumami kontrolnymi: `models.json`; pobranie: `node scripts/download-tts-voices.mjs`.

Wszystkie głosy pochodzą z [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)
i są wolne licencyjnie. Sam Piper jest na licencji MIT.

| Głos                    | Licencja      | Zbiór treningowy                                                                                  |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `pl_PL-darkman-medium`  | CC0           | [OHF Voice datasets](https://github.com/OHF-Voice/voice-datasets)                                  |
| `pl_PL-gosia-medium`    | CC0           | [OHF Voice datasets](https://github.com/OHF-Voice/voice-datasets)                                  |
| `pl_PL-mc_speech-medium`| CC0           | [The MC Speech Dataset](https://www.kaggle.com/datasets/czyzi0/the-mc-speech-dataset)              |
| `pl_PL-bass-high`       | Apache-2.0    | rhasspy/piper-voices                                                                               |
| `pl_PL-mls_6892-low`    | **CC BY 4.0** | [Multilingual LibriSpeech](http://www.openslr.org/94/), mówca 6892                                 |

**Wymagana atrybucja (CC BY 4.0):** głos `pl_PL-mls_6892-low` (preset „Głos z radia")
został wytrenowany na Multilingual LibriSpeech (Pratap et al., 2020), mówca 6892,
udostępnionym na licencji CC BY 4.0.

## Presety a modele

`voices.json` to katalog presetów pod archetypy Cyberpunk RED. Kilka presetów może
korzystać z tego samego modelu — różni je tempo i wysokość głosu. Piper nie ma
sterowania wysokością, więc realizujemy ją tak: synteza jest spowalniana o
współczynnik `pitch`, a odtwarzanie przyspieszane o ten sam współczynnik przez
podbicie częstotliwości próbkowania. Tempo pozostaje bez zmian, barwa się przesuwa.
