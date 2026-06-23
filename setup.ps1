# setup.ps1 — wrapper para quem está no PowerShell puro (sem WSL/Git Bash
# no PATH explicitamente). A lógica real mora em setup.sh; este script só
# acha um bash disponível (o que vem com o Git for Windows é o mais comum
# em quem já clonou o repo) e delega.
#
# Uso:
#   .\setup.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$bash = Get-Command bash -ErrorAction SilentlyContinue
if (-not $bash) {
    $gitBash = "C:\Program Files\Git\bin\bash.exe"
    if (Test-Path $gitBash) { $bash = $gitBash } else { $bash = $null }
}

if (-not $bash) {
    Write-Host "[ERRO] Nao encontrei 'bash' no PATH nem em 'C:\Program Files\Git\bin\bash.exe'." -ForegroundColor Red
    Write-Host "       Instale o Git for Windows (https://git-scm.com/download/win) - ele inclui o Git Bash -" -ForegroundColor Red
    Write-Host "       ou rode os comandos do README manualmente." -ForegroundColor Red
    exit 1
}

$bashPath = if ($bash -is [string]) { $bash } else { $bash.Source }
& $bashPath "./setup.sh"
exit $LASTEXITCODE
