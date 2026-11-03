
/* View limits never restrict ranking calculations or exported candidates. */
let crExpanded=false,crTableRender=false,crCandidateSource=null,crPreference='relative',crImportedAvailability=null,crStartingRows=null,crLastRankRows=null;
const crOriginalVisible=visibleCandidates,crOriginalValue=researchValue,crOriginalConfig=config;
function crRankRows(candidates){const sorted=candidates.slice().sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity));return crExpanded?sorted:sorted.slice(0,5);}
visibleCandidates=function(candidates){return crTableRender?crRankRows(candidates):crOriginalVisible(candidates);};
function crCandidateName(r){
 const labels={R:'R · 빨강',G:'G · 초록',B:'B · 파랑',H:'H · 색조',S:'S · 채도',V:'V · 명도',paper_s:'논문 S',br_difference:'B−R',br_contrast:'(B−R)/(B+R)',h_cos:'cos(H−240°)',v_contrast:'V + 색상 대비'};
 if(r.research_channel)return labels[r.research_channel]||r.name;
 const total=r.weights.reduce((s,x)=>s+Math.abs(x),0);
 return r.weights.map((v,i)=>Math.abs(v)>1e-8?names[i]+(v<0?'−':' ')+Math.round(Math.abs(v)/total*100)+'%':null).filter(Boolean).join(' + ');
}
renderRank=function(candidates){
 if(crLastRankRows!==rows){crLastRankRows=rows;crExpanded=false;}
 v2Candidates=candidates;crCandidateSource=candidates;
 const shown=crRankRows(candidates),root=$('rank'),head=$('rankTable').querySelector('thead tr');root.replaceChildren();head.replaceChildren(...['#','지표','점수','SNR'].map(x=>uiEl('th',x)));
 shown.forEach((r,i)=>{
  const tr=uiEl('tr');tr.tabIndex=0;tr.dataset.weights=JSON.stringify(r.weights);
  const cell=uiEl('td'),line=uiEl('div',undefined,'rankMetricLine'),apply=uiEl('button',crCandidateName(r),'rankApply'),expand=uiEl('button','⌄','rankExpand'),detail=uiEl('div',undefined,'rankMetricDetail');
  apply.title=r.name||combinationName(r.weights);expand.title='변화량·기준선·회복률 상세';expand.setAttribute('aria-label',crCandidateName(r)+' 상세');expand.setAttribute('aria-expanded','false');detail.hidden=true;
  const covered=r.per_concentration?(' · '+r.valid_concentrations+'/'+r.total_concentrations+'개 농도 평가'):'';
  detail.textContent='변화량 '+fmt(r.mean_abs_change)+' · Baseline SD '+fmt(r.baseline_noise_mean,5)+' · 회복률 '+(Number.isFinite(r.mean_recovery_fraction)?(r.mean_recovery_fraction*100).toFixed(1)+'%':'—')+covered;
  apply.onclick=e=>{e.stopPropagation();applyCandidateMetric(r);};expand.onclick=e=>{e.stopPropagation();detail.hidden=!detail.hidden;expand.setAttribute('aria-expanded',String(!detail.hidden));};
  line.append(apply,expand);cell.append(line,detail);tr.append(uiEl('td',Number.isFinite(r.score)?i+1:'—'),cell,uiEl('td',fmt(r.score,4)),uiEl('td',fmt(r.mean_signal_to_sd,1)));
  tr.title='행을 누르면 전체 그래프에 적용합니다.';tr.onclick=()=>applyCandidateMetric(r);tr.onkeydown=e=>{if(e.target===tr&&['Enter',' '].includes(e.key)){e.preventDefault();applyCandidateMetric(r);}};root.append(tr);
 });
 const button=$('crCandidateToggle');if(button){button.textContent=crExpanded?'접기':'전체 후보 보기';button.hidden=candidates.length<=5;button.setAttribute('aria-expanded',String(crExpanded));}
 const groups=new Set(config().cycle_plan.map(r=>r.concentration_ppm)).size;
 $('rankNote').textContent='전체 '+groups+'개 농도 통합 · '+shown.length+' / '+candidates.length+'개 지표';
 $('candidateLegend').textContent='전체 농도 통합 순위 · 각 농도의 평가 점수를 같은 비중으로 합산';
 v2Chart('candidatePlot',[{color:'#078789',dots:true,points:shown.filter(r=>Number.isFinite(r.score)).map((r,i)=>[i+1,r.score])}]);markCandidateRows();
};
function crHasMode(mode){
 if(imported&&crImportedAvailability&&crImportedAvailability[mode]===false)return false;
 return rows.some(r=>['R','G','B','V','H_deg','S'].some(k=>Number.isFinite(crOriginalValue(r,k,mode))));
}
function crPolicy(){
 const requested=crPreference,enabled=imported||crWhiteEnabled(),available=crHasMode(requested);
 const running=busy&&!['done','error','cancelled'].includes(desktopJobState);
 if(requested==='raw')return {requested,effective:'raw',state:'raw_selected',reason:'원본(Raw) 분석 적용'};
 if(enabled&&available)return {requested,effective:requested,state:'applied',reason:requested==='relative'?'Relative 분석 적용 · 보정 불가 표본은 결측으로 유지합니다.':'Legacy 분석 적용 · White 기준 200'};
 if(enabled&&(running||!rows.length||rows===crStartingRows))return {requested,effective:requested,state:'pending',reason:running?'선택한 보정 유지 · 보정 데이터 수신 대기 중':'선택한 보정 유지 · 추출 후 보정값을 확인합니다.'};
 if(crHasMode('raw')||!enabled)return {requested,effective:'raw',state:'raw_fallback',reason:enabled?'선택한 보정의 유효값이 없어 Raw를 표시합니다. 초기 White 구간을 확인하세요.':'White Reference 미설정 · 현재 Raw 표시. 보정을 적용하려면 White 지정 후 재추출하세요.'};
 for(const mode of ['relative','legacy'])if(crHasMode(mode))return {requested,effective:mode,state:'stored_only',reason:'선택한 보정값이 없어 저장된 '+mode+' 값으로 표시합니다.'};
 return {requested,effective:requested,state:'unavailable',reason:'선택한 보정의 데이터가 없습니다. 원본 추출이 필요합니다.'};
}
function crWhiteValid(rect=white){return Array.isArray(rect)&&rect.length===4&&rect.every(Number.isFinite)&&rect[0]>=0&&rect[1]>=0&&rect[2]*960>=4&&rect[3]*540>=4&&(rect[0]+rect[2])<=1&&(rect[1]+rect[3])<=1;}
function crWhiteEnabled(){return $('crWhiteEnabled')?.checked!==false&&crWhiteValid();}
function crApplyPolicy(){const p=crPolicy();researchCalibration.mode=p.effective;if($('calibrationMode')){if($('calibrationMode').value!==crPreference)$('calibrationMode').value=crPreference;$('calibrationMode').hidden=false;}if($('crCalibrationState'))$('crCalibrationState').textContent=p.reason;return p;}
config=function(){const p=crApplyPolicy(),c=crOriginalConfig();c.calibration_mode=p.effective;c.calibration_preference=crPreference;c.calibration_policy=p;c.white_enabled=crWhiteEnabled();c.white_baseline.mode=p.effective;return c;};
researchSetMode=function(mode){
 if(!['raw','relative','legacy'].includes(mode))return;
 const previous=researchCalibration.mode;crPreference=mode;const p=crApplyPolicy();
 if(previous!==p.effective&&$('firstInjection').value===''){timingSuccessRows=null;timingFailureRows=null;estimatedFirst=null;timingInference=null;timingUnresolved=false;}
 nativeView.reference=null;nativeView.source=null;nativeReferenceRows=null;nativeInvalidateReport();
 if(busy){if(rows.length&&totalSelected(weights)){latest=timingOnlyAssessment(weights,true,false,config());plot(latest.curve);}globalThis.dashboardUI?.refresh();return;}
 if(rows.length&&totalSelected(weights))nativeRefresh();else{researchRefreshCalibration();syncNativeControls();}globalThis.dashboardUI?.refresh();
};
researchModeLabel=function(mode=crApplyPolicy().effective){return mode==='relative'?'Relative · 초기 White 기준':mode==='raw'?'Raw · 원본':'Legacy · White 기준 200';};
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
const crStart=start;
start=async function(){const previousRows=rows,stored=researchStoredCalibrationMode,availability=crImportedAvailability;crStartingRows=previousRows;crImportedAvailability=null;researchStoredCalibrationMode=null;try{return await crStart();}finally{crStartingRows=null;if(rows===previousRows&&imported){researchStoredCalibrationMode=stored;crImportedAvailability=availability;}crApplyPolicy();}};
const crCSVImport=$('csvFile').onchange;
$('csvFile').onchange=async function(e){const f=e.target.files?.[0];if(!f)return;let declared=null;try{const input=parseCSV(await f.text()),r=input[0]||{},keys=Object.keys(r),stored=r.calibration_mode;declared={raw:keys.some(k=>/^raw_(R|G|B|V|H_deg|S)$/.test(k))||stored==='raw',relative:keys.some(k=>/^relative_(R|G|B|V|H_deg|S)$/.test(k))||stored==='relative',legacy:keys.some(k=>/^cal_(R|G|B|V|H_deg|S)$/.test(k))&&stored!=='relative'&&stored!=='raw'};if(!stored&&!declared.relative&&!declared.legacy)declared.raw=true;}catch{}
 crImportedAvailability=declared;await crCSVImport.call(this,e);if(imported&&declared){crImportedAvailability=declared;crPreference='relative';crApplyPolicy();if(rows.length&&totalSelected(weights))await evaluate();researchRefreshCalibration();}
};
const crSettingsImport=$('researchSettingsFile').onchange;
$('researchSettingsFile').onchange=async function(e){const f=e.target.files?.[0];if(!f)return;let data=null;try{data=JSON.parse(await f.text());const c=data.analysis||data.settings?.analysis;if(c){crPreference=['raw','relative','legacy'].includes(c.calibration_preference)?c.calibration_preference:['raw','relative','legacy'].includes(c.calibration_mode)?c.calibration_mode:'relative';if($('crWhiteEnabled'))$('crWhiteEnabled').checked=c.white_enabled!==false;}}catch{}
 await crSettingsImport.call(this,e);crApplyPolicy();if(rows.length&&totalSelected(weights))await evaluate();
};
const crRawRecords=researchRawRecords;
researchRawRecords=function(){return crRawRecords().map((record,i)=>{const out={...record};if(imported&&crImportedAvailability?.raw===false){for(const k of Object.keys(out))if(k.startsWith('raw_')||k==='Brightness_raw_percent')out[k]=null;out.Raw_status='원본 Raw 열 없음; 과거 보정값을 Raw로 간주하지 않음';}else if(imported&&researchStoredCalibrationMode==='raw'){for(const k of ['R','G','B','H_deg','S','V'])out['raw_'+k]=Number.isFinite(crOriginalValue(rows[i],k,'raw'))?crOriginalValue(rows[i],k,'raw'):null;out.Brightness_raw_percent=Number.isFinite(out.raw_V)?out.raw_V*100:null;}return out;});};
function crRelativeRecords(){return rows.map(r=>({video:r.video||r.video_id||'',time_s:r.time_s,global_time_s:r.global_time_s,...Object.fromEntries(['R','G','B','H_deg','S','V','H_coherence','paper_S'].map(k=>['relative_'+k,Number.isFinite(crOriginalValue(r,k,'relative'))?crOriginalValue(r,k,'relative'):null])),Brightness_relative_percent:Number.isFinite(crOriginalValue(r,'V','relative'))?crOriginalValue(r,'V','relative')*100:null,Status:Number.isFinite(crOriginalValue(r,'V','relative'))?'저장된 픽셀별 Relative 값':'Relative 값 없음; 원본 재추출 필요',calibration_mode:'relative'}));}
const crExport=exportData;
exportData=function(){crApplyPolicy();const d=crExport();d.relative=crRelativeRecords();d.settings.calibration_policy={...crPolicy(),raw_preserved:true,relative_formula:'pixel RGB × initial White / current White; clip then per-pixel HSV',legacy:'pixel RGB x 200/current White; all stored modes are selectable',missing_reference:'Raw if available; no invented calibration or per-row mode mixing'};d.settings.ranking_scope={scope:'all_concentrations',aggregation:'sum of valid concentration scores / all configured concentrations; single concentration keeps original scoring',missing:'missing group contributes zero to ranking only, scientific values stay null',cv:'within the same concentration only'};return d;};
const crExcel=excelBytes;
excelBytes=function(d){return cxExtendExcel(crExcel(d),[['Color_Relative',d.relative||crRelativeRecords()]]);};
const crFiles=researchFiles;
researchFiles=function(d){return [...crFiles(d),['Color_Relative.csv',csv(d.relative||crRelativeRecords())]];};
(function(){
 const button=uiEl('button','전체 후보 보기');button.id='crCandidateToggle';button.hidden=true;button.onclick=()=>{if(!$('rank').children.length||!v2Candidates?.length){crCandidateSource=null;crExpanded=false;button.hidden=true;return;}crExpanded=!crExpanded;renderRank(v2Candidates);};$('rankTable').parentElement.after(button);
 $('calibrationMode').innerHTML='<option value="relative" selected>Relative · 초기 White 기준</option><option value="raw">원본(Raw) 비교</option><option value="legacy">Legacy · White RGB를 200으로</option>';researchCalibration.mode='relative';crPreference='relative';
 const state=uiEl('p',undefined,'researchNote');state.id='crCalibrationState';$('calibrationMode').parentElement.append(state);
 const check=uiEl('label');check.innerHTML='<input id="crWhiteEnabled" type="checkbox" style="width:auto;margin-right:6px"> White Reference 사용';$('calibrationMode').parentElement.append(check);
 $('crWhiteEnabled').onchange=()=>{if(busy){$('crWhiteEnabled').checked=extractionSettings?.white_enabled!==false;return;}crApplyPolicy();if(rows.length&&totalSelected(weights))nativeRefresh();if(rows.length)status('미사용 시 Raw로 분석합니다. 새 White 좌표의 보정값은 원본 재추출이 필요하며 저장된 데이터는 보존합니다.');};
 $('relativeStart').closest('details').querySelector('summary').textContent='원본(Raw) / Relative 비교·초기 White 설정';
 crApplyPolicy();
})();


// Reports keep their existing per-concentration appendix; UI/CSV rank is global.
const crReportPages=buildReportPages;
buildReportPages=function(a,candidates,...rest){
 const details=candidates.flatMap(r=>r.per_concentration||[r]).sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity));
 return crReportPages(a,details,...rest);
};
