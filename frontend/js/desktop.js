/* Desktop transport only. Analytical functions and geometry remain in legacy files. */
let desktopCurrentFile=null,desktopJob=null,desktopPreviewEpoch=0;
const desktopReady=new Promise(resolve=>{
 if(window.pywebview?.api)resolve();else window.addEventListener('pywebviewready',resolve,{once:true});
});
async function desktopCall(method,...args){await desktopReady;return window.pywebview.api[method](...args);}

loadVideo=async function(file){
 if(!file?.id)throw Error('OpenCV 영상 선택 버튼으로 원본 영상을 선택하세요.');
 await desktopCall('set_decoder_mode',$('desktopDecoder')?.value||'auto');desktopCurrentFile=file;cxFrame={file:file.name,time_s:0};return file.duration_s;
};
seekFrame=async function(target){
 if(!desktopCurrentFile)throw Error('영상을 선택하세요.');
 const f=desktopCurrentFile,result=await desktopCall('frame',f.id,Number(target));
 const decoded=new Image();decoded.src='data:image/png;base64,'+result.image;await decoded.decode();
 sx.clearRect(0,0,960,540);sx.drawImage(decoded,0,0);cxFrame={file:f.name,time_s:result.time};
 return {time:result.time,source:result.source};
};
showPreviewBase=async function(){
 if(busy||desktopSelecting)throw Error('추출 또는 윤곽 선택이 끝난 뒤 미리보기를 바꾸세요.');
 const f=files[Number($('previewVideo').value)];if(!f)throw Error('먼저 영상을 선택하세요.');
 const duration=await loadVideo(f);$('previewTime').max=Math.max(0,duration-.1);
 $('videoDurationLabel').textContent='전체 길이 '+formatSeconds(duration);
 const t=Math.max(0,Math.min(Number($('previewTime').value)||0,duration-.001));
 const meta=await seekFrame(t);$('previewTime').value=meta.time;image=surface;drawFrame();
 status(f.name+' · '+duration.toFixed(1)+'초 · OpenCV 미리보기');
};

async function desktopChoose(){
 if(busy||photoBusy||qualityReviewLoading||desktopSelecting)return;
 try{
  $('desktopOpen').disabled=true;const selected=await desktopCall('choose_videos');
  if(!selected.length)return;
  files=selected;fileMeta=files.map(f=>({...f}));uiVideoMeta=uiMeta();listFiles();
  $('previewTime').value=0;await showPreview();
 }catch(e){status(e.message,true);}finally{$('desktopOpen').disabled=false;}
}

