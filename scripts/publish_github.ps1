# Publie le projet sur GitHub apres avoir verifie qu'aucune cle n'est dans les fichiers a envoyer.
# Prerequis : Git installe, et un depot VIDE cree sur github.com (sans README ni .gitignore).
#   .\scripts\publish_github.ps1 -GitHubUser badiegmati
#   .\scripts\publish_github.ps1 -GitHubUser badiegmati -Repo fleetdesk
param(
    [Parameter(Mandatory = $true)][string]$GitHubUser,
    [string]$Repo = "fleetdesk"
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git n'est pas installe : https://git-scm.com/download/win (puis rouvre PowerShell)."
}
if (-not (Test-Path ".git")) { git init -b main | Out-Null }
git add -A

# Garde-fou : aucune cle dans ce qui va etre envoye (les fichiers .env sont ignores par .gitignore).
$pattern = 'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|AIza[A-Za-z0-9_-]{30,}|AQ\.Ab8R|sk-ant-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]+'
$hits = git grep --cached -nIE $pattern -- . ':!*package-lock.json' 2>$null
if ($hits) {
    Write-Host "ARRET : une cle semble presente dans ces fichiers :" -ForegroundColor Red
    $hits | ForEach-Object { Write-Host "  $_" }
    Write-Host "Retire la cle (et regenere-la), puis relance." -ForegroundColor Yellow
    exit 1
}
Write-Host "Aucune cle detectee." -ForegroundColor Green

git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { git commit -m "FleetDesk : projet complet" | Out-Null }

$url = "https://github.com/$GitHubUser/$Repo.git"
if (git remote | Select-String -SimpleMatch "origin") { git remote set-url origin $url } else { git remote add origin $url }
git branch -M main
git push -u origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec du push : le depot $url existe-t-il (vide) et es-tu connecte a GitHub ?" -ForegroundColor Red
    exit 1
}

Write-Host "`nEnvoye sur $url" -ForegroundColor Green
Write-Host "Etape suivante : Settings -> Pages -> Source = 'GitHub Actions'." -ForegroundColor Cyan
Write-Host "Site : https://$GitHubUser.github.io/$Repo/"
