# Packs the GM's local data for the VPS (stage 28): a consistent copy of dev.db
# (the server's own snapshot, VACUUM INTO — never a plain copy of a live base),
# the whole uploads/ and data/private/cpred. Rulebook PDFs, RAG and old backups
# stay on the PC.
#
#   pwsh deploy/pack-data.ps1            # -> vtt-data.tgz in the scratch dir below
#   pwsh deploy/pack-data.ps1 -Out D:\x  # elsewhere
param([string]$Out = (Join-Path $env:TEMP 'vtt-deploy'))
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')

Push-Location $root
try {
  pnpm --filter @vtt/server snapshot | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'snapshot failed' }
} finally { Pop-Location }

$snapshot = Get-ChildItem (Join-Path $root 'data/private/backups') -Directory -Filter 'snapshot-*' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $snapshot) { throw 'no snapshot in data/private/backups' }

$stage = Join-Path $Out 'vtt-data'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $stage 'db'), (Join-Path $stage 'private') | Out-Null
Copy-Item (Join-Path $snapshot.FullName 'db.sqlite') (Join-Path $stage 'db/vtt.db')
Copy-Item (Join-Path $root 'uploads') (Join-Path $stage 'uploads') -Recurse
Copy-Item (Join-Path $root 'data/private/cpred') (Join-Path $stage 'private/cpred') -Recurse

# Windows bsdtar explicitly: a GNU tar from Git on PATH reads "C:" as a remote host.
$archive = Join-Path $Out 'vtt-data.tgz'
& (Join-Path $env:SystemRoot 'System32/tar.exe') -czf $archive -C $stage db uploads private
if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
$skills = (Get-Content (Join-Path $stage 'private/cpred/skills.json') -Raw | ConvertFrom-Json)
Write-Host "Snapshot $($snapshot.Name) -> $archive ($([math]::Round((Get-Item $archive).Length / 1MB, 1)) MB)"
Write-Host "Skills in private/cpred/skills.json: $($skills.skills.Count)"
