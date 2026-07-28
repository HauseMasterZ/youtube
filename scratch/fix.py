import os

file_path = r'c:\Users\Hause\Documents\Code\youtube\js\ui.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = """    function updateMediaSessionMetadata(track, url) {
        if (!hasMediaSession) return;
        
        const artwork = url && url.startsWith('data:image') 
            ? [{ src: url, sizes: '512x512', type: 'image/jpeg' }]
            : [
                { src: getAlbumArtUrl(track.id, 'hqdefault'), sizes: '480x360', type: 'image/jpeg' },
                { src: getAlbumArtUrl(track.id, 'maxresdefault'), sizes: '1280x720', type: 'image/jpeg' }
            ];
            
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.channel,
            artwork: artwork
        });
    }"""

replacement = """    function updateMediaSessionMetadata(track, url) {
        if (!hasMediaSession) return;
        
        const artwork = url && url.startsWith('data:image') 
            ? [{ src: url, sizes: '512x512', type: 'image/jpeg' }]
            : [];
            
        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.channel,
            artwork: artwork
        });
    }"""

if target in content:
    content = content.replace(target, replacement)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")
else:
    print("Target not found")
