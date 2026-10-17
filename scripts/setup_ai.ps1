# Configure les fonctions IA en UNE commande : teste la cle, enregistre les secrets, deploie les 3 fonctions.
# La cle est saisie en masque (jamais dans la commande, donc jamais dans l'historique PowerShell).
#   .\scripts\setup_ai.ps1
#   .\scripts\setup_ai.ps1 -ProjectRef nwfzuteyhquajkwjxspb -Model gemini-3.6-flash
param(
    [string]$ProjectRef = "nwfzuteyhquajkwjxspb",
    [string]$Model = "gemini-3.6-flash"
)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

function Read-Secret([string]$Prompt) {
    $s = Read-Host $Prompt -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { $v = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    return ($v -replace '[^\x21-\x7E]', '')
}

Write-Host "Projet Supabase cible : $ProjectRef" -ForegroundColor Cyan
$key = Read-Secret "Cle GEMINI_API_KEY (NOUVELLE cle, saisie masquee)"
if (-not $key) { Write-Host "Cle vide." -ForegroundColor Red; exit 1 }

# 1) Test de la cle AVANT de toucher a Supabase
Write-Host "`n[1/3] Test de la cle et du modele '$Model'..." -ForegroundColor Cyan
$body = @{ contents = @(@{ role = "user"; parts = @(@{ text = "Dis juste bonjour." }) }) } | ConvertTo-Json -Depth 6
try {
    Invoke-RestMethod -Method Post `
        -Uri "https://generativelanguage.googleapis.com/v1beta/models/${Model}:generateContent" `
        -Headers @{ "x-goog-api-key" = $key; "content-type" = "application/json" } -Body $body | Out-Null
    Write-Host "OK" -ForegroundColor Green
} catch {
    Write-Host "ECHEC du test Gemini :" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message } else { Write-Host $_.Exception.Message }
    Write-Host "Rien n'a ete modifie sur Supabase." -ForegroundColor Yellow
    exit 1
}

# 2) Secrets (CRON_SECRET genere automatiquement)
Write-Host "`n[2/3] Enregistrement des secrets..." -ForegroundColor Cyan
$cron = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
npx supabase secrets set "GEMINI_API_KEY=$key" "GEMINI_MODEL=$Model" "CRON_SECRET=$cron" --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { Write-Host "Echec de 'secrets set' (projet en pause ? mauvais compte ? 'npx supabase login')." -ForegroundColor Red; exit 1 }

# 3) Deploiement (--use-api : pas besoin de Docker)
Write-Host "`n[3/3] Deploiement des fonctions..." -ForegroundColor Cyan
npx supabase functions deploy ai-assistant forecast-demand damage-check --project-ref $ProjectRef --use-api
if ($LASTEXITCODE -ne 0) { Write-Host "Echec du deploiement." -ForegroundColor Red; exit 1 }

Write-Host "`nTermine." -ForegroundColor Green
Write-Host "CRON_SECRET (a coller UNE fois dans la commande cron.schedule de supabase/migrations/0006_realtime_cron.sql) :" -ForegroundColor Yellow
Write-Host $cron
