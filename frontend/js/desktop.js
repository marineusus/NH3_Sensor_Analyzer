/* Desktop transport only. Analytical functions and geometry remain in legacy files. */
let desktopCurrentFile=null,desktopJob=null,desktopPreviewEpoch=0;
const desktopReady=new Promise(resolve=>{
 if(window.pywebview?.api)resolve();else window.addEventListener('pywebviewready',resolve,{once:true});
});
async function desktopCall(method,...args){await desktopReady;return window.pywebview.api[method](...args);}

loadVideo=async function(file){
 if(!file?.id)throw Error('OpenCV 영상 선택 버튼으로 원본 영상을 선택하세요.');
 desktopCurrentFile=file;cxFrame={file:file.name,time_s:0};return file.duration_s;
};
seekFrame=async function(target){
 if(!desktopCurrentFile)throw Error('영상을 선택하세요.');
 const f=desktopCurrentFile,result=await desktopCall('frame',f.id,Number(target));
 const decoded=new Image();decoded.src='data:image/png;base64,'+result.image;await decoded.decode();
 sx.clearRect(0,0,960,540);sx.drawImage(decoded,0,0);cxFrame={file:f.name,time_s:result.time};
 return {time:result.time,source:result.source};
};
showPreviewBase=async function(){
 if(busy)throw Error('추출 중에는 미리보기를 바꿀 수 없습니다.');
 const f=files[Number($('previewVideo').value)];if(!f)throw Error('먼저 영상을 선택하세요.');
 const duration=await loadVideo(f);$('previewTime').max=Math.max(0,duration-.1);
 $('videoDurationLabel').textContent='전체 길이 '+formatSeconds(duration);
 const t=Math.max(0,Math.min(Number($('previewTime').value)||0,duration-.001));
 const meta=await seekFrame(t);$('previewTime').value=meta.time;image=surface;drawFrame();
 status(f.name+' · '+duration.toFixed(1)+'초 · OpenCV 미리보기');
};

async function desktopChoose(){
 if(busy||photoBusy||qualityReviewLoading)return;
 try{
  $('desktopOpen').disabled=true;const selected=await desktopCall('choose_videos');
  if(!selected.length)return;
  files=selected;fileMeta=files.map(f=>({...f}));uiVideoMeta=uiMeta();listFiles();
  $('previewTime').value=0;desktopCandidates.replaceChildren();await showPreview();
 }catch(e){status(e.message,true);}finally{$('desktopOpen').disabled=false;}
}

async function desktopExtract(){
 if(busy)return;if(photoBusy||qualityReviewLoading)throw Error('사진 읽기가 끝난 뒤 추출하세요.');
 const c=config();validate(c);if(!files.length)throw Error('영상을 선택하세요.');
 const roi=buildROI(c),payloadROI={ids_runs:cxRuns(roi.ids),rect:roi.rect,geometry:roi.geometry,variants:roi.variants,white_reference:roi.white_reference};
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

const desktopCandidates=uiEl('div');desktopCandidates.id='desktopCandidates';
const desktopPanel=uiEl('div');desktopPanel.className='researchFold';
desktopPanel.append(uiEl('p','스펀지 후보가 여러 개면 분석할 하나를 선택하세요. 윤곽 확인 후 기존 Edge 제외·내부 직사각형을 적용합니다.','hint'),desktopCandidates);
$('frame').parentElement.append(desktopPanel);
autoSensorBase=async function(){
 try{
  if(busy||photoBusy||qualityReviewLoading)return;
  if(!desktopCurrentFile)throw Error('영상 미리보기를 먼저 불러오세요.');
  status('OpenCV 스펀지 후보 찾는 중…');desktopCandidates.replaceChildren();
  const candidates=await desktopCall('detect',desktopCurrentFile.id,cxFrame?.time_s||0,searchROI);
  if(!candidates.length)throw Error('확실한 스펀지 후보를 찾지 못했습니다. 검색 범위를 좁히거나 기존 수동 윤곽 지정을 사용하세요.');
  for(const [i,candidate]of candidates.entries()){
   const button=uiEl('button','후보 '+(i+1)+(candidates.length===2?(i===0?' · 왼쪽':' · 오른쪽'):''));
   const thumb=document.createElement('canvas');thumb.width=180;thumb.height=110;
   const [x,y,w,h]=candidate.bounds;thumb.getContext('2d').drawImage(surface,x*960,y*540,w*960,h*540,0,0,180,110);button.prepend(thumb);
   button.onclick=()=>{if(busy)return;sensor=candidate.polygon.map(p=>p.slice());mode='none';cxCache=null;cxReference=cxFrame&&{...cxFrame};
    drawFrame();status('후보 '+(i+1)+' 선택 · 센서 윤곽과 초록색 내부 ROI를 확인한 뒤 추출하세요.');
    [...desktopCandidates.children].forEach(b=>b.classList.toggle('active',b===button));};
   desktopCandidates.append(button);
  }
  status('스펀지 후보 '+candidates.length+'개 · 아래 사진에서 분석할 하나를 선택하세요.');
 }catch(e){status(e.message,true);}
};

const desktopOpen=uiEl('button','OpenCV 영상 선택');desktopOpen.id='desktopOpen';desktopOpen.className='primary';desktopOpen.onclick=desktopChoose;
$('videoFiles').before(desktopOpen);$('videoFiles').hidden=true;
const desktopHint=uiEl('p','원본 영상은 PC에서 직접 읽습니다. 여러 파일은 선택 순서를 확인해 연결하세요. 분석 FPS는 기존 설정을 그대로 사용합니다.','hint');desktopOpen.after(desktopHint);
// WebView2 download handling is enabled in app.py, preserving CSV/XLSX/report exports.
desktopReady.then(()=>status('OpenCV 연결 완료 · 영상 선택 후 기존 방식으로 ROI와 실험 시간을 설정하세요.'));
const desktopExportBase=exportData;
exportData=function(){const d=desktopExportBase();d.settings.method='OpenCV FFmpeg decode; 960x540 letterbox INTER_LINEAR; exact frontend ROI pixel runs; float64 original per-pixel RGB/HSV equations; fixed ROI; no motion correction';d.settings.source='NH3 Sensor Analyzer desktop / Python OpenCV';d.settings.timing='OpenCV presentation milliseconds; frame-index/FPS fallback explicitly recorded; requested and actual times exported separately';d.settings.decoder=extractionSettings?.decoder||{status:'imported CSV; see original extraction settings'};return d;};
