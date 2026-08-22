    const baseUrl = "__API_GATEWAY_URL__";
    function getSearchString(track) { return (track.title + " " + track.channel).toLowerCase(); }
    function getThumbUrl(track) { return track.thumbnail_path ? `${baseUrl}/${track.thumbnail_path.split('/').map(encodeURIComponent).join('/')}` : null; }
    function getAudioUrl(track) { return `${baseUrl}/${track.file_path.split('/').map(encodeURIComponent).join('/')}`; }
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds === Infinity) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    function parseISODuration(pt) {
        if (!pt) return 0;
        // If it's already a number or a numeric string, just return it
        if (!isNaN(pt)) return parseInt(pt, 10);
        
        const match = String(pt).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return 0;
        const h = parseInt(match[1] || 0, 10);
        const m = parseInt(match[2] || 0, 10);
        const s = parseInt(match[3] || 0, 10);
        return h * 3600 + m * 60 + s;
    }
    function normalizePlaylistData(data, folderName) {
        if (!Array.isArray(data)) return [];
        return data.filter(item => {
            const title = String(Array.isArray(item) ? item[1] : (item.title || ''));
            return !title.includes('Deleted/Private Video') && !title.includes('Deleted video') && !title.includes('Private video');
        }).map(item => {
            if (Array.isArray(item)) {
                return {
                    id: item[0],
                    title: item[1],
                    channel: item[2],
                    duration: item[3],
                    file_path: `${folderName}/${item[0]}.webm`,
                    thumbnail_path: `${folderName}/thumbnails/${item[0]}.webp`
                };
            }
            return {
                ...item,
                file_path: `${folderName}/${item.id}.webm`,
                thumbnail_path: `${folderName}/thumbnails/${item.id}.webp`
            };
        });
    }

    // Environment Feature Checks
    const hasMediaSession = 'mediaSession' in navigator;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
