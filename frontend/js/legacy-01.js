
const v2OriginalRender=renderResults,v2OriginalRankBase=rankBase,v2OriginalRankRender=renderRank,v2OriginalExport=exportData;
let v2Assessment=null,v2Quality=null,v2Calibration=null,v2Candidates=[];
const v2Avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const v2SD=a=>a.length>=2?sd(a):null;
const v2Num=x=>Number.isFinite(x);
const v2GroupKey=x=>x===null||x===undefined?'미기록':String(x);
const v2Escape=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function v2Table(id,records,columns){$(id).innerHTML='<table><thead><tr>'+columns.map(([k,label])=>'<th>'+v2Escape(label)+'</th>').join('')+'</tr></thead><tbody>'+records.map(r=>'<tr>'+columns.map(([k])=>'<td>'+v2Escape(typeof r[k]==='boolean'?(r[k]?'완료':'미완료'):typeof r[k]==='number'?Number(r[k].toFixed(5)):r[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}
function v2Chart(id,series,extra={}){let canvas=$(id),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);let points=series.flatMap(s=>s.points).filter(p=>p.every(v2Num));if(!points.length){ctx.fillStyle=document.documentElement.dataset.theme==='dark'?'#a99dbc':'#607586';ctx.font='16px DashboardRound, sans-serif';ctx.fillText('계산할 데이터가 없습니다.',65,80);return}let xs=points.map(p=>p[0]),ys=points.flatMap(p=>p.length>2?[p[1]-p[2],p[1]+p[2]]:[p[1]]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);if(xmin===xmax)xmax=xmin+1;if(ymin===ymax){ymin-=.01;ymax+=.01}let pad=(ymax-ymin)*.08;ymin-=pad;ymax+=pad;let X=x=>70+(x-xmin)/(xmax-xmin)*(W-95),Y=y=>H-45-(y-ymin)/(ymax-ymin)*(H-75);ctx.font='12px DashboardRound, sans-serif';for(let i=0;i<=4;i++){let y=ymin+(ymax-ymin)*i/4,x=xmin+(xmax-xmin)*i/4;ctx.strokeStyle=document.documentElement.dataset.theme==='dark'?'#34384f':'#dce5eb';ctx.beginPath();ctx.moveTo(70,Y(y));ctx.lineTo(W-25,Y(y));ctx.stroke();ctx.fillStyle=document.documentElement.dataset.theme==='dark'?'#b5adc8':'#526b7c';ctx.fillText(y.toFixed(3),5,Y(y)+4);ctx.fillText(x.toFixed(1),X(x)-12,H-20)}series.forEach((s,index)=>{ctx.strokeStyle=s.color||['#078789','#d47b38','#527ddb','#9763b6'][index%4];ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2;ctx.beginPath();let begun=false;for(let p of s.points){if(!p.slice(0,2).every(v2Num)){begun=false;continue}if(!begun){ctx.moveTo(X(p[0]),Y(p[1]));begun=true}else ctx.lineTo(X(p[0]),Y(p[1]))}if(s.line!==false)ctx.stroke();if(s.dots||s.line===false)for(let p of s.points){if(!p.slice(0,2).every(v2Num))continue;ctx.beginPath();ctx.arc(X(p[0]),Y(p[1]),4,0,Math.PI*2);ctx.fill();if(p[2]>0){ctx.beginPath();ctx.moveTo(X(p[0]),Y(p[1]-p[2]));ctx.lineTo(X(p[0]),Y(p[1]+p[2]));ctx.stroke()}}})}
/* Quality warnings only. No extraction, calibration, baseline, assessment or
 * exclusion math is changed here. All decisions still require manual review. */
function dqSettings(){
 const mode=$('qualitySensitivity')?.value||'standard',p={sensitive:[6,.10],standard:[8,.15],relaxed:[12,.20]}[mode]||[8,.15];
 return {sensitivity:mode,mad_multiple:p[0],signal_range_fraction:p[1],signal_absolute_floor:.02,white_reference_percent:10,white_step_percent:4,white_rgb_floor:2,severe_saturation_fraction:.10,maximum_gap_multiple:1.8,automatic_deletion:false};
}
function dqSameSegment(i,j,interval){
 if(i<0||j>=rows.length||j<=i)return false;
 for(let k=i+1;k<=j;k++){
  const a=rows[k-1],b=rows[k],dt=b.global_time_s-a.global_time_s;
  if((a.video||a.video_id)!==(b.video||b.video_id)||!Number.isFinite(dt)||dt<=0||dt>interval*1.8)return false;
 }
 return true;
}
function dqExcursion(values,i,interval){
 if(!Number.isFinite(values[i]))return null;let left=[],right=[];
 for(let j=Math.max(0,i-3);j<i;j++)if(Number.isFinite(values[j])&&dqSameSegment(j,i,interval))left.push(values[j]);
 for(let j=i+1;j<=Math.min(values.length-1,i+3);j++)if(Number.isFinite(values[j])&&dqSameSegment(i,j,interval))right.push(values[j]);
 const a=left.length>=2?median(left):null,b=right.length>=2?median(right):null;
 if(a!==null&&b!==null){const dl=values[i]-a,dr=values[i]-b;return {delta:dl*dr>0?Math.min(Math.abs(dl),Math.abs(dr)):0,reference:(a+b)/2,left:a,right:b,edge:false};}
 if(i===0&&right.length>=3)return {delta:Math.abs(values[i]-b),reference:b,edge:true};
 if(i===values.length-1&&left.length>=3)return {delta:Math.abs(values[i]-a),reference:a,edge:true};
 return null;
}
function dqRobustThreshold(steps,k,floor){
 const m=steps.length?median(steps):0,mad=steps.length?median(steps.map(x=>Math.abs(x-m)))*1.4826:0;
 return {center:m,mad,threshold:Math.max(floor,m+k*mad)};
}
function dqInternalValidity(values,c){
 let intervals=[],time_order=0,gaps=0;for(let i=1;i<rows.length;i++){
  const dt=rows[i].global_time_s-rows[i-1].global_time_s;if(!Number.isFinite(dt)||dt<=0)time_order++;
  else if((rows[i].video||rows[i].video_id)===(rows[i-1].video||rows[i-1].video_id))intervals.push(dt);
 }
 let interval=intervals.length?median(intervals):1/(c.fps||1);if(!Number.isFinite(interval)||interval<=0)interval=1;
 for(let i=1;i<rows.length;i++)if(rows[i].global_time_s-rows[i-1].global_time_s>interval*1.8)gaps++;
 return {observed_interval_s:interval,time_order_invalid_count:time_order,gap_count:gaps,selected_value_missing_count:values.filter(x=>!Number.isFinite(x)).length,policy:'internal only; do not compare across gaps/order faults/file boundaries; original values preserved'};
}
function checkDataQuality(a){
 const c=config(),settings=dqSettings();
 const raw=typeof qualityRawAssessment==='function'?qualityRawAssessment(a.weights):a,values=raw.curve.map(p=>p[1]);
 const internal=dqInternalValidity(values,c),interval=internal.observed_interval_s,issues=[],notes=[];
 const selected=values.filter(Number.isFinite).sort((a,b)=>a-b),span=selected.length?selected[Math.floor((selected.length-1)*.95)]-selected[Math.floor((selected.length-1)*.05)]:0;
 let steps=[],whiteSteps=[];
 for(let i=1;i<rows.length;i++)if(dqSameSegment(i-1,i,interval)){
  if(Number.isFinite(values[i])&&Number.isFinite(values[i-1]))steps.push(Math.abs(values[i]-values[i-1]));
  const d=['R','G','B'].map(k=>Math.abs(rows[i]['white_'+k]-rows[i-1]['white_'+k]));if(d.every(Number.isFinite))whiteSteps.push(Math.max(...d));
 }
 const signalRobust=dqRobustThreshold(steps,settings.mad_multiple,settings.signal_absolute_floor);
 const threshold=Math.max(signalRobust.threshold,span*settings.signal_range_fraction),whiteRobust=dqRobustThreshold(whiteSteps,8,settings.white_rgb_floor);
 const usable=rows.filter(r=>['R','G','B'].every(k=>Number.isFinite(r['white_'+k])&&r['white_'+k]>0));
 let reference=usable.filter(r=>r.global_time_s>=rows[0]?.global_time_s&&r.global_time_s<(rows[0]?.global_time_s||0)+30);
 if(reference.length<3)reference=usable.slice(0,3);
 const refs=reference.length>=3?['R','G','B'].map(k=>median(reference.map(r=>r['white_'+k]))):null;
 let normalTransitions=0;const phases=!a.timing_unresolved&&(!c.first_injection_auto||Number.isFinite(c.first_injection_estimated_s))?c.cycle_plan||[]:[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i],whiteReasons=[],whiteValue={R:r.white_R??null,G:r.white_G??null,B:r.white_B??null};let drift=0,jump=0;
  if(refs&&['R','G','B'].every(k=>Number.isFinite(r['white_'+k]))){drift=Math.max(...['R','G','B'].map((k,j)=>Math.abs(r['white_'+k]/refs[j]-1)*100));if(drift>settings.white_reference_percent)whiteReasons.push('초기 White 대비 최대 '+drift.toFixed(1)+'% 변화');}
  if(i&&dqSameSegment(i-1,i,interval)){
   const changes=['R','G','B'].map(k=>({delta:Math.abs(r['white_'+k]-rows[i-1]['white_'+k]),percent:Math.abs(r['white_'+k]-rows[i-1]['white_'+k])/Math.max(1,Math.abs(rows[i-1]['white_'+k]))*100})).filter(d=>Number.isFinite(d.delta)&&Number.isFinite(d.percent));
   const large=changes.filter(d=>d.delta>whiteRobust.threshold&&d.percent>settings.white_step_percent);if(large.length){jump=Math.max(...large.map(d=>d.percent));whiteReasons.push('직전 White 대비 최대 '+jump.toFixed(1)+'% 급변');}
  }
  if((r.white_too_dark&&['R','G','B'].some(k=>Number.isFinite(r['white_'+k])))||['R','G','B'].some(k=>Number.isFinite(r['white_'+k])&&r['white_'+k]<5))whiteReasons.push('White가 너무 어두워 보정값을 계산할 수 없음');
  if(r.white_saturated_fraction>settings.severe_saturation_fraction)whiteReasons.push('White 심각 포화 '+(r.white_saturated_fraction*100).toFixed(1)+'%');
  const clip=c.calibration_mode==='relative'?r.relative_clipped_fraction:c.calibration_mode==='raw'?0:r.clipped_fraction;
  if(clip>settings.severe_saturation_fraction)whiteReasons.push('선택 보정 후 심각 포화 '+(clip*100).toFixed(1)+'%');
  function add(category,type,detail,value,extra={}){issues.push({time_s:r.global_time_s,video:r.video||r.video_id||'',local_time_s:r.time_s,row_index:i,category,type,detail,value,signal_value:Number.isFinite(values[i])?values[i]:null,white_R:r.white_R??null,white_G:r.white_G??null,white_B:r.white_B??null,review_status:qualityStatus(r),review_decision:qualityStatusName(r),review_reason:r.quality_review_reason||'',...extra});}
  if(whiteReasons.length)add('white','조명 안정성',whiteReasons.join(' · '),JSON.stringify(whiteValue),{reference_change_percent:drift,step_change_percent:jump});
  const d=dqExcursion(values,i,interval);
  if(d&&d.delta>threshold){
   const near=phases.some(p=>[p.gas_on_s,p.gas_off_s].some(t=>Number.isFinite(t)&&Math.abs(r.global_time_s-t)<=interval*2));
   // A sustained transition near a recorded gas boundary is not an isolated spike.
   if(near&&!whiteReasons.length&&!d.edge&&Math.abs(d.right-d.left)>threshold){normalTransitions++;continue;}
   add('signal','색상 데이터 이상 변화','주변 표본 대비 '+d.delta.toFixed(4)+' / 튐 기준 '+threshold.toFixed(4)+(near?' · 주입·제거 근처: 정상 반응 가능성도 확인':'')+(d.edge?' · 영상 끝단의 한쪽 주변 값과 비교':''),Number(values[i].toFixed(6)),{deviation:d.delta,threshold,near_gas_boundary:near,one_sided:d.edge});
  }
 }
 if(!refs)notes.push('White Reference 유효 표본이 부족해 초기 기준 대비 조명 안정성은 평가하지 못했습니다.');
 if(usable.length<rows.length&&refs)notes.push('White 값이 없는 시점은 조명 검사에서 평가하지 않았습니다.');
 const reviewed=qualityReviews().length,excluded=rows.filter(r=>qualityStatus(r)==='exclude').length;
 if(excluded)notes.push('사용자가 제외한 '+excluded+'개 표본은 원본을 보존하고 그래프·분석에서 공백으로 처리합니다.');
 return {issues,notes,internal_validation:{...internal,normal_transition_candidates:normalTransitions},summary:{sample_count:rows.length,warning_samples:new Set(issues.map(r=>r.row_index)).size,warning_count:issues.length,observed_interval_s:interval,white_available:!!refs,white_valid_sample_count:usable.length,white_reference_samples:reference.length,white_limit_percent:settings.white_reference_percent,white_jump_threshold_rgb:whiteRobust.threshold,jump_mad_multiple:settings.mad_multiple,jump_threshold:threshold,signal_valid_sample_count:selected.length,white_warning_samples:issues.filter(e=>e.category==='white').length,signal_warning_samples:issues.filter(e=>e.category==='signal').length,reviewed_samples:reviewed,excluded_samples:excluded,calibration_mode:c.calibration_mode,checks:['white_reference','selected_signal_spike'],parameters:settings,automatic_deletion:false}};
}
function dqWarningTable(target,events){
 target.replaceChildren();if(!events.length){target.append(uiEl('p','감지된 이상 변화가 없습니다.','hint'));return;}
 const table=uiEl('table'),head=uiEl('thead'),tr=uiEl('tr');for(const title of ['발생 시각','데이터값','확인 내용','검토 상태','원본 확인'])tr.append(uiEl('th',title));head.append(tr);table.append(head);const body=uiEl('tbody');
 for(const e of events.slice(0,100)){const row=uiEl('tr'),r=rows[e.row_index];row.append(uiEl('td',formatSeconds(e.start)+(e.end>e.start?' ~ '+formatSeconds(e.end):'')),uiEl('td',typeof e.value==='string'?e.value:String(e.value)),uiEl('td',e.detail+(e.count>1?' · '+e.count+'개 표본':'')),uiEl('td',qualityStatusName(r)));const td=uiEl('td'),button=uiEl('button','장면 보기');button.onclick=()=>openQualityReview(e.row_index,e);td.append(button);row.append(td);body.append(row);}
 table.append(body);target.append(table);if(events.length>100)target.append(uiEl('p','화면은 첫 100개 구간만 표시합니다. 저장 파일에는 전체 기록을 남깁니다.','hint'));
}
function dqStatus(id,events,available){
 const out=$(id);out.className='basis'+(events.length?' warn':'');
 out.textContent=!available?'평가 불가 · 유효 데이터 부족':events.length?'확인 필요 · '+events.length+'개 구간 · '+events.slice(0,3).map(e=>formatSeconds(e.start)).join(', ')+(events.length>3?' 외':''):'정상 · 검사 기준을 넘는 변화 없음';
}
function renderQuality(a){
 v2Quality=checkDataQuality(a);const q=v2Quality,events=qualityEvents(q),whites=events.filter(e=>e.category==='white'),signals=events.filter(e=>e.category==='signal');
 $('qualitySummary').textContent=rows.length+'개 표본 · 검토 '+q.summary.reviewed_samples+'개 / 제외 '+q.summary.excluded_samples+'개 · 자동 삭제 없음';
 dqStatus('qualityWhiteState',whites,q.summary.white_available);dqStatus('qualitySignalState',signals,q.summary.signal_valid_sample_count>=4);
 dqWarningTable($('qualityWhiteList'),whites);dqWarningTable($('qualityAnomalies'),signals);
 v2Chart('whitePlot',['R','G','B'].map((k,i)=>({color:['#d84d50','#23896a','#347de0'][i],points:rows.map(r=>[r.global_time_s,r['white_'+k]])})));
 const raw=qualityRawAssessment(a.weights);v2Chart('qualitySignalPlot',[{color:'#078789',points:raw.curve}]);
 $('qualitySignalAxis').textContent='X축: 영상 시간(초) / Y축: '+(a.analysis_metric?.label||'선택 분석 지표')+' ('+(a.analysis_metric?.unit||'지표 단위')+') · 원본 유효 신호';
 $('qualityNotes').textContent=q.notes.join(' / ');$('qualityReviewComparison').textContent=qualityComparison();
}

function repeatStats(cycles){let valid=cycles.filter(r=>r.complete&&v2Num(r.change)),values=valid.map(r=>r.change),mu=v2Avg(values),sigma=v2SD(values);return {count:valid.length,response_mean:mu,response_sd:sigma,response_cv:sigma!==null&&Math.abs(mu)>1e-8?sigma/Math.abs(mu):null,t90_mean:v2Avg(valid.map(r=>r.response_t90_s).filter(v2Num)),recovery_time_mean:v2Avg(valid.map(r=>r.recovery_time_s).filter(v2Num)),recovery_fraction_mean:v2Avg(valid.map(r=>r.recovery_fraction).filter(v2Num))}}
function renderOverlays(){if(!v2Assessment)return;let a=v2Assessment,key=$('overlayConcentration').value,cycles=a.cycles.filter(r=>v2GroupKey(r.concentration_ppm)===key&&v2Num(r.baseline)),colors=['#078789','#d47b38','#527ddb','#9763b6','#b44d6b'];let series=phase=>cycles.map((r,i)=>({color:colors[i%colors.length],points:a.curve.filter(p=>phase==='response'?p[0]>=r.gas_on_s&&p[0]<r.gas_off_s:p[0]>=r.gas_off_s&&p[0]<r.recovery_end_s).map(p=>[p[0]-(phase==='response'?r.gas_on_s:r.gas_off_s),v2Num(p[1])?p[1]-r.baseline:null])}));v2Chart('responseOverlay',series('response'));v2Chart('recoveryOverlay',series('recovery'));$('overlayLegend').innerHTML=cycles.map((r,i)=>'<span style="color:'+colors[i%colors.length]+'">● '+r.cycle+'회차</span>').join(' · ');let stats=repeatStats(cycles);v2Table('repeatSummary',[...cycles.map(r=>({cycle:r.cycle,response:r.change,t90:r.response_t90_s,recovery_time:r.recovery_time_s,recovery_percent:v2Num(r.recovery_fraction)?r.recovery_fraction*100:null})),{cycle:'완료 '+stats.count+'회 평균',response:stats.response_mean,t90:stats.t90_mean,recovery_time:stats.recovery_time_mean,recovery_percent:v2Num(stats.recovery_fraction_mean)?stats.recovery_fraction_mean*100:null},{cycle:'Response SD',response:stats.response_sd},{cycle:'Response CV(%)',response:v2Num(stats.response_cv)?stats.response_cv*100:null}],[['cycle','회차 / 통계'],['response','Response'],['t90','90% 반응 시간(초)'],['recovery_time','설정 회복 시간(초)'],['recovery_percent','최종 회복률(%)']])}
function calculateCalibration(a){let groups=new Map();for(let r of a.cycles)if(r.complete&&v2Num(r.change)&&v2Num(r.concentration_ppm)){let key=r.concentration_ppm;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r.change)}let table=[...groups].sort((a,b)=>a[0]-b[0]).map(([ppm,values])=>({concentration_ppm:ppm,n:values.length,response_mean:v2Avg(values),response_sd:v2SD(values)})),regression=null,n=table.length,notes=[];if(n>=2){let xm=v2Avg(table.map(r=>r.concentration_ppm)),ym=v2Avg(table.map(r=>r.response_mean)),Sxx=table.reduce((s,r)=>s+(r.concentration_ppm-xm)**2,0),slope=table.reduce((s,r)=>s+(r.concentration_ppm-xm)*(r.response_mean-ym),0)/Sxx,intercept=ym-slope*xm,SSt=table.reduce((s,r)=>s+(r.response_mean-ym)**2,0),SSr=table.reduce((s,r)=>s+(r.response_mean-slope*r.concentration_ppm-intercept)**2,0);regression={sensitivity_per_ppm:slope,intercept,r_squared:SSt>1e-12?1-SSr/SSt:null,distinct_concentrations:n,method:'농도별 평균값에 대한 비가중 선형회귀; signed Response; 절편 자유',unit:'선택 지표값 / ppm'};if(n===2)notes.push('농도 2점은 직선을 항상 만들 수 있어 R²로 선형성을 검증할 수 없습니다. 최소 3개 이상 농도로 확인하세요.');else notes.push('R²는 측정한 농도 범위의 선형 적합도입니다. 독립 반복·새 농도에서 재검증하세요.')}else notes.push('검량선 계산 불가: 완료된 서로 다른 농도 2개 이상이 필요합니다.');if(table.some(r=>r.n<2))notes.push('반복 1회인 농도는 SD를 계산할 수 없습니다.');if(a.cycles.some(r=>!v2Num(r.concentration_ppm)))notes.push('농도 미기록 회차는 검량선에서 제외했습니다.');return {table,regression,notes}}
function plotCalibration(d){let series=[{color:'#078789',dots:true,line:false,points:d.table.map(r=>[r.concentration_ppm,r.response_mean,r.response_sd||0])}];if(d.regression&&d.table.length){let r=d.regression,x=[d.table[0].concentration_ppm,d.table.at(-1).concentration_ppm];series.push({color:'#d47b38',points:x.map(v=>[v,r.sensitivity_per_ppm*v+r.intercept])})}v2Chart('calibrationPlot',series)}
function refreshV2(a=v2Assessment){if(!rows.length)return;if(!a)a=assess(weights);v2Assessment=a;renderQuality(a);let select=$('overlayConcentration'),previous=select.value;select.replaceChildren();for(let key of new Set(a.cycles.map(r=>v2GroupKey(r.concentration_ppm)))){let o=uiEl('option',key==='미기록'?'농도 미기록 (동일 농도 여부 확인)':key+' ppm');o.value=key;select.append(o)}if([...select.options].some(o=>o.value===previous))select.value=previous;renderOverlays();v2Calibration=calculateCalibration(a);let r=v2Calibration.regression;$('calibrationSummary').textContent=r?'Sensitivity '+fmt(r.sensitivity_per_ppm,5)+' 지표값/ppm · R² '+(v2Num(r.r_squared)?r.r_squared.toFixed(4):'계산 불가')+' · '+r.distinct_concentrations+'개 농도':'서로 다른 농도 데이터 부족 · 기존 반복 분석은 그대로 사용합니다.';v2Table('calibrationTable',v2Calibration.table,[['concentration_ppm','NH₃(ppm)'],['n','완료 반복 수'],['response_mean','평균 Response'],['response_sd','Response SD']]);$('calibrationNote').textContent=(r?'회귀식: Response = '+r.sensitivity_per_ppm.toFixed(6)+' × ppm + ('+r.intercept.toFixed(6)+'). ':'')+v2Calibration.notes.join(' / ');plotCalibration(v2Calibration)}
renderResults=function(a){v2OriginalRender(a);refreshV2(a)};
rankBase=function(c=config()){let result=v2OriginalRankBase(c),mode=$('evaluationMode').value;for(let r of result){let a=assess(r.weights,normalizedCandidateConfig(c),false),v=a.cycles.filter(x=>x.complete&&v2Num(x.change)),amplitude=v2Avg(v.map(x=>Math.abs(x.change))),noise=v2Avg(v.map(x=>x.baseline_sd).filter(v2Num)),snr=v2Avg(v.map(x=>x.signal_to_sd).filter(v2Num)),speed=v2Avg(v.map(x=>((x.response_t90_s??(x.gas_off_s-x.gas_on_s))/(x.gas_off_s-x.gas_on_s)+(x.recovery_time_s??(x.recovery_end_s-x.gas_off_s))/(x.recovery_end_s-x.gas_off_s))/2)),cv=a.change_cv;r.evaluation_mode=mode;r.baseline_noise_mean=noise;r.amplitude_score=amplitude!==null?amplitude/(1+(cv??0)):null;r.stability_score=v.length>=2&&v2Num(cv)&&v2Num(snr)?Math.log1p(snr)/(1+cv*10):null;r.speed_score=v.length&&v2Num(speed)?Math.log1p(snr??0)/(1+speed*5)/(1+(cv??0)):null;r.original_balanced_score=r.score;if(mode==='amplitude')r.score=r.amplitude_score;if(mode==='stability')r.score=r.stability_score;if(mode==='speed')r.score=r.speed_score;r.selection_reason=mode==='amplitude'?'L1 정규화된 지표의 변화폭과 반복 CV':mode==='stability'?'동일 농도 반복 2회 이상 · SNR과 CV':mode==='speed'?'주입·회복 시간 대비 도달 시간 · 미도달은 전체 구간 시간으로 평가':'기존 SNR·CV·시간·회복률 종합 점수';if(!v.length)r.score=null}return result.sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity))};
renderRank=function(candidates,note){v2Candidates=candidates;v2OriginalRankRender(candidates,note);let visible=visibleCandidates(candidates);[...$('rank').children].forEach((tr,i)=>{let detail=tr.querySelector('details');if(detail&&visible[i])detail.append(uiEl('p',visible[i].selection_reason,'hint'))});$('rankNote').textContent+=' / 평가: '+$('evaluationMode').selectedOptions[0].textContent+' · RGB/255, S/V 0–1, H=cos(H−240°), 가중치 절댓값 합=1. 지표 수치 범위 차이 때문에 변화폭만으로 최종 선정하지 마세요.';v2Chart('candidatePlot',[{color:'#078789',dots:true,points:visible.filter(r=>v2Num(r.score)).map((r,i)=>[i+1,r.score])}]);$('candidateLegend').textContent='X축: 표시 후보 번호 / Y축: 선택 기준의 비교 점수 · 농도 간 점수는 직접 비교하지 마세요.'};
async function saveMetric(){if(!totalSelected(weights))throw Error('지표를 먼저 선택하세요.');let w=weights.map(x=>x/weights.reduce((s,v)=>s+Math.abs(v),0));await download(JSON.stringify({type:'sensor_color_metric',version:2,name:combinationName(w),weights:w,evaluation_mode:$('evaluationMode').value,feature_definition:'R/G/B /255; H cos(H-240deg); S,V 0-1; L1 weights'},null,2),'selected_metric.json','application/json')}
$('metricFile').onchange=async e=>{try{let file=e.target.files[0];if(!file)return;let m=JSON.parse(await file.text());if(m.type!=='sensor_color_metric'||!Array.isArray(m.weights)||m.weights.length!==6||m.weights.some(v=>!v2Num(v))||!totalSelected(m.weights))throw Error('올바른 분석 지표 JSON이 아닙니다.');let norm=m.weights.reduce((s,v)=>s+Math.abs(v),0);weights=m.weights.map(v=>v/norm);if(['balanced','amplitude','stability','speed'].includes(m.evaluation_mode))$('evaluationMode').value=m.evaluation_mode;sliders();if(rows.length)await evaluate();status('저장한 색상 지표 적용 · 새 데이터에서 재현성을 확인하세요.')}catch(e){status(e.message,true)}};
exportData=function(){let d=v2OriginalExport();refreshV2(assess(weights));renderRank(d.ranked);d.quality=v2Quality;d.calibration=v2Calibration;d.repeat_summary=[...new Set(v2Assessment.cycles.map(r=>v2GroupKey(r.concentration_ppm)))].map(key=>({concentration:key,...repeatStats(v2Assessment.cycles.filter(r=>v2GroupKey(r.concentration_ppm)===key))}));d.settings.second_improvements={version:2,evaluation_mode:$('evaluationMode').value,quality_thresholds:v2Quality.summary,calibration:v2Calibration.regression,final_weights:weights,quality_policy:'warn only; never auto-delete'};return d};
excelBytes=function(d){let settings=Object.entries(d.settings).map(([k,v])=>({setting:k,value:typeof v==='object'?JSON.stringify(v):v}));let nonempty=(a,reason)=>a.length?a:[{status:reason}];return xlsx([['사이클 결과',d.cycles],['후보 조합',d.ranked],['색상 시계열',d.colors],['설정',settings],['품질 경고',nonempty(d.quality.issues,'감지 경고 없음')],['표본 검토',nonempty(d.quality_reviews||[],'검토 기록 없음')],['반복 통계',d.repeat_summary],['농도별 평균',nonempty(d.calibration.table,'농도 데이터 부족')],['선형회귀',d.calibration.regression?[d.calibration.regression]:[{status:d.calibration.notes.join(' / ')}]]])};
function v2PNG(id){let b64=$(id).toDataURL('image/png').split(',')[1],raw=atob(b64);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
exportResultsBase=async function(){let d=exportData(),entries=[['colors_with_combination.csv',csv(d.colors)],['cycle_results.csv',csv(d.cycles)],['candidate_ranking.csv',csv(d.ranked)],['settings.json',JSON.stringify(d.settings,null,2)],['analysis.xlsx',excelBytes(d)],['quality_anomalies.csv',csv(d.quality.issues.length?d.quality.issues:[{status:'감지 경고 없음'}])],['quality_review.csv',csv(d.quality_reviews?.length?d.quality_reviews:[{status:'검토 기록 없음'}])],['quality_summary.json',JSON.stringify(d.quality.summary,null,2)],['repeat_summary.csv',csv(d.repeat_summary)],['concentration_response.csv',csv(d.calibration.table.length?d.calibration.table:[{status:'농도 데이터 부족'}])],['calibration_regression.csv',csv(d.calibration.regression?[d.calibration.regression]:[{status:d.calibration.notes.join(' / ')}])]];for(let id of ['plot','whitePlot','candidatePlot','calibrationPlot'])entries.push(['graphs/'+id+'.png',v2PNG(id)]);let original=$('overlayConcentration').value;for(let option of $('overlayConcentration').options){$('overlayConcentration').value=option.value;renderOverlays();entries.push(['graphs/response_'+option.value+'.png',v2PNG('responseOverlay')],['graphs/recovery_'+option.value+'.png',v2PNG('recoveryOverlay')])}$('overlayConcentration').value=original;renderOverlays();await download(zip(entries),'sensor_results.zip','application/zip')};
