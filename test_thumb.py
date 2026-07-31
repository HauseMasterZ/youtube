import urllib.request
from PIL import Image

url = "https://media-proxy.system-cache-node.workers.dev/Gym/thumbnails/Crazy%20Kiya%20Re%20-%20Sunidhi%20Chauhan%20-%20Topic.webp"
urllib.request.urlretrieve(url, "test.webp")
img = Image.open("test.webp")
print(f"Size: {img.width}x{img.height}")
