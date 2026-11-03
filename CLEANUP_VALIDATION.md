# v1.4.2 코드 정리 검증

- JS 파일: 20개 → 14개.
- JS 원본: 382,264 → 358,840바이트 (23,424바이트, 6.13% 감소). minify나 난독화 없이 중복 구현을 삭제한 크기.
- 옛 브라우저용 자동 센서 검출, 영상 요소/파일 선택 핸들러, 픽셀 RGB/HSV·White Baseline·논문 S·반응 마스크 중복 계산, 숨겨진 가중치 편집기, 빈 패치 스크립트 제거.
- ROI 실측색·현재 장면 기준색·H 검산은 Python analyzer.sample 공용 계산 사용. 최신 미리보기 RGB 프레임 1개만 캐시하며 디코더 변경 시 폐기.
- 늦게 도착한 응답이 현재 ROI를 덮지 않는지 검사: ROI A → B 요청 대기 → 캐시된 A로 복귀 → B 늦은 응답에서도 A 색 유지.
- 연구 분석 엔진 analyzer.py와 검출기 detection.py, ICO 원본은 변경하지 않음. ROI 기하·White 선택·시계열 통계·그래프·사진·보고서 기능 보존.

## 검증

- unittest 11개 통과: 원본 JS와의 수식 비교, 실제 PTS/빈 카메라 표본, 취소/연결 영상, White 보정, 미리보기 API 캐시.
- 실제 WebView2 통합: 합성 영상 16표본, 기존 first/last/cycles/ROI/calibration 수치 기준과 동일. Python 평균색·기준색·픽셀 CRC 기반 H 검산 통과.
- 사진 생성, Excel/ZIP, 7쪽 보고서, 휴대용 HTML의 NanumSquareRound 두 글꼴 확인.
- 1920×1080 / 1600×900 / 1366×768: 영상 비율·ROI 좌표·단계 이동·설정 복원·RGB/HSV 막대·가로 넘침·기능 접근 검사 통과.
- D드라이브 첫 실제 카메라 영상: 0.01 FPS UI 추출이 기존 356초 중단 지점을 지나 EOF까지 완료. 실제 PTS와 sampling 표본 수 일치, partial=false.
- 이전 D영상 16개 0.5 FPS 완주 이력은 DECODE_VALIDATION.md 참조. 이번 프론트 정리에서 16개 전체를 반복 추출하지 않음.

배포 용량 대부분은 Python·OpenCV·영상 코덱 DLL입니다. JS 정리 비율이 전체 배포 크기의 감소 비율은 아닙니다. 검사용 원본 HTML, 테스트, 정리 도구는 배포하지 않습니다.
