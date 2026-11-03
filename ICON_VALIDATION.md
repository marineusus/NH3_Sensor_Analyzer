# v1.4.1 플랑이 최종 아이콘 검증

- 제공된 `NH3SensorAnalyzer_Flangi_Final.ico` 원본을 그대로 적용. SHA256: `4a5307e4bccb7ccc2f5d17f1b1cc8657343f81d7da195a2e018bcd0fb1280931`.
- 16/20/24/30/32/36/40/48/64/96/128/256px 12개 RGBA 리소스를 EXE에서 추출하여 원본과 바이트 일치 확인. 투명 배경·반투명 가장자리 유지. 이미지 재생성·크롭·색상 변경 없음.
- 실행 창 WM_GETICON, 탐색기 EXE Shell 아이콘, 바탕화면 및 시작 메뉴 바로가기 Shell 아이콘을 밝고 어두운 배경에 렌더링하여 투명 모서리 확인.
- Windows AppUserModelID: `marineusus.NH3SensorAnalyzer.Flangi`. 바로가기는 새 v1.4.1 EXE 리소스에 연결. 사용자가 별도로 고정한 작업표시줄 항목은 강제 삭제하거나 전체 캐시를 초기화하지 않음.
- 기존 `assets/app.ico` 제거, spec은 새 ICO 참조. onedir/windowed 및 최소 OpenCV 빌드 옵션 유지. ICO/참고 PNG 중복 배포 없음.
- 이전 v1.4와 내장 PYZ 분석 엔진 바이트 동일. `_internal`은 base_library.zip의 ZIP 메타데이터 외 동일하며 해당 ZIP의 모든 파일 내용도 동일. UI·분석·ROI 계산 변경 없음.
- 이전 v1.4 7z 한 개를 백업으로 보관하고 오래된 사용자용 배포 폴더와 중복 압축본 정리.

아래는 이전 버전 검증 기록입니다.

# 이전 아이콘 및 프리셋 표 검증

## 아이콘

- 사용자 ZIP의 ICO를 변환하지 않고 `assets/app.ico`로 보존. SHA256: `4bfd582e29a1cfe84675c2a1019b6fa01bcc2a61fcf0bff92af591596e28e0fc`.
- 16/24/32/48/64/128/256px, 32bit PNG 7개 모두 alpha=0 투명 픽셀과 반투명 가장자리 유지. 모든 크기의 네 모서리 alpha=0.
- PyInstaller EXE의 RT_GROUP_ICON 1개와 RT_ICON 7개를 다시 추출해 크기/알파 확인. 별도 참고 PNG/ZIP은 배포하지 않음.
- 실제 실행 창 WM_GETICON 큰 아이콘, 탐색기의 EXE Shell 아이콘, 실제 바탕화면에 만든 테스트 바로가기 Shell 아이콘 확인. 밝은/어두운 배경 DrawIconEx 렌더링에서 투명 모서리는 배경색 그대로 유지. 검은 사각형으로 평탄화되지 않음.
- 실제 프로그램 제목 표시줄과 탐색기 상세 아이콘도 화면으로 확인. 작업표시줄은 전용 AppUserModelID와 실행 창 큰 아이콘을 사용하도록 연결. 기존 사용자가 고정해 둔 항목의 캐시/다른 PC의 작업표시줄 상태까지 변경하거나 검증한 것은 아님.
- 소스 실행은 ICO 파일을 사용하고, 배포 실행 창은 EXE에 내장된 아이콘을 사용하므로 중복 ICO를 배포 폴더에 넣지 않음.

## 빌드/의존성

- 기존 onedir/windowed, frontend 데이터, tkinter 제외, UPX/strip 등 spec 옵션 유지. `build.ps1`은 추적하는 spec으로 빌드하도록 연결.
- 새 외부 의존성 없음. 앱 시작 시 Windows 아이콘 그룹 식별과 소스 실행 아이콘 지정만 추가. 분석기와 검출기, API 형식은 변경하지 않음.
- 새 배포본 파일 170개 약 181.94MB(문서 추가 전). SHA256 기준 완전히 같은 중복 파일 0.
- 큰 파일은 OpenCV, FFmpeg, NumPy OpenBLAS. `libscipy_openblas...dll`은 NumPy 의존성이며 별도 SciPy 기능을 새로 추가한 것이 아님.
- WebView2의 아키텍처별 Loader들은 라이브러리의 런타임 탐색 코드가 참조하므로 임의 삭제하지 않음. GUI/영상/수치 기능을 줄여 용량을 맞추지 않음.

## 사용자가 추가 요청한 프리셋 표 수정

- 분석/UI 전반은 그대로 유지하되 `dashboard.css`의 #planTable 규칙만 추가. 농도/주입/회복 입력은 한 줄, 계산 시간은 다음 줄로 배치.
- 1600×900 및 1366×768에서 확인: 행 높이 약 101.94px, 헤더 47.88px, 시간 표시 폭 각각 335px/281px. 한 글자씩 세로로 쪼개지는 현상 제거.
- 검사 전후 3회차의 [10,500,1000] 입력값 일치. 수식/프리셋 데이터 변경 없음.
- 기능 자동 검사 8개 통과. frontend SHA 비교에서 이 CSS 외 변경 없음.
