const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const url=process.argv[2]||JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../ui-server.json'),'utf8')).url;
 const output=path.resolve(process.argv[3]||path.resolve(__dirname,'../../../outputs'));fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});const errors=[];let frames=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'){try{if(r.postDataJSON().name==='frame')frames++;}catch{}}});
 await page.goto(url);await page.locator('#dashboard').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.locator('.stepButton[data-step="1"]').click();await page.locator('#desktopOpen').click();
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('미리보기'));
 await page.locator('.stepButton[data-step="3"]').click();await page.locator('#autoROI').click();
 const b=await page.locator('#frame').boundingBox();await page.mouse.click(b.x+b.width*.75,b.y+b.height*.4);
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('선택 완료'));


 // Original background drag and automatic-white-to-manual fallback are preserved.
 await page.getByRole('button',{name:'흰색 기준 드래그',exact:true}).click();
 {const box=await page.locator('#frame').boundingBox();await page.mouse.move(box.x+box.width*.46,box.y+box.height*.03);await page.mouse.down();await page.mouse.move(box.x+box.width*.51,box.y+box.height*.10);await page.mouse.up();}
 assert(await page.evaluate(()=>!whiteSpongeReference.selected&&white[2]>.04&&white[3]>.06));
 await page.locator('#whiteSpongeButton').click();
 const whiteAutomatic=await page.evaluate(()=>({selected:!!whiteSpongeReference.selected,manualFallback:whiteSpongeReference.picking}));
 assert(whiteAutomatic.selected||whiteAutomatic.manualFallback);
 if(whiteAutomatic.manualFallback)await page.locator('#whiteSpongeButton').click();
 // Independent White sponge: explicit manual entry, four corners, exact restore.
 await page.locator('#dashWhiteManual').click();
 for(const [x,y]of [[.10,.08],[.42,.08],[.40,.65],[.08,.60]]){const box=await page.locator('#frame').boundingBox();await page.mouse.click(box.x+box.width*x,box.y+box.height*y);}
 await page.waitForFunction(()=>Boolean(whiteSpongeReference.selected));
 const whiteMask=await page.evaluate(()=>JSON.stringify(whiteSpongeReference.selected.metadata.mask_runs));
 assert(await page.evaluate(()=>whiteSpongeReference.selected.ids.every(id=>whiteSpongeReference.selected.inner[id])),'White pixels must stay inside the inset mask');
 // Original manual sensor handler remains connected after DOM relocation.
 await page.getByRole('button',{name:'센서 윤곽 직접 지정',exact:true}).click();
 for(const [x,y]of [[.54,.18],[.90,.20],[.87,.76],[.54,.70]]){const box=await page.locator('#frame').boundingBox();await page.mouse.click(box.x+box.width*x,box.y+box.height*y);}
 await page.locator('#frame').dispatchEvent('dblclick');
 assert(await page.evaluate(()=>sensor.length>=4&&buildROI(config()).ids.length>=25));
 await page.locator('#autoROI').click();{const box=await page.locator('#frame').boundingBox();await page.mouse.click(box.x+box.width*.75,box.y+box.height*.4);}
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('선택 완료'));
 assert.equal(await page.evaluate(()=>JSON.stringify(whiteSpongeReference.selected.metadata.mask_runs)),whiteMask);
 await page.locator('#calibrationMode').selectOption('legacy');assert.equal(await page.evaluate(()=>config().calibration_mode),'legacy');
 const saved=await page.evaluate(()=>config());
 await page.evaluate(()=>{window.__settingsFinished=false;const input=document.getElementById('researchSettingsFile'),handler=input.onchange;input.onchange=async function(e){try{return await handler.call(this,e);}finally{window.__settingsFinished=true;}};});
 await page.locator('#researchSettingsFile').setInputFiles({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({analysis:saved}))});
 await page.waitForFunction(()=>window.__settingsFinished);
 assert.equal(await page.evaluate(()=>JSON.stringify(whiteSpongeReference.selected.metadata.mask_runs)),whiteMask);
 assert.equal(await page.evaluate(()=>config().calibration_mode),'legacy');
 await page.locator('#calibrationMode').selectOption('relative');
 const before=await page.evaluate(()=>({sensor:JSON.stringify(sensor),file:files[0].id,rows:rows.length,time:cxFrame.time_s})),frameCount=frames;
 for(let i=1;i<=7;i++){await page.locator('.stepButton[data-step="'+i+'"]').click();assert(await page.locator('#dashboardStep'+i).isVisible());}
 const after=await page.evaluate(()=>({sensor:JSON.stringify(sensor),file:files[0].id,rows:rows.length,time:cxFrame.time_s}));assert.deepStrictEqual(before,after);assert.equal(frames,frameCount,'Menu navigation must not decode frames');
 await page.locator('.stepButton[data-step="4"]').click();assert.equal(await page.locator('#sliders input[type=range]').count(),6);
 for(const r of await page.locator('#sliders input[type=range]').all()){assert.equal(await r.getAttribute('min'),'-1');assert.equal(await r.getAttribute('max'),'1');}
 const result=[];
 for(const [width,height]of [[1920,1080],[1600,900],[1366,768]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  const metrics=await page.evaluate(()=>{
   const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
   return {viewport:[innerWidth,innerHeight],canvas:rect('frame'),graph:rect('dashboardGraphBody'),sidebar:document.querySelector('.dashboardSidebar').getBoundingClientRect().width,right:document.querySelector('.dashboardRight').getBoundingClientRect().width,weights:rect('sliders'),overflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(document.querySelector('.stepButton')).fontFamily,loaded:document.fonts.check('14px DashboardRound')};
  });
  assert(Math.abs(metrics.canvas.width/metrics.canvas.height-16/9)<.001,'ROI canvas must remain 16:9');assert(metrics.graph.bottom<=height,'Graph off screen');assert(!metrics.overflow,'Horizontal page overflow');assert(metrics.weights.right<=width,'Weight controls off screen');assert(metrics.loaded);
  await page.screenshot({path:path.join(output,`NH3_UI_${width}x${height}.png`),fullPage:false});result.push(metrics);
 }
 assert.deepStrictEqual(errors,[]);fs.writeFileSync(path.join(output,'layout-validation.json'),JSON.stringify({result,errors,frame_requests:frames,white_automatic:whiteAutomatic},null,2));
 console.log(JSON.stringify({result,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
