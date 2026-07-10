import math
import os
import struct
import zlib

BG = (79, 70, 229)  # indigo-600
FG = (255, 255, 255)


def render_png_bytes(size, bg=BG, fg=FG):
    w = h = size
    cx, cy = w / 2, h / 2
    outer_r = w * 0.38
    # Floors keep the ring/hands from anti-aliasing away to nothing at 16-32px tray sizes,
    # where a pure w*0.045 thickness rounds down to a sub-pixel gap.
    ring_thickness = max(w * 0.045, 1.5)
    hand_min_len = w * 0.24
    hand_hour_len = w * 0.15
    hand_thickness = max(w * 0.035, 1.3)
    angle_min = math.radians(-90 + 70)
    angle_hour = math.radians(-90 + 160)

    def near_segment(x, y, angle, length, thickness):
        ex, ey = cx + length * math.cos(angle), cy + length * math.sin(angle)
        seg_dx, seg_dy = ex - cx, ey - cy
        seg_len2 = seg_dx * seg_dx + seg_dy * seg_dy
        t = max(0, min(1, ((x - cx) * seg_dx + (y - cy) * seg_dy) / seg_len2))
        px, py = cx + t * seg_dx, cy + t * seg_dy
        return math.hypot(x - px, y - py) <= thickness

    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type: None
        for x in range(w):
            dist = math.hypot(x - cx, y - cy)
            on_ring = outer_r - ring_thickness <= dist <= outer_r
            on_hand = near_segment(x, y, angle_min, hand_min_len, hand_thickness) or \
                near_segment(x, y, angle_hour, hand_hour_len, hand_thickness)
            on_center = dist <= max(w * 0.035, 1.3)
            r, g, b = fg if (on_ring or on_hand or on_center) else bg
            raw += bytes([r, g, b, 255])

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


def make_png(path, size, bg=BG, fg=FG):
    png = render_png_bytes(size, bg, fg)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


def make_ico(path, sizes, bg=BG, fg=FG):
    """Windows .ico with one PNG-compressed frame per size (supported since Vista) —
    avoids hand-rolling the uncompressed BMP/DIB frame format ICO also allows."""
    images = [render_png_bytes(s, bg, fg) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = bytearray()
    for s, data in zip(sizes, images):
        wb = s if s < 256 else 0
        hb = s if s < 256 else 0
        entries += struct.pack("<BBBBHHII", wb, hb, 0, 0, 1, 32, len(data), offset)
        offset += len(data)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(header)
        f.write(entries)
        for data in images:
            f.write(data)


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "dashboard", "public", "icons")
    for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
        make_png(os.path.join(base, name), size)
        print(f"wrote {name} ({size}x{size})")

    ico_path = os.path.join(os.path.dirname(__file__), "..", "agent", "icon.ico")
    make_ico(ico_path, [16, 32, 48, 256])
    print(f"wrote agent/icon.ico (16,32,48,256)")
