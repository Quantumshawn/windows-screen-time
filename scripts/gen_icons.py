import math
import os
import struct
import zlib

BG = (79, 70, 229)  # indigo-600
FG = (255, 255, 255)


def make_png(path, size, bg=BG, fg=FG):
    w = h = size
    cx, cy = w / 2, h / 2
    outer_r = w * 0.38
    ring_thickness = w * 0.045
    hand_min_len = w * 0.24
    hand_hour_len = w * 0.15
    hand_thickness = w * 0.035
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
            on_center = dist <= w * 0.035
            r, g, b = fg if (on_ring or on_hand or on_center) else bg
            raw += bytes([r, g, b, 255])

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(__file__), "..", "dashboard", "public", "icons")
    for size, name in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
        make_png(os.path.join(base, name), size)
        print(f"wrote {name} ({size}x{size})")
