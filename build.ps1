$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path -LiteralPath '.venv/Scripts/python.exe')) { py -3.14 -m venv .venv }
& ./.venv/Scripts/python.exe -m pip install -r requirements-build.txt
if ($LASTEXITCODE) { throw 'Dependency installation failed' }
& ./.venv/Scripts/python.exe -m PyInstaller --noconfirm --clean --onedir --windowed --name NH3SensorAnalyzer --add-data 'frontend;frontend' --exclude-module tkinter app.py
if ($LASTEXITCODE) { throw 'Build failed' }
Write-Host 'Build complete: dist/NH3SensorAnalyzer/NH3SensorAnalyzer.exe'
