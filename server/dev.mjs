import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {Readable} from 'node:stream';
import {handle} from './pos.mjs';

const port=Number(process.env.PORT||3000),publicDir=resolve('public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
createServer(async (req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname==='/api/v1'||url.pathname.startsWith('/api/v1/')){
   const hasBody=!['GET','HEAD'].includes(req.method);
   const response=await handle(new Request(url,{method:req.method,headers:req.headers,...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const path=resolve(publicDir,'.'+(['/', '/owner','/workstation'].includes(url.pathname)?'/index.html':url.pathname));
  if(!path.startsWith(publicDir+'/')){res.writeHead(404).end();return}
  const bytes=await readFile(path);
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(bytes);
 }catch{res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found')}
}).listen(port,'127.0.0.1',()=>console.log('Hood Spot POS dev listening on http://127.0.0.1:'+port));
