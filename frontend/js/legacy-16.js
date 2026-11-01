
/* Preserve supplementary analyses, separate them from the two quality checks. */
(function(){
 const quality=$('qualityCard'),extra=uiEl('details',undefined,'card v2Full');extra.id='qualityRelatedAnalysis';extra.append(uiEl('summary','색상 데이터 상세 분석'));
 // These are existing analyses with unchanged inputs, charts and calculations.
 for(const id of ['relativeStart','cxPixelMetric','cxHueTime','cxRGBPlot']){
  const fold=$(id)?.closest('details');if(fold)extra.append(fold);
 }
 quality.after(extra);$('qualityCalibrationAnchor')?.remove();
 const restore=$('researchSettingsFile').onchange;
 $('researchSettingsFile').onchange=async function(e){await restore.call(this,e);try{const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text()),mode=data.second_improvements?.quality_thresholds?.parameters?.sensitivity;if(['standard','sensitive','relaxed'].includes(mode))$('qualitySensitivity').value=mode;if(rows.length)refreshV2();}catch{/* Existing importer owns file-validation messages. */}};
 const style=uiEl('style');style.textContent='#qualityCard .qualityCoreItem{margin:8px 0 14px}#qualityCard h3{margin:6px 0}#qualityCard .basis{margin:6px 0;padding:8px 10px}#qualityCard #qualitySensitivity{width:auto;min-width:140px}#qualityCard .v2Table{margin-top:8px}#qualityRelatedAnalysis>summary{font-weight:700}#qualityRelatedAnalysis .researchFold{margin-top:10px}';document.head.append(style);
})();

