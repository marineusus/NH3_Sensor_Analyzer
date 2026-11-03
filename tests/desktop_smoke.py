"""Native webview integration smoke test; creates a temporary synthetic video."""
import json
import os
import sys
import tempfile
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import cv2
import numpy as np
import webview
from app import Api,ROOT,desktop_gui

result={}
with tempfile.TemporaryDirectory(prefix='nh3-smoke-') as temp:
    clip=Path(os.environ.get('NH3_SMOKE_VIDEO',str(Path(temp)/'synthetic.mp4')))
    if not os.environ.get('NH3_SMOKE_VIDEO'):
        writer=cv2.VideoWriter(str(clip),cv2.VideoWriter_fourcc(*'mp4v'),15,(960,540))
        for i in range(120):
            image=np.full((540,960,3),200,dtype=np.uint8)
            v=80 if i<45 else 80+(i-45)*2 if i<75 else max(80,140-(i-75)*2)
            image[130:350,320:620]=[v,110,140]
            writer.write(image)
        writer.release()
    api=Api();files=api._register([clip])
    window=webview.create_window('NH3 integration test',str(ROOT/'frontend/index.html'),js_api=api,hidden=False)
    api._window=window
    def run():
        try:
            if not window.events.loaded.wait(45):
                raise AssertionError('Native webview did not finish loading in 45 seconds')
            # Loaded event occurs before the API handshake on some WebView2 versions.
            for _ in range(100):
                if window.evaluate_js("Boolean(window.pywebview?.api?.start_analysis && typeof desktopExtract==='function' && window.dashboardUI && document.readyState==='complete' && !document.documentElement.classList.contains('nh3-booting'))"):
                    break
                time.sleep(.1)
            if not window.evaluate_js("Boolean(window.dashboardUI && !document.documentElement.classList.contains('nh3-booting'))"):
                raise AssertionError('Dashboard initialization failed')
            setup='''
files=FILES;fileMeta=files.map(f=>({...f}));listFiles();
sensor=[[.33,.24],[.65,.24],[.65,.65],[.33,.65]];white=[.06,.10,.08,.20];$('crWhiteEnabled').checked=true;
$('fps').value=2;$('firstInjection').value=3;$('baseline_window').value=2;
cyclePlan=[{concentration_ppm:10,gas_on_s:3,gas_off_s:5,recovery_end_s:8}];
$('relativeStart').value=0;$('relativeEnd').value=2;estimatedFirst=null;timingUnresolved=false;
window.smokeErrors=[];window.addEventListener('error',e=>smokeErrors.push(e.message));
window.smokeDone=false;
(async()=>{try{await showPreview();const previewColor=await desktopSample(buildROI(config()));await start();await $('nativeReadScene').onclick();const nativeReferenceOK=nativeView.reference?.every(Number.isFinite)===true;
await cxVerifyHue();const nativeHueOK=$('cxHueCheck').textContent.includes('픽셀 CRC 일치');
const c=config();const a=assess(weights,c);const g=cxMetadata(cxGeometry(c));
const d=exportData(),info=readReportInfo();info.photos=false;const pages=buildReportPages(a,rank(),checkDataQuality(a),calculateCalibration(a),info,[]);const photo=await captureSensorPhoto(rows[0]);await openReportSettings();$('reportPhotos').checked=false;await makeReportPreview();const reportPreviewReady=!$('reportPreview').hidden&&$('reportPreview').contentDocument?.body?.children.length>0&&$('reportPreview').contentDocument.fonts.status==='loaded';if($('reportDialog').open)$('reportDialog').close();
window.smokeResult={native_preview_sample_ok:Number.isFinite(previewColor.raw_H_deg),native_reference_ok:nativeReferenceOK,native_hue_ok:nativeHueOK,canvas_font_round:$('plot').getContext('2d').font.includes('DashboardRound'),report_preview_ready:reportPreviewReady,report_embedded_fonts:reportFontCSS.split('data:font/ttf;base64,').length-1,report_pages:pages.length,photo_ok:!!photo,status:$('status').textContent,rows:rows.length,first:rows[0],last:rows.at(-1),calibration:researchCalibration,
cycles:a.cycles,geometry:g,raw:researchRawRecords().length,relative:crRelativeRecords().length,
excel_bytes:excelBytes(d).length,zip_bytes:zip([['settings.json',JSON.stringify(d.settings)],['colors.csv',csv(d.colors)]]).length,errors:smokeErrors};
}catch(e){window.smokeResult={failure:e.stack};}finally{window.smokeDone=true;}})();
'''.replace('FILES',json.dumps(files))
            window.run_js(setup)
            for _ in range(600):
                if window.evaluate_js('window.smokeDone===true'):break
                time.sleep(.2)
            value=window.evaluate_js('window.smokeResult||({failure:"timeout",status:document.getElementById("status").textContent})')
            result.update(value)
        except Exception as error:
            result['failure']=str(error)
            result['native_events']={name:getattr(window.events,name).is_set() for name in ['shown','before_load','loaded','_pywebviewready']}
            result['native_url']=window.real_url
            if sys.platform == 'darwin':
                import subprocess
                subprocess.run(['screencapture','-x','mac-validation/startup-failure.png'],check=False)
        finally:
            api.close();window.destroy()
    window.events.loaded+=lambda:None
    webview.start(run,gui=desktop_gui())
baseline=ROOT/'tests/fixtures/analysis-baseline.json'
if baseline.exists() and not result.get('failure'):
    expected=json.loads(baseline.read_text(encoding='utf-8'))
    if os.environ.get('NH3_SMOKE_VIDEO'):
        # The lossless fixture preserves the Windows reference pixels. Only its
        # filename differs; no numerical tolerance or expected measurement changes.
        expected['first']['video']=clip.name
        expected['last']['video']=clip.name
        expected['geometry']['reference_frame']['file']=clip.name
    for key,value in expected.items():
        if result.get(key)!=value:
            result['failure']='Numerical/UI baseline mismatch: '+key
            break
print(json.dumps(result,ensure_ascii=False,indent=2))
if not all(result.get(k) for k in ['native_preview_sample_ok','native_reference_ok','native_hue_ok']) or not result.get('canvas_font_round') or result.get('failure') or result.get('errors') or result.get('rows')!=16 or result.get('excel_bytes',0)<1000 or result.get('report_pages',0)<1 or result.get('report_embedded_fonts')!=2 or not result.get('photo_ok') or not result.get('report_preview_ready'):
    raise SystemExit(1)
