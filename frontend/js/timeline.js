/* Preview uses concatenated time; decoding and ROI frame references use local time. */
function videoTimeline(items){
 let offset=0;
 return items.map((file,index)=>{
  const duration=Number(file.duration_s);
  if(!Number.isFinite(duration)||duration<=0)throw Error('영상 길이를 확인할 수 없습니다: '+file.name);
  const segment={file,index,start_s:offset,end_s:offset+duration,duration_s:duration};
  offset=segment.end_s;return segment;
 });
}
function locateVideo(timeline,value){
 if(!timeline.length)throw Error('먼저 영상을 선택하세요.');
 const total=timeline.at(-1).end_s,time=Math.max(0,Math.min(Number(value)||0,total));
 const segment=timeline.find(s=>time<s.end_s)||timeline.at(-1);
 return {...segment,local_time_s:Math.min(time-segment.start_s,Math.max(0,segment.duration_s-.001))};
}
function formatPreviewTime(value){
 const time=Math.max(0,Number(value)||0),rounded=Math.round(time);
 const hours=Math.floor(rounded/3600),minutes=Math.floor(rounded/60)%60,seconds=rounded%60;
 return time.toFixed(1)+'초 ('+(hours?hours+'시간 ':'')+minutes+'분 '+seconds+'초)';
}
