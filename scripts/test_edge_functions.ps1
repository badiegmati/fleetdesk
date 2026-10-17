# Teste l'authentification puis la fonction ai-assistant.
#   $env:SUPABASE_URL = "https://<ref>.supabase.co"
#   $env:SUPABASE_ANON_KEY = "<cle anon/publishable>"
#   .\scripts\test_edge_functions.ps1                      # compte de demo agent@fleetdesk-demo.com
#   .\scripts\test_edge_functions.ps1 -Email x@y.z         # mot de passe demande (masque)
param([string]$Email = "agent@fleetdesk-demo.com")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $env:SUPABASE_URL -or -not $env:SUPABASE_ANON_KEY) {
    Write-Host "Definis d'abord SUPABASE_URL et SUPABASE_ANON_KEY (voir l'en-tete du script)." -ForegroundColor Red
    exit 1
}
$secure = Read-Host "Mot de passe de $Email" -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

function Get-ErrorBody($ErrorRecord) {
    if ($ErrorRecord.ErrorDetails.Message) { return $ErrorRecord.ErrorDetails.Message }
    return $ErrorRecord.Exception.Message
}

Write-Host "`n=== 1. Authentification ===" -ForegroundColor Cyan
try {
    $auth = Invoke-RestMethod -Method Post -Uri "$($env:SUPABASE_URL)/auth/v1/token?grant_type=password" `
        -Headers @{ apikey = $env:SUPABASE_ANON_KEY; "Content-Type" = "application/json" } `
        -Body (@{ email = $Email; password = $password } | ConvertTo-Json)
    $jwt = $auth.access_token
    Write-Host "OK : JWT obtenu." -ForegroundColor Green
} catch { Write-Host "ECHEC :" -ForegroundColor Red; Write-Host (Get-ErrorBody $_); exit 1 }

Write-Host "`n=== 2. ai-assistant ===" -ForegroundColor Cyan
try {
    $r = Invoke-RestMethod -Method Post -Uri "$($env:SUPABASE_URL)/functions/v1/ai-assistant" `
        -Headers @{ Authorization = "Bearer $jwt"; "Content-Type" = "application/json" } `
        -Body (@{ message = "Quelles voitures sont disponibles a l'agence Tunis Centre demain ?" } | ConvertTo-Json)
    Write-Host "OK :" -ForegroundColor Green
    $r | ConvertTo-Json -Depth 8
} catch {
    Write-Host "ECHEC (statut $($_.Exception.Response.StatusCode.value__)) :" -ForegroundColor Red
    Write-Host (Get-ErrorBody $_)
}
