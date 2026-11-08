#!/usr/bin/env python3
"""Génère favicon + icônes iOS/PWA à partir de assets/logo.svg (la fleur CYANOIDE),
remplie avec le dégradé Instagram :
    radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)

Usage : python3 -I tools/make_icons.py
Le logo doit être un SVG fait de chemins M/L/Z (polygones), comme assets/logo.svg.
"""
import os, re
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'logo.svg')
OUT = os.path.join(ROOT, 'icons')
os.makedirs(OUT, exist_ok=True)

svg = open(SRC, encoding='utf-8').read()
vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
VBW, VBH = vb[2], vb[3]

polys = []
for d in re.findall(r'<path[^>]*\sd="([^"]+)"', svg):
    pts = [(float(x), float(y)) for x, y in re.findall(r'(-?\d+\.?\d*)[ ,]+(-?\d+\.?\d*)', d)]
    if len(pts) >= 3:
        polys.append(pts)
if not polys:
    raise SystemExit('Aucun tracé trouvé dans assets/logo.svg')

allp = [p for poly in polys for p in poly]
minx, maxx = min(p[0] for p in allp), max(p[0] for p in allp)
miny, maxy = min(p[1] for p in allp), max(p[1] for p in allp)

STOPS = [(0.00, (0xfd, 0xf4, 0x97)), (0.05, (0xfd, 0xf4, 0x97)), (0.45, (0xfd, 0x59, 0x49)),
         (0.60, (0xd6, 0x24, 0x9f)), (0.90, (0x28, 0x5a, 0xeb)), (1.00, (0x28, 0x5a, 0xeb))]

def gradient(n):
    """Dégradé CSS 'circle at 30% 107%' (farthest-corner) sur un carré n x n."""
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32) / (n - 1)
    cx, cy = 0.30, 1.07
    r = np.hypot(max(cx, 1 - cx), max(cy, abs(1 - cy)))   # farthest-corner
    t = np.hypot(xs - cx, ys - cy) / r
    out = np.zeros((n, n, 3), np.float32)
    for i in range(len(STOPS) - 1):
        a, b = STOPS[i], STOPS[i + 1]
        m = (t >= a[0]) & (t <= b[0])
        k = ((t - a[0]) / (b[0] - a[0]))[..., None]
        seg = np.array(a[1], np.float32) * (1 - k) + np.array(b[1], np.float32) * k
        out = np.where(m[..., None], seg, out)
    return Image.fromarray(out.astype(np.uint8), 'RGB')

def mask(n, fill):
    """Masque du logo centré dans un carré n x n ; `fill` = part de la taille occupée par le logo."""
    big = n * 4
    scale = big * fill / max(maxx - minx, maxy - miny)
    ox = (big - (maxx - minx) * scale) / 2 - minx * scale
    oy = (big - (maxy - miny) * scale) / 2 - miny * scale
    m = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([(x * scale + ox, y * scale + oy) for x, y in poly], fill=255)
    return m.resize((n, n), Image.LANCZOS)

def icon(size, fill, bg=(11, 13, 16)):
    g = gradient(size)
    base = Image.new('RGB', (size, size), bg)
    base.paste(g, (0, 0), mask(size, fill))
    return base

for name, size in [('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)]:
    icon(size, 0.62).save(os.path.join(OUT, name), optimize=True)

# favicon : fleur seule sur fond transparent, cadrée serré
N = 256
g = gradient(N).convert('RGBA')
g.putalpha(mask(N, 0.96))
for px in (32, 64):
    g.resize((px, px), Image.LANCZOS).save(os.path.join(OUT, f'favicon-{px}.png'), optimize=True)

# favicon SVG : mêmes tracés, mêmes couleurs (dégradé en coordonnées utilisateur)
side = max(maxx - minx, maxy - miny) / 0.96
x0 = (minx + maxx) / 2 - side / 2
y0 = (miny + maxy) / 2 - side / 2
cx, cy = x0 + 0.30 * side, y0 + 1.07 * side
rr = np.hypot(0.70, 1.07) * side
paths = '\n  '.join('<path d="M ' + ' L '.join(f'{x:.2f},{y:.2f}' for x, y in p) + ' Z"/>' for p in polys)
fav = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.2f} {y0:.2f} {side:.2f} {side:.2f}">
  <defs>
    <radialGradient id="ig" gradientUnits="userSpaceOnUse" cx="{cx:.2f}" cy="{cy:.2f}" r="{rr:.2f}">
      <stop offset="0" stop-color="#fdf497"/><stop offset=".05" stop-color="#fdf497"/>
      <stop offset=".45" stop-color="#fd5949"/><stop offset=".60" stop-color="#d6249f"/>
      <stop offset=".90" stop-color="#285AEB"/>
    </radialGradient>
  </defs>
  <g fill="url(#ig)">
  {paths}
  </g>
</svg>
'''
open(os.path.join(OUT, 'favicon.svg'), 'w', encoding='utf-8').write(fav)
print('OK :', ', '.join(sorted(os.listdir(OUT))))
