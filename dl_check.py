import urllib.request
import struct

url = "https://media-proxy.system-cache-node.workers.dev/Driving/thumbnails/Cheerleader%20-%20OMI%20-%20Topic.webp"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        data = response.read(30)
        
        if data[12:16] == b'VP8X':
            w = 1 + int.from_bytes(data[24:27], 'little')
            h = 1 + int.from_bytes(data[27:30], 'little')
            print(f"VP8X: {w}x{h}")
        elif data[12:16] == b'VP8 ':
            w = int.from_bytes(data[26:28], 'little') & 0x3fff
            h = int.from_bytes(data[28:30], 'little') & 0x3fff
            print(f"VP8: {w}x{h}")
        elif data[12:16] == b'VP8L':
            b0 = data[21]
            b1 = data[22]
            b2 = data[23]
            b3 = data[24]
            w = 1 + (((b1 & 0x3F) << 8) | b0)
            h = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
            print(f"VP8L: {w}x{h}")
        else:
            print("Unknown WEBP format")
except Exception as e:
    print(f"Error: {e}")
