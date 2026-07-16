# Dane

## Zasady (KRYTYCZNE — repo jest publiczne)

- **`data/public/`** — wyłącznie dane wymyślone lub własnego autorstwa, wolne od praw autorskich. Trafiają do repo (przykłady do testów, schematy).
- **`data/private/`** — dane z podręcznika Cyberpunk RED (objęte prawem autorskim, użytek prywatny). Katalog jest w `.gitignore` i **nigdy nie może trafić do repo**. W repo mogą być schematy i parsery — nigdy treść podręcznika.

Przed commitem dotykającym danych sprawdź `git status`, czy nic z `data/private/` ani `uploads/` nie jest w stage'u.
