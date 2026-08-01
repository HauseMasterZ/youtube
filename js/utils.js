    const baseUrl = "https://media-proxy.system-cache-node.workers.dev";
    function getSearchString(track) { return (track.title + " " + track.channel).toLowerCase(); }
    function getThumbUrl(track) { return track.thumbnail_path ? `${baseUrl}/${track.thumbnail_path.split('/').map(encodeURIComponent).join('/')}` : null; }
    function getAudioUrl(track) { return `${baseUrl}/${track.file_path.split('/').map(encodeURIComponent).join('/')}`; }
    
    const canvasCropCache = new Map();
    function getSquareArtworkUrl(url) {
        if (canvasCropCache.has(url)) return Promise.resolve(canvasCropCache.get(url));
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const size = Math.min(img.width, img.height);
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                const startX = (img.width - size) / 2;
                const startY = (img.height - size) / 2;
                ctx.drawImage(img, startX, startY, size, size, 0, 0, size, size);
                try {
                    const dataUrl = canvas.toDataURL("image/webp", 0.9);
                    canvasCropCache.set(url, dataUrl);
                    resolve(dataUrl);
                } catch (e) {
                    resolve(url); // Fallback on tainted canvas
                }
            };
            img.onerror = () => resolve(url);
            img.src = url;
        });
    }
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
    // Environment Feature Checks
    const hasMediaSession = 'mediaSession' in navigator;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
