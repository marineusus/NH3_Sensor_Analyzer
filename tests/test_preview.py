import base64,tempfile,unittest
from pathlib import Path
import cv2,numpy as np
import av
from unittest.mock import patch
from app import Api
from analyzer import sample, prepare_roi

class Preview(unittest.TestCase):
    def test_local_unicode_path_and_time_seek(self):
        with tempfile.TemporaryDirectory() as temp:
            folder=Path(temp)/'한글 경로 영상';folder.mkdir();p=folder/'평균색 확인.mp4'
            with av.open(str(p),'w') as output:
                stream=output.add_stream('mpeg4',rate=4)
                stream.width,stream.height,stream.pix_fmt=160,90,'yuv420p'
                for i in range(8):
                    frame=av.VideoFrame.from_ndarray(np.full((90,160,3),[30+i*10,100,180],dtype=np.uint8),format='bgr24')
                    output.mux(stream.encode(frame))
                output.mux(stream.encode(None))
            api=Api()
            try:
                files=api._register([p]);self.assertEqual(len(files),1)
                for t in [0,1]:
                    r=api.frame(files[0]['id'],t);pixels=cv2.imdecode(np.frombuffer(base64.b64decode(r['image']),dtype=np.uint8),cv2.IMREAD_COLOR)
                    self.assertEqual(pixels.shape,(540,960,3));self.assertGreater(float(pixels.mean()),10);self.assertAlmostEqual(r['time'],t)
                roi={'ids_runs':[[200*960+300,100]],'rect':[20,20,40,40]}
                frame=cv2.cvtColor(pixels,cv2.COLOR_BGR2RGB)
                for enabled,base in [(False,None),(True,[120,110,100])]:
                    config={'white_enabled':enabled,'white_baseline':{'white_baseline':base}}
                    expected=sample(frame,prepare_roi(roi),base,config=config)
                    # The live UI must reuse the exact decoded preview, not decode it again.
                    with patch.object(api._reader,'read',side_effect=AssertionError('preview decoded twice')):
                        actual=api.sample_frame(files[0]['id'],r['time'],roi,config)
                    self.assertEqual(actual,expected)
                api.set_decoder_mode('software')
                self.assertIsNone(api._preview_frame)
            finally:api.close()

if __name__=='__main__':unittest.main()
