const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(process.argv[2]);
  await page.waitForFunction(()=>window.dashboardUI&&!document.documentElement.classList.contains('nh3-booting'));
  await page.evaluate(()=>{
   rows=Array.from({length:101},(_,i)=>({global_time_s:i*10,raw_V:.5+.2*Math.sin(i/8),raw_R:100,raw_G:120,raw_B:130,raw_S:.3,raw_H_deg:200,raw_H_coherence:1,video:'axis-fixture'}));
   $('firstInjection').value=100;cyclePlan=[{concentration_ppm:10,gas_on_s:100,gas_off_s:500,recovery_end_s:1000}];
   researchCalibration.mode='raw';nativeView.channel='V';nativeView.basis='actual';
   latest={weights:[0,0,0,0,0,1],analysis_metric:{channel:'V',basis:'actual',unit:'%',calibration_mode:'raw'},curve:rows.map(r=>[r.global_time_s,r.raw_V*100])};
   plot(latest.curve);dashboardUI.refresh();window.axisRowsBefore=JSON.stringify(rows);
  });
  const view=()=>page.evaluate(()=>chartAxes.view($('plot')));
  assert.deepStrictEqual((await view()).x,[0,1000]);assert.deepStrictEqual((await view()).y,[0,100]);
  async function clickLabel(axis){
   const p=await page.locator('#plot').evaluate((canvas,axis)=>{const b=canvas.getBoundingClientRect(),sx=b.width/canvas.width,sy=b.height/canvas.height;return {x:b.x+(axis==='x'?(72+canvas.width-24)/2-25:9)*sx+10,y:b.y+(axis==='x'?canvas.height-12:65)*sy-5};},axis);
   await page.mouse.click(p.x,p.y);await page.locator('#chartAxisDialog').waitFor({state:'visible'});
  }
  async function apply(min,max){await page.locator('#chartAxisMin').fill(String(min));await page.locator('#chartAxisMax').fill(String(max));await page.locator('#chartAxisForm button[type=submit]').click();}
  await clickLabel('x');await apply(200,800);assert.deepStrictEqual((await view()).x,[200,800]);
  await clickLabel('y');await apply(30,70);assert.deepStrictEqual((await view()).y,[30,70]);
  await clickLabel('x');await apply(900,100);assert(await page.locator('#chartAxisDialog').isVisible());assert((await page.locator('#chartAxisError').textContent()).includes('최댓값'));await page.locator('#chartAxisCancel').click();assert.deepStrictEqual((await view()).x,[200,800]);
  // Detached report/export charts retain the original automatic scale.
  assert(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=340;researchChart(c,[{points:latest.curve}],{range:[0,100],light:true});return chartAxes.view(c)===undefined&&JSON.stringify(rows)===axisRowsBefore;}));
  for(const [width,height]of [[1920,1080],[1600,900],[1366,768]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>plot(latest.curve));
   await clickLabel('x');await page.locator('#chartAxisCancel').click();
   assert.deepStrictEqual((await view()).x,[200,800]);assert.deepStrictEqual((await view()).y,[30,70]);
  }
  await page.locator('#plot').focus();await page.keyboard.press('y');await page.locator('#chartAxisAuto').click();assert.deepStrictEqual((await view()).y,[0,100]);assert.deepStrictEqual((await view()).x,[200,800]);
  await clickLabel('x');await page.locator('#chartAxisAuto').click();assert.deepStrictEqual((await view()).x,[0,1000]);
  await page.evaluate(()=>{latest.analysis_metric={channel:'R',basis:'actual',unit:'RGB',calibration_mode:'raw'};plot(latest.curve);});assert(!(await view()).yManual);
  assert.deepStrictEqual(errors,[]);
  if(process.argv[3]){fs.mkdirSync(process.argv[3],{recursive:true});await clickLabel('y');await page.screenshot({path:path.join(process.argv[3],'그래프_축범위_설정.png')});}
  console.log('PASS: axis-label clicks, X/Y ranges, validation, cancel, auto reset, keyboard, three resolutions, unchanged rows and automatic export axes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
