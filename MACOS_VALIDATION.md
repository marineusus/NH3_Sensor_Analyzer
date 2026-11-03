# Apple Silicon one-off release validation

Windows EXE remains the primary distribution. This is the separately requested
M-series MacBook Air build; future commits do not trigger Mac builds.

- Built source: `eab5235c6eff6fbe5962769fecf50fc432c3a1ec`.
- Run: https://github.com/marineusus/NH3_Sensor_Analyzer/actions/runs/41669094818
- Host: Apple Silicon arm64, macOS 14.8.9, Python 3.14.
- Package: `NH3SensorAnalyzer-v1.4.3-macOS-AppleSilicon.zip`, 82,037,669 bytes.
- SHA-256: `16becb52526efb63cacf51c24e8f7484b3c700d310ecc7ecfb50f53a00eb407e`.

All 13 unit/regression checks passed on Mac. Native Cocoa/WKWebView integration
passed 16 extracted samples against the unchanged numerical baseline using
the shared lossless synthetic fixture. Live preview RGB/H verification, ROI,
Raw/Relative/Legacy calculations, two embedded NanumSquareRound fonts, photos,
Excel generation, and seven report pages passed. This is generated test data;
the user's D-drive experiment videos were not uploaded or tested on the Mac.

The frozen `.app` also read a synthetic video under a Korean folder name and
completed the existing packaged-engine verification. The real native window
was captured and inspected. Resources, fonts, the Flangi ICNS bundle icon,
arm64 Mach-O header, ad-hoc signature, and absence of Windows DLL/PYD files
were checked. The downloaded ZIP passed CRC/SHA-256 verification and retained
executable permissions and 262 symlinks. It was not unpacked on Windows as a
second full copy.

Windows source integration passed the existing 16-sample baseline. The Windows
EXE/release folder, Windows build spec/script, frontend, detector and analysis
engine were not modified. Shared startup changes select the native renderer
and a writable Mac log directory only; the Windows branch is preserved.

The package is ad-hoc signed, without Apple Developer ID signing or Apple
notarization. The teammate's physical MacBook Air and Gatekeeper prompts have
not been tested. See MACOS.md for macOS 14+ installation and first-open steps.
