import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handle} from '../server/pos.mjs';

test('REST discovery is public and does not expose secrets',async()=>{
 const res=await handle(new Request('http://localhost/api/v1/'));
 assert.equal(res.status,200);
 assert.equal((await res.json()).version,'v1');
 assert.match(res.headers.get('cache-control'),/no-store/);
});
test('reject a cross-origin mutation before touching the database',async()=>{
 const req=new Request('https://example.com/api/v1/sales',{method:'POST',headers:{Origin:'https://example.net'}});
 const res=await handle(req);
 assert.equal(res.status,403);
});
test('offline caches none of the API or private responses',async()=>{
 const sw=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
 const shell=sw.match(/const files=\[(.*)\]/)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
 for(const file of shell){await readFile(new URL('../public'+(file==='/'?'/index.html':file),import.meta.url))}
});
test('print CSS declares an 80 mm print layout',async()=>{
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 assert.match(css,/@media print[\s\S]*width:80mm/);
});
