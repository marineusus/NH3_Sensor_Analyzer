#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This build requires macOS. Windows release: build.ps1' >&2
  exit 1
fi
PYTHON="${NH3_PYTHON:-python3.14}"
"$PYTHON" -m venv .venv-macos
.venv-macos/bin/python -m pip install -r requirements-build.txt
.venv-macos/bin/python packaging/make_mac_icon.py
.venv-macos/bin/python -m PyInstaller --noconfirm --clean NH3SensorAnalyzer-macOS.spec
codesign --verify --deep --strict dist/NH3SensorAnalyzer.app
echo 'Build complete: dist/NH3SensorAnalyzer.app'
