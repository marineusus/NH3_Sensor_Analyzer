"""Opt-in full extraction of local camera files; never changes the inputs.

Usage: python tests/real_camera_smoke.py FOLDER RESULT.json [--fps .5]
The result stores timing/coverage evidence, not the user's video or ROI pixels.
"""
import argparse
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from analyzer import analyze_video


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('folder', type=Path)
    parser.add_argument('result', type=Path)
    parser.add_argument('--fps', type=float, default=.5)
    args = parser.parse_args()
    paths = sorted(args.folder.glob('VID-*.mp4'))
    roi = dict(ids_runs=[[y * 960 + 610, 80] for y in range(220, 320)],
               rect=[0, 0, 0, 0], variants=[])
    config = dict(fps=args.fps, white_enabled=False, relative_start=0,
                  relative_end=30, first_injection_auto=False, baseline_window=30,
                  response_pixel_rule=dict(metric='V', k=3, delta_min=1),
                  response_excluded_times=[], decoder_mode='auto',
                  cycle_plan=[dict(gas_on_s=1000 + i*1500,
                                   gas_off_s=1500 + i*1500,
                                   recovery_end_s=2500 + i*1500) for i in range(4)])
    started = time.perf_counter()
    stats = {}
    last_write = 0

    def save(state, **extra):
        args.result.write_text(json.dumps(dict(state=state, fps=args.fps,
            elapsed_s=time.perf_counter()-started, files=stats, **extra),
            ensure_ascii=False, indent=2), encoding='utf-8')

    def sink(row):
        name = row['video']
        f = stats.setdefault(name, dict(rows=0, first_s=row['time_s'], last_s=-1,
            max_request_difference_s=0, beyond_355=False, timestamp_sources=[]))
        assert row['time_s'] > f['last_s'], 'Duplicate or backwards PTS'
        assert 0 <= row['raw_R'] <= 255 and 0 <= row['raw_V'] <= 1
        f['last_s'] = row['time_s']
        f['rows'] += 1
        f['beyond_355'] |= row['time_s'] > 355
        f['max_request_difference_s'] = max(f['max_request_difference_s'],
            abs(row['time_s']-row['requested_time_s']))
        if row['timestamp_source'] not in f['timestamp_sources']:
            f['timestamp_sources'].append(row['timestamp_source'])

    def progress(p, cal, metas):
        nonlocal last_write
        if time.perf_counter()-last_write > 3:
            save('running', progress=p)
            last_write = time.perf_counter()

    try:
        result = analyze_video(paths, roi, config, progress=progress, sink=sink)
        assert not result['cancelled'] and len(stats) == len(paths)
        for meta in result['file_meta']:
            assert stats[meta['name']]['last_s'] > meta['duration_s']-max(5, 1/args.fps+1), meta['name']+' final sample outside expected interval'
        save('done', file_meta=result['file_meta'])
    except Exception as error:
        save('error', error=str(error))
        raise


if __name__ == '__main__':
    main()
