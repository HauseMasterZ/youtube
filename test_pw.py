import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        # Launch chromium with devtools open so we can see what's happening if needed
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            ignore_https_errors=True,
            service_workers="allow"
        )
        
        # Route to track requests
        async def handle_request(route):
            request = route.request
            if "webm" in request.url:
                print(f"MEDIA REQUEST: {request.method} {request.url}")
                print(f"Headers: {request.headers}")
            await route.continue_()
            
        page = await context.new_page()
        await page.route("**/*", handle_request)
        
        print("Navigating...")
        await page.goto("https://hausemasterz.github.io/youtube/")
        
        await asyncio.sleep(3)
        
        # Wait for the playlist to render, click the first one
        await page.evaluate('''() => {
            const cards = document.querySelectorAll('.playlist-card');
            if (cards.length > 0) cards[0].click();
        }''')
        
        await asyncio.sleep(3)
        
        # Click the first track
        await page.evaluate('''() => {
            const tracks = document.querySelectorAll('.track-item');
            if (tracks.length > 0) tracks[0].click();
        }''')
        
        await asyncio.sleep(5)
        
        print("Pausing...")
        await page.evaluate("audioPlayer.pause()")
        
        await asyncio.sleep(5)
        
        print("Playing again...")
        await page.evaluate("audioPlayer.play()")
        
        await asyncio.sleep(5)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
