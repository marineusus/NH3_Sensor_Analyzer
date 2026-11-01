"""Independent comparisons against the original JavaScript equations."""
import json
import re
import subprocess
import unittest
from pathlib import Path
import numpy as np
from analyzer import pixel_stats, sample, prepare_roi, PixelModels, unpack_runs

ROOT=Path(__file__).resolve().parents[1]
SOURCE=(ROOT/'reference/original.html').read_text(encoding='utf-8')


def function(name):
    start=SOURCE.index('function '+name+'(')
    pos=SOURCE.index('{',start);depth=1;end=pos+1
    while depth:
        if SOURCE[end]=='{':depth+=1
        if SOURCE[end]=='}':depth-=1
        end+=1
    return SOURCE[start:end]


class Equations(unittest.TestCase):
    def test_pixel_stats_against_original_js(self):
        rng=np.random.default_rng(82)
        pixels=np.vstack([rng.integers(0,256,(1000,3)),[[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[255,255,0]]]).astype(np.uint8)
        for gain in [None,[1.21,.83,2.12],[0,0,0]]:
            script=function('hsv')+'\n'+function('pixelStats')+f'\nconst p={json.dumps(pixels.tolist())};const data=p.flatMap(p=>[...p,255]);console.log(JSON.stringify(pixelStats(data,p.map((_,i)=>i),{json.dumps(gain)})));'
            expected=json.loads(subprocess.check_output(['node','-e',script],text=True,encoding='utf-8'))
            got=pixel_stats(pixels,gain)
            for key,value in expected.items():
                self.assertAlmostEqual(got[key],value,places=10,msg=key)

    def test_paper_s_and_white_mask(self):
        frame=np.zeros((540,960,3),dtype=np.uint8);frame[0:2,0:20]=[50,100,150];frame[10:20,10:20]=[200,220,240]
        roi=prepare_roi(dict(ids_runs=[[0,20],[960,20]],rect=[0,0,0,0],white_reference={'mask_runs':[[10*960+10,10]]}))
        r=sample(frame,roi,[100,110,120]);self.assertEqual(r['white_R'],200)
        self.assertAlmostEqual(r['raw_paper_S'],.5);self.assertAlmostEqual(r['relative_R'],25)
        self.assertEqual(r['pixel_count'],40)
        r=sample(frame,roi,None,config={'white_enabled':False})
        self.assertIsNone(r['cal_R']);self.assertIsNone(r['relative_R']);self.assertEqual(r['raw_R'],50)

    def test_pixel_response_matches_original_js(self):
        c=dict(response_pixel_rule={'metric':'V','k':3,'delta_min':1},baseline_window=10,
               first_injection_auto=False,cycle_plan=[{'gas_on_s':3,'gas_off_s':7,'recovery_end_s':10}],response_excluded_times=[])
        frames=[{'raw':[.1,.2,.3],'cal':None,'relative':[.2,.3,.4]},
                {'raw':[.11,.21,.31],'cal':None,'relative':[.21,.31,.41]},
                {'raw':[.09,.19,.29],'cal':None,'relative':[.19,.29,.39]},
                {'raw':[.2,.2,.3],'cal':None,'relative':[.2,.5,.4]}]
        js='const cxModels=new Map();'+function('cxKnownSchedule')+function('cxPixelUpdate')
        js+=f';const c={json.dumps(c)},frames={json.dumps(frames)};console.log(JSON.stringify(frames.map((f,i)=>cxPixelUpdate(f,i,c))));'
        expected=json.loads(subprocess.check_output(['node','-e',js],text=True,encoding='utf-8'))
        model=PixelModels()
        for t,f in enumerate(frames):
            got=model.update({k:None if v is None else np.array(v) for k,v in f.items()},t,c)
            self.assertEqual(got,expected[t])

    def test_run_validation(self):
        for bad in [[[518399,2]],[[0,2],[1,2]],[[-1,1]],[[0,-1]]]:
            with self.assertRaises(ValueError):unpack_runs(bad)


if __name__=='__main__':unittest.main()

