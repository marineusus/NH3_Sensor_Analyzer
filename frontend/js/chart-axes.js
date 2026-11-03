/* Display-only axis ranges. Detached export/report canvases keep automatic ranges. */
const chartAxes=(()=>{
 const states=new WeakMap();let active=null;
 const dialog=document.createElement('dialog');dialog.id='chartAxisDialog';
 dialog.innerHTML='<form id="chartAxisForm"><h2 id="chartAxisTitle"></h2><p class="hint">그래프에 보이는 범위만 변경합니다. 원본 데이터와 분석값은 유지됩니다.</p><div class="chartAxisFields"><label>최솟값<input id="chartAxisMin" type="number" step="any" required></label><label>최댓값<input id="chartAxisMax" type="number" step="any" required></label></div><p id="chartAxisError" role="alert"></p><div class="chartAxisActions"><button id="chartAxisAuto" type="button">자동 범위</button><button id="chartAxisCancel" type="button">취소</button><button type="submit" class="primary">적용</button></div></form>';
 document.body.append(dialog);
 const find=id=>document.getElementById(id);
 function checkedRange(min,max){
  if(!Number.isFinite(min)||!Number.isFinite(max)||!(max>min)||!Number.isFinite(max-min))throw Error('유한한 숫자를 입력하고, 최댓값을 최솟값보다 크게 설정하세요.');
  return [min,max];
 }
 function hit(canvas,event){
  const state=states.get(canvas);if(!state)return null;
  const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
  return ['x','y'].find(axis=>{const b=state.boxes?.[axis];return b&&x>=b.x&&x<=b.x+b.width&&y>=b.y&&y<=b.y+b.height;})||null;
 }
 function open(canvas,axis){
  const state=states.get(canvas);if(!state||!state.auto)return;
  active={canvas,axis,state};const range=state[axis]||state.auto[axis];
  find('chartAxisTitle').textContent=axis.toUpperCase()+'축 범위 · '+state.labels[axis];
  find('chartAxisMin').value=range[0];find('chartAxisMax').value=range[1];find('chartAxisError').textContent='';
  dialog.showModal();find('chartAxisMin').focus();find('chartAxisMin').select();
 }
 find('chartAxisForm').onsubmit=event=>{
  event.preventDefault();if(!active)return;
  try{
   const range=checkedRange(find('chartAxisMin').valueAsNumber,find('chartAxisMax').valueAsNumber);
   active.state[active.axis]=range;const redraw=active.state.redraw;dialog.close();redraw();
  }catch(error){find('chartAxisError').textContent=error.message;}
 };
 find('chartAxisAuto').onclick=()=>{if(!active)return;active.state[active.axis]=null;const redraw=active.state.redraw;dialog.close();redraw();};
 find('chartAxisCancel').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{active?.canvas.focus({preventScroll:true});active=null;});
 function prepare(canvas,automatic,labels,redraw,light){
  if(light||!canvas.isConnected||!canvas.id)return {...automatic,xManual:false,yManual:false};
  let state=states.get(canvas);
  if(!state){
   state={x:null,y:null,boxes:null};states.set(canvas,state);
   canvas.tabIndex=canvas.tabIndex<0?0:canvas.tabIndex;
   canvas.setAttribute('aria-label','그래프. 축 이름을 클릭하거나 X 또는 Y 키를 눌러 표시 범위를 설정하세요.');
   canvas.addEventListener('click',event=>{const axis=hit(canvas,event);if(axis)open(canvas,axis);});
   canvas.addEventListener('pointermove',event=>{const axis=hit(canvas,event);canvas.style.cursor=axis?'pointer':'';canvas.title=axis?axis.toUpperCase()+'축 범위 설정 · 클릭':'';});
   canvas.addEventListener('pointerleave',()=>{canvas.style.cursor='';canvas.title='';});
   canvas.addEventListener('keydown',event=>{if(!event.ctrlKey&&!event.altKey&&!event.metaKey&&['x','y'].includes(event.key.toLowerCase())){event.preventDefault();open(canvas,event.key.toLowerCase());}});
  }
  if(state.labels?.x!==labels.x)state.x=null;
  if(state.labels?.y!==labels.y)state.y=null;
  state.auto=automatic;state.labels=labels;state.redraw=redraw;
  state.view={x:state.x||automatic.x,y:state.y||automatic.y,xManual:!!state.x,yManual:!!state.y};
  return state.view;
 }
 function labels(canvas,ctx,xLabel,yLabel,x,y){
  const state=states.get(canvas);if(!state)return;
  const rect=canvas.getBoundingClientRect(),sx=rect.width/canvas.width,sy=rect.height/canvas.height;
  // The dashboard's primary graph compensates font scaling to retain readable text.
  const fontX=canvas.id==='plot'?1:sx,fontY=canvas.id==='plot'?1:sy;
  const box=(text,at)=>({x:at[0]*sx-5,y:at[1]*sy-13*fontY-4,width:ctx.measureText(text).width*fontX+10,height:18*fontY+8});
  state.boxes={x:box(xLabel,x),y:box(yLabel,y)};
 }
 function tick(value,span){
  if(value!==0&&(Math.abs(value)>=1e8||Math.abs(value)<1e-6))return value.toExponential(3);
  const digits=Math.min(12,Math.max(0,Math.ceil(-Math.log10(span/5))));
  return Number(value.toFixed(digits)).toString();
 }
 function clear(canvas){
  const state=states.get(canvas);if(!state)return;
  if(active?.canvas===canvas)dialog.close();
  Object.assign(state,{x:null,y:null,auto:null,view:null,boxes:null,redraw:null});
 }
 return {prepare,labels,tick,checkedRange,clear,view:canvas=>states.get(canvas)?.view};
})();
