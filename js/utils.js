    // In-memory runtime XOR decoder & rolling HMAC token generator
    const _ENC_GW = "__ENC_API_GATEWAY__";
    const _ENC_SEED = "__ENC_HMAC_SEED__";

    function _d(s, k = 0x5A) {
        try {
            const r = atob(s);
            let o = "";
            for (let i = 0; i < r.length; i++) o += String.fromCharCode(r.charCodeAt(i) ^ k);
            return o;
        } catch (e) { return ""; }
    }

    async function getRollingToken() {
        try {
            const seed = _d(_ENC_SEED);
            if (!seed) return "";
            const slot = String(Math.floor(Date.now() / 30000));
            const enc = new TextEncoder();
            const key = await crypto.subtle.importKey("raw", enc.encode(seed), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
            const sig = await crypto.subtle.sign("HMAC", key, enc.encode(slot));
            const bytes = new Uint8Array(sig);
            let bin = "";
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            return btoa(bin);
        } catch (e) { return ""; }
    }

    // Dynamic resolution in memory
    const baseUrl = _ENC_GW.startsWith("__") ? "__API_GATEWAY_URL__" : _d(_ENC_GW);

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
    // Environment Feature Checks
    const hasMediaSession = 'mediaSession' in navigator;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
