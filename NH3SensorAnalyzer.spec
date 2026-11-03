# -*- mode: python ; coding: utf-8 -*-
from importlib.metadata import distribution
import os
from pathlib import Path

minimal_cv = os.environ.get('NH3_MINIMAL_OPENCV')
if minimal_cv and not (Path(minimal_cv)/'cv2.pyd').is_file():
    raise ValueError('NH3_MINIMAL_OPENCV must contain the verified minimal cv2.pyd')


a = Analysis(
    ['app.py'],
    pathex=[minimal_cv] if minimal_cv else [],
    binaries=[],
    datas=[('frontend', 'frontend'), ('licenses', 'licenses'),
           (str(distribution('av').locate_file('av-19.0.2.dist-info/licenses/LICENSE.txt')), 'licenses/PyAV')],
    hiddenimports=[],
    hookspath=['packaging/minimal-hooks'] if minimal_cv else [],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter'],
    noarchive=False,
    optimize=0,
)
# Video decoding now uses PyAV. OpenCV's separate VideoCapture FFmpeg plugin
# is no longer called by the app; retaining it would duplicate the decoder.
a.binaries = [entry for entry in a.binaries if 'opencv_videoio_ffmpeg' not in entry[0].lower()]
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='NH3SensorAnalyzer',
    icon='assets/NH3SensorAnalyzer_Flangi_Final.ico',
    version='packaging/version_info.txt',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='NH3SensorAnalyzer',
)
