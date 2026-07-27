$envPath = ".env"
$apiKey = ""

if (Test-Path $envPath) {
    $envContent = Get-Content $envPath
    foreach ($line in $envContent) {
        if ($line -match "^GEMINI_API_KEY=(.*)") {
            $apiKey = $matches[1].Trim("`"").Trim("'")
            break
        }
    }
}
Invoke-RestMethod -Uri "https://generativelanguage.googleapis.com/v1beta/models?key=$apiKey" | Select-Object -ExpandProperty models | Select-Object name