async function desktopExtract(){
 if(busy)return;if(photoBusy||qualityReviewLoading)throw Error('사진 읽기가 끝난 뒤 추출하세요.');
 const c=config();validate(c);if(!files.length)throw Error('영상을 선택하세요.');
 const roi=buildROI(c),payloadROI={ids_runs:cxRuns(roi.ids),rect:roi.rect,geometry:roi.geometry,variants:roi.variants,white_reference:roi.white_reference};
 c.decoder_mode=$('desktopDecoder').value;
 c.relative_start=Number($('relativeStart').value);c.relative_end=Number($('relativeEnd').value);
 c.research_calibration=structuredClone(researchCalibration);c.source='OpenCV FFmpeg local original; no upload or reencoding';
 c.decoder={backend:'OpenCV FFmpeg',resize:'960×540 letterbox, INTER_LINEAR',timestamp:'presentation milliseconds; fallback explicitly marked',compatibility:'equations and masks preserved; browser/OpenCV decoded pixels may differ'};
 let started=false;
 $('start').disabled=true;$('desktopOpen').disabled=true;
 try{
  desktopJob=await desktopCall('start_analysis',{files:files.map(f=>f.id),roi:payloadROI,config:c});
  started=true;busy=true;cancel=false;rows=[];latest=null;uiDataContext=null;uiDataMeta=[];imported=false;
  researchStoredCalibrationMode=null;crImportedAvailability=null;extractionSettings=structuredClone(c);
  let cursor=0,last=null;
  for(;;){
   if(cancel)await desktopCall('cancel_analysis');
   const p=await desktopCall('poll_analysis',desktopJob,cursor);cursor=p.cursor;last=p;
   for(const row of p.rows)rows.push(row);
   if(p.calibration){researchCalibration=p.calibration;extractionSettings.research_calibration=structuredClone(p.calibration);}
   if(p.file_meta)fileMeta=p.file_meta;
   if(p.progress)drawProgress({...p.progress,frames:rows.length});
   status((p.state==='running'?'OpenCV 색상 추출 중':'OpenCV 결과 정리 중')+' · '+rows.length.toLocaleString()+'개 · '+p.elapsed_s.toFixed(1)+'초');
   if(p.state!=='running'&&cursor>=p.total_rows)break;
   await new Promise(resolve=>setTimeout(resolve,180));
  }
  renderVideoSummary();crApplyPolicy();
  $('warnings').textContent='OpenCV와 브라우저 디코더·축소 보간 차이로 기존 CSV와 픽셀값이 조금 다를 수 있습니다. 수식·ROI 마스크는 유지됩니다. '+(rows.some(r=>r.timestamp_source.endsWith('approx'))?'일부 시각은 프레임 번호/FPS 근사값입니다. ':'');
  if(rows.length){await evaluate();researchRefreshCalibration();cxRefresh();}
  if(last.state==='done'){
   drawProgress({percent:100,videoPercent:100,index:files.length,total:files.length,name:files.at(-1).name,frames:rows.length});
   status('완료 · '+rows.length.toLocaleString()+'개 표본 · '+last.elapsed_s.toFixed(1)+'초 · 원본 변경 없음');
  }else status((last.error||'추출 중지')+' · '+rows.length+'개 표본 보존 · 부분 결과를 내보낼 수 있습니다.',last.state==='error');
 }catch(e){status(e.message,true);if(started)await desktopCall('cancel_analysis');}
 finally{busy=false;$('start').disabled=false;$('desktopOpen').disabled=false;desktopJob=null;}
}
cancelAnalysis=function(){cancel=true;desktopCall('cancel_analysis').catch(e=>status(e.message,true));status('중지 요청 · 현재 프레임 후 표본을 보존합니다.');};

// Existing responsive-mask UI already has a native-reader extension point.
async function readerConnect(file){return {reader_id:file.id};}
async function readerPost(action,p){
 if(action!=='responsive')throw Error('지원하지 않는 요청');
 return desktopCall('responsive',p.id,p.time,p.global_time,p.mode,p.excluded_times);
}

