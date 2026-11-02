"""Opt-in packaged-engine verification; never changes video or UI state."""
import json
import math
import time
from pathlib import Path
from analyzer import analyze_video


def verify_video_folder(folder, output, fps=.5):
    folder, output = Path(folder), Path(output)
    paths = sorted(folder.glob('VID-*.mp4'))
    if not paths:
        raise ValueError('No VID-*.mp4 files in verification folder')
    output.parent.mkdir(parents=True, exist_ok=True)
    roi = dict(ids_runs=[[y*960+610,80] for y in range(220,320)],
               rect=[0,0,0,0], variants=[])
    config = dict(fps=fps,white_enabled=False,relative_start=0,relative_end=30,
        first_injection_auto=False,baseline_window=30,decoder_mode='auto',
        response_pixel_rule=dict(metric='V',k=3,delta_min=1),response_excluded_times=[],
        cycle_plan=[dict(gas_on_s=1000+i*1500,gas_off_s=1500+i*1500,
                        recovery_end_s=2500+i*1500) for i in range(4)])
    started, last_write, stats = time.perf_counter(),0,{}

    def save(state, **extra):
        value=dict(state=state,fps=fps,elapsed_s=time.perf_counter()-started,
            scope='Engine verification; fixed 8000-pixel ROI inside right sponge; Raw; not an experimental result for a user-edited ROI',
            files=stats,**extra)
        temp=output.with_suffix(output.suffix+'.tmp')
        temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
        temp.replace(output)

    def sink(row):
        f=stats.setdefault(row['video'],dict(rows=0,first_s=row['time_s'],last_s=-1,
            max_request_difference_s=0,beyond_355=False,timestamp_sources=[]))
        if row['time_s']<=f['last_s'] or not all(math.isfinite(row['raw_'+k]) for k in ('R','G','B','V')):
            raise ValueError('Invalid or non-increasing real-frame sample')
        if not (0<=row['raw_R']<=255 and 0<=row['raw_V']<=1):
            raise ValueError('RGB/HSV outside original units')
        f.update(last_s=row['time_s'],rows=f['rows']+1,
            beyond_355=f['beyond_355'] or row['time_s']>355,
            max_request_difference_s=max(f['max_request_difference_s'],
                abs(row['time_s']-row['requested_time_s'])))
        if row['timestamp_source'] not in f['timestamp_sources']:
            f['timestamp_sources'].append(row['timestamp_source'])

    def progress(p, cal, metas):
        nonlocal last_write
        if time.perf_counter()-last_write>3:
            save('running',progress=p)
            last_write=time.perf_counter()

    save('running')
    try:
        result=analyze_video(paths,roi,config,progress=progress,sink=sink)
        if result['cancelled'] or len(stats)!=len(paths):
            raise ValueError('Verification stopped before all files completed')
        for meta in result['file_meta']:
            if stats[meta['name']]['last_s']<=meta['duration_s']-max(5,1/fps+1):
                raise ValueError(meta['name']+' final sample outside expected interval')
        save('done',percent=100,total_rows=sum(f['rows'] for f in stats.values()),
             file_meta=result['file_meta'])
    except Exception as error:
        save('error',error=str(error))
        raise
