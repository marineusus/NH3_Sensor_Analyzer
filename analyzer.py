"""Vectorized pixel engine. Definitions match reference/original.html.

Geometry is supplied as exact pixel runs by the unchanged frontend. No tracking,
warping, denoising, pixel rejection, or implicit change in sampling frequency.
"""
from __future__ import annotations

import base64
import math
import threading
import zlib
from pathlib import Path
import cv2
import numpy as np

W, H = 960, 540


def unpack_runs(runs, minimum=0):
    parts, end = [], 0
    for start, count in runs:
        if not isinstance(start, int) or not isinstance(count, int) or start < end or count <= 0 or start + count > W * H:
            raise ValueError('Invalid ROI pixel runs')
        parts.append(np.arange(start, start + count, dtype=np.intp))
        end = start + count
    ids = np.concatenate(parts) if parts else np.array([], dtype=np.intp)
    if ids.size < minimum:
        raise ValueError('ROI is too small')
    return ids


def corrected_pixels(rgb, gain=None):
    values = rgb.astype(np.float64)
    if gain is not None:
        values *= np.asarray(gain)
    return np.clip(values, 0, 255), float(np.mean(values > 255))


def pixel_stats(rgb, gain=None):
    """Float64 HSV, not quantized OpenCV uint8 HSV; saturation-weighted hue."""
    p, clipped = corrected_pixels(rgb, gain)
    if not len(p):
        raise ValueError('Empty pixel set')
    q = p / 255.0
    hi, lo = q.max(axis=1), q.min(axis=1)
    d = hi - lo
    sat = np.divide(d, hi, out=np.zeros_like(d), where=hi != 0)
    hue = np.zeros_like(d)
    valid = d != 0
    red = valid & (hi == q[:, 0])
    green = valid & ~red & (hi == q[:, 1])
    blue = valid & ~red & ~green
    hue[red] = (q[red, 1] - q[red, 2]) / d[red] % 6
    hue[green] = (q[green, 2] - q[green, 0]) / d[green] + 2
    hue[blue] = (q[blue, 0] - q[blue, 1]) / d[blue] + 4
    angle = (hue * 60 % 360) * np.pi / 180
    x, y, s = np.sum(sat * np.cos(angle)), np.sum(sat * np.sin(angle)), np.sum(sat)
    means = p.mean(axis=0)
    total = p.sum(axis=1)
    good = total > 1e-12
    paper = 1 - 3 * p[good].min(axis=1) / total[good]
    return dict(R=float(means[0]), G=float(means[1]), B=float(means[2]),
                H_deg=float((math.degrees(math.atan2(y, x)) + 360) % 360),
                S=float(sat.mean()), V=float(hi.mean()),
                H_coherence=float(math.hypot(x, y) / s) if s else 0.0,
                clipped_fraction=clipped, paper_S=float(paper.mean()) if len(paper) else None,
                paper_S_valid_pixels=int(good.sum()))


