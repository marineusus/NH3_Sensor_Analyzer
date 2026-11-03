
/* Geometry proposal only: no frame-by-frame tracking or color-value filtering. */
function findWhiteSpongeReference(source,sensorPoints=[]){
  const W=480,H=270,N=W*H,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,W,H);const pixels=ctx.getImageData(0,0,W,H).data;
  const luminance=new Float32Array(N),neutral=new Uint8Array(N),excluded=new Uint8Array(N),bright=[];
  if(sensorPoints.length>=3){
    const mask=document.createElement('canvas');mask.width=W;mask.height=H;const m=mask.getContext('2d');m.fillStyle='white';m.beginPath();sensorPoints.forEach(([x,y],i)=>i?m.lineTo(x*W,y*H):m.moveTo(x*W,y*H));m.closePath();m.fill();
    const rgba=m.getImageData(0,0,W,H).data;for(let i=0;i<N;i++)excluded[i]=rgba[i*4+3]>0?1:0;
  }
  for(let i=0;i<N;i++){
    const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2],hi=Math.max(r,g,b),lo=Math.min(r,g,b),v=(r+g+b)/3;
    luminance[i]=v;neutral[i]=hi>35&&(hi-lo)/hi<.22?1:0;
    if(!excluded[i]&&neutral[i]&&v>110&&i%5===0)bright.push(v);
  }
  if(bright.length<120)throw Error('밝은 기준 배경을 충분히 확인하지 못했습니다.');
  bright.sort((a,b)=>a-b);const background=bright[Math.floor((bright.length-1)*.85)],threshold=background-Math.max(14,background*.08);
  // Local texture separates sponge pores from smooth background shadows.
  const stride=W+1,sums=new Float64Array((W+1)*(H+1)),squares=new Float64Array(sums.length),texture=new Float32Array(N);
  for(let y=0;y<H;y++){let sum=0,square=0;for(let x=0;x<W;x++){const v=luminance[y*W+x];sum+=v;square+=v*v;sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+sum;squares[(y+1)*stride+x+1]=squares[y*stride+x+1]+square;}}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const x0=Math.max(0,x-2),x1=Math.min(W,x+3),y0=Math.max(0,y-2),y1=Math.min(H,y+3),count=(x1-x0)*(y1-y0);
    const mean=(sums[y1*stride+x1]-sums[y0*stride+x1]-sums[y1*stride+x0]+sums[y0*stride+x0])/count;
    const meanSquare=(squares[y1*stride+x1]-squares[y0*stride+x1]-squares[y1*stride+x0]+squares[y0*stride+x0])/count;
    texture[y*W+x]=Math.sqrt(Math.max(0,meanSquare-mean*mean));
  }
  let mask=new Uint8Array(N);
  for(let i=0;i<N;i++)mask[i]=!excluded[i]&&neutral[i]&&luminance[i]<threshold&&luminance[i]>35&&texture[i]>=7?1:0;
  function morph(input,dilate){
    const out=new Uint8Array(N);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      let value=dilate?0:1;
      search:for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
        if(dx*dx+dy*dy>9)continue;
        const xx=x+dx,yy=y+dy,v=xx>=0&&xx<W&&yy>=0&&yy<H?input[yy*W+xx]:0;
        if(dilate?v:!v){value=dilate?1:0;break search;}
      }
      out[y*W+x]=value;
    }
    return out;
  }
  mask=morph(morph(mask,true),false);for(let i=0;i<N;i++)if(excluded[i])mask[i]=0;
  const seen=new Uint8Array(N),candidates=[];
  for(let seed=0;seed<N;seed++){
    if(!mask[seed]||seen[seed])continue;
    const q=[seed];seen[seed]=1;let x0=W,y0=H,x1=-1,y1=-1,sum=0,sum2=0;
    for(let j=0;j<q.length;j++){
      const i=q[j],x=i%W,y=Math.floor(i/W),v=luminance[i];x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);sum+=v;sum2+=v*v;
      for(const k of [x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1])if(k>=0&&mask[k]&&!seen[k]){seen[k]=1;q.push(k);}
    }
    const width=x1-x0+1,height=y1-y0+1,area=q.length,fill=area/(width*height),aspect=Math.min(width,height)/Math.max(width,height),mean=sum/area,sd=Math.sqrt(Math.max(0,sum2/area-mean*mean)),contrast=background-mean;
    if(area<Math.max(300,N*.004)||area>N*.48||width<20||height<20||aspect<.30||fill<.30||contrast<12||sd<4||mean<background*.60)continue;
    // A sponge should be a compact textured object with brighter nearby surroundings.
    let ringSum=0,ringN=0;const pad=7;
    for(let y=Math.max(0,y0-pad);y<=Math.min(H-1,y1+pad);y+=2)for(let x=Math.max(0,x0-pad);x<=Math.min(W-1,x1+pad);x+=2){
      if(x>=x0&&x<=x1&&y>=y0&&y<=y1)continue;
      const i=y*W+x;if(neutral[i]&&!excluded[i]&&luminance[i]>70){ringSum+=luminance[i];ringN++;}
    }
    const localContrast=ringN?ringSum/ringN-mean:0;if(localContrast<7)continue;
    const score=area*Math.min(1,fill/.7)*Math.min(1,aspect/.6)*Math.min(2,contrast/25)*Math.min(1,localContrast/20);
    candidates.push({q,x0,y0,x1,y1,area,score,contrast,localContrast,sd});
  }
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length)throw Error('배경과 구분되는 흰 스펀지를 확실히 찾지 못했습니다.');
  if(candidates[1]&&candidates[1].score>candidates[0].score*.72)throw Error('흰 스펀지로 보이는 영역이 여러 개입니다.');
  const best=candidates[0],component=new Uint8Array(N);for(const i of best.q)component[i]=1;
  // Fill enclosed pores for an outline mask, retaining every pixel in the final rectangle.
  const outside=new Uint8Array(N),flood=[];
  function push(i){if(!component[i]&&!outside[i]){outside[i]=1;flood.push(i);}}
  for(let x=0;x<W;x++){push(x);push((H-1)*W+x);}for(let y=0;y<H;y++){push(y*W);push(y*W+W-1);}
  for(let j=0;j<flood.length;j++){const i=flood[j],x=i%W,y=Math.floor(i/W);if(x)push(i-1);if(x<W-1)push(i+1);if(y)push(i-W);if(y<H-1)push(i+W);}
  const filled=new Uint8Array(N),edgePoints=[];
  for(let i=0;i<N;i++)filled[i]=!outside[i]?1:0;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(filled[i]&&(!x||x===W-1||!y||y===H-1||!filled[i-1]||!filled[i+1]||!filled[i-W]||!filled[i+W]))edgePoints.push([x+.5,y+.5]);}
  edgePoints.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lower=[],upper=[];for(const p of edgePoints){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=edgePoints.length-1;i>=0;i--){const p=edgePoints[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  const polygon=lower.slice(0,-1).concat(upper.slice(0,-1)).map(([x,y])=>[x/W,y/H]);
  if(polygon.length<4)throw Error('흰 스펀지 윤곽이 불확실합니다.');
  const outer=new Uint8Array(cxW*cxH);for(let y=0;y<cxH;y++)for(let x=0;x<cxW;x++)outer[y*cxW+x]=filled[Math.min(H-1,Math.floor(y*H/cxH))*W+Math.min(W-1,Math.floor(x*W/cxW))];
  return {polygon,outer,diagnostics:{method:'neutral textured component with darker interior and brighter surround',contrast:best.contrast,local_contrast:best.localContrast,texture_sd:best.sd,alternate_candidates:candidates.length-1}};
}

/* Separate, fixed White-sponge reference; existing RGB gains and HSV equations are unchanged. */
(function(){
  const state={selected:null,pending:[],picking:false};
  globalThis.whiteSpongeReference=state;
  const originalROI=buildROI,originalConfig=config;
  const originalMode=setROIMode,originalDraw=drawFrame;
  const frame=$('frame'),oldDown=frame.onpointerdown,oldMove=frame.onpointermove,oldUp=frame.onpointerup;
  const backgroundButton=[...document.querySelector('.roiCard').querySelectorAll('button')].find(button=>button.textContent.trim()==='흰색 기준 드래그');
  if(!backgroundButton)throw Error('흰색 기준 드래그 버튼을 찾지 못했습니다.');
  const button=uiEl('button','흰색 스펀지 잡기');button.type='button';button.id='whiteSpongeButton';
  button.title='흰 스펀지를 자동으로 찾습니다. Shift를 누르고 클릭하면 모서리 4개를 직접 지정합니다.';
  button.setAttribute('aria-pressed','false');backgroundButton.after(button);

  function geometry(points,referenceFrame=null,options={}){
    const automatic=!!options.outerMask;
    if(!Array.isArray(points)||(automatic?points.length<4:points.length!==4)||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('흰 스펀지의 모서리 4개를 화면 안에서 순서대로 지정하세요.');
    // Reject crossed or concave quadrilaterals instead of including the background.
    const signs=points.map((p,i)=>{const a=points[(i+1)%points.length],b=points[(i+2)%points.length];return (a[0]-p[0])*(b[1]-a[1])-(a[1]-p[1])*(b[0]-a[0]);});
    if(signs.some(v=>Math.abs(v)<1e-8)||!signs.every(v=>Math.sign(v)===Math.sign(signs[0])))throw Error('흰 스펀지 모서리를 시계 또는 반시계 방향으로 다시 지정하세요.');
    const polygon=points.map(p=>p.slice()),outer=options.outerMask||cxOuter(polygon),info=cxMaskInfo(outer);
    const edge=Math.round(Math.min(info.width,info.height)*.10),inner=cxErode(outer,edge);
    const found=largestRotatedRectangleInMask(inner,cxW,cxH,[(info.x0+info.x1+1)/2,(info.y0+info.y1+1)/2]);
    if(!found||found.ids.length<25)throw Error('흰 스펀지 내부 영역이 너무 작습니다. 더 넓게 지정하세요.');
    if(found.ids.some(id=>!inner[id]))throw Error('흰 스펀지 바깥 픽셀이 포함되었습니다. 다시 지정하세요.');
    let x0=cxW,y0=cxH,x1=-1,y1=-1;
    for(const id of found.ids){const x=id%cxW,y=Math.floor(id/cxW);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    if(x1-x0+1<4||y1-y0+1<4)throw Error('흰 스펀지 기준 영역의 폭과 높이를 충분히 크게 지정하세요.');
    const rect=[x0,y0,x1+1,y1+1],bounds=[x0/cxW,y0/cxH,(x1-x0+1)/cxW,(y1-y0+1)/cxH];
    const metadata={version:1,mode:'sponge',selection:'four corners; fixed inset rotated rectangle',polygon,edge_percent:10,edge_distance_px:edge,analysis_resolution:[cxW,cxH],pixel_count:found.ids.length,angle_deg:found.rectangle.angle_deg,corners:found.rectangle.corners.map(p=>p.slice()),mask_runs:cxRuns(found.ids),reference_frame:referenceFrame?structuredClone(referenceFrame):null};
    if(automatic){metadata.selection='automatic outline; fixed inset rotated rectangle';metadata.outer_mask_runs=cxRuns(Array.from(outer.keys()).filter(id=>outer[id]));metadata.detection=structuredClone(options.diagnostics||{});}
    return {ids:found.ids.slice(),inner,rect,bounds,metadata};
  }
  function checkOverlap(selected,points=sensor){
    if(points.length<3)return;
    const sensorMask=cxOuter(points);
    if(selected.ids.some(id=>sensorMask[id]))throw Error('흰 스펀지 기준 영역과 실험 센서 윤곽이 겹칩니다. 흰 스펀지만 지정하세요.');
  }
  function finishPicking(){state.picking=false;state.pending=[];button.setAttribute('aria-pressed','false');anchor=null;mode='none';}
  function applySelection(selected){
    state.selected=selected;white=selected.bounds.slice();finishPicking();drawFrame();
    $('roiHint').textContent='흰 스펀지 내부 기준 영역 고정 · Edge 10% 제외 · '+selected.ids.length.toLocaleString()+'픽셀. 배경을 쓰려면 흰색 기준 드래그를 선택하세요.';
  }
  button.onclick=(event={})=>{
    if(busy||photoBusy||qualityReviewLoading){status('영상 추출이나 사진 읽기가 끝난 뒤 흰 스펀지를 지정하세요.',true);return;}
    if(!(image.naturalWidth||image.width)){status('먼저 영상 미리보기를 불러오세요.',true);return;}
    if(state.picking){finishPicking();drawFrame();hint();status('흰 스펀지 지정 취소 · 이전 기준 영역을 유지합니다.');return;}
    let reason='';
    if(!event.shiftKey){
      try{
        const detected=findWhiteSpongeReference(image,sensor);
        const selected=geometry(detected.polygon,cxFrame,{outerMask:detected.outer,diagnostics:detected.diagnostics});
        checkOverlap(selected);applySelection(selected);
        status('흰 스펀지 자동 지정 완료 · 흰 실선 영역을 확인하세요. Edge 10% 제외 · '+selected.ids.length.toLocaleString()+'픽셀'+(rows.length?' · 새 기준은 재추출부터 적용됩니다.':''));return;
      }catch(error){reason=error.message+' ';}
    }
    if(roiLocked)lockROI();anchor=null;state.pending=[];state.picking=true;mode='whiteSponge';button.setAttribute('aria-pressed','true');
    $('roiHint').textContent='흰 스펀지의 모서리 4개를 시계 또는 반시계 방향으로 클릭하세요. 네 번째 점에서 내부 기준 영역이 정해집니다.';
    status(reason+'흰 스펀지 모서리 4개를 순서대로 직접 클릭하세요. 버튼을 다시 누르면 취소합니다.',!!reason);drawFrame();
  };
  frame.onpointerdown=function(event){
    if(!state.picking||mode!=='whiteSponge')return oldDown.call(this,event);
    if(busy||roiLocked)return;event.preventDefault?.();state.pending.push(point(event));
    if(state.pending.length===4){
      try{const selected=geometry(state.pending,cxFrame);checkOverlap(selected);applySelection(selected);status('흰 스펀지 기준 영역 지정 완료 · 테두리 10% 제외 · '+selected.ids.length.toLocaleString()+'픽셀'+(rows.length?' · 기존 데이터는 유지하며 새 기준은 재추출부터 적용됩니다.':''));}
      catch(error){state.pending=[];drawFrame();status(error.message,true);}
    }else{drawFrame();$('roiHint').textContent='흰 스펀지 모서리 '+state.pending.length+'/4개 지정 · 다음 모서리를 클릭하세요.';}
  };
  frame.onpointermove=function(event){if(state.picking)return;return oldMove.call(this,event);};
  frame.onpointerup=function(event){if(state.picking){anchor=null;return;}return oldUp.call(this,event);};
  setROIMode=function(next){
    if(next==='white'&&busy){status('추출이 끝난 뒤 White 기준 영역을 변경하세요.',true);return;}
    state.picking=false;state.pending=[];button.setAttribute('aria-pressed','false');
    if(next==='white')state.selected=null;
    const result=originalMode(next);drawFrame();return result;
  };
  drawFrame=function(){
    originalDraw();const selected=state.selected,points=state.picking?state.pending:selected?.metadata.polygon;
    if(!points?.length)return;
    const ctx=frame.getContext('2d');ctx.save();ctx.strokeStyle='#8cb8ff';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x*cxW,y*cxH):ctx.moveTo(x*cxW,y*cxH));if(points.length>=3)ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    if(state.picking){ctx.fillStyle='white';for(const [x,y]of points)ctx.fillRect(x*cxW-3,y*cxH-3,6,6);}
    else{ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.beginPath();selected.metadata.corners.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();}
    ctx.restore();
  };
  config=function(){const c=originalConfig();c.white_reference=state.selected?structuredClone(state.selected.metadata):{version:1,mode:'rectangle',bounds:white.slice(),analysis_resolution:[cxW,cxH]};return c;};
  buildROI=function(c){
    if(!state.selected||c.white_enabled===false)return originalROI(c);
    const selected=state.selected;checkOverlap(selected,c.sensor);
    const roi=originalROI({...c,white_enabled:false});roi.rect=selected.rect.slice();
    roi.white_reference=structuredClone(selected.metadata);return roi;
  };
  // Keep the new reference in the existing settings export/import workflow.
  const settingsInput=$('researchSettingsFile'),importSettings=settingsInput.onchange;
  settingsInput.onchange=async function(event){
    if(busy)return importSettings.call(this,event);
    const file=event.target.files?.[0];if(!file)return;
    let c,selected=null;
    try{
      const data=JSON.parse(await file.text());c=data.analysis||data.settings?.analysis;
      if(!c||!Array.isArray(c.cycle_plan))return importSettings.call(this,event);
      if(c.white_reference?.mode==='sponge'){
        const saved=c.white_reference,options={};
        if(saved.outer_mask_runs){
          if(!Array.isArray(saved.outer_mask_runs)||saved.analysis_resolution?.[0]!==cxW||saved.analysis_resolution?.[1]!==cxH)throw Error('흰 스펀지 마스크 해상도가 다릅니다.');
          const outer=new Uint8Array(cxW*cxH);let end=0;
          for(const run of saved.outer_mask_runs){
            if(!Array.isArray(run)||run.length!==2||!run.every(Number.isInteger)||run[0]<end||run[1]<=0||run[0]+run[1]>outer.length)throw Error('흰 스펀지 마스크가 유효하지 않습니다.');
            outer.fill(1,run[0],run[0]+run[1]);end=run[0]+run[1];
          }
          if(!outer.some(Boolean))throw Error('흰 스펀지 마스크가 비어 있습니다.');
          options.outerMask=outer;options.diagnostics=saved.detection;
        }
        selected=geometry(saved.polygon,saved.reference_frame,options);
      }
    }
    catch(error){status('White 기준 설정을 읽지 못했습니다. '+error.message,true);return;}
    const previous=state.selected;state.selected=null;finishPicking();
    await importSettings.call(this,event);
    const applied=!$('status').classList.contains('error')&&Array.isArray(c.white)&&white.length===c.white.length&&white.every((value,i)=>Math.abs(value-c.white[i])<1e-9)&&Number($('fps').value)===c.fps;
    if(applied){if(selected){try{checkOverlap(selected,sensor);applySelection(selected);}catch(error){drawFrame();status(error.message,true);}}else drawFrame();}
    else{state.selected=previous;drawFrame();}
  };
})();

