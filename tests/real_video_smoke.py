"""Optional real-data smoke test. Never copies videos or writes beside them.
Usage: python tests/real_video_smoke.py D:/video > ../real-check.json
"""
import json
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import webview
from app import Api,ROOT

paths=list(Path(sys.argv[1]).rglob('VID-0000.mp4'))
api=Api();items=[api._register([p])[0] for p in paths]
result={}
window=webview.create_window('NH3 real-video selection verification',str(ROOT/'frontend/index.html'),js_api=api,width=1380,height=900)
api._window=window

def run():
    try:
        for _ in range(100):
            if window.evaluate_js("Boolean(window.pywebview?.api?.select_sponge && typeof desktopExtract==='function')"):break
            time.sleep(.1)
        script='''
window.realDone=false;window.realResults=[];
(async()=>{try{
$('crWhiteEnabled').checked=false;$('firstInjection').value=300;estimatedFirst=null;timingUnresolved=false;
cyclePlan=[{concentration_ppm:10,gas_on_s:300,gas_off_s:600,recovery_end_s:900}];
for(const f of ITEMS){
 files=[f];fileMeta=[{...f}];listFiles();$('previewTime').value=0;await showPreview();
 for(const point of [[.25,.35],[.75,.4]]){
  autoSensorBase();const rect=$('frame').getBoundingClientRect();
  $('frame').dispatchEvent(new PointerEvent('pointerdown',{clientX:rect.left+rect.width*point[0],clientY:rect.top+rect.height*point[1],bubbles:true}));
  while(desktopSelecting)await new Promise(r=>setTimeout(r,100));
  if(mode==='desktopSensor')throw Error($('status').textContent);
  const c=config(),roi=buildROI(c);validate(c);
  realResults.push({file:f,point,status:$('status').textContent,sensor:c.sensor,roi:{ids_runs:cxRuns(roi.ids),rect:roi.rect,variants:roi.variants},geometry:roi.geometry,config:{...c,relative_start:0,relative_end:30}});
 }
}
}catch(e){window.realFailure=e.stack;}finally{window.realDone=true;}})();
'''.replace('ITEMS',json.dumps(items))
        window.run_js(script)
        for _ in range(900):
            if window.evaluate_js('window.realDone===true'):break
            time.sleep(.2)
        result.update(results=window.evaluate_js('window.realResults'),failure=window.evaluate_js('window.realFailure||null'))
    except Exception as e:result['failure']=str(e)
    finally:api.close();window.destroy()

webview.start(run,gui='edgechromium')
print(json.dumps(result,ensure_ascii=False,indent=2))
if result.get('failure') or len(result.get('results',[]))!=len(items)*2:raise SystemExit(1)
