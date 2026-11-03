# Portable native integration input

`synthetic.nut` contains 120 entirely synthetic 960×540 RGB frames at 15 FPS.
It is an FFV1 lossless BGR0 stream in NUT (time base 1/61440); no experimental
video is included. It is test data and is never bundled in the app.

The image sequence preserves the decoded RGB pixels from the Windows
`tests/desktop_smoke.py` MPEG-4 fixture that established `analysis-baseline.json`.
Encoding the synthetic MP4 separately with the Mac OpenCV wheel otherwise
introduced one-code-value RGB differences and a different CRC before analysis.
The Mac test now reads the same lossless pixel sequence instead of comparing
different locally encoded videos. It checks the existing numerical baseline
exactly, changing only the expected video filename. No tolerances are widened,
and no expected RGB/HSV, calibration, ROI, or cycle results are updated.

The original Windows-generated MP4 test remains the Windows default.
