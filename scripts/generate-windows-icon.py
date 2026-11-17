"""Derive the Windows multi-resolution icon from the existing app icon (requires Pillow)."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
target = root / 'build/windows/icon.ico'
target.parent.mkdir(parents=True, exist_ok=True)
with Image.open(root / 'public/assets/ios27/icon-512.png') as source:
    source.save(target, sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)])
