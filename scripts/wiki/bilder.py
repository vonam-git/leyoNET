#!/usr/bin/env python3
"""Bilder für das Wiki aus Aufnahmen der App (Playwright) erzeugen.

Aufruf: python3 scripts/wiki/bilder.py <standbilder> <animationen> <ziel>
  <standbilder>/<demo>-light.png, <demo>-dark.png   (Canvas, doppelte Auflösung)
  <animationen>/<demo>-light/<nr>-<ms>.png, …-dark/   (Canvas in Zeitlupe, einfache Auflösung)
Schreibt <ziel>/<demo>.webp, <demo>-dark.webp, <demo>-anim.webp, <demo>-anim-dark.webp
und <ziel>/masse.json mit Breite und Höhe je Bild (für width/height im HTML).
Zugeschnitten wird auf den Inhalt (Hintergrund weg), hell und dunkel gleich.
"""
import glob, json, os, sys
from PIL import Image, ImageChops

still_dir, anim_dir, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
sizes_file = os.path.join(out, 'masse.json')
sizes = json.load(open(sizes_file)) if os.path.exists(sizes_file) else {}

def content_box(im, margin):
    bg = Image.new(im.mode, im.size, im.getpixel((3, 3)))
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 24 else 0)
    box = diff.getbbox()
    if not box:
        return (0, 0) + im.size
    l, t, r, b = box
    return (max(0, l - margin), max(0, t - margin), min(im.size[0], r + margin), min(im.size[1], b + margin))

def union(a, b):
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]))

def fit(im, max_w):
    if im.size[0] <= max_w:
        return im
    return im.resize((max_w, round(im.size[1] * max_w / im.size[0])), Image.LANCZOS)

# --- Standbilder ---------------------------------------------------------------
for light in sorted(glob.glob(os.path.join(still_dir, '*-light.png'))):
    name = os.path.basename(light)[:-len('-light.png')]
    dark = light.replace('-light.png', '-dark.png')
    a = Image.open(light).convert('RGB')
    box = content_box(a, 48)
    if os.path.exists(dark):
        box = union(box, content_box(Image.open(dark).convert('RGB'), 48))
    for path, suffix in ((light, ''), (dark, '-dark')):
        if not os.path.exists(path):
            continue
        im = fit(Image.open(path).convert('RGB').crop(box), 1400)
        im.save(os.path.join(out, f'{name}{suffix}.webp'), 'WEBP', quality=78, method=6)
        sizes[f'{name}{suffix}'] = [im.size[0] // 2, im.size[1] // 2]  # doppelte Auflösung

# --- Animationen ---------------------------------------------------------------
for frame_dir in sorted(glob.glob(os.path.join(anim_dir, '*-light'))):
    name = os.path.basename(frame_dir)[:-len('-light')]
    sets = {'': frame_dir, '-dark': frame_dir[:-len('-light')] + '-dark'}
    box = None
    loaded = {}
    for suffix, d in sets.items():
        files = sorted(glob.glob(os.path.join(d, '*.png')))
        if not files:
            continue
        frames = [(Image.open(f).convert('RGB'), int(os.path.basename(f).split('-')[1][:-4])) for f in files]
        loaded[suffix] = frames
        for im, _ in frames[:: max(1, len(frames) // 12)]:
            b = content_box(im, 24)
            box = b if box is None else union(box, b)
    for suffix, frames in loaded.items():
        out_frames, durations = [], []
        for i, (im, ms) in enumerate(frames):
            nxt = frames[i + 1][1] if i + 1 < len(frames) else ms + 200
            im = fit(im.crop(box), 960)
            if out_frames and ImageChops.difference(im, out_frames[-1]).getbbox() is None:
                durations[-1] += nxt - ms
                continue
            out_frames.append(im)
            durations.append(max(40, nxt - ms))
        if len(out_frames) < 12:
            # Kaum Bewegung (der Ablauf war schon vorbei): lieber nur das Standbild zeigen.
            print(name + suffix, 'übersprungen, nur', len(out_frames), 'verschiedene Bilder')
            continue
        # Am Ende kurz stehen bleiben, dann von vorn.
        durations[-1] = max(durations[-1], 1500)
        target = os.path.join(out, f'{name}-anim{suffix}.webp')
        out_frames[0].save(target, 'WEBP', save_all=True, append_images=out_frames[1:], duration=durations, loop=0, quality=70, method=4)
        sizes[f'{name}-anim{suffix}'] = list(out_frames[0].size)
        print(name + suffix, len(out_frames), 'Bilder', os.path.getsize(target) // 1024, 'KB')

json.dump(dict(sorted(sizes.items())), open(sizes_file, 'w'), indent=1)
