"""Generate PWA / iOS PNG icons for Ario into frontend/public/icons."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

TOP = (56, 189, 248)
BOTTOM = (2, 132, 199)
SS = 4  # supersampling for smooth edges


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return img


def draw_glyph(draw, size, scale):
    """Shopping bag with a check mark, centred; scale = fraction of canvas used."""
    s = size * scale
    ox = (size - s) / 2
    oy = (size - s) / 2
    u = s / 100
    white = (255, 255, 255, 255)

    handle_w = max(2, round(7 * u))
    draw.arc(
        [ox + 32 * u, oy + 12 * u, ox + 68 * u, oy + 52 * u],
        start=180, end=360, fill=white, width=handle_w,
    )

    draw.rounded_rectangle(
        [ox + 14 * u, oy + 32 * u, ox + 86 * u, oy + 94 * u],
        radius=16 * u, fill=white,
    )

    check = (2, 132, 199, 255)
    cw = max(2, round(8 * u))
    pts = [(ox + 34 * u, oy + 63 * u), (ox + 46 * u, oy + 75 * u), (ox + 67 * u, oy + 52 * u)]
    draw.line(pts, fill=check, width=cw, joint="curve")
    r = cw / 2
    for x, y in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=check)


def make_icon(size, *, rounded, glyph_scale, name):
    big = size * SS
    bg = gradient(big).convert("RGBA")
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw_glyph(ImageDraw.Draw(layer), big, glyph_scale)
    bg.alpha_composite(layer)

    if rounded:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.225, fill=255)
        out = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        out.paste(bg, (0, 0), mask)
        bg = out

    bg.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)


make_icon(192, rounded=True, glyph_scale=0.62, name="icon-192.png")
make_icon(512, rounded=True, glyph_scale=0.62, name="icon-512.png")
make_icon(512, rounded=False, glyph_scale=0.5, name="maskable-512.png")
make_icon(180, rounded=False, glyph_scale=0.62, name="apple-touch-icon.png")
make_icon(64, rounded=True, glyph_scale=0.7, name="favicon-64.png")
print("icons written to", OUT)