// One click chooses the sensor; no automatic selection of the other sponge.
let desktopSelecting=false,desktopSelectionEpoch=0;
const desktopClickHint=uiEl('p','스펀지 클릭 선택을 누른 뒤 분석할 스펀지의 중앙을 클릭하세요. 기존 수동 윤곽 지정도 사용할 수 있습니다.','hint');
$('frame').parentElement.append(desktopClickHint);
const desktopSensorButton=[...document.querySelectorAll('button')].find(b=>b.getAttribute('onclick')?.includes('autoSensor('));
if(desktopSensorButton){desktopSensorButton.textContent='스펀지 클릭 선택';desktopSensorButton.title='분석할 스펀지의 중앙을 직접 클릭합니다.';}
autoSensorBase=function(){
 if(busy||photoBusy||qualityReviewLoading||desktopSelecting)return;
 if(!desktopCurrentFile){status('영상 미리보기를 먼저 불러오세요.',true);return;}
 if(globalThis.whiteSpongeReference?.picking)$('whiteSpongeButton').click();
 if(mode==='desktopSensor'){mode='none';status('스펀지 클릭 선택 취소 · 이전 ROI를 유지합니다.');return;}
 anchor=null;mode='desktopSensor';
 status('분석할 스펀지의 중앙을 클릭하세요. 두 개가 보여도 클릭한 하나만 선택합니다.');
 $('roiHint').textContent='분석할 스펀지 중앙 클릭 → 윤곽 확인 → 기존 Edge 제외·내부 직사각형 적용';
};
const desktopPointerDown=$('frame').onpointerdown,desktopPointerMove=$('frame').onpointermove,desktopPointerUp=$('frame').onpointerup;
$('frame').onpointerdown=async function(e){
 if(mode!=='desktopSensor')return desktopPointerDown?.call(this,e);
 e.preventDefault();if(desktopSelecting||busy||photoBusy||qualityReviewLoading)return;
 const rect=this.getBoundingClientRect(),point=[(e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height];
 const file=desktopCurrentFile,frame={...cxFrame},epoch=++desktopSelectionEpoch;
 desktopSelecting=true;if(desktopSensorButton)desktopSensorButton.disabled=true;
 try{
  status('클릭한 스펀지 윤곽을 잡는 중…');
  const selected=await desktopCall('select_sponge',file.id,frame.time_s,point,searchROI);
  if(epoch!==desktopSelectionEpoch||desktopCurrentFile?.id!==file.id||cxFrame?.time_s!==frame.time_s)return;
  sensor=selected.polygon.map(p=>p.slice());mode='none';anchor=null;cxCache=null;cxReference=frame;
  drawFrame();status('클릭한 스펀지 선택 완료 · 노란 윤곽과 초록 내부 ROI를 확인한 뒤 색상 추출을 시작하세요.');
 }catch(error){status(error.message,true);}finally{desktopSelecting=false;if(desktopSensorButton)desktopSensorButton.disabled=false;}
};
$('frame').onpointermove=function(e){if(mode==='desktopSensor'||desktopSelecting)return;return desktopPointerMove?.call(this,e);};
$('frame').onpointerup=function(e){if(mode==='desktopSensor'||desktopSelecting)return;return desktopPointerUp?.call(this,e);};

const desktopOpen=uiEl('button','OpenCV 영상 선택');desktopOpen.id='desktopOpen';desktopOpen.className='primary';desktopOpen.onclick=desktopChoose;
$('videoFiles').before(desktopOpen);$('videoFiles').hidden=true;
const desktopDecoder=uiEl('select');desktopDecoder.id='desktopDecoder';desktopDecoder.setAttribute('aria-label','영상 디코더');
desktopDecoder.innerHTML='<option value="auto">영상 디코더 · 자동 GPU 가속 (지원 시)</option><option value="software">영상 디코더 · CPU (비교·재현용)</option>';
desktopOpen.after(desktopDecoder);desktopDecoder.onchange=async()=>{if(busy){desktopDecoder.value=extractionSettings?.decoder_mode||'auto';return;}try{await desktopCall('set_decoder_mode',desktopDecoder.value);if(files.length)await showPreview();status('디코더 변경 · 이전 색상값은 유지합니다. 새 디코더 값은 재추출부터 적용됩니다.');}catch(e){status(e.message,true);}};
const decoderNote=uiEl('p','GPU 가속은 지원되지 않으면 CPU로 읽습니다. 디코더에 따라 픽셀값이 조금 다를 수 있어 설정과 실제 가속 방식을 기록합니다.','hint');desktopDecoder.after(decoderNote);
const desktopHint=uiEl('p','원본 영상은 PC에서 직접 읽습니다. 여러 파일은 선택 순서를 확인해 연결하세요. 분석 FPS는 기존 설정을 그대로 사용합니다.','hint');desktopOpen.after(desktopHint);
// WebView2 download handling is enabled in app.py, preserving CSV/XLSX/report exports.
desktopReady.then(()=>status('OpenCV 연결 완료 · 영상 선택 후 기존 방식으로 ROI와 실험 시간을 설정하세요.'));
const desktopExportBase=exportData;
exportData=function(){const d=desktopExportBase();d.settings.method='OpenCV FFmpeg decode; 960x540 letterbox INTER_LINEAR; exact frontend ROI pixel runs; float64 original per-pixel RGB/HSV equations; fixed ROI; no motion correction';d.settings.source='NH3 Sensor Analyzer desktop / Python OpenCV';d.settings.timing='OpenCV presentation milliseconds; frame-index/FPS fallback explicitly recorded; requested and actual times exported separately';d.settings.decoder=extractionSettings?.decoder||{status:'imported CSV; see original extraction settings'};return d;};

const desktopConfigBase=config;config=function(){const c=desktopConfigBase();c.decoder_mode=$('desktopDecoder')?.value||'auto';return c;};

const desktopSettingsImport=$('researchSettingsFile').onchange;
$('researchSettingsFile').onchange=async function(e){
 let saved=null;try{const f=e.target.files?.[0];if(f){const data=JSON.parse(await f.text());saved=data.analysis||data.settings?.analysis;}}catch{}
 await desktopSettingsImport.call(this,e);
 if(saved&&['auto','software'].includes(saved.decoder_mode)&&!$('status').classList.contains('error')){
  $('desktopDecoder').value=saved.decoder_mode;await desktopCall('set_decoder_mode',saved.decoder_mode);
 }
};
