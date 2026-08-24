#!/usr/bin/env python3
"""Re-encode Brizo's licensed bundled UI font as lossless-glyph WOFF2."""

from pathlib import Path
import sys

from fontTools.ttLib import TTFont


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: convert-font-to-woff2.py SOURCE.ttf OUTPUT.woff2")
    source = Path(sys.argv[1]).resolve()
    destination = Path(sys.argv[2]).resolve()
    if source.suffix.lower() != ".ttf" or destination.suffix.lower() != ".woff2":
        raise SystemExit("expected a .ttf source and .woff2 destination")
    destination.parent.mkdir(parents=True, exist_ok=True)
    font = TTFont(source, recalcBBoxes=False, recalcTimestamp=False)
    font.flavor = "woff2"
    font.save(destination, reorderTables=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
