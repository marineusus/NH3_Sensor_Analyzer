param([string]$MinimalOpenCV='')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path -LiteralPath '.venv/Scripts/python.exe')) { py -3.14 -m venv .venv }
& ./.venv/Scripts/python.exe -m pip install -r requirements-build.txt
if ($LASTEXITCODE) { throw 'Dependency installation failed' }
if ($MinimalOpenCV) {
    $nh3MinimalPath=(Resolve-Path -LiteralPath $MinimalOpenCV).Path
    if (!(Test-Path -LiteralPath (Join-Path $nh3MinimalPath 'cv2.pyd'))) { throw 'Minimal OpenCV module not found' }
    $env:NH3_MINIMAL_OPENCV=$nh3MinimalPath
} else {
    Remove-Item Env:\NH3_MINIMAL_OPENCV -ErrorAction SilentlyContinue
}
& ./.venv/Scripts/python.exe -m PyInstaller --noconfirm --clean NH3SensorAnalyzer.spec
if ($LASTEXITCODE) { throw 'Build failed' }
Write-Host 'Build complete: dist/NH3SensorAnalyzer/NH3SensorAnalyzer.exe'
