$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes('c:\Users\Hause\Documents\Code\youtube\icon-192.png'))
$content = Get-Content -Raw 'c:\Users\Hause\Documents\Code\youtube\app.js'
$content = $content.Replace("new URL('icon-512.png', window.location.href).href", "'data:image/png;base64,' + `"$b64`"")
[IO.File]::WriteAllText('c:\Users\Hause\Documents\Code\youtube\app.js', $content)
