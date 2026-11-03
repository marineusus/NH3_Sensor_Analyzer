"""Run the frozen Mac engine and check a real Cocoa window, not a renamed EXE."""
from pathlib import Path
import json
import os
import platform
import plistlib
import subprocess
import tempfile
import time
import av
import numpy as np
import Quartz

root = Path(__file__).resolve().parents[1]
bundle = root/'dist/NH3SensorAnalyzer.app'
exe = bundle/'Contents/MacOS/NH3SensorAnalyzer'
out = root/'mac-validation'
out.mkdir(exist_ok=True)
info = plistlib.loads((bundle/'Contents/Info.plist').read_bytes())
assert info['CFBundleIdentifier'] == 'marineusus.NH3SensorAnalyzer.Flangi'
assert info['CFBundleShortVersionString'] == '1.4.3'
assert (bundle/'Contents/Resources'/info['CFBundleIconFile']).is_file()
assert (bundle/'Contents/Resources/frontend/index.html').is_file()
assert len(list((bundle/'Contents/Resources/frontend').rglob('*.ttf'))) >= 2
architecture = subprocess.check_output(['lipo', '-archs', str(exe)], text=True).strip()
assert architecture == platform.machine(), (architecture, platform.machine())
assert not list(bundle.rglob('*.pyd')) and not list(bundle.rglob('*.dll'))

with tempfile.TemporaryDirectory(prefix='nh3-mac-') as temp:
    folder = Path(temp)/'한글 영상 경로'
    folder.mkdir()
    clip = folder/'VID-0000.mp4'
    with av.open(str(clip), 'w') as container:
        stream = container.add_stream('mpeg4', rate=4)
        stream.width, stream.height, stream.pix_fmt = 160, 90, 'yuv420p'
        for i in range(32):
            image = np.full((90, 160, 3), [30+i, 100, 180], dtype=np.uint8)
            frame = av.VideoFrame.from_ndarray(image, format='bgr24')
            container.mux(stream.encode(frame))
        container.mux(stream.encode(None))
    report = out/'frozen-engine.json'
    subprocess.run([str(exe), '--verify-videos', str(folder), '--verification-output', str(report)],
                   cwd=temp, check=True, timeout=90)
    engine = json.loads(report.read_text())
    assert engine['state'] == 'done' and engine['total_rows'] == 4, engine
    stdout = out/'frozen-startup.log'
    with stdout.open('w') as log:
        app = subprocess.Popen([str(exe)], cwd=temp, stdout=log, stderr=subprocess.STDOUT)
        try:
            window = None
            deadline = time.monotonic()+40
            while time.monotonic() < deadline:
                if app.poll() is not None:
                    raise AssertionError('App exited during startup: '+stdout.read_text())
                windows = Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionAll, 0)
                window = next((w for w in windows
                               if w.get('kCGWindowOwnerPID') == app.pid
                               and w.get('kCGWindowBounds', {}).get('Width', 0) >= 900
                               and w.get('kCGWindowBounds', {}).get('Height', 0) >= 600), None)
                if window:
                    break
                time.sleep(.5)
            assert window is not None, 'No native application window'
            time.sleep(5)
            assert app.poll() is None, stdout.read_text()
            # Screen capture may be denied by the runner; never report a missing capture as visual QA.
            capture = subprocess.run(['screencapture', '-x', '-l', str(window['kCGWindowNumber']),
                                      str(out/'frozen-window.png')], capture_output=True, text=True, timeout=15)
            (out/'frozen-bundle.json').write_text(json.dumps(dict(
                architecture=architecture, os=platform.mac_ver(),
                native_window=True, window_bounds=dict(window['kCGWindowBounds']),
                screen_capture_available=capture.returncode == 0,
                screen_capture_message=capture.stderr, icon=info['CFBundleIconFile'],
                bundle_identifier=info['CFBundleIdentifier'], frozen_engine_rows=engine['total_rows'],
                frontend_present=True, font_files_present=True,
            ), ensure_ascii=False, indent=2), encoding='utf-8')
        finally:
            app.terminate()
            try:
                app.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app.kill()
                app.wait()
print('Frozen Mac engine, resources, architecture, icon, and native window passed.')
