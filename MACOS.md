# 맥북용 별도 배포본

기준 배포본은 계속 Windows EXE입니다. 이번 Mac 패키지만 따로 빌드하며 분석 수식, ROI, White Reference, RGB/HSV, 화면과 결과 저장은 같은 소스를 사용합니다.

- macOS 14 이상. 빌드·자동 검증 환경의 실제 버전은 함께 제공하는 검증 기록에 남깁니다.
- `AppleSilicon`: M1/M2/M3/M4 등 Apple 칩 맥북.
- 이번 배포는 팀원의 M시리즈 맥북용입니다. Intel 버전은 만들지 않습니다.
- 해당 ZIP을 풀고 `NH3SensorAnalyzer.app`을 응용 프로그램 폴더로 옮겨 실행합니다. Python, Homebrew, WebView2 설치는 필요 없습니다.
- Apple Developer ID 서명·공증은 없는 개인/팀 배포본입니다. 신뢰하는 배포본임을 확인한 뒤 차단된다면 시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기를 사용합니다. macOS 보안 기능 전체를 끄지 마세요. [Apple 안내](https://support.apple.com/ko-kr/102445)
- 로그는 `~/Library/Logs/NH3SensorAnalyzer/app.log`에 기록합니다.
- Mac은 Cocoa/WKWebView, Windows는 기존 Edge WebView2를 사용합니다. Mac의 영상 읽기는 같은 PyAV/FFmpeg 소프트웨어 경로이며 Windows D3D11 GPU 가속은 사용하지 않습니다.

## 이번에만 빌드하기

GitHub Actions의 **Build macOS app (manual only)**를 수동 실행합니다. push/태그/스케줄로 자동 빌드하지 않습니다. Apple Silicon Mac 러너에서 빌드하고 ZIP 및 검증 기록을 아티팩트로 남깁니다. ZIP은 macOS `ditto`로 만들어 앱 내부 실행 권한·심볼릭 링크를 유지합니다.

Mac에서 직접 빌드하려면 Python 3.14 설치 후 `bash build-macos.sh`를 실행합니다. 별도 `.venv-macos`와 `NH3SensorAnalyzer-macOS.spec`을 사용합니다. Windows `build.ps1`과 `NH3SensorAnalyzer.spec`은 그대로 유지합니다.

아이콘은 기존 확정 ICO의 가장 큰 PNG를 ICNS 해상도별로 변환합니다. 디자인·얼굴·색·투명 배경·비율을 바꾸거나 자르지 않습니다. 확대 해상도는 새 디테일을 그린 것이 아닙니다.
