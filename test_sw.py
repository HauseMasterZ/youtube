import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Use an isolated context to ensure clean cache state
        context = await browser.new_context(
            ignore_https_errors=True,
            service_workers="allow"
        )
        page = await context.new_page()

        print("Navigating to https://hausemasterz.github.io/youtube/")
        await page.goto("https://hausemasterz.github.io/youtube/")
        
        # Wait for service worker to activate
        print("Waiting for Service Worker...")
        await asyncio.sleep(3)
        
        # Click the first playlist to load songs
        print("Clicking first playlist...")
        await page.evaluate("document.querySelector('.playlist-card').click()")
        await asyncio.sleep(2)
        
        # Click play on the first track
        print("Playing first track...")
        await page.evaluate("document.querySelector('.track-item').click()")
        await asyncio.sleep(3)
        
        # Dump the keys in 'yt-player-media' cache
        print("Checking yt-player-media cache keys...")
        keys = await page.evaluate('''async () => {
            try {
                const cache = await caches.open('yt-player-media');
                const reqs = await cache.keys();
                return reqs.map(r => r.url);
            } catch(e) { return [e.toString()]; }
        }''')
        print(f"Cached media keys: {keys}")
        
        # Check preloadedFetches in playback.js context
        print("Checking preloadedFetches map...")
        preloaded = await page.evaluate('''() => {
            // We can't access preloadedFetches directly if it's not exported, but we can see what's in the DOM
            return "N/A"; 
        }''')
        
        # Now pause the audio
        print("Pausing audio...")
        await page.evaluate("audioPlayer.instantPause()")
        await asyncio.sleep(2)
        
        # Check cache again
        keys2 = await page.evaluate('''async () => {
            const cache = await caches.open('yt-player-media');
            const reqs = await cache.keys();
            return reqs.map(r => r.url);
        }''')
        print(f"Cached media keys after pause: {keys2}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
