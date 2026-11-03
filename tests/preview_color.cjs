/* Native ROI colors, including a late response after returning to a cached ROI. */
const assert=require('assert');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.dashboardUI&&!document.documentElement.classList.contains('nh3-booting'));
  await page.evaluate(async()=>{
   await desktopChoose();dashboardUI.setStep(4);
   window.testROI=[[.64,.25],[.82,.25],[.82,.60],[.64,.60]];
   sensor=structuredClone(testROI);drawFrame();
  });
  await page.waitForFunction(()=>document.querySelector('#dashboardColorGauges output').textContent!=='—');
  const before=await page.locator('#dashSummaryWeights').textContent();
  await page.evaluate(()=>{
   const call=desktopCall;let hold=true;
   desktopCall=async function(method,...args){const result=await call(method,...args);
    if(method==='sample_frame'&&hold){hold=false;return new Promise(resolve=>{window.releaseColor=()=>resolve(result);});}return result;
   };
   sensor=[[.18,.25],[.32,.25],[.32,.60],[.18,.60]];drawFrame();
  });
  await page.waitForFunction(()=>typeof releaseColor==='function');
  await page.evaluate(()=>{sensor=structuredClone(testROI);drawFrame();releaseColor();});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#dashSummaryWeights').textContent(),before,'Late response must not replace the current ROI color');
  assert.deepStrictEqual(errors,[]);
  console.log('PASS: native ROI colors and cached-ROI late-response protection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
