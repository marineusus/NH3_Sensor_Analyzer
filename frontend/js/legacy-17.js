
/* View limits never restrict ranking calculations or exported candidates. */
let crExpanded=false,crTableRender=false,crCandidateSource=null,crPreference='relative',crImportedAvailability=null,crStartingRows=null,crLastRankRows=null;
const crOriginalVisible=visibleCandidates,crOriginalRenderRank=renderRank,crOriginalValue=researchValue,crOriginalConfig=config;
function crRankRows(candidates){
 const groups=[...new Set(candidates.map(r=>r.concentration_ppm))];return groups.flatMap(ppm=>{const full=candidates.filter(r=>r.concentration_ppm===ppm).slice().sort((a,b)=>(Number.isFinite(b.score)?b.score:-Infinity)-(Number.isFinite(a.score)?a.score:-Infinity));return crExpanded?full:full.slice(0,5);});
}
visibleCandidates=function(candidates){return crTableRender?crRankRows(candidates):crOriginalVisible(candidates);};
renderRank=function(candidates,note){
 if(crLastRankRows!==rows){crLastRankRows=rows;crExpanded=false;}
 crCandidateSource=candidates;crTableRender=true;try{crOriginalRenderRank(candidates,note);}finally{crTableRender=false;}
 const counts=new Map(),shown=crRankRows(candidates);[...$('rank').children].forEach((tr,i)=>{let r=shown[i];if(!r)return;let n=(counts.get(r.concentration_ppm)||0)+1;counts.set(r.concentration_ppm,n);tr.children[0].textContent=Number.isFinite(r.score)?String(n):'—';});
 const button=$('crCandidateToggle');if(button){button.textContent=crExpanded?'접기':'전체 후보 보기';button.hidden=candidates.length<=shown.length&&!crExpanded;button.setAttribute('aria-expanded',String(crExpanded));}
 // Keep the existing score graph/export population; only the table is limited.
 const plotRows=crOriginalVisible(candidates);v2Chart('candidatePlot',[{color:'#078789',dots:true,points:plotRows.filter(r=>Number.isFinite(r.score)).map((r,i)=>[i+1,r.score])}]);
 $('rankNote').textContent+=' / '+shown.length+'개 표시 · 전체 '+candidates.length+'개 후보 계산·보존';
};
function crHasMode(mode){
 if(imported&&crImportedAvailability&&crImportedAvailability[mode]===false)return false;
 return rows.some(r=>['R','G','B','V','H_deg','S'].some(k=>Number.isFinite(crOriginalValue(r,k,mode))));
}
function crPolicy(){
 if(!rows.length||rows===crStartingRows)return {requested:crPreference,effective:crWhiteEnabled()?crPreference:'raw',state:'pending',reason:crWhiteEnabled()?'영상 추출 후 White 기준과 실제 보정값을 확인합니다.':'White Reference 미설정 — Raw 분석 적용'};
 const relative=crHasMode('relative'),raw=crHasMode('raw'),legacy=crHasMode('legacy');
 if(crPreference==='relative'&&relative&&(imported||crWhiteEnabled()))return {requested:crPreference,effective:'relative',state:'applied',reason:imported?'저장된 Relative 픽셀값 분석 · 새로운 보정을 평균 RGB에서 만들지 않습니다.':'Relative 분석 적용 · 보정 불가 표본은 결측으로 유지합니다.'};
 if(raw)return {requested:crPreference,effective:'raw',state:crPreference==='raw'?'raw_selected':'raw_fallback',reason:crPreference==='raw'?'원본(Raw) 분석 적용':crWhiteEnabled()?'유효한 초기 White 기준/Relative 데이터 없음 — Raw 분석 적용':'White Reference 미설정 — Raw 분석 적용'};
 if(relative)return {requested:crPreference,effective:'relative',state:'raw_unavailable',reason:'Raw 원본 열이 없는 파일입니다. 저장된 Relative 값으로 분석합니다.'};
 if(legacy)return {requested:crPreference,effective:'legacy',state:'legacy_compatibility',reason:'과거 Legacy 전용 파일의 호환 분석입니다. Raw/Relative 비교에는 원본 재추출이 필요합니다.'};
 return {requested:crPreference,effective:'raw',state:'unavailable',reason:'분석할 Raw/Relative 값이 없습니다. 원본 영상 재추출이 필요합니다.'};
}
function crWhiteValid(rect=white){return Array.isArray(rect)&&rect.length===4&&rect.every(Number.isFinite)&&rect[0]>=0&&rect[1]>=0&&rect[2]*960>=4&&rect[3]*540>=4&&(rect[0]+rect[2])<=1&&(rect[1]+rect[3])<=1;}
function crWhiteEnabled(){return $('crWhiteEnabled')?.checked!==false&&crWhiteValid();}
function crApplyPolicy(){const p=crPolicy();researchCalibration.mode=p.effective;if($('calibrationMode')){$('calibrationMode').value=p.effective==='legacy'?'raw':p.effective;$('calibrationMode').hidden=p.effective==='legacy';}if($('crCalibrationState'))$('crCalibrationState').textContent=p.reason;return p;}
researchValue=function(r,key,mode=researchCalibration.mode){return crOriginalValue(r,key,mode);};
config=function(){const p=crApplyPolicy(),c=crOriginalConfig();c.calibration_mode=p.effective;c.calibration_preference=crPreference;c.calibration_policy=p;c.white_enabled=crWhiteEnabled();c.white_baseline.mode=p.effective;return c;};
researchSetMode=function(mode){
 if(busy){crApplyPolicy();return;}if(!['raw','relative'].includes(mode))return;
 const previous=researchCalibration.mode;crPreference=mode;const p=crApplyPolicy();
 if(previous!==p.effective&&$('firstInjection').value===''){timingSuccessRows=null;timingFailureRows=null;estimatedFirst=null;timingInference=null;timingUnresolved=false;}
 nativeView.reference=null;nativeView.source=null;nativeReferenceRows=null;nativeInvalidateReport();
 if(rows.length&&totalSelected(weights))nativeRefresh();else{researchRefreshCalibration();syncNativeControls();}
};
researchModeLabel=function(mode=crApplyPolicy().effective){return mode==='relative'?'Relative · 초기 White 기준':mode==='raw'?'Raw · 원본':'과거 Legacy 파일 · 호환 분석';};
researchRefreshCalibration=function(){
 crApplyPolicy();if(!rows.length)return;const modes=['raw','relative'],series=modes.filter(crHasMode).map((mode,i)=>({label:researchModeLabel(mode),color:['#527dc9','#087f83'][i],points:researchBrightnessSeries(mode)}));
 researchChart($('calibrationComparePlot'),series,{title:'Raw / Relative Brightness 비교',yLabel:'Brightness (%)',subtitle:'동일 ROI · 원본 별도 보존 · 제외 표본은 공백',range:[0,100]});
 const c=config(),table=[];for(const mode of modes){if(!crHasMode(mode)){table.push({mode:researchModeLabel(mode),cycle:'—',mean:'데이터 없음',sd:'원본 재추출 필요',amplitude:'—',snr:'—',drift:'—'});continue;}
  const a=researchVAssessment(c,false,false,mode);for(const r of a.cycles)table.push({mode:researchModeLabel(mode),cycle:r.cycle,mean:r.Va_percent,sd:r.baseline_sd,amplitude:Number.isFinite(r.change)?Math.abs(r.change):null,snr:r.snr_unfloored,drift:r.baseline_drift});
 }
 v2Table('calibrationCompareStats',table,[['mode','보정'],['cycle','회차'],['mean','주입 전 평균(%)'],['sd','Baseline SD(%p)'],['amplitude','|Δ|(%p)'],['snr','SNR |Δ|/SD'],['drift','Baseline drift(%p)']]);
 const b=researchCalibration.white_baseline;$('calibrationModeNote').textContent=crPolicy().reason+' '+(b?'초기 White RGB '+b.map(x=>x.toFixed(2)).join(', ')+'. ':'')+'같은 ROI의 Raw·Relative SD/변화폭/SNR을 비교하세요. 보정 효과를 검증한 판정은 아닙니다. '+(researchCalibration.warnings||[]).join(' / ');
 researchDrawBrightness();researchDrawComparison();
};
// A missing White region is represented by an empty reference rectangle. The
// sensor pixel set and original RGB extraction do not change.
const crBuildROI=buildROI;
buildROI=function(c){if(c.white_enabled!==false&&crWhiteValid(c.white))return crBuildROI(c);const g=cxGeometry(c);return {ids:g.selected.ids.slice(),rect:[0,0,0,0],geometry:cxMetadata(g),variants:Object.entries(g.variants).map(([key,v])=>({key,ids_runs:cxRuns(v.ids),pixel_count:v.ids.length,percent:v.percent,shape:v.shape,angle_deg:v.rectangle?.angle_deg??null,rectangle:v.rectangle}))};};
const crValidate=validate;
validate=function(c){return crValidate(c.white_enabled===false?{...c,white:[0,0,0,0]}:c);};
const crPrepareBaseline=researchPrepareWhiteBaseline;
researchPrepareWhiteBaseline=async function(roi,c){if(c.white_enabled===false){researchStoredCalibrationMode=null;researchCalibration={...researchCalibration,white_baseline:null,samples:0,actual_start_s:null,actual_end_s:null,warnings:['White Reference 미설정 — Raw 분석 적용']};return;}return crPrepareBaseline(roi,c);};
const crStart=start;
start=async function(){const previousRows=rows,stored=researchStoredCalibrationMode,availability=crImportedAvailability;crStartingRows=previousRows;crImportedAvailability=null;researchStoredCalibrationMode=null;try{return await crStart();}finally{crStartingRows=null;if(rows===previousRows&&imported){researchStoredCalibrationMode=stored;crImportedAvailability=availability;}crApplyPolicy();}};
const crCSVImport=$('csvFile').onchange;
$('csvFile').onchange=async function(e){const f=e.target.files?.[0];if(!f)return;let declared=null;try{const input=parseCSV(await f.text()),r=input[0]||{},keys=Object.keys(r),stored=r.calibration_mode;declared={raw:keys.some(k=>/^raw_(R|G|B|V|H_deg|S)$/.test(k))||stored==='raw',relative:keys.some(k=>/^relative_(R|G|B|V|H_deg|S)$/.test(k))||stored==='relative',legacy:keys.some(k=>/^cal_(R|G|B|V|H_deg|S)$/.test(k))&&stored!=='relative'&&stored!=='raw'};if(!stored&&!declared.relative&&!declared.legacy)declared.raw=true;}catch{}
 crImportedAvailability=declared;await crCSVImport.call(this,e);if(imported&&declared){crImportedAvailability=declared;crPreference='relative';crApplyPolicy();if(rows.length&&totalSelected(weights))await evaluate();researchRefreshCalibration();}
};
const crSettingsImport=$('researchSettingsFile').onchange;
$('researchSettingsFile').onchange=async function(e){const f=e.target.files?.[0];if(!f)return;let data=null;try{data=JSON.parse(await f.text());const c=data.analysis||data.settings?.analysis;if(c){crPreference=['raw','relative'].includes(c.calibration_preference)?c.calibration_preference:c.calibration_mode==='raw'?'raw':'relative';if($('crWhiteEnabled'))$('crWhiteEnabled').checked=c.white_enabled!==false;}}catch{}
 await crSettingsImport.call(this,e);crApplyPolicy();if(rows.length&&totalSelected(weights))await evaluate();
};
const crRawRecords=researchRawRecords;
researchRawRecords=function(){return crRawRecords().map((record,i)=>{const out={...record};if(imported&&crImportedAvailability?.raw===false){for(const k of Object.keys(out))if(k.startsWith('raw_')||k==='Brightness_raw_percent')out[k]=null;out.Raw_status='원본 Raw 열 없음; 과거 보정값을 Raw로 간주하지 않음';}else if(imported&&researchStoredCalibrationMode==='raw'){for(const k of ['R','G','B','H_deg','S','V'])out['raw_'+k]=Number.isFinite(crOriginalValue(rows[i],k,'raw'))?crOriginalValue(rows[i],k,'raw'):null;out.Brightness_raw_percent=Number.isFinite(out.raw_V)?out.raw_V*100:null;}return out;});};
function crRelativeRecords(){return rows.map(r=>({video:r.video||r.video_id||'',time_s:r.time_s,global_time_s:r.global_time_s,...Object.fromEntries(['R','G','B','H_deg','S','V','H_coherence','paper_S'].map(k=>['relative_'+k,Number.isFinite(crOriginalValue(r,k,'relative'))?crOriginalValue(r,k,'relative'):null])),Brightness_relative_percent:Number.isFinite(crOriginalValue(r,'V','relative'))?crOriginalValue(r,'V','relative')*100:null,Status:Number.isFinite(crOriginalValue(r,'V','relative'))?'저장된 픽셀별 Relative 값':'Relative 값 없음; 원본 재추출 필요',calibration_mode:'relative'}));}
const crExport=exportData;
exportData=function(){crApplyPolicy();const d=crExport();d.relative=crRelativeRecords();d.settings.calibration_policy={...crPolicy(),raw_preserved:true,relative_formula:'pixel RGB × initial White / current White; clip then per-pixel HSV',legacy:'compatibility only; no menu or comparison',missing_reference:'Raw if available; no invented calibration or per-row mode mixing'};return d;};
const crExcel=excelBytes;
excelBytes=function(d){return cxExtendExcel(crExcel(d),[['Color_Relative',d.relative||crRelativeRecords()]]);};
const crFiles=researchFiles;
researchFiles=function(d){return [...crFiles(d),['Color_Relative.csv',csv(d.relative||crRelativeRecords())]];};
(function(){
 const button=uiEl('button','전체 후보 보기');button.id='crCandidateToggle';button.hidden=true;button.onclick=()=>{if(!$('rank').children.length||!v2Candidates?.length){crCandidateSource=null;crExpanded=false;button.hidden=true;return;}crExpanded=!crExpanded;renderRank(v2Candidates);};$('rankTable').parentElement.after(button);
 $('calibrationMode').innerHTML='<option value="relative" selected>Relative · 초기 White 기준</option><option value="raw">원본(Raw) 비교</option>';researchCalibration.mode='relative';crPreference='relative';
 const state=uiEl('p',undefined,'researchNote');state.id='crCalibrationState';$('calibrationMode').parentElement.append(state);
 const check=uiEl('label');check.innerHTML='<input id="crWhiteEnabled" type="checkbox" checked style="width:auto;margin-right:6px"> White Reference 사용';$('calibrationMode').parentElement.append(check);
 $('crWhiteEnabled').onchange=()=>{if(busy){$('crWhiteEnabled').checked=extractionSettings?.white_enabled!==false;return;}crApplyPolicy();if(rows.length&&totalSelected(weights))nativeRefresh();if(rows.length)status('미사용 시 Raw로 분석합니다. 새 White 좌표의 보정값은 원본 재추출이 필요하며 저장된 데이터는 보존합니다.');};
 $('relativeStart').closest('details').querySelector('summary').textContent='원본(Raw) / Relative 비교·초기 White 설정';
 crApplyPolicy();
})();

