"""Pack render-duo-motion.cjs output. Requires Pillow and opencv-python-headless."""
import json
import sys
from pathlib import Path

import cv2
from PIL import Image, ImageFilter

source = Path(sys.argv[1])
root = Path(__file__).resolve().parents[1]
out = root / 'public/duo-3d/motion'
out.mkdir(exist_ok=True)
crops = []
for finish in ('night', 'white'):
    for first in range(0, 61, 9):
        frames = []
        for number in range(first, min(first + 9, 61)):
            image = Image.open(source / f'{finish}-{number * 3}.png').convert('RGBA')
            alpha = image.getchannel('A')
            shadow = Image.new('RGBA', image.size)
            shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(16)).point(lambda a: int(a * .4)))
            frame = Image.new('RGBA', image.size)
            frame.alpha_composite(shadow, (0, 14))
            frame.alpha_composite(image)
            frames.append(frame)
        if finish == 'night':
            boxes = [frame.getbbox() for frame in frames]
            crops.append([op(b[i] for b in boxes) for i, op in enumerate((min, min, max, max))])
        box = crops[first // 9]
        width, height = box[2] - box[0], box[3] - box[1]
        atlas = Image.new('RGBA', (width * 3, height * ((len(frames) + 2) // 3)))
        for i, frame in enumerate(frames):
            atlas.paste(frame.crop(box), (i % 3 * width, i // 3 * height))
        atlas.save(out / f'{finish}-{first // 9}.webp', quality=94, method=4)

apertures = []
for angle in range(0, 181, 3):
    image = cv2.imread(str(source / f'aperture-{angle}.png'), cv2.IMREAD_UNCHANGED)
    mask = (image[:, :, 0] > 127) & (image[:, :, 3] > 127)
    contours, _ = cv2.findContours(mask.astype('uint8'), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    paths = []
    for contour in contours:
        if cv2.contourArea(contour) < 8:
            continue
        points = cv2.approxPolyDP(contour, 0.7, True).reshape(-1, 2)
        paths.append('M' + 'L'.join(f'{x} {y}' for x, y in points) + 'Z')
    apertures.append(''.join(paths))
for name, data in [('crops', crops), ('apertures', apertures)]:
    (root / f'src/config/duo-motion-{name}.json').write_text(json.dumps(data, indent=2) + '\n')
