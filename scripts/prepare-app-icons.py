#!/usr/bin/env python3

from pathlib import Path
import shutil
import subprocess

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "logo app.png"
BUILD = ROOT / "build"
ICONSET = BUILD / "icon.iconset"
LINUX_ICONS = BUILD / "icons"


def contain_on_square(source: Image.Image) -> Image.Image:
    side = max(source.width, source.height)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.alpha_composite(source, ((side - source.width) // 2, (side - source.height) // 2))
    return square


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing app icon source: {SOURCE}")

    BUILD.mkdir(exist_ok=True)
    shutil.rmtree(ICONSET, ignore_errors=True)
    shutil.rmtree(LINUX_ICONS, ignore_errors=True)
    ICONSET.mkdir()
    LINUX_ICONS.mkdir()

    with Image.open(SOURCE).convert("RGBA") as source:
        square = contain_on_square(source)
        resized(square, 1024).save(BUILD / "icon.png", optimize=True)

        iconset_sizes = {
            "icon_16x16.png": 16,
            "icon_16x16@2x.png": 32,
            "icon_32x32.png": 32,
            "icon_32x32@2x.png": 64,
            "icon_128x128.png": 128,
            "icon_128x128@2x.png": 256,
            "icon_256x256.png": 256,
            "icon_256x256@2x.png": 512,
            "icon_512x512.png": 512,
            "icon_512x512@2x.png": 1024,
        }
        for filename, size in iconset_sizes.items():
            resized(square, size).save(ICONSET / filename, optimize=True)

        windows_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        resized(square, 256).save(BUILD / "icon.ico", sizes=windows_sizes)

        for size in (16, 24, 32, 48, 64, 128, 256, 512, 1024):
            resized(square, size).save(LINUX_ICONS / f"{size}x{size}.png", optimize=True)

    if shutil.which("iconutil"):
        subprocess.run(
            ["iconutil", "-c", "icns", str(ICONSET), "-o", str(BUILD / "icon.icns")],
            check=True,
        )
    else:
        print("iconutil is unavailable; skipped build/icon.icns")

    print("Prepared Brizo app icons from logo app.png")


if __name__ == "__main__":
    main()
