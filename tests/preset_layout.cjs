const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>!document.documentElement.classList.contains('nh3-booting'));
  await page.locator('.stepButton[data-step="2"]').click();await page.locator('#researchPreset').click();
  const values=await page.locator('#planRows input').evaluateAll(ns=>ns.map(n=>n.value)),report=[];
  const output=process.argv[3]||'.';fs.mkdirSync(output,{recursive:true});
  for(const [width,height]of [[1920,1080],[1600,900],[1366,768]]){
   await page.setViewportSize({width,height});
   const geometry=await page.evaluate(()=>({rowHeight:$('planRows').firstElementChild.getBoundingClientRect().height,cells:$('planRows').firstElementChild.children.length,headers:$('planTable').querySelectorAll('th').length,timeText:$('planRows').textContent.includes('→'),overflow:document.documentElement.scrollWidth>innerWidth}));
   assert(geometry.rowHeight<=44);assert.equal(geometry.cells,5);assert.equal(geometry.headers,5);assert(!geometry.timeText&&!geometry.overflow);
   assert.deepStrictEqual(await page.locator('#planRows input').evaluateAll(ns=>ns.map(n=>n.value)),values);
   report.push({width,height,...geometry});await page.locator('#planTable').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`NH3_프리셋_${width}.png`)});
  }
  await page.locator('#planRows input').first().fill('12');await page.locator('#planRows input').first().press('Tab');assert.equal(await page.evaluate(()=>cyclePlan[0].concentration_ppm),12);
  const count=await page.locator('#planRows tr').count();await page.locator('#planRows button').first().click();assert.equal(await page.locator('#planRows tr').count(),count-1);
  assert.deepStrictEqual(errors,[]);fs.writeFileSync(path.join(output,'preset-layout.json'),JSON.stringify({values,report,errors},null,2));console.log(JSON.stringify({report,edit_and_remove:'passed',errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
