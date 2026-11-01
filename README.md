# NH3 Sensor Analyzer

기존 `sensor_analysis_브라우저형_흰색스펀지.html`을 기반으로 만든 Windows 데스크톱 분석기입니다. HTML 화면·ROI·연구 분석 정의를 유지하면서 반복 영상 읽기와 픽셀 연산을 Python/OpenCV/NumPy로 분리했습니다. 인터넷 업로드 없이 원본 파일을 직접 읽습니다.

## 실행

배포본은 **ZIP을 모두 풀고** 폴더 안의 `NH3SensorAnalyzer.exe`를 실행하세요. exe만 다른 곳으로 옮기면 작동하지 않습니다. Windows 10/11 64bit 및 Microsoft Edge WebView2 Runtime이 필요합니다. Python은 배포본에 포함됩니다. 첫 실행·바이러스 검사·PC 성능에 따라 시작 시간은 달라집니다.

소스 실행은 Python 3.14 64bit에서 `start.cmd`를 실행하거나 아래 명령을 사용하세요.

```powershell
py -3.14 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

1. **OpenCV 영상 선택**으로 같은 촬영 폴더의 영상을 고릅니다. 목록에서 순서를 확인하고 위/아래 버튼으로 바꿀 수 있습니다. 같은 이름의 다른 폴더 파일은 혼합하지 않습니다. `._` 메타 파일·복사본은 제외합니다.
2. 미리보기 장면을 고르고 **스펀지 클릭 선택**을 누른 뒤 분석할 스펀지 **중앙을 클릭**합니다. 두 개가 있어도 클릭한 하나의 윤곽만 잡습니다. 노랑 윤곽·주황 Edge·초록 최종 ROI를 확인하세요. 색·질감 분할이 불확실하면 검색 범위를 좁히거나 기존 수동 윤곽 지정을 사용합니다. 스펀지를 식별하는 대형 학습 모델은 넣지 않았습니다. 클릭한 부분의 기하 제안만 하며, 분석 픽셀의 색을 필터링하지 않습니다.
3. 기존 흰색 기준 드래그/흰 스펀지 잡기, Edge 비율/픽셀, 내부 회전 직사각형/윤곽 분석을 그대로 사용합니다. 한 번 고른 ROI는 추출 중 추적하거나 색으로 재선별하지 않습니다.
4. FPS, 주입·제거·회복 시각, 초기 White 구간을 설정하고 추출합니다. 기존 기본 FPS **0.5**를 임의로 바꾸지 않았습니다. 자동 시각 추정과 직접 입력도 기존과 같습니다.
5. 진행 중 취소하면 이미 추출한 표본을 보존합니다. CSV, Excel, 그래프, 설정 JSON, 보고서와 사진 기능은 기존 화면에서 사용합니다. 다운로드 저장 위치는 WebView2의 저장 대화상자에서 선택합니다.

## 역할 분담

| 영역 | 담당 |
| --- | --- |
| `analyzer.py` | FFmpeg 영상 디코딩, 960×540 축소, 선택 표본 추출, Float64 픽셀별 RGB/HSV·White 보정·논문 S·반응 픽셀·Edge 비교 |
| `app.py` | 파일 대화상자, 제한된 프레임 미리보기, 별도 작업 스레드, 진행률·취소·증분 결과, 반응 마스크 |
| `detection.py` | 사용자가 클릭한 스펀지 윤곽 분할 (색·질감/GrabCut) |
| `frontend/js/desktop.js` | 화면/엔진 연결, 비동기 결과 수신, 미리보기·스펀지 클릭 선택 |
| `frontend/js/legacy-*.js` | 기존 ROI 기하·시간 추정·통계·t90·회복·추천·품질 검토·그래프·내보내기 정의 |
| `reference/original.html` | 사용자가 제공한 원본 스냅샷. 실행/배포에는 포함하지 않음 |

반복 픽셀 연산은 Python에 있고, 기하 계산과 표본 평균 시계열의 통계는 기존 JavaScript 정의를 유지합니다. 분석 정의를 한꺼번에 다시 쓰면서 발생할 회귀를 피하기 위한 선택입니다. 전체 분석을 Python으로 재작성했다고 표현하지 않습니다. ROI 각도 탐색은 기존 5° 후 상위 후보 근방 1° 방식이며 연속 각도 전역 최대를 보장하지 않습니다.

## 보존한 분석 규칙

- 원본과 같은 960×540 좌표와 letterbox, 프론트에서 확정한 정확한 pixel runs를 전달합니다. 분석을 위해 회전/warp하지 않습니다.
- Raw, 기존 200/White gain, 초기 White/current White의 Relative를 분리합니다. 픽셀별 보정→0~255 clip→HSV 순서와 채도 가중 원형 평균 H를 유지합니다. 양자화된 OpenCV uint8 HSV로 대체하지 않았습니다.
- White 여러 표본의 중앙값, 포화·암부 제외, White 미지정 시 Raw, 픽셀별 표본 SD와 엄격한 `>` 반응 판정, 3표본 연속 t90/onset 등 기존 정의를 유지합니다.
- FPS는 사용자가 정한 표본 간격입니다. 빠르게 만들기 위해 강제로 1fps로 낮추지 않습니다. 모든 프레임의 RGB를 UI로 보내지 않으며 압축된 원본을 통째로 메모리에 올리지 않습니다.
- 프레임별 요청 시각과 실제 디코더 시각을 모두 기록합니다. 디코더 timestamp가 불가능하면 frame index/FPS 근사임을 CSV에 표시합니다.

**동일 수식이 기존 영상 CSV와 비트 단위로 같은 값을 뜻하지는 않습니다.** 브라우저와 FFmpeg의 색 변환 및 Canvas/OpenCV 보간 차이가 있습니다. 같은 RGB 입력에서 수식 일치 검사를 수행하며 디코더 변경은 설정 JSON에 기록합니다. 연구 결과를 교체하기 전 대표 원본 영상에서 기존 추출과의 차이를 검토하세요. 평활화·자동 ROI 이동·자동 이상치 제거는 추가하지 않았습니다.

## 검증 및 빌드

```powershell
# Node.js는 원본 JS와의 비교 테스트에만 필요합니다.
.\.venv\Scripts\python -m unittest discover -s tests -v
# WebView2 통합 검사: 임시 합성 영상을 만들고 실제 창에서 추출/Excel 생성
.\.venv\Scripts\python tests/desktop_smoke.py
# 폴더형 배포본
powershell -File build.ps1
```

`requirements-lock.txt`는 검증 환경 전체 의존성 기록입니다. 배포 크기/실행 시간/분석 속도는 실측값을 `VALIDATION.md`에 기록하며 30MB·1초 실행·10배 개선을 보장하지 않습니다. 무거운 ML/과학 그래프 패키지를 추가하지 않았습니다. 보고서용 한글 글꼴은 원본에 포함되어 있던 것을 유지했습니다.

오류 로그: `%LOCALAPPDATA%\NH3SensorAnalyzer\app.log`. 기본 동작은 영상을 읽기만 합니다. 영상·추출 결과·실험 설정은 Git에 자동 업로드하지 않습니다.
