$content = Get-Content -Path app.js -Raw

$oldCode = @'
                tempImg.onload = () => {
                    // Only apply if the user hasn't frantically skipped to another track while it was loading
                    if (currentPlaybackSequence === sequenceId) {
                        const color = getDominantColor(tempImg, track.id);
                        document.documentElement.style.setProperty('--primary-color', color);
                        albumArt.src = thumbUrl;
                        albumArt.style.display = 'block';
                    }
                };
                if (currentPlaybackSequence === sequenceId) {
                    tempImg.src = thumbUrl;
                }
'@

$newCode = @'
                tempImg.onload = () => {
                    // Only apply if the user hasn't frantically skipped to another track while it was loading
                    if (currentPlaybackSequence === sequenceId) {
                        const color = getDominantColor(tempImg, track.id);
                        document.documentElement.style.setProperty('--primary-color', color);
                        albumArt.src = thumbUrl;
                        albumArt.style.display = 'block';
                    }
                };
                tempImg.onerror = () => {
                    if (currentPlaybackSequence === sequenceId) {
                        // Fallback to default purple if image is missing/404
                        document.documentElement.style.setProperty('--primary-color', '#8c73ff');
                        albumArt.src = thumbUrl; // Browser will natively show a broken image icon
                        albumArt.style.display = 'block';
                    }
                };
                if (currentPlaybackSequence === sequenceId) {
                    tempImg.src = thumbUrl;
                }
'@

if ($content.Contains($oldCode)) {
    $content = $content.Replace($oldCode, $newCode)
    Set-Content -Path app.js -Value $content
    Write-Output "Successfully fixed tempImg.onerror"
} else {
    Write-Output "Failed to find oldCode exact string"
}
