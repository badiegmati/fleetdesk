# Teste une cle Gemini (jamais ecrite dans un fichier ni dans la commande : saisie masquee).
#   .\scripts\test_gemini_key.ps1
#   .\scripts\test_gemini_key.ps1 -Model gemini-3.6-flash
param([string]$Model = "gemini-3.6-flash")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-Secret([string]$Prompt) {
    $s = Read-Host $Prompt -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { $v = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    # Supprime espaces, retours a la ligne et caracteres invisibles colles par erreur.
    return ($v -replace '[^\x21-\x7E]', '')
}

$key = if ($env:GEMINI_API_KEY) { ($env:GEMINI_API_KEY -replace '[^\x21-\x7E]', '') } else { Read-Secret "Cle GEMINI_API_KEY (saisie masquee)" }
if (-not $key) { Write-Host "Cle vide." -ForegroundColor Red; exit 1 }

$body = @{ contents = @(@{ role = "user"; parts = @(@{ text = "Dis juste bonjour." }) }) } | ConvertTo-Json -Depth 6
try {
    $r = Invoke-RestMethod -Method Post `
        -Uri "https://generativelanguage.googleapis.com/v1beta/models/${Model}:generateContent" `
        -Headers @{ "x-goog-api-key" = $key; "content-type" = "application/json" } -Body $body
    Write-Host "OK : cle valide, modele '$Model' disponible." -ForegroundColor Green
    Write-Host $r.candidates[0].content.parts[0].text
} catch {
    Write-Host "ECHEC (modele '$Model') :" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message } else { Write-Host $_.Exception.Message }
    Write-Host "Si l'erreur est 404 : le modele a ete retire, essaie un autre (-Model ...)."
    exit 1
}
