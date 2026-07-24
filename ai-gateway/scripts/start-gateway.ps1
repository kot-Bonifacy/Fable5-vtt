# Uruchamia AI Gateway (a ten — jeśli w .env są ścieżki — także llama-server).
#
#   pwsh ai-gateway/scripts/start-gateway.ps1
#
# Wymaga uv (https://docs.astral.sh/uv/). Pierwsze uruchomienie ściągnie Pythona 3.12
# i zależności do .venv w katalogu ai-gateway.

$ErrorActionPreference = 'Stop'
$gatewayDir = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Error "Nie znaleziono 'uv'. Zainstaluj: winget install astral-sh.uv"
}

if (-not (Test-Path (Join-Path $gatewayDir '.env'))) {
    Write-Warning "Brak pliku .env — kopiuję .env.example. Sprawdź ścieżki do modelu."
    Copy-Item (Join-Path $gatewayDir '.env.example') (Join-Path $gatewayDir '.env')
}

Push-Location $gatewayDir
try {
    uv run vtt-gateway
}
finally {
    Pop-Location
}
