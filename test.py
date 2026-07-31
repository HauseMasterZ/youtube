from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.set_content('<html><body><img id="img1" src="https://media-proxy.system-cache-node.workers.dev/Driving/thumbnails/Cheerleader%20-%20OMI%20-%20Topic.webp"></body></html>')
    page.wait_for_timeout(3000)
    w = page.evaluate('document.getElementById("img1").naturalWidth')
    h = page.evaluate('document.getElementById("img1").naturalHeight')
    print('Cheerleader', w, 'x', h)
    
    page.set_content('<html><body><img id="img1" src="https://media-proxy.system-cache-node.workers.dev/Driving/thumbnails/Hunter%20-%20HazeRipper%20-%20Topic.webp"></body></html>')
    page.wait_for_timeout(3000)
    w = page.evaluate('document.getElementById("img1").naturalWidth')
    h = page.evaluate('document.getElementById("img1").naturalHeight')
    print('Hunter', w, 'x', h)
    
    page.set_content('<html><body><img id="img1" src="https://media-proxy.system-cache-node.workers.dev/Songs/thumbnails/Dancin%20-%20Krono%20Remix%20-%20Aaron%20Smith.webp"></body></html>')
    page.wait_for_timeout(3000)
    w = page.evaluate('document.getElementById("img1").naturalWidth')
    h = page.evaluate('document.getElementById("img1").naturalHeight')
    print('Dancin', w, 'x', h)
    b.close()
