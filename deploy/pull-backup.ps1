# Off-site copy of the VPS snapshots (stage 28): pulls the newest complete
# snapshot from vtt-data/backups to the GM's PC, checks it and keeps the last
# -Keep of them. Run by hand or from the Task Scheduler (-Register).
#
#   pwsh deploy/pull-backup.ps1                  # pull now -> D:\kopie-vtt
#   pwsh deploy/pull-backup.ps1 -Register        # daily task "VTT pull backup"
#
# Needs `ssh vps` with the key in the Windows ssh-agent (docs/DEPLOY.md).
param(
  [string]$Dest = 'D:\kopie-vtt',
  [int]$Keep = 14,
  [string]$HostAlias = 'vps',
  [string]$RemoteDir = '/opt/docker-apps/vtt-data/backups',
  [switch]$Register
)
$ErrorActionPreference = 'Stop'
# Windows OpenSSH explicitly: it talks to the ssh-agent service, Git's ssh does not.
$ssh = Join-Path $env:SystemRoot 'System32/OpenSSH/ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32/OpenSSH/scp.exe'

if ($Register) {
  $pwsh = (Get-Command pwsh).Source
  $action = New-ScheduledTaskAction -Execute $pwsh `
    -Argument "-NoProfile -WindowStyle Hidden -File `"$PSCommandPath`" -Dest `"$Dest`" -Keep $Keep"
  # Daily in the evening; a PC that was off catches up at the next chance.
  $trigger = New-ScheduledTaskTrigger -Daily -At '23:30'
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName 'VTT pull backup' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
  Write-Host "Registered task 'VTT pull backup' (daily 23:30, catch-up when missed)"
  return
}

New-Item -ItemType Directory -Force $Dest | Out-Null
$log = Join-Path $Dest 'pull-backup.log'
function Log([string]$msg) {
  $line = '{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Host $line
}

try {
  # The server writes manifest.json last, so a snapshot with it is complete.
  $remote = & $ssh -o BatchMode=yes $HostAlias "cd '$RemoteDir' && ls -1d snapshot-*/manifest.json 2>/dev/null | sort | tail -1"
  if ($LASTEXITCODE -ne 0) { throw "ssh $HostAlias failed ($LASTEXITCODE)" }
  $name = ($remote | Select-Object -Last 1) -replace '/manifest.json$', ''
  if (-not $name) { throw "no complete snapshot in $RemoteDir" }

  $target = Join-Path $Dest $name
  if (Test-Path (Join-Path $target 'verified.txt')) {
    Log "$name already here and verified"
  } else {
    $partial = "$target.partial"
    Remove-Item $partial -Recurse -Force -ErrorAction SilentlyContinue
    & $scp -q -r -o BatchMode=yes "${HostAlias}:$RemoteDir/$name" $partial
    if ($LASTEXITCODE -ne 0) { throw "scp of $name failed ($LASTEXITCODE)" }

    $manifest = Get-Content (Join-Path $partial 'manifest.json') -Raw | ConvertFrom-Json
    $db = Join-Path $partial 'db.sqlite'
    $dbBytes = (Get-Item $db).Length
    if ($dbBytes -ne $manifest.dbBytes) { throw "$name db.sqlite is $dbBytes B, manifest says $($manifest.dbBytes)" }
    $uploads = Join-Path $partial 'uploads'
    $files = if (Test-Path $uploads) { @(Get-ChildItem $uploads -Recurse -File).Count } else { 0 }
    if ($files -ne $manifest.files) { throw "$name has $files upload files, manifest says $($manifest.files)" }
    $integrity = node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});console.log(d.prepare('PRAGMA integrity_check').get().integrity_check)" $db
    if ($integrity -ne 'ok') { throw "$name integrity_check: $integrity" }

    Set-Content -Path (Join-Path $partial 'verified.txt') -Encoding utf8 `
      -Value ("{0:yyyy-MM-dd HH:mm:ss} integrity ok, db {1} B, {2} upload files" -f (Get-Date), $dbBytes, $files)
    Rename-Item $partial $name
    Log "$name pulled and verified (db $dbBytes B, $files files)"
  }

  $old = Get-ChildItem $Dest -Directory -Filter 'snapshot-*' |
    Where-Object { $_.Name -notlike '*.partial' } | Sort-Object Name -Descending | Select-Object -Skip $Keep
  foreach ($dir in $old) {
    Remove-Item $dir.FullName -Recurse -Force
    Log "removed old $($dir.Name)"
  }
} catch {
  Log "ERROR $($_.Exception.Message)"
  exit 1
}
