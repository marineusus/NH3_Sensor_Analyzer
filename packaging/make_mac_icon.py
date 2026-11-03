"""Convert the existing approved ICO to ICNS; never redraw or crop the icon."""
from pathlib import Path
import struct
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
source = ROOT/'assets/NH3SensorAnalyzer_Flangi_Final.ico'
data = source.read_bytes()
reserved, kind, count = struct.unpack_from('<HHH', data)
assert (reserved, kind) == (0, 1)
images = []
for i in range(count):
    w, h, _, _, _, _, size, offset = struct.unpack_from('<BBBBHHII', data, 6+i*16)
    payload = data[offset:offset+size]
    if payload.startswith(b'\x89PNG\r\n\x1a\n'):
        images.append((w or 256, h or 256, payload))
_, _, png = max(images, key=lambda item: item[0]*item[1])
image = cv2.imdecode(np.frombuffer(png, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
assert image.shape[2] == 4 and image[:, :, 3].min() == 0
chunks = []
for size, tag in [(16, b'icp4'), (32, b'icp5'), (64, b'icp6'), (128, b'ic07'),
                  (256, b'ic08'), (512, b'ic09'), (1024, b'ic10')]:
    scaled = cv2.resize(image, (size, size), interpolation=cv2.INTER_AREA if size<image.shape[0] else cv2.INTER_LINEAR)
    ok, encoded = cv2.imencode('.png', scaled)
    assert ok
    payload = encoded.tobytes()
    chunks.append(tag+struct.pack('>I', len(payload)+8)+payload)
payload = b''.join(chunks)
target = source.with_suffix('.icns')
target.write_bytes(b'icns'+struct.pack('>I', len(payload)+8)+payload)
print(target.name, target.stat().st_size)
