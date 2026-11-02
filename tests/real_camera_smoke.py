"""Opt-in local camera check; delegates to the exact packaged-engine probe.
Usage: python tests/real_camera_smoke.py FOLDER RESULT.json [--fps .5]
"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from verification import verify_video_folder

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder',type=Path)
    parser.add_argument('result',type=Path)
    parser.add_argument('--fps',type=float,default=.5)
    args=parser.parse_args()
    verify_video_folder(args.folder,args.result,args.fps)
