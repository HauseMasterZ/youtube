$lines = Get-Content -Path app.js.backup

function Get-Lines($start, $end) {
    return $lines[($start-1)..($end-1)]
}

$dom = Get-Lines 2 34
$utils = (Get-Lines 36 39) + (Get-Lines 1092 1097) + (Get-Lines 125 128)
$state = (Get-Lines 41 59) + (Get-Lines 89 105) + (Get-Lines 107 114) + (Get-Lines 116 123)
$ui = (Get-Lines 61 88) + (Get-Lines 267 407) + (Get-Lines 415 436) + (Get-Lines 1082 1090) + (Get-Lines 1099 1104) + (Get-Lines 1340 1383)
$playback = (Get-Lines 131 181) + (Get-Lines 439 462) + (Get-Lines 464 516) + (Get-Lines 525 606) + (Get-Lines 609 833) + (Get-Lines 1197 1221)
$lyrics = (Get-Lines 835 1034) + (Get-Lines 1037 1049)
$mediaSession = (Get-Lines 1177 1185) + (Get-Lines 1469 1558)
$main = (Get-Lines 183 265) + (Get-Lines 409 413) + (Get-Lines 518 523) + (Get-Lines 1051 1059) + (Get-Lines 1061 1080) + (Get-Lines 1106 1175) + (Get-Lines 1187 1195) + (Get-Lines 1223 1338) + (Get-Lines 1385 1445) + (Get-Lines 1447 1467) + (Get-Lines 1560 1576)

Set-Content -Path dom.js -Value ($dom -join "`r`n")
Set-Content -Path utils.js -Value ($utils -join "`r`n")
Set-Content -Path state.js -Value ($state -join "`r`n")
Set-Content -Path ui.js -Value ($ui -join "`r`n")
Set-Content -Path playback.js -Value ($playback -join "`r`n")
Set-Content -Path lyrics.js -Value ($lyrics -join "`r`n")
Set-Content -Path mediaSession.js -Value ($mediaSession -join "`r`n")
Set-Content -Path main.js -Value ($main -join "`r`n")

Write-Output "Successfully split files!"
