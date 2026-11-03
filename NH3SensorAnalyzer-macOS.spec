# Separate, opt-in Mac distribution. NH3SensorAnalyzer.spec remains Windows-only.
from importlib.metadata import distribution
import sys

if sys.platform != 'darwin':
    raise RuntimeError('Build this .app on macOS; use NH3SensorAnalyzer.spec on Windows.')

av_dist = distribution('av')
av_license = next(av_dist.locate_file(p) for p in av_dist.files
                  if str(p).endswith('.dist-info/licenses/LICENSE.txt'))
a = Analysis(
    ['app.py'], pathex=[], binaries=[],
    datas=[('frontend', 'frontend'), ('licenses', 'licenses'),
           (str(av_license), 'licenses/PyAV')],
    hiddenimports=['webview.platforms.cocoa'], hookspath=[], hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'webview.platforms.winforms', 'webview.platforms.edgechromium',
              'webview.platforms.qt', 'webview.platforms.gtk', 'PyQt5', 'PyQt6',
              'PySide2', 'PySide6', 'pythonnet', 'clr'],
    noarchive=False, optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True, name='NH3SensorAnalyzer',
    debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
    console=False, disable_windowed_traceback=False, argv_emulation=False,
    target_arch=None, codesign_identity=None, entitlements_file=None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False,
               name='NH3SensorAnalyzer')
app = BUNDLE(
    coll, name='NH3SensorAnalyzer.app',
    icon='assets/NH3SensorAnalyzer_Flangi_Final.icns',
    bundle_identifier='marineusus.NH3SensorAnalyzer.Flangi', version='1.4.3',
    info_plist={
        'CFBundleDisplayName': 'NH₃ Sensor Analysis',
        'CFBundleShortVersionString': '1.4.3',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '14.0',
        'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True},
    },
)