class VideoReader:
    def __init__(self, path, decoder_mode='auto'):
        self.path = str(path)
        params=[cv2.CAP_PROP_HW_ACCELERATION,cv2.VIDEO_ACCELERATION_ANY if decoder_mode=='auto' else cv2.VIDEO_ACCELERATION_NONE]
        self.cap = cv2.VideoCapture(self.path, cv2.CAP_FFMPEG,params)
        if not self.cap.isOpened() and decoder_mode=='auto':
            self.cap = cv2.VideoCapture(self.path, cv2.CAP_FFMPEG)
        self.acceleration=int(self.cap.get(cv2.CAP_PROP_HW_ACCELERATION)) if self.cap.isOpened() else 0
        self.decoder_mode=decoder_mode
        if not self.cap.isOpened():
            raise ValueError(f'Cannot open video: {Path(path).name}')
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.frames = self.cap.get(cv2.CAP_PROP_FRAME_COUNT)
        if not math.isfinite(self.fps) or self.fps <= 0 or self.frames <= 0:
            self.close()
            raise ValueError('Cannot determine video duration/frame rate')
        self.duration = self.frames / self.fps
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.last_index = -1
        self.last_time = None

    def metadata(self):
        return dict(name=Path(self.path).name, duration_s=self.duration,
                    width=self.width, height=self.height, fps=self.fps, frames=int(self.frames),decoder_mode=self.decoder_mode,hw_acceleration=self.acceleration)

    def read(self, target):
        target = max(0.0, min(float(target), self.duration - .001))
        # Seek by presentation time. FFmpeg seeks to a keyframe and decodes forward.
        # Nearby targets use grab(), avoiding repeated keyframe decoding.
        if self.last_time is None or target <= self.last_time + 1e-7 or target - self.last_time > .5:
            if not self.cap.set(cv2.CAP_PROP_POS_MSEC, target * 1000):
                raise ValueError('Decoder could not seek to requested time')
        ok, bgr = self.cap.read()
        if not ok:
            raise ValueError(f'Video decoding failed at {target:.3f}s; analysis stopped without inventing samples')
        time_s = self.cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        source = 'opencv_ffmpeg_pos_msec'
        if not math.isfinite(time_s) or time_s < 0 or (target > 1 and time_s == 0):
            time_s = (self.cap.get(cv2.CAP_PROP_POS_FRAMES) - 1) / self.fps
            source = 'opencv_frame_index_fps_approx'
        while time_s + .5 / self.fps < target:
            ok = self.cap.grab()
            if not ok:
                raise ValueError(f'Video ended unexpectedly at {target:.3f}s')
            time_s = self.cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            if not math.isfinite(time_s) or (target > 1 and time_s == 0):
                time_s = (self.cap.get(cv2.CAP_PROP_POS_FRAMES) - 1) / self.fps
                source = 'opencv_frame_index_fps_approx'
            bgr = None
        if bgr is None:
            ok, bgr = self.cap.retrieve()
            if not ok:
                raise ValueError('Cannot retrieve selected frame')
        self.last_time = time_s
        ratio = min(W / bgr.shape[1], H / bgr.shape[0])
        nw, nh = max(1, round(bgr.shape[1] * ratio)), max(1, round(bgr.shape[0] * ratio))
        resized = cv2.resize(bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
        result = np.zeros((H, W, 3), dtype=np.uint8)
        x, y = (W - nw) // 2, (H - nh) // 2
        result[y:y + nh, x:x + nw] = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        return result, time_s, source

    def close(self):
        self.cap.release()


def white_stats(frame, roi, enabled=True):
    if not enabled:
        return [None] * 3, None
    flat = frame.reshape(-1, 3)
    if roi.get('white_reference', {}).get('mask_runs'):
        p = flat[unpack_runs(roi['white_reference']['mask_runs'], 1)]
    else:
        x0, y0, x1, y1 = roi['rect']
        if not (0 <= x0 <= x1 <= W and 0 <= y0 <= y1 <= H):
            raise ValueError('Invalid White Reference rectangle')
        p = frame[y0:y1, x0:x1].reshape(-1, 3)
    return (p.mean(axis=0).tolist(), float(np.mean(p >= 250))) if len(p) else ([None] * 3, None)


class PixelModels:
    def __init__(self):
        self.models = {}

    def update(self, signals, t, c):
        rule = c['response_pixel_rule']
        known = not c.get('first_injection_auto') or c.get('first_injection_estimated_s') is not None
        excluded = t in c.get('response_excluded_times', [])
        current, n = None, len(signals['raw'])
        plan = c['cycle_plan']
        if known:
            for i, r in enumerate(plan):
                begin = max(0, r['gas_on_s'] - c['baseline_window'], plan[i-1]['gas_off_s'] if i else 0)
                if not excluded and begin <= t < r['gas_on_s']:
                    for mode, value in signals.items():
                        if value is None:
                            continue
                        m = self.models.setdefault((i, mode), dict(n=0, mean=np.zeros(n), m2=np.zeros(n), times=[]))
                        m['n'] += 1
                        m['times'].append(t)
                        delta = value - m['mean']
                        m['mean'] += delta / m['n']
                        m['m2'] += delta * (value - m['mean'])
                if r['gas_on_s'] <= t < r['recovery_end_s']:
                    current = i
        r = plan[current] if current is not None else None
        out = dict(response_roi_pixels=n, response_cycle=current+1 if current is not None else None,
                   response_pixel_metric=rule['metric'], response_pixel_k=rule['k'], response_pixel_delta_min=rule['delta_min'],
                   response_gas_on_s=r['gas_on_s'] if r else None,
                   response_baseline_start_s=max(0, r['gas_on_s']-c['baseline_window'], plan[current-1]['gas_off_s'] if current else 0) if r else None)
        for mode, value in signals.items():
            m = self.models.get((current, mode))
            valid = m is not None and m['n'] >= 3 and value is not None and not excluded
            count = None
            if valid:
                delta = rule['delta_min'] / (100 if rule['metric'] == 'V' else 1)
                threshold = np.maximum(rule['k'] * np.sqrt(m['m2'] / (m['n']-1)), delta)
                count = int(np.sum(np.abs(value - m['mean']) > threshold))
            out.update({mode+'_responsive_count':count, mode+'_response_pixel_pct':100*count/n if count is not None else None,
                        mode+'_response_baseline_n':m['n'] if m else 0,
                        mode+'_response_status':'계산 완료' if valid else '제외 표본' if excluded else '주입 시각 미확정' if not known else 'Baseline 3표본 미만 또는 보정 불가'})
        return out


def sample(frame, roi, base=None, models=None, t=0, config=None):
    ids = roi['_ids'] if '_ids' in roi else unpack_runs(roi['ids_runs'], 25)
    pixels = frame.reshape(-1, 3)[ids]
    ref, saturated = white_stats(frame, roi, (config or {}).get('white_enabled', True))
    valid = all(x is not None and math.isfinite(x) and x >= 5 for x in ref)
    gains = dict(raw=None, cal=200/np.array(ref) if valid else False,
                 relative=np.array(base)/ref if valid and base is not None and all(x >= 5 for x in base) else False)
    stats = {mode:pixel_stats(pixels, gain) if gain is not False else None for mode,gain in gains.items()}
    out = dict(pixel_count=len(ids), white_R=ref[0], white_G=ref[1], white_B=ref[2],
               white_saturated_fraction=saturated, white_too_dark=not valid,
               clipped_fraction=stats['cal']['clipped_fraction'] if stats['cal'] else None,
               relative_clipped_fraction=stats['relative']['clipped_fraction'] if stats['relative'] else None,
               relative_baseline_R=base[0] if base is not None else None,
               relative_baseline_G=base[1] if base is not None else None,
               relative_baseline_B=base[2] if base is not None else None,
               roi_pixels_crc32=zlib.crc32(pixels.tobytes()))
    for mode,s in stats.items():
        for key in ['R','G','B','H_deg','S','V','H_coherence','paper_S','paper_S_valid_pixels']:
            out[mode+'_'+key] = s[key] if s else (0 if key == 'paper_S_valid_pixels' else None)
    cal = stats['cal']
    out['cal_BR'] = (cal['B']-cal['R'])/(cal['B']+cal['R']) if cal and cal['B']+cal['R']>1e-6 else None
    if models is not None:
        signals = {}
        for mode,gain in gains.items():
            p = corrected_pixels(pixels,gain)[0] if gain is not False else None
            signals[mode] = None if p is None else p.max(axis=1)/255 if config['response_pixel_rule']['metric']=='V' else p[:,2]-p[:,0]
        out.update(models.update(signals,t,config))
        out['roi_variants'] = {}
        for v in roi.get('variants',[]):
            vi = v['_ids']
            values = frame.reshape(-1,3)[vi]
            item = dict(pixel_count=len(vi),edge_percent=v['percent'],roi_shape=v['shape'],roi_angle_deg=v.get('angle_deg'))
            for mode,gain in gains.items():
                item[mode+'_V'] = float(corrected_pixels(values,gain)[0].max(axis=1).mean()/255) if len(vi)>=25 and gain is not False else None
            out['roi_variants'][v['key']] = item
    return out


def png_base64(frame):
    ok, png = cv2.imencode('.png',cv2.cvtColor(frame,cv2.COLOR_RGB2BGR))
    if not ok:
        raise ValueError('PNG encoding failed')
    return base64.b64encode(png).decode('ascii')


def prepare_roi(roi):
    roi = dict(roi)
    roi['_ids'] = unpack_runs(roi['ids_runs'],25)
    roi['variants'] = [dict(v, _ids=unpack_runs(v['ids_runs'])) for v in roi.get('variants',[])]
    return roi


def prepare_baseline(paths, metas, roi, c, stop):
    cal = dict(c.get('research_calibration',{}))
    first, end = float(c['relative_start']), float(c['relative_end'])
    if first < 0 or end <= first or not math.isfinite(end):
        raise ValueError('초기 White 구간을 확인하세요.')
    cal.update(baseline_start_s=first,baseline_end_s=end,white_baseline=None,samples=0,actual_start_s=None,actual_end_s=None,warnings=[])
    if c.get('white_enabled') is False:
        cal['warnings'].append('White Reference 미설정 — Raw 분석 적용')
        return cal
    on = c['cycle_plan'][0]['gas_on_s'] if not c.get('first_injection_auto') else None
    if on is not None and end > on:
        cal['warnings'].append('초기 White 기준 구간이 가스 노출과 겹칩니다. Relative 값은 계산하지 않습니다.')
        return cal
    total = sum(m['duration_s'] for m in metas)
    if first >= total:
        cal['warnings'].append('초기 White 기준 구간이 촬영 범위를 벗어납니다.')
        return cal
    limit = min(end,total)
    dt = max((limit-first)/30,1/c['fps'])
    targets = np.arange(first,limit,dt)
    collected, offset = [], 0
    for path,meta in zip(paths,metas):
        local = targets[(targets>=offset)&(targets<offset+meta['duration_s'])]
        if len(local):
            reader = VideoReader(path,c.get('decoder_mode','auto'))
            try:
                for target in local:
                    if stop.is_set():
                        raise InterruptedError('초기 White 기준 수집을 중지했습니다.')
                    frame,ts,_ = reader.read(float(target-offset))
                    rgb,sat = white_stats(frame,roi)
                    if all(x is not None and x>=5 for x in rgb) and sat<=.01:
                        collected.append((offset+ts,rgb))
                    else:
                        cal['warnings'].append(f'어두움/포화로 초기 기준 표본 제외: {target:.1f}초')
            finally:
                reader.close()
        offset += meta['duration_s']
    if len(collected)>=3:
        cal.update(white_baseline=np.median([x[1] for x in collected],axis=0).tolist(),samples=len(collected),actual_start_s=min(x[0] for x in collected),actual_end_s=max(x[0] for x in collected))
    else:
        cal['warnings'].append('초기 White 유효 표본 3개 미만: Relative 보정 계산 불가. Raw 데이터는 보존됩니다.')
    return cal


def analyze_video(paths, roi, c, progress=None, stop=None, sink=None):
    """Analyze connected files; rows sent incrementally to sink and retained there."""
    stop = stop or threading.Event()
    if isinstance(paths,(str,Path)):
        paths = [paths]
    if not paths or not .01 <= float(c['fps']) <= 30:
        raise ValueError('영상과 FPS 설정을 확인하세요.')
    roi = prepare_roi(roi)
    metas = []
    for path in paths:
        reader = VideoReader(path,c.get('decoder_mode','auto'))
        metas.append(reader.metadata());reader.close()
    cal = prepare_baseline(paths,metas,roi,c,stop)
    total,offset,models,out = sum(m['duration_s'] for m in metas),0,PixelModels(),[]
    count = 0
    for i,(path,meta) in enumerate(zip(paths,metas)):
        reader = VideoReader(path,c.get('decoder_mode','auto'))
        last = -math.inf
        try:
            for target in np.arange(0,meta['duration_s']-.001,1/c['fps']):
                if stop.is_set():
                    return dict(rows=out,calibration=cal,file_meta=metas,cancelled=True,_models=models)
                frame,ts,source = reader.read(float(target))
                if ts<=last+1e-7:
                    continue
                r = dict(video=meta['name'],time_s=ts,requested_time_s=float(target),global_time_s=offset+ts,timestamp_source=source,decoder_acceleration=reader.acceleration,
                         **sample(frame,roi,cal['white_baseline'],models,offset+ts,c))
                (sink or out.append)(r);count+=1;last=ts
                if progress:
                    progress(dict(percent=min(99.9,100*(offset+ts)/total),videoPercent=min(99.9,100*ts/meta['duration_s']),index=i+1,total=len(paths),name=meta['name'],frames=count),cal,metas)
        finally:
            reader.close()
        offset+=meta['duration_s']
    return dict(rows=out,calibration=cal,file_meta=metas,cancelled=False,_models=models)
