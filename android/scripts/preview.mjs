import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../app/src/main/assets');
const mime={html:'text/html',mjs:'text/javascript',js:'text/javascript',css:'text/css',json:'application/json',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2',wasm:'application/wasm',ttf:'font/ttf',bcmap:'application/octet-stream',pfb:'application/octet-stream',icc:'application/octet-stream'};
const server=http.createServer(async(request,response)=>{try{
  const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname),relative=pathname==='/'?'index.html':pathname.slice(1),file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))throw Error('invalid path');
  let data;if(relative.startsWith('vendor/ecdict/')&&relative.endsWith('.json')&&!relative.endsWith('SOURCE.json'))data=gunzipSync(await readFile(file+'.gz'));else data=await readFile(file);
  response.writeHead(200,{'Content-Type':(mime[relative.split('.').at(-1)]??'text/plain')+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'"});response.end(data);
}catch{response.writeHead(404);response.end('Not found');}});
server.listen(Number(process.env.STUDY_PREVIEW_PORT??4186),'127.0.0.1',()=>console.log('AI-StudyDesk mobile preview: http://127.0.0.1:'+server.address().port));
