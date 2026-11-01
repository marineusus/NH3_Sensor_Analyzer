"""Conservative geometry proposals for this fixed laboratory camera setup.

Not a semantic classifier: ambiguous objects always require user confirmation.
No tracking or change to analytical pixel values.
"""
import cv2
import numpy as np


def detect_sponges(frame, search=None):
    small = cv2.resize(frame,(480,270),interpolation=cv2.INTER_LINEAR)
    rgb = small.astype(np.float32)
    hi,lo = rgb.max(axis=2),rgb.min(axis=2)
    gray = rgb.mean(axis=2)
    bg = gray[5:-5:4,5:-5:4][((hi-lo)[5:-5:4,5:-5:4]<45)&(hi[5:-5:4,5:-5:4]>90)]
    reference = float(np.percentile(bg,65)) if bg.size else 180
    colored = (hi>25)&(hi-lo>22)&((hi-lo)/np.maximum(hi,1)>.24)
    dark = gray<min(120,reference*.65)
    neutral=(hi>35)&((hi-lo)/np.maximum(hi,1)<.22)
    bright=gray[neutral&(gray>110)]
    background=float(np.percentile(bright,85)) if bright.size else reference
    mean=cv2.blur(gray,(5,5));texture=np.sqrt(np.maximum(0,cv2.blur(gray*gray,(5,5))-mean*mean))
    white_sponge=neutral&(gray<background-max(14,background*.08))&(gray>35)&(texture>=7)
    mask = (colored|dark).astype(np.uint8)
    if search:
        x,y,w,h=search
        region=np.zeros_like(mask);region[round(y*270):round((y+h)*270),round(x*480):round((x+w)*480)]=1
        mask &= region
    mask[:4]=0;mask[-4:]=0;mask[:,:4]=0;mask[:,-4:]=0
    yy,xx=np.mgrid[-2:3,-2:3];kernel=((xx*xx+yy*yy)<=4).astype(np.uint8)
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,kernel)
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    tagged=[(c,False) for c in contours]
    neutral_mask=white_sponge.astype(np.uint8)
    if search:
        neutral_mask &= region
    yy3,xx3=np.mgrid[-3:4,-3:4]
    neutral_mask=cv2.morphologyEx(neutral_mask,cv2.MORPH_CLOSE,((xx3*xx3+yy3*yy3)<=9).astype(np.uint8))
    neutral_contours,_=cv2.findContours(neutral_mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    tagged += [(c,True) for c in neutral_contours]
    result=[]
    for contour,is_white in tagged:
        area=cv2.contourArea(contour);x,y,w,h=cv2.boundingRect(contour)
        if area<630 or area>480*270*.48 or min(w,h)<20 or min(w,h)/max(w,h)<.3 or area/(w*h)<.35:
            continue
        # Reject flat colored labels/wires and objects touching the image border.
        component=np.zeros_like(mask);cv2.drawContours(component,[contour],-1,1,-1)
        lum=gray[component.astype(bool)]
        if float(lum.std())<5:
            continue
        if is_white:
            if x<4 or y<4 or x+w>476 or y+h>266:
                continue
            if lum.mean()<background*.60 or background-lum.mean()<12:
                continue
            ring=gray[max(0,y-7):min(270,y+h+7),max(0,x-7):min(480,x+w+7)]
            ring_mask=np.ones(ring.shape,dtype=bool)
            ring_mask[y-max(0,y-7):y+h-max(0,y-7),x-max(0,x-7):x+w-max(0,x-7)]=False
            ring_values=ring[ring_mask]
            if not len(ring_values) or ring_values.mean()-lum.mean()<7:
                continue
            if any(max(0,min(x+w,r['bounds'][0]*480+r['bounds'][2]*480)-max(x,r['bounds'][0]*480))*max(0,min(y+h,r['bounds'][1]*270+r['bounds'][3]*270)-max(y,r['bounds'][1]*270))>w*h*.4 for r in result):
                continue
        poly=cv2.approxPolyDP(contour,.65,True).reshape(-1,2)
        if len(poly)<4:
            continue
        result.append(dict(polygon=(poly/np.array([480,270])).tolist(),area=float(area),
                           bounds=[x/480,y/270,w/480,h/270],texture_sd=float(lum.std()),
                           label='스펀지 후보',method='colored/dark compact textured component; user confirmation required'))
    result.sort(key=lambda r:r['bounds'][0])
    return result
