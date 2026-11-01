"""Loopback-only UI test adapter. Not included in the desktop distribution."""
import json
import secrets
import sys
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Api,ROOT
api=Api();fixture=api._register([next(Path(sys.argv[1]).rglob('VID-0000.mp4'))]);token=secrets.token_hex(24)
allowed={'set_decoder_mode','frame','select_sponge','detect','start_analysis','poll_analysis','cancel_analysis','responsive'}
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'frontend'),**kwargs)
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path in ('/','/index.html'):
            body=(ROOT/'frontend/index.html').read_text(encoding='utf-8')
            bootstrap='<script>window.pywebview={api:Object.fromEntries('+json.dumps(sorted(allowed|{'choose_videos'}))+'.map(name=>[name,async(...args)=>{const r=await fetch("/rpc",{method:"POST",headers:{"Content-Type":"application/json","X-Test-Token":"'+token+'"},body:JSON.stringify({name,args})});const d=await r.json();if(d.error)throw Error(d.error);return d.result;}]))};</script>'
            data=body.replace('<head>','<head>'+bootstrap).encode('utf-8');self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(data)
        else:super().do_GET()
    def do_POST(self):
        if self.path!='/rpc' or self.headers.get('X-Test-Token')!=token:
            self.send_error(403);return
        try:
            body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if body['name']=='choose_videos':result=fixture
            elif body['name'] in allowed:result=getattr(api,body['name'])(*body['args'])
            else:raise ValueError('Unknown test method')
            data=json.dumps({'result':result},ensure_ascii=False).encode('utf-8')
        except Exception as e:data=json.dumps({'error':str(e)},ensure_ascii=False).encode('utf-8')
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Path('../ui-server.json').write_text(json.dumps({'url':f'http://127.0.0.1:{server.server_port}/'}),encoding='utf-8')
print(server.server_port,flush=True)
try:server.serve_forever()
finally:api.close()
