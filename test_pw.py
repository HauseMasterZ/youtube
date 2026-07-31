from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.goto('file://c:/Users/Hause/Documents/Code/youtube/test_edge.html')
    page.on('console', lambda msg: print(msg.text))
    page.evaluate('''() => {
        setTimeout(() => {
            try {
                console.log('Cheerleader (Padded Topic):', detectPillarboxing(document.getElementById('img1')));
                console.log('Curbi (Real 16:9 Music Video):', detectPillarboxing(document.getElementById('img2')));
                console.log('Jumbo (Padded Topic):', detectPillarboxing(document.getElementById('img3')));
            } catch (e) {
                console.log('Error:', e.message);
            }
        }, 1000);
    }''')
    page.wait_for_timeout(2000)
    b.close()
