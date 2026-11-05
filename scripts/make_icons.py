"""Draw the site icons: a dot-matrix "P" and a red full stop on a dark tile."""

import math
from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
TILE = (0x1C, 0x1C, 0x1C)
INK = (0xFF, 0xFF, 0xFF)
ACCENT = (0xF4, 0x33, 0x25)

GLYPH = (
    "PPP..",
    "P..P.",
    "PPP..",
    "P....",
    "P...R",
)
DOTS = [
    (col, row, ACCENT if mark == "R" else INK)
    for row, line in enumerate(GLYPH)
    for col, mark in enumerate(line)
    if mark != "."
]
COLS, ROWS = len(GLYPH[0]), len(GLYPH)

# Pitch is the dot spacing as a share of the icon. Tab icons fill more of the
# square so the dots survive at 16px. Maskable icons keep every dot inside the
# central 80% circle that Android may crop to.
LAYOUTS = {
    "tab": {"pitch": 0.13, "dot": 0.44, "corner": 0.22},
    "app": {"pitch": 0.1, "dot": 0.4, "corner": 0.22},
    "touch": {"pitch": 0.1, "dot": 0.4, "corner": 0},
    "maskable": {"pitch": 0.08, "dot": 0.4, "corner": 0},
}


def geometry(size, layout):
    pitch = layout["pitch"] * size
    left = (size - (COLS - 1) * pitch) / 2
    top = (size - (ROWS - 1) * pitch) / 2
    radius = layout["dot"] * pitch
    dots = [(left + col * pitch, top + row * pitch, radius, color) for col, row, color in DOTS]
    return dots, layout["corner"] * size


def rounded_rect_alpha(x, y, size, corner):
    if corner <= 0:
        return 1.0
    cx = min(max(x, corner), size - corner)
    cy = min(max(y, corner), size - corner)
    return min(max(corner - math.hypot(x - cx, y - cy) + 0.5, 0.0), 1.0)


def render(size, layout):
    dots, corner = geometry(size, layout)
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            x, y = px + 0.5, py + 0.5
            alpha = rounded_rect_alpha(x, y, size, corner)
            color = TILE
            for dx, dy, radius, ink in dots:
                cover = min(max(radius - math.hypot(x - dx, y - dy) + 0.5, 0.0), 1.0)
                if cover:
                    color = tuple(round(c + (i - c) * cover) for c, i in zip(color, ink))
            row += bytes(color) + bytes([round(alpha * 255)])
        rows.append(bytes(row))
    return png(size, b"".join(rows))


def png(size, raw):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def ico(images):
    offset = 6 + 16 * len(images)
    entries, data = b"", b""
    for size, image in images:
        entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(image), offset + len(data))
        data += image
    return struct.pack("<HHH", 0, 1, len(images)) + entries + data


def svg(layout):
    size = 64
    dots, corner = geometry(size, layout)
    hex_color = lambda rgb: "#%02x%02x%02x" % rgb
    circles = "".join(
        f'<circle cx="{x:g}" cy="{y:g}" r="{r:g}" fill="{hex_color(c)}"/>' for x, y, r, c in dots
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<rect width="{size}" height="{size}" rx="{corner:g}" fill="{hex_color(TILE)}"/>'
        f"{circles}</svg>\n"
    )


def main():
    icons = ROOT / "icons"
    icons.mkdir(exist_ok=True)
    (icons / "favicon.svg").write_text(svg(LAYOUTS["tab"]))
    (ROOT / "favicon.ico").write_bytes(ico([(s, render(s, LAYOUTS["tab"])) for s in (16, 32, 48)]))
    (icons / "apple-touch-icon.png").write_bytes(render(180, LAYOUTS["touch"]))
    (icons / "icon-192.png").write_bytes(render(192, LAYOUTS["app"]))
    (icons / "icon-512.png").write_bytes(render(512, LAYOUTS["app"]))
    (icons / "icon-maskable-512.png").write_bytes(render(512, LAYOUTS["maskable"]))
    print(f"Wrote icons to {icons} and {ROOT / 'favicon.ico'}")


if __name__ == "__main__":
    main()
