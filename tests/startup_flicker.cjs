const assert=require('assert');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release;const hold=new Promise(resolve=>release=resolve);
  await page.route('**/js/dashboard.js',async route=>{await hold;await route.continue();});
  const navigation=page.goto(process.argv[2]);
  await page.waitForFunction(()=>Boolean(document.querySelector('main')));
  const before=await page.evaluate(()=>({pending:document.documentElement.classList.contains('nh3-booting'),visibility:getComputedStyle(document.body).visibility}));
  assert(before.pending);assert.equal(before.visibility,'hidden');
  assert(!(await page.locator('body>header').first().isVisible()),'Legacy header must never be painted');
  release();await navigation;
  await page.waitForFunction(()=>!document.documentElement.classList.contains('nh3-booting'));
  assert(await page.locator('#dashboard').isVisible());
  assert(await page.evaluate(()=>document.fonts.check('400 14px DashboardRound')&&document.fonts.check('700 14px DashboardRound')));
  assert.deepStrictEqual(errors,[]);
  console.log('PASS: delayed dashboard initialization keeps legacy screen hidden; final layout and fonts are visible.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
