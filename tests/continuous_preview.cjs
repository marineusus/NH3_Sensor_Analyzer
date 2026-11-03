const assert=require('assert'),fs=require('fs'),path=require('path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.dashboardUI&&!document.documentElement.classList.contains('nh3-booting'));
  await page.evaluate(async()=>{
   window.frameRequests=[];const call=desktopCall;
   desktopCall=async(method,...args)=>{if(method==='frame')frameRequests.push(args);return call(method,...args);};
   await desktopChoose();
  });
  const meta=await page.evaluate(()=>({files:files.map(f=>({id:f.id,name:f.name,duration_s:f.duration_s})),total:videoTimeline(files).at(-1).end_s,label:$('videoDurationLabel').textContent}));
  assert(meta.files.length>1);assert(meta.total>3600);assert(meta.label.includes('시간'));assert(meta.label.includes(meta.total.toFixed(1)+'초'));
  const targets=[meta.files[0].duration_s-.5,meta.files[0].duration_s,meta.files[0].duration_s+12,3605,meta.total-1];
  const checked=[];
  for(const target of targets){
   const result=await page.evaluate(async target=>{
    $('previewTime').value=target;await showPreview(target);
    const expected=locateVideo(videoTimeline(files),target);
    return {index:Number($('previewVideo').value),expected:expected.index,name:cxFrame.file,expectedName:expected.file.name,
     local:cxFrame.time_s,global:Number($('previewTime').value),start:expected.start_s,requested:frameRequests.at(-1),expectedLocal:expected.local_time_s,
     label:$('previewLabel').textContent,total:Number($('previewTime').max),valid:desktopPreviewState.valid};
   },target);
   assert(result.valid);assert.equal(result.index,result.expected);assert.equal(result.name,result.expectedName);
   assert(Math.abs(result.requested[1]-result.expectedLocal)<1e-6);
   assert(Math.abs(result.global-result.start-result.local)<.051);assert.equal(result.total,meta.total);
   checked.push(result);
  }
  // Selecting a file jumps to its position on the same cumulative timeline.
  await page.selectOption('#previewVideo','1');
  await page.waitForFunction(name=>!previewRunning&&cxFrame.file===name,meta.files[1].name);
  assert(await page.evaluate(()=>Number($('previewTime').value)>=files[0].duration_s));
  // Photo/report code must restore local file time, even after the first file.
  await page.evaluate(async()=>{
   sensor=[[.64,.25],[.82,.25],[.82,.60],[.64,.60]];
   window.savedPreview={...cxFrame};photoAssessment={cycles:[]};await collectReportPhotos({cycles:[]});
  });
  assert(await page.evaluate(()=>cxFrame.file===savedPreview.file&&Math.abs(cxFrame.time_s-savedPreview.time_s)<.001));
  const reorder=await page.evaluate(()=>{const selected=files[1].id;moveFile(1);return selected;});
  await page.waitForFunction(id=>!previewRunning&&desktopCurrentFile.id===id,reorder);
  assert(await page.evaluate(()=>Number($('previewVideo').value)===2&&fileMeta.every((m,i)=>m.name===files[i].name)));
  // A newer scrub must survive the completion of an older native frame request.
  await page.evaluate(()=>{
   const call=desktopCall;let hold=true;
   desktopCall=async(method,...args)=>{const result=await call(method,...args);if(method==='frame'&&hold){hold=false;return new Promise(resolve=>{window.releasePreview=()=>resolve(result);});}return result;};
   window.pendingPreview=showPreview(0);
  });
  await page.waitForFunction(()=>typeof releasePreview==='function');
  await page.evaluate(()=>{$('previewTime').value=3605;scrubPreview();releasePreview();});
  await page.waitForFunction(()=>!previewRunning&&Number($('previewTime').value)>=3605);
  assert(await page.evaluate(()=>cxFrame.file===locateVideo(videoTimeline(files),3605).file.name));
  // A failed seek in another file keeps the last real frame and cumulative time.
  const rollback=await page.evaluate(async()=>{
   const before={...desktopPreviewState},time=Number($('previewTime').value),pixels=surface.toDataURL();
   const call=desktopCall,bad=files.find(f=>f.id!==before.file);
   desktopCall=(method,...args)=>method==='frame'&&args[0]===bad.id?Promise.reject(Error('test unreadable segment')):call(method,...args);
   try{await showPreview(videoTimeline(files).find(s=>s.file===bad).start_s);}
   finally{desktopCall=call;}
   return {valid:desktopPreviewState.valid,file:desktopPreviewState.file,expected:before.file,time:Number($('previewTime').value),expectedTime:time,samePixels:surface.toDataURL()===pixels};
  });
  assert(rollback.valid&&rollback.samePixels);assert.equal(rollback.file,rollback.expected);assert.equal(rollback.time,rollback.expectedTime);
  assert.deepStrictEqual(errors,[]);
  const output=process.argv[3];if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'연속영상_전체시간.png')});fs.writeFileSync(path.join(output,'continuous-preview.json'),JSON.stringify({meta,checked,errors},null,2));}
  console.log(JSON.stringify({files:meta.files.length,total_s:meta.total,label:meta.label,seeks:checked.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
