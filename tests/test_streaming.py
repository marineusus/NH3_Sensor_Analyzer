import tempfile
import threading
import unittest
from pathlib import Path
import av
import numpy as np
from analyzer import analyze_video

class Streaming(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.paths=[]
        for name in ['a.mp4','b.mp4']:
            p=Path(self.tmp.name)/name
            with av.open(str(p),'w') as output:
                stream=output.add_stream('mpeg4',rate=10)
                stream.width,stream.height,stream.pix_fmt=160,90,'yuv420p'
                for i in range(20):
                    frame=av.VideoFrame.from_ndarray(np.full((90,160,3),100+i,dtype=np.uint8),format='bgr24')
                    output.mux(stream.encode(frame))
                output.mux(stream.encode(None))
            self.paths.append(p)
        self.roi=dict(ids_runs=[[960*200+100,40]],rect=[0,0,0,0],variants=[])
        self.c=dict(fps=2,white_enabled=False,relative_start=0,relative_end=1,cycle_plan=[dict(gas_on_s=1,gas_off_s=2,recovery_end_s=4)],first_injection_auto=False,baseline_window=1,response_pixel_rule=dict(metric='V',k=3,delta_min=1),response_excluded_times=[])
    def tearDown(self):self.tmp.cleanup()
    def test_connected_files(self):
        r=analyze_video(self.paths,self.roi,self.c)
        self.assertEqual(len(r['rows']),8)
        self.assertEqual([x['global_time_s'] for x in r['rows']],[0,.5,1,1.5,2,2.5,3,3.5])
        self.assertEqual(r['rows'][4]['time_s'],0)
        self.assertFalse(r['cancelled'])
    def test_cancel_preserves_completed_samples(self):
        stop=threading.Event();samples=[]
        def sink(row):
            samples.append(row)
            if len(samples)==3:stop.set()
        r=analyze_video(self.paths,self.roi,self.c,stop=stop,sink=sink)
        self.assertTrue(r['cancelled']);self.assertEqual(len(samples),3)
    def test_decode_failure_does_not_invent_data(self):
        with self.assertRaises(ValueError):analyze_video([Path(self.tmp.name)/'missing.mp4'],self.roi,self.c)

if __name__=='__main__':unittest.main()
