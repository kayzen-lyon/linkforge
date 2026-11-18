"""Derives the English sharing image from the supplied French artwork.

public/og-image.jpg is supplied artwork and is never redrawn. This script
copies it, repaints only the tagline band with the gradient found just above
and below it, and writes the English tagline there:

    python3 apps/web/scripts/og-image.py        (needs Pillow and the Inter font)

It is run by hand when the artwork or the tagline changes; the Vite build has
no image encoder, so the result (public/og-image-en.jpg) is committed.
"""
from PIL import Image, ImageDraw, ImageFont

TAGLINE = 'The API for universal web transformation'
BAND = (300, 468, 900, 522)

image = Image.open('apps/web/public/og-image.jpg').convert('RGB')
pixels = image.load()
x0, y0, x1, y1 = BAND
for x in range(x0, x1):
    top, bottom = pixels[x, y0 - 2], pixels[x, y1 + 2]
    for y in range(y0, y1):
        f = (y - y0) / (y1 - y0)
        pixels[x, y] = tuple(round(top[i] * (1 - f) + bottom[i] * f) for i in range(3))
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 25)
draw.text(((image.width - draw.textlength(TAGLINE, font=font)) / 2, 480), TAGLINE, fill=(38, 49, 66), font=font)
image.save('apps/web/public/og-image-en.jpg', 'JPEG', quality=86, optimize=True)
print('apps/web/public/og-image-en.jpg', image.size)
