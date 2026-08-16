#!/usr/bin/env python3

from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "logo pic.svg"
BUILD = ROOT / "build"
ICONSET = BUILD / "icon.iconset"
LINUX_ICONS = BUILD / "icons"


def rasterize_svg(output: Path, size: int = 1400) -> None:
    if shutil.which("sips"):
        subprocess.run(
            ["sips", "-s", "format", "png", str(SOURCE), "--out", str(output)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        subprocess.run(
            ["sips", "-Z", str(size), str(output)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        return

    if shutil.which("rsvg-convert"):
        subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(output), str(SOURCE)],
            check=True,
        )
        return

    if shutil.which("magick"):
        subprocess.run(
            ["magick", "-background", "none", str(SOURCE), "-resize", f"{size}x{size}", str(output)],
            check=True,
        )
        return

    try:
        import cairosvg
    except ImportError as error:
        raise SystemExit(
            "SVG rasterization needs sips, rsvg-convert, ImageMagick, or Python CairoSVG"
        ) from error
    cairosvg.svg2png(url=str(SOURCE), write_to=str(output), output_width=size)


def make_macos_style_icon(source: Image.Image) -> Image.Image:
    render_size = 2048
    tile_inset = 160
    tile_radius = 380
    logo_limit = 1298
    canvas = Image.new("RGBA", (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (tile_inset, tile_inset, render_size - tile_inset, render_size - tile_inset),
        radius=tile_radius,
        fill=(255, 255, 255, 255),
    )

    logo = source.convert("RGBA")
    bounds = logo.getbbox()
    if bounds:
        logo = logo.crop(bounds)
    scale = min(logo_limit / logo.width, logo_limit / logo.height)
    logo = logo.resize(
        (max(1, round(logo.width * scale)), max(1, round(logo.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas.alpha_composite(
        logo,
        ((render_size - logo.width) // 2, (render_size - logo.height) // 2),
    )
    return canvas.resize((1024, 1024), Image.Resampling.LANCZOS)


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

    with tempfile.TemporaryDirectory(prefix="brizo-icon-") as temporary_directory:
        raster_path = Path(temporary_directory) / "logo.png"
        rasterize_svg(raster_path)
        with Image.open(raster_path).convert("RGBA") as source:
            square = make_macos_style_icon(source)
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

    print("Prepared Brizo app icons from logo pic.svg on a white macOS-style tile")


if __name__ == "__main__":
    main()
