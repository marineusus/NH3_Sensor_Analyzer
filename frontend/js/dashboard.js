/* Final-layout controller. The screen structure is static in index.html. */
(function(){
const shell=$('dashboard'),header=$('dashboardHeader');
const panes=Array.from({length:7},(_,i)=>$('dashboardStep'+(i+1)));
const videoCard=panes[0].querySelector('section'),experimentCard=panes[1].querySelector('section'),roiCard=document.querySelector('.roiCard');
const metricCard=document.querySelector('.metricChoice'),candidateCard=document.querySelector('.candidateChoice'),exportCard=document.querySelector('.exportCard');
const titles=['영상 선택','실험 조건 설정','ROI 설정','분석 지표 선택','지표 비교','분석 결과','결과 저장'];
const iconPaths=[
 '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18M16 3v18M4 8h4M4 16h4M16 8h4M16 16h4"/>',
 '<path d="M9 3h6M10 3v7L4 20h16L14 10V3M7 15h10"/>',
 '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>',
 '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
 '<path d="M4 20h17M7 16v-4M12 16V5M17 16V9"/>',
 '<path d="M3 3v18h18M6 15l4-5 4 3 6-8"/>',
 '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'
];
function svg(path,cls=''){return '<svg class="'+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';}
const flask=svg('<path d="M9 3h6M10 3v7L4 20q-1 2 2 2h12q3 0 2-2l-6-10V3M7 16h10"/><circle cx="11" cy="13" r=".6"/><circle cx="14" cy="18" r=".6"/>','brandFlask');
document.querySelectorAll('.stepButton').forEach(b=>b.onclick=()=>setStep(Number(b.dataset.step)));
const frame=$('frame');frame.style.maxHeight='none';frame.style.aspectRatio='16/9';
$('dashEmptyOpen').onclick=()=>{setStep(1);desktopChoose();};$('dashQuickCancel').onclick=()=>cancelAnalysis();
// Separate the analytical sensor from the independent White Reference.
const roiSensor=uiEl('div');roiSensor.className='dashboardROIGroup';roiSensor.append(uiEl('h3','분석 센서 영역'));
const sensorButtons=[...roiCard.querySelectorAll('button')].filter(b=>b.id==='autoROI'||b.getAttribute('onclick')?.includes('editSensor(')||b.getAttribute('onclick')?.includes('sensor=[]'));
roiSensor.append(...sensorButtons);roiSensor.append($('roiHint'));
const roiWhite=uiEl('div');roiWhite.className='dashboardROIGroup';roiWhite.append(uiEl('h3','White Reference 영역'));
const whiteDrag=[...roiCard.querySelectorAll('button')].find(b=>b.textContent.trim()==='흰색 기준 드래그');if(whiteDrag)roiWhite.append(whiteDrag);roiWhite.append($('whiteSpongeButton'));
const whiteManual=uiEl('button','흰 스펀지 수동 지정');whiteManual.id='dashWhiteManual';whiteManual.onclick=()=>{$('whiteSpongeButton').onclick({shiftKey:true});};roiWhite.append(whiteManual);
roiWhite.append(uiEl('p','분석 센서와 별개의 보정 기준입니다. 0 mg 스펀지를 자동으로 기준으로 간주하지 않습니다.','hint'));
const whiteStatus=uiEl('p');whiteStatus.id='dashWhiteState';whiteStatus.className='hint';roiWhite.append(whiteStatus);
const whiteToggle=$('crWhiteEnabled')?.closest('label');if(whiteToggle)roiWhite.append(whiteToggle);
const roiCalibration=uiEl('div');roiCalibration.className='dashboardROIGroup';roiCalibration.append(uiEl('h3','보정 설정'));
const calibrationSelect=$('calibrationMode'),calibrationRow=calibrationSelect.closest('.researchRow');if(calibrationRow)roiCalibration.append(calibrationRow);
const calibrationFold=$('relativeStart').closest('details');if(calibrationFold)roiCalibration.append(calibrationFold);
const legacyOption=uiEl('option','Legacy · White RGB를 200으로');legacyOption.value='legacy';calibrationSelect.append(legacyOption);
roiCard.prepend(roiSensor,roiWhite,roiCalibration);
function enableSelectedWhite(){if(!crWhiteValid())return;const box=$('crWhiteEnabled');if(!box.checked){box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));}drawFrame();}
const originalWhitePick=$('whiteSpongeButton').onclick;
$('whiteSpongeButton').onclick=function(event){const before=whiteSpongeReference.selected;const result=originalWhitePick.call(this,event);if(whiteSpongeReference.selected&&whiteSpongeReference.selected!==before)enableSelectedWhite();return result;};
let whiteGesture=false;frame.addEventListener('pointerdown',()=>{whiteGesture=mode==='white'||whiteSpongeReference.picking;},{capture:true});
frame.addEventListener('pointerup',()=>{if(whiteGesture)requestAnimationFrame(()=>{if(crWhiteValid())enableSelectedWhite();});whiteGesture=false;});
const oldWhiteToggle=$('crWhiteEnabled').onchange;$('crWhiteEnabled').onchange=function(e){if(this.checked&&!crWhiteValid()){this.checked=false;status('먼저 흰색 기준 영역을 직접 지정하세요.',true);return;}return oldWhiteToggle.call(this,e);};
// Expose the ALREADY computed cal_* path; no calibration equation is rewritten.
let dashboardLegacyPreferred=false;
const dashboardPolicyBase=crPolicy;crPolicy=function(){
 if(!dashboardLegacyPreferred)return dashboardPolicyBase();
 const pending=!rows.length||rows===crStartingRows,available=pending?crWhiteEnabled():crHasMode('legacy')&&(imported||crWhiteEnabled());
 return {requested:'legacy',effective:available?'legacy':'raw',state:available?'legacy_selected':'raw_fallback',reason:available?'Legacy · 기존 픽셀별 RGB × 200 / 현재 White 사용':'Legacy 보정값 없음 — Raw 분석 적용'};
};
const dashboardApplyPolicyBase=crApplyPolicy;crApplyPolicy=function(){const p=dashboardApplyPolicyBase();calibrationSelect.hidden=false;calibrationSelect.value=p.effective;return p;};
const dashboardSetModeBase=researchSetMode;researchSetMode=function(selected){
 if(busy){crApplyPolicy();return;}
 const wasLegacy=dashboardLegacyPreferred;dashboardLegacyPreferred=selected==='legacy';
 if(selected!=='legacy'){if(wasLegacy)researchCalibration.mode='legacy';return dashboardSetModeBase(selected);}
 crApplyPolicy();nativeView.reference=null;nativeView.source=null;nativeReferenceRows=null;nativeInvalidateReport();
 if(rows.length&&totalSelected(weights))nativeRefresh();else{researchRefreshCalibration();syncNativeControls();}refresh();
};
const dashboardModeLabelBase=researchModeLabel;researchModeLabel=function(mode=crApplyPolicy().effective){return mode==='legacy'?'Legacy · White 기준 200':dashboardModeLabelBase(mode);};
// Keep native channel/reference controls accessible without crowding the six weights.
const nativeRow=$('nativeChannel').closest('.nativeViewRow');
const nativeReference=metricCard.querySelector('.nativeReference');
const nativeFold=uiEl('details');nativeFold.className='dashboardAdvanced';nativeFold.append(uiEl('summary','Y축 성분·표시 방식·비교 기준색'));
if(nativeRow)nativeFold.append(nativeRow);if($('nativeAxisHint'))nativeFold.append($('nativeAxisHint'));if(nativeReference)nativeFold.append(nativeReference);
metricCard.append(nativeFold);
const mixFold=metricCard.querySelector('.legacyMixFold');const tabs=uiEl('div');tabs.className='dashboardTabs';
tabs.innerHTML='<button class="active" id="dashWeightsTab">가중치 설정</button><button id="dashPresetTab">프리셋</button>';
metricCard.querySelector(':scope>h2')?.remove();
const description=uiEl('p','RGB / HSV 가중치를 조합하여 분석 지표를 설정합니다.','dashboardDescription');
metricCard.prepend(description,tabs);
const weightsArea=uiEl('div');weightsArea.id='dashboardWeightsArea';weightsArea.append($('sliders'));
const formula=uiEl('div');formula.className='dashboardFormula';formula.innerHTML='<b>∑ 분석 지표 계산식</b><span id="dashFormula"></span>';
const formulaNote=uiEl('p');formulaNote.id='dashFormulaNote';formulaNote.className='hint';
const actions=uiEl('div');actions.className='dashboardMetricActions';actions.innerHTML='<button id="dashResetWeights">⟳ 초기화</button><button class="primary" id="dashApplyWeights">▶ 이 조합으로 결과 보기</button>';
weightsArea.append(formula,formulaNote,actions);tabs.after(weightsArea);
const presetArea=uiEl('div');presetArea.id='dashboardPresetArea';presetArea.hidden=true;
const preset=uiEl('button','B−R 조합 적용');preset.onclick=()=>{applyBRPreset();setMetricTab(false);refresh();};presetArea.append(uiEl('p','기존 B−R 프리셋과 지표 JSON을 사용합니다.','hint'),preset);
for(const [text,action]of [['지표 JSON 저장',()=>saveMetric()],['지표 JSON 불러오기',()=>$('metricFile').click()]]){const b=uiEl('button',text);b.onclick=action;presetArea.append(b);}
weightsArea.after(presetArea);if(mixFold)mixFold.hidden=true;
// The existing combination card remains available as an advanced explanation.
const mixDetail=uiEl('details');mixDetail.className='dashboardAdvanced';mixDetail.append(uiEl('summary','현재 지표의 정의·정규화'),$('combinationCard'));metricCard.append(mixDetail);
$('dashResetWeights').onclick=()=>{weights=[-1,0,1,0,0,0];sliders();if(rows.length)evaluate().catch(e=>status(e.message,true));refresh();};
$('dashApplyWeights').onclick=async()=>{try{nativeSelectChannel('combination');if(!rows.length){status('가중치를 적용했습니다. 먼저 색상을 추출하거나 CSV를 불러오세요.');refresh();return;}await evaluate();refresh();}catch(e){status(e.message,true);}};
function setMetricTab(preset){weightsArea.hidden=preset;presetArea.hidden=!preset;$('dashWeightsTab').classList.toggle('active',!preset);$('dashPresetTab').classList.toggle('active',preset);}
$('dashWeightsTab').onclick=()=>setMetricTab(false);$('dashPresetTab').onclick=()=>setMetricTab(true);
function styleSliders(){const ranges=['0–255','0–255','0–255','0–360°','0–100%','0–100%'];[...$('sliders').children].forEach((row,i)=>{const label=row.querySelector('.channelLabel');if(label){if(label.querySelector('b').textContent!==ranges[i])label.querySelector('b').textContent=ranges[i];label.title=CHANNELS[i].label;}row.querySelector('input[type=range]')?.setAttribute('aria-label',names[i]+' 분석 가중치 −1~1');});}
const originalSliders=sliders;sliders=function(...args){const value=originalSliders(...args);styleSliders();refresh();return value;};styleSliders();new MutationObserver(styleSliders).observe($('sliders'),{childList:true});
// Primary UI reports measured ROI colors. Weight editors remain hidden solely
// for original recommendation/import compatibility; no measurement is editable.
tabs.hidden=true;weightsArea.hidden=true;presetArea.hidden=true;
const colorPanel=uiEl('section');colorPanel.id='dashboardColorPanel';
colorPanel.innerHTML='<div class="currentMeanTop"><span id="dashMeanSwatch" class="empty"></span><div><strong>현재 ROI 평균색</strong><p id="dashMeanBasis">ROI를 지정하면 실제 색상을 표시합니다.</p></div></div><div id="dashboardColorGauges"></div><p id="dashMeanValues" class="hint"></p>';
const colorLimits=[255,255,255,360,100,100],colorRanges=['0–255','0–255','0–255','0–360°','0–100%','0–100%'];
names.forEach((name,i)=>{const row=uiEl('div');row.className='measuredColorRow';row.innerHTML='<span class="measuredColorLabel"><b style="background:'+CHANNELS[i].color+'">'+name+'</b><span>'+colorRanges[i]+'</span></span><input type="range" min="0" max="'+colorLimits[i]+'" step="any" disabled aria-label="'+name+' 현재 ROI 측정값"><output>—</output>';row.style.setProperty('--measure-color',CHANNELS[i].color);$('dashboardColorGauges')?.append(row);colorPanel.querySelector('#dashboardColorGauges').append(row);});
metricCard.prepend(colorPanel);
// Use the existing component selector with actual-value units; no new formula.
if(nativeRow){colorPanel.before(nativeRow);nativeRow.classList.add('dashboardNativeChoice');}
const combinationOption=$('nativeChannel').querySelector('option[value="combination"]');if(combinationOption){combinationOption.hidden=true;combinationOption.textContent='저장/추천 조합 지표 · 호환';}
if(nativeReference){nativeReference.querySelector('.nativeRefTop strong').textContent='비교 기준색 (고급)';nativeFold.querySelector('summary').textContent='비교 기준색 조정 · 원본 측정값 유지';}
description.textContent='선택한 ROI의 실제 평균 RGB / HSV 값을 확인합니다.';
$('dashSummaryWeights').previousElementSibling.textContent='현재 ROI · RGB / HSV';
let meanTimer=null,meanKey='',meanCache=null;
function requestMean(){
 if(busy||sensor.length<3||!cxFrame||!image.width||!desktopPreviewState.valid){if(sensor.length<3||!desktopPreviewState.valid){meanCache=null;meanKey='';showMean();}return;}
 const key=JSON.stringify([cxFrame,sensor,cxSettings(),white,globalThis.whiteSpongeReference?.selected?.metadata.mask_runs,researchCalibration.white_baseline,crPolicy().effective]);
 if(key===meanKey)return;clearTimeout(meanTimer);meanTimer=setTimeout(()=>{
  if(busy)return;
  try{const c=config(),g=cxGeometry(c);let record,prefix=c.calibration_mode==='legacy'?'cal':c.calibration_mode;
   try{record=sample(buildROI(c));}catch{const raw=pixelStats(sx.getImageData(0,0,960,540).data,g.selected.ids,null);record=Object.fromEntries(Object.entries(raw).map(([k,v])=>['raw_'+k,v]));prefix='raw';}
   if(!['R','G','B','H_deg','S','V'].every(k=>Number.isFinite(record[prefix+'_'+k])))prefix='raw';
   const values=['R','G','B','H_deg','S','V'].map(k=>record[prefix+'_'+k]);if(values.some(v=>!Number.isFinite(v)))throw Error('현재 ROI 색상을 읽지 못했습니다.');values[4]*=100;values[5]*=100;
   meanCache={values,prefix,pixels:g.selected.ids.length,time:cxFrame.time_s};meanKey=key;showMean();
  }catch(e){meanCache=null;showMean(e.message);}
 },100);
}
function showMean(error){
 const swatch=$('dashMeanSwatch');swatch.classList.toggle('empty',!meanCache);
 if(!meanCache){swatch.style.backgroundColor='';$('dashMeanBasis').textContent=error||'ROI를 지정하면 실제 색상을 표시합니다.';$('dashMeanValues').textContent='측정 전 · 값을 임의로 표시하지 않습니다.';for(const row of colorPanel.querySelectorAll('.measuredColorRow')){row.querySelector('input').value=0;row.querySelector('output').textContent='—';}return;}
 const v=meanCache.values;swatch.style.backgroundColor='rgb('+v.slice(0,3).map(x=>Math.max(0,Math.min(255,x))).join(',')+')';
 $('dashMeanBasis').textContent=(meanCache.prefix==='raw'?'Raw · 원본':meanCache.prefix==='cal'?'Legacy · White 기준 200':'Relative · 초기 White 기준')+' · '+meanCache.pixels.toLocaleString()+'픽셀';
 [...colorPanel.querySelectorAll('.measuredColorRow')].forEach((row,i)=>{row.querySelector('input').value=v[i];row.querySelector('output').textContent=v[i].toFixed(1)+(i===3?'°':i>=4?'%':'');});
 $('dashMeanValues').textContent='현재 장면 '+meanCache.time.toFixed(2)+'초 · 최종 분석 ROI의 픽셀 평균';
 $('dashSummaryWeights').textContent='RGB '+v.slice(0,3).map(x=>x.toFixed(1)).join(' / ')+' · H '+v[3].toFixed(1)+'°';
}
showMean();
const runActions=uiEl('div');runActions.className='dashboardRunActions';const stopButton=[...experimentCard.querySelectorAll('button')].find(b=>b.getAttribute('onclick')?.includes('cancelAnalysis('));runActions.append($('start'));if(stopButton)runActions.append(stopButton);roiCard.append(runActions);roiCard.append($('progressCard'));
let activeStep=4;const touched=new Set();
function setStep(n){activeStep=n;panes.forEach((p,i)=>p.hidden=i!==n-1);document.querySelectorAll('.stepButton').forEach(b=>{const on=Number(b.dataset.step)===n;b.classList.toggle('selected',on);b.setAttribute('aria-current',on?'step':'false');});$('dashboardWorkTitle').innerHTML=svg(iconPaths[n-1])+'<span>'+n+'. '+titles[n-1]+'</span>';$('dashboardWorkBody').scrollTop=0;refresh();}
globalThis.dashboardUI={setStep,refresh,get activeStep(){return activeStep;}};
function clock(value){if(!Number.isFinite(value))return '00:00';let n=Math.max(0,Math.floor(value));return (n>=3600?String(Math.floor(n/3600)).padStart(2,'0')+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
function refresh(){
 const f=files[Number($('previewVideo').value)]||null,t=Number($('previewTime').value)||0;
 $('dashQuickCancel').hidden=!busy;$('dashboardStatus').classList.toggle('isRunning',busy);
 const firstText=$('firstInjection').value,firstTime=Number(firstText);
 if($('firstTimingNote'))$('firstTimingNote').textContent=firstText!==''&&Number.isFinite(firstTime)?'입력한 첫 주입: 영상 '+firstTime+'초 · 시작 전 구간은 Initial Baseline / Air':Number.isFinite(estimatedFirst)?'색 변화로 추정한 첫 주입: 영상 '+estimatedFirst.toFixed(1)+'초 · 실제 장비 기록과 구분':'첫 주입 시각 미입력 · 색 변화 자동 추정 대기';
 $('dashFile').textContent=f?.name||(imported?'CSV 데이터':'영상 미선택');$('dashFile').title=f?.name||'';$('dashFPS').textContent='FPS '+$('fps').value;$('dashTime').textContent=clock(t)+' / '+clock(f?.duration_s);
 $('dashVideoEmpty').hidden=!!f&&desktopPreviewState.valid;if(f&&!desktopPreviewState.valid){$('dashVideoEmpty').querySelector('strong').textContent=desktopPreviewState.error?'미리보기를 읽지 못했습니다':'미리보기 불러오는 중';$('dashVideoEmpty').querySelector('p').textContent=desktopPreviewState.error||'원본 영상을 PC에서 읽고 있습니다.';}else{$('dashVideoEmpty').querySelector('strong').textContent='분석할 영상을 선택하세요';$('dashVideoEmpty').querySelector('p').textContent='스펀지 하나를 클릭하여 ROI를 설정합니다.';}$('dashGraphEmpty').hidden=!!rows.length;if(!rows.length)$('plotinfo').textContent='분석 데이터 없음 · 시간(초) / 선택 지표';
 $('dashGraphChannel').textContent=rows.length?($('nativeChannel').selectedOptions[0]?.textContent||'선택 지표'):'데이터 없음';
 $('dashSummaryMetric').textContent=rows.length?($('nativeChannel').selectedOptions[0]?.textContent||'미선택'):'미분석 · '+($('nativeChannel').selectedOptions[0]?.textContent||'미선택');
 if(!meanCache)$('dashSummaryWeights').textContent='ROI 측정 전';else showMean();requestMean();
 $('dashSummaryTarget').textContent=sensor.length>=3?'클릭한 스펀지 · 1센서':'ROI 미설정';
 const configured=crWhiteValid(),enabled=crWhiteEnabled(),relative=crPolicy().effective==='relative';
 const effective=crPolicy().effective,whiteKind=!configured?'미설정':globalThis.whiteSpongeReference?.selected?'흰 스펀지 · 고정 내부 ROI':'배경 사각형 · 지정됨';
 $('dashSummaryWhite').textContent=!configured?'미설정 · Raw':!enabled?'미적용 · Raw':rows.length?(effective==='raw'?'Raw · 보정 미적용':researchModeLabel(effective)+' 적용'):whiteKind+' · 추출 전';
 if($('dashWhiteState'))$('dashWhiteState').textContent=(enabled?'사용: ':'미사용: ')+whiteKind;
 if($('dashSummaryDetail'))$('dashSummaryDetail').textContent='센서 ROI: '+(sensor.length>=3?'지정됨':'미설정')+' · 기준 종류: '+(enabled?whiteKind:'미사용')+' · 보정: '+researchModeLabel(effective)+' · '+(busy?'분석 중':rows.length?rows.length+'개 표본':'미분석');
 const sum=weights.reduce((a,v)=>a+Math.abs(v),0),terms=weights.map((v,i)=>Math.abs(v)<1e-8?null:(v/sum).toFixed(2)+'·'+(i<3?names[i]+'/255':i===3?'cos(H−240°)':names[i])).filter(Boolean);
 $('dashFormula').textContent=sum?'I = '+terms.join(' + '):'가중치 미선택';$('dashFormula').title=$('dashFormula').textContent;$('dashFormulaNote').hidden=nativeView.channel==='combination';$('dashFormulaNote').textContent='조합식 미리보기입니다. 적용 버튼을 누르면 그래프에 반영됩니다.';
 const done=[files.length>0||imported,touched.has(2),!!(cxCache?.selected?.ids?.length>=25),!!totalSelected(weights),$('rank').children.length>0,rows.length>0,false];
 document.querySelectorAll('.stepButton').forEach((b,i)=>{b.querySelector('.stepCheck').textContent=done[i]?'✓':'';b.classList.toggle('complete',done[i]);});
}
// Resize the canvas element itself to 16:9; contain never creates an unaccounted
// pointer-coordinate letterbox in the editor's CSS bounding rectangle.
function fitVideo(){const box=$('dashboardViewport'),width=Math.max(1,Math.min(box.clientWidth,box.clientHeight*16/9));frame.style.width=width+'px';frame.style.height=width*9/16+'px';}
new ResizeObserver(fitVideo).observe($('dashboardViewport'));
const fullscreenTarget=shell.querySelector('.dashboardVideo');$('dashFullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await fullscreenTarget.requestFullscreen();}catch(e){status(e.message,true);}};
const help=uiEl('dialog');help.id='dashboardHelp';help.innerHTML='<div class="helpTop"><h2>NH₃ Sensor Analysis 사용 안내</h2><button id="dashHelpClose" aria-label="닫기">×</button></div><p>1. 원본 영상을 선택하고 순서를 확인합니다.</p><p>2. FPS·실험 시각·초기 White 구간을 설정합니다.</p><p>3. 스펀지 클릭 선택을 누르고 분석할 스펀지 중앙을 클릭합니다. White Reference는 별도로 지정합니다.</p><p>4. 기존 분석 지표와 가중치(−1~1)를 설정한 뒤 색상을 추출합니다.</p><p>5–7. 실제 데이터로 지표를 비교하고 결과·품질을 확인한 뒤 CSV·Excel·ZIP·보고서를 저장합니다.</p><p>메뉴를 전환해도 영상·ROI·분석값은 유지됩니다. 상세 설정은 각 단계의 접기/펼치기에 있습니다.</p><p class="hint">지원 시 GPU로 읽으며 CPU 모드도 선택할 수 있습니다. 디코더별 픽셀 차이는 설정에 기록합니다. 이 프로그램은 화면에 보이는 스펀지 중 하나를 분석합니다.</p>';
document.body.append(help);$('dashHelpClose').onclick=()=>help.close();$('dashHelp').onclick=()=>help.showModal();$('dashStepHelp').onclick=()=>help.showModal();$('dashSettings').onclick=()=>setStep(2);
const detail=uiEl('details');detail.className='summaryDetails';detail.append(uiEl('summary','ROI·보정·진행 상태 자세히'));const detailText=uiEl('p');detailText.id='dashSummaryDetail';detail.append(detailText);shell.querySelector('.dashboardSummary').append(detail);
const dashboardConfigBase=config;config=function(){const c=dashboardConfigBase();if(dashboardLegacyPreferred)c.calibration_preference='legacy';return c;};
const dashboardSettingsImport=$('researchSettingsFile').onchange;
$('researchSettingsFile').onchange=async function(e){
 let selected=null;try{const data=JSON.parse(await e.target.files?.[0]?.text());selected=data.analysis||data.settings?.analysis;}catch{}
 dashboardLegacyPreferred=false;await dashboardSettingsImport.call(this,e);
 if(selected&&(selected.calibration_preference==='legacy'||selected.calibration_mode==='legacy')&&!$('status').classList.contains('error')){dashboardLegacyPreferred=true;crApplyPolicy();if(rows.length)nativeRefresh();}refresh();
};
const oldTheme=setAppTheme;setAppTheme=function(){oldTheme('dark');document.documentElement.dataset.dashboardTheme='dark';};setAppTheme();
// Keep axis labels readable at every viewport without touching curve values.
const dashboardPlotBase=plot;plot=function(points){
 const canvas=$('plot'),ctx=canvas.getContext('2d'),fill=ctx.fillText,sx=canvas.clientWidth/canvas.width,sy=canvas.clientHeight/canvas.height;
 if(sx>0&&sy>0)ctx.fillText=function(text,x,y,maxWidth){const size=Number.parseFloat(ctx.font.match(/([0-9.]+)px/)?.[1]||'12');ctx.save();ctx.scale(1/sx,1/sy);ctx.font=(ctx.font.includes('bold')?'700':'400')+' '+size+'px DashboardRound, sans-serif';if(maxWidth===undefined)fill.call(ctx,text,x*sx,y*sy);else fill.call(ctx,text,x*sx,y*sy,maxWidth*sx);ctx.restore();};
 try{return dashboardPlotBase(points);}finally{ctx.fillText=fill;}
};
new ResizeObserver(()=>{if(latest?.curve)plot(latest.curve);}).observe($('dashboardGraphBody'));
const dashboardExportBase=exportData;exportData=function(){const d=dashboardExportBase();if(d.settings.calibration_policy)d.settings.calibration_policy.legacy='Explicit Legacy selection uses preserved cal_* values: original per-pixel gain 200/current White; no calibration from channel means';return d;};
$('start').onclick=()=>Promise.resolve().then(()=>start()).catch(e=>status(e.message,true));
const oldRender=renderResults;renderResults=function(...args){const r=oldRender(...args);refresh();return r;};
const oldDraw=drawFrame;drawFrame=function(...args){const r=oldDraw(...args);
 if(sensor.length>=3){const ctx=frame.getContext('2d'),xs=sensor.map(p=>p[0]*960),ys=sensor.map(p=>p[1]*540),x=Math.max(4,Math.min(840,Math.min(...xs))),y=Math.max(20,Math.min(...ys)-7);ctx.save();ctx.font='700 14px DashboardRound, sans-serif';const text='Sensor ROI',w=ctx.measureText(text).width+14;ctx.fillStyle='#a580dd';ctx.fillRect(x,y-18,w,22);ctx.fillStyle='#fff';ctx.fillText(text,x+7,y-2);ctx.restore();}
 refresh();return r;};
const oldShow=showPreview;showPreview=async function(...args){try{return await oldShow(...args);}finally{refresh();}};
new MutationObserver(refresh).observe($('status'),{childList:true,characterData:true,subtree:true});
// Delegation changes only presentation. It neither redecodes nor reevaluates.
shell.addEventListener('input',()=>{touched.add(activeStep);refresh();});shell.addEventListener('change',()=>{touched.add(activeStep);refresh();});
setStep(1);fitVideo();
// The legacy DOM remains measurable while hidden. Reveal only the final layout
// after both UI font weights are ready; never paint the pre-dashboard screen.
Promise.all([document.fonts.load('400 14px DashboardRound','가스 센서 NH₃'),document.fonts.load('700 14px DashboardRound','가스 센서 NH₃')])
 .catch(()=>{})
 .then(()=>requestAnimationFrame(()=>{fitVideo();document.documentElement.classList.remove('nh3-booting');window.dispatchEvent(new Event('nh3dashboardready'));}));
})();
