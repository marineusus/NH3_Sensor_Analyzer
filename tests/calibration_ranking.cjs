const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.dashboardUI&&!document.documentElement.classList.contains('nh3-booting'));
  const calibration=await page.evaluate(()=>{
   white=[.02,.02,.1,.1];$('crWhiteEnabled').checked=true;busy=true;desktopJobState='running';rows=[];crPreference='relative';crApplyPolicy();
   const record=()=>({selected:$('calibrationMode').value,effective:researchCalibration.mode,state:crPolicy().state});
   const result=[record()];rows=[{global_time_s:0,raw_R:100,raw_G:110,raw_B:120,raw_H_deg:210,raw_S:.2,raw_V:.5}];
   researchCalibration={...researchCalibration,mode:'raw'};crApplyPolicy();result.push(record());
   researchSetMode('legacy');result.push(record());
   Object.assign(rows[0],{cal_R:110,cal_G:120,cal_B:130,cal_H_deg:210,cal_S:.2,cal_V:.55});crApplyPolicy();result.push(record());
   researchSetMode('raw');result.push(record());researchSetMode('relative');
   Object.assign(rows[0],{relative_R:120,relative_G:130,relative_B:140,relative_H_deg:210,relative_S:.2,relative_V:.6});
   // Repeated native progress payloads must not overwrite the user's selection.
   for(let i=0;i<3;i++){researchCalibration={...researchCalibration,mode:'raw'};crApplyPolicy();result.push(record());}
   busy=false;desktopJobState='done';white=[0,0,0,0];$('crWhiteEnabled').checked=false;crApplyPolicy();result.push(record());
   return result;
  });
  assert.equal(calibration[0].selected,'relative');assert.equal(calibration[1].effective,'relative');
  assert.equal(calibration[2].selected,'legacy');assert.equal(calibration[3].effective,'legacy');assert.equal(calibration[4].effective,'raw');
  for(const p of calibration.slice(5,8)){assert.equal(p.selected,'relative');assert.equal(p.effective,'relative');}
  assert.equal(calibration.at(-1).selected,'relative');assert.equal(calibration.at(-1).effective,'raw');assert.equal(calibration.at(-1).state,'raw_fallback');
  const ranking=await page.evaluate(async()=>{
   sensor=[[.6,.2],[.85,.2],[.85,.7],[.6,.7]];crPreference='raw';$('firstInjection').value=100;$('baseline_window').value=20;
   cyclePlan=[2,5,10,20].map((ppm,i)=>({concentration_ppm:ppm,gas_on_s:100+i*200,gas_off_s:180+i*200,recovery_end_s:300+i*200}));
   rows=Array.from({length:901},(_,t)=>{
    let strength=0;for(const c of cyclePlan)if(t>=c.gas_on_s&&t<c.recovery_end_s)strength=c.concentration_ppm/20*(t<c.gas_off_s?Math.min(1,(t-c.gas_on_s)/30):1-(t-c.gas_off_s)/120);
    const rgb=[160-15*strength,180-100*strength,80+20*strength].map(v=>v+.3*Math.sin(t*.31));const [h,s,v]=hsv(...rgb);
    return {video:'fixture',global_time_s:t,time_s:t,pixel_count:1000,raw_R:rgb[0],raw_G:rgb[1],raw_B:rgb[2],raw_H_deg:h,raw_H_coherence:1,raw_S:s,raw_V:v,raw_paper_S:1-3*Math.min(...rgb)/rgb.reduce((a,b)=>a+b),white_R:210,white_G:210,white_B:210};
   });
   crApplyPolicy();estimatedFirst=null;timingUnresolved=false;const before=JSON.stringify(rows);await evaluate();const candidates=rank();renderRank(candidates);
   const checks={count:candidates.length,allGlobal:candidates.every(r=>r.ranking_scope==='all_concentrations'&&r.total_concentrations===4&&r.per_concentration.length===4),sorted:candidates.every((r,i)=>i===0||(candidates[i-1].score??-Infinity)>=(r.score??-Infinity)),sameFormula:candidates.every(r=>{const finite=r.per_concentration.filter(x=>Number.isFinite(x.score));return finite.length?Math.abs(r.score-finite.reduce((s,x)=>s+x.score,0)/4)<1e-12:r.score===null;}),noMixedCV:candidates.every(r=>r.change_cv===null),unchanged:JSON.stringify(rows)===before,header:[...$('rankTable').querySelectorAll('th')].map(x=>x.textContent),noClockNote:!$('initialClockNote'),perGroupScoreCount:candidates[0].valid_concentrations};
   window.completeRows=rows;rows=rows.slice(0,751);const partial=rank();checks.partialCovered=partial.some(r=>r.valid_concentrations===3&&r.total_concentrations===4&&r.per_concentration.find(p=>p.concentration_ppm===20).score===null);rows=completeRows;
   const exported=exportData(),info=readReportInfo();info.photos=false;const assessment=assess(weights);checks.cyclesPreserved=candidates.every(r=>r.cycle_results.every((c,i)=>c.cycle===i+1));checks.exportGlobal=exported.ranked.every(r=>r.ranking_scope==='all_concentrations');checks.reportPages=buildReportPages(assessment,candidates,checkDataQuality(assessment),calculateCalibration(assessment),info,[]).length;renderRank(candidates);dashboardUI.setStep(5);return checks;
  });
  assert(ranking.count<40);for(const key of ['allGlobal','sorted','sameFormula','noMixedCV','unchanged','noClockNote','partialCovered'])assert(ranking[key],JSON.stringify(ranking));
  assert.deepStrictEqual(ranking.header,['#','지표','점수','SNR']);assert(ranking.exportGlobal&&ranking.cyclesPreserved&&ranking.reportPages>0);
  const output=process.argv[3];if(output)fs.mkdirSync(output,{recursive:true});
  const layouts=[];
  for(const [width,height]of [[1920,1080],[1600,900],[1366,768]]){
   await page.setViewportSize({width,height});await page.locator('#rankTable').scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(()=>({rowHeight:$('rank').firstElementChild.getBoundingClientRect().height,tableWidth:$('rankTable').getBoundingClientRect().width,panelWidth:$('dashboardWorkBody').clientWidth,overflow:document.documentElement.scrollWidth>innerWidth,note:!!$('initialClockNote')}));
   assert(geometry.rowHeight<45&&!geometry.overflow&&!geometry.note);assert(geometry.tableWidth<=geometry.panelWidth);layouts.push({width,height,...geometry});
   if(output)await page.screenshot({path:path.join(output,`지표비교_${width}.png`)});
  }
  await page.locator('#rank .rankExpand').first().click();assert(await page.locator('#rank .rankMetricDetail').first().isVisible());
  await page.locator('#rank .rankApply').first().click();await page.waitForTimeout(100);assert.deepStrictEqual(errors,[]);
  if(output)fs.writeFileSync(path.join(output,'calibration-ranking.json'),JSON.stringify({calibration,ranking,layouts,errors},null,2));
  console.log(JSON.stringify({ranking,layouts,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
