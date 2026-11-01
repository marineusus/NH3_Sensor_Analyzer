"""Real WebView2 integration smoke test; creates a temporary synthetic video."""
import json
import sys
import tempfile
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import cv2
import numpy as np
import webview
from app import Api,ROOT

result={}
with tempfile.TemporaryDirectory(prefix='nh3-smoke-') as temp:
    clip=Path(temp)/'synthetic.mp4'
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
            # Loaded event occurs before the API handshake on some WebView2 versions.
            for _ in range(100):
                if window.evaluate_js("Boolean(window.pywebview?.api?.start_analysis && typeof desktopExtract==='function')"):
                    break
                time.sleep(.1)
            setup='''
files=FILES;fileMeta=files.map(f=>({...f}));listFiles();
sensor=[[.33,.24],[.65,.24],[.65,.65],[.33,.65]];white=[.06,.10,.08,.20];
$('fps').value=2;$('firstInjection').value=3;$('baseline_window').value=2;
cyclePlan=[{concentration_ppm:10,gas_on_s:3,gas_off_s:5,recovery_end_s:8}];
$('relativeStart').value=0;$('relativeEnd').value=2;estimatedFirst=null;timingUnresolved=false;
window.smokeErrors=[];window.addEventListener('error',e=>smokeErrors.push(e.message));
window.smokeDone=false;
(async()=>{try{await showPreview();await start();
const c=config();const a=assess(weights,c);const g=cxMetadata(cxGeometry(c));
const d=exportData(),info=readReportInfo();info.photos=false;const pages=buildReportPages(a,rank(),checkDataQuality(a),calculateCalibration(a),info,[]);const photo=await captureSensorPhoto(rows[0]);
window.smokeResult={report_pages:pages.length,photo_ok:!!photo,status:$('status').textContent,rows:rows.length,first:rows[0],last:rows.at(-1),calibration:researchCalibration,
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
        finally:
            api.close();window.destroy()
    window.events.loaded+=lambda:None
    webview.start(run,gui='edgechromium')
print(json.dumps(result,ensure_ascii=False,indent=2))
if result.get('failure') or result.get('errors') or result.get('rows')!=16 or result.get('excel_bytes',0)<1000 or result.get('report_pages',0)<1 or not result.get('photo_ok'):
    raise SystemExit(1)


