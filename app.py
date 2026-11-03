"""Desktop bridge: native file selection, bounded previews, background jobs."""
from __future__ import annotations
import argparse
import json
import logging
import threading
import time
import uuid
from pathlib import Path
import numpy as np
from analyzer import (VideoReader, analyze_video, prepare_roi, sample, png_base64,
                      white_stats, corrected_pixels, W, H)
from detection import detect_sponges, select_sponge

ROOT = Path(__file__).resolve().parent
APP_VERSION = '1.4.2'


class Api:
    def __init__(self):
        self._window = None
        self._files = {}
        self._job = None
        self._lock = threading.RLock()
        self._preview_lock = threading.Lock()
        self._reader = None
        self._reader_id = None
        self._preview_frame = None
        self._decoder_mode = 'auto'

    def _register(self, paths):
        files=[]
        for path in paths:
            path=Path(path).resolve()
            if not path.is_file() or path.name.startswith('._') or '복사본' in path.name:
                continue
            reader=VideoReader(path,self._decoder_mode)
            try:
                meta=reader.metadata()
            finally:
                reader.close()
            fid=uuid.uuid4().hex
            self._files[fid]=path
            files.append(dict(id=fid,**meta))
        files.sort(key=lambda f:f['name'])
        if len({f['name'] for f in files}) != len(files):
            raise ValueError('서로 다른 폴더의 같은 파일명은 한 번에 연결하지 마세요. 폴더별로 분석하세요.')
        return files

    def choose_videos(self):
        import webview
        if self._job and self._job['state']=='running':
            raise ValueError('추출을 중지한 후 영상을 바꾸세요.')
        paths=self._window.create_file_dialog(webview.FileDialog.OPEN,allow_multiple=True,
                directory='D:/video' if Path('D:/video').exists() else '',
                file_types=('Videos (*.mp4;*.mov;*.avi;*.mkv;*.mts;*.m4v)',))
        return self._register(paths or [])

    def set_decoder_mode(self, mode):
        if mode not in ('auto','software'):
            raise ValueError('Invalid decoder mode')
        if self._job and self._job['state']=='running' and mode!=self._decoder_mode:
            raise ValueError('추출을 중지한 후 디코더를 변경하세요.')
        with self._preview_lock:
            if mode!=self._decoder_mode:
                if self._reader:
                    self._reader.close()
                self._reader=None;self._reader_id=None;self._decoder_mode=mode
                self._preview_frame=None
        return mode

    def frame(self, fid, target):
        with self._preview_lock:
            if fid != self._reader_id:
                if self._reader:
                    self._reader.close()
                self._reader=VideoReader(self._files[fid],self._decoder_mode);self._reader_id=fid
            image,ts,source=self._reader.read(target)
            self._preview_frame=(fid,ts,image)
            return dict(image=png_base64(image),time=ts,source=source)

    def sample_frame(self, fid, target, roi, config):
        """Use the extraction equations for live ROI colors and hue verification."""
        roi=prepare_roi(roi)
        with self._preview_lock:
            cached=self._preview_frame
            if cached is not None and cached[0]==fid and abs(cached[1]-target)<1e-6:
                frame=cached[2]
            else:
                reader=VideoReader(self._files[fid],self._decoder_mode)
                try:
                    frame,_,_=reader.read(target)
                finally:
                    reader.close()
            return sample(frame,roi,(config.get('white_baseline') or {}).get('white_baseline'),
                          config=config)

    def detect(self, fid, target, search=None):
        reader=VideoReader(self._files[fid],self._decoder_mode)
        try:
            frame,_,_=reader.read(target)
            return detect_sponges(frame,search)
        finally:
            reader.close()

    def select_sponge(self, fid, target, point, search=None):
        reader=VideoReader(self._files[fid],self._decoder_mode)
        try:
            frame,_,_=reader.read(target)
            return select_sponge(frame,point,search)
        finally:
            reader.close()

    def start_analysis(self, payload):
        with self._lock:
            if self._job and self._job['state']=='running':
                raise ValueError('이미 추출 중입니다.')
            ids=payload['files'];paths=[self._files[fid] for fid in ids]
            if not paths:
                raise ValueError('영상을 선택하세요.')
            c=payload['config'];roi=payload['roi']
            prepare_roi(roi)
            job=dict(id=uuid.uuid4().hex,state='running',rows=[],progress=None,error=None,
                     stop=threading.Event(),config=c,roi=roi,started=time.perf_counter(),files=ids)
            self._job=job
            threading.Thread(target=self._run,args=(job,paths),daemon=True).start()
            return job['id']

    def _run(self,job,paths):
        def progress(p,cal,meta):
            with self._lock:
                job.update(progress=p,calibration=cal,file_meta=meta)
        def sink(row):
            with self._lock:
                job['rows'].append(row)
        try:
            result=analyze_video(paths,job['roi'],job['config'],progress,job['stop'],sink)
            with self._lock:
                job.update(calibration=result['calibration'],file_meta=result['file_meta'],
                           models=result['_models'],state='cancelled' if result['cancelled'] else 'done')
        except InterruptedError as error:
            with self._lock:
                job.update(state='cancelled',error=str(error))
        except Exception as error:
            logging.exception('Analysis failed')
            with self._lock:
                job.update(state='error',error=str(error))
        finally:
            with self._lock:
                job['elapsed_s']=time.perf_counter()-job['started']

    def poll_analysis(self, job_id, cursor=0):
        with self._lock:
            j=self._job
            if not j or j['id']!=job_id:
                raise ValueError('추출 작업을 찾을 수 없습니다.')
            cursor=int(cursor);end=min(len(j['rows']),cursor+500)
            return dict(state=j['state'],rows=j['rows'][cursor:end],cursor=end,total_rows=len(j['rows']),
                        progress=j.get('progress'),calibration=j.get('calibration'),file_meta=j.get('file_meta'),
                        error=j['error'],elapsed_s=j.get('elapsed_s',time.perf_counter()-j['started']))

    def cancel_analysis(self):
        with self._lock:
            if self._job:
                self._job['stop'].set()
        return True

    def responsive(self, fid, local_time, global_time, mode, excluded_times):
        j=self._job
        if not j or j['state']=='running' or not j.get('models'):
            raise ValueError('현재 원본 추출의 Baseline이 필요합니다. 다시 추출하세요.')
        rows=j['rows'];row=min(rows,key=lambda r:abs(r['global_time_s']-global_time))
        if abs(row['global_time_s']-global_time)>1e-6 or fid not in j['files']:
            raise ValueError('현재 추출 결과의 원본 영상을 선택하세요.')
        if global_time in excluded_times:
            raise ValueError('제외 표본입니다.')
        mode='cal' if mode=='legacy' else mode
        m=j['models'].models.get(((row['response_cycle'] or 0)-1,mode))
        if m is None or m['n']<3 or any(t in excluded_times for t in m['times']):
            raise ValueError('유효 픽셀 Baseline 부족/제외 후 재추출 필요')
        reader=VideoReader(self._files[fid],j['config'].get('decoder_mode','auto'))
        try:
            frame,_,_=reader.read(local_time)
        finally:
            reader.close()
        roi=prepare_roi(j['roi']);ids=roi['_ids'];ref,_=white_stats(frame,roi,j['config'].get('white_enabled',True))
        gain=None
        if mode!='raw':
            if any(v is None or v<5 for v in ref):
                raise ValueError('White 보정 불가')
            gain=200/np.array(ref) if mode=='cal' else np.array(j['calibration']['white_baseline'])/ref
        p=corrected_pixels(frame.reshape(-1,3)[ids],gain)[0];rule=j['config']['response_pixel_rule']
        value=p.max(axis=1)/255 if rule['metric']=='V' else p[:,2]-p[:,0]
        threshold=np.maximum(rule['k']*np.sqrt(m['m2']/(m['n']-1)),rule['delta_min']/(100 if rule['metric']=='V' else 1))
        hits=ids[np.abs(value-m['mean'])>threshold]
        flat=frame.reshape(-1,3);flat[hits]=np.rint(flat[hits]*.27+np.array([37,206,125])*.73).astype(np.uint8)
        return dict(image=png_base64(frame),responsive_count=len(hits),roi_pixels=len(ids),rule=rule)

    def close(self):
        self.cancel_analysis()
        with self._preview_lock:
            if self._reader:
                self._reader.close()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--debug',action='store_true')
    parser.add_argument('--verify-videos',metavar='FOLDER',help=argparse.SUPPRESS)
    parser.add_argument('--verification-output',metavar='JSON',help=argparse.SUPPRESS)
    parser.add_argument('--verification-fps',type=float,default=.5,help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.verify_videos:
        if not args.verification_output:
            parser.error('--verification-output is required with --verify-videos')
        from verification import verify_video_folder
        verify_video_folder(args.verify_videos,args.verification_output,args.verification_fps)
        return
    import webview
    import sys
    from os import environ
    if sys.platform == 'win32':
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID('marineusus.NH3SensorAnalyzer.Flangi')
    logdir=Path(environ.get('LOCALAPPDATA',str(Path.cwd())))/'NH3SensorAnalyzer'
    logdir.mkdir(parents=True,exist_ok=True)
    logging.basicConfig(filename=logdir/'app.log',level=logging.INFO,encoding='utf-8')
    logging.info('NH3SensorAnalyzer %s; PyAV FFmpeg reader', APP_VERSION)
    api=Api()
    webview.settings['ALLOW_DOWNLOADS']=True
    window=webview.create_window('NH₃ 센서 영상 분석 · v'+APP_VERSION,str(ROOT/'frontend/index.html'),
                                js_api=api,width=1480,height=960,min_size=(1000,700))
    api._window=window
    window.events.closed+=api.close
    # Frozen WinForms windows use the embedded EXE icon; source runs use the same ICO.
    source_icon = None if getattr(sys, 'frozen', False) else str(ROOT/'assets/NH3SensorAnalyzer_Flangi_Final.ico')
    webview.start(gui='edgechromium',debug=args.debug,icon=source_icon)


if __name__=='__main__':
    main()
