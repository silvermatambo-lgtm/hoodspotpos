import {neon} from '@neondatabase/serverless';
import {createHash, randomBytes, scrypt as scryptRaw, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';

const scrypt=promisify(scryptRaw);
const hash=v=>createHash('sha256').update(v).digest('hex');
const token=(n=32)=>randomBytes(n).toString('hex');
const credentials={owner:'Owner@2026',cashier:'Till@2026'};
const categories=['Beer','Cider','Spirits','Mixers','Soft drinks'];
const methods=['cash','ecocash','card'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const usernamePattern=/^[a-z][a-z0-9._-]{2,31}$/;
const codePattern=/^[a-f0-9]{32}$/;
const maxAge=43200;
const originCookie='hoodspot_session';
const errorLabels={
 SALE_ID_CONFLICT:'That receipt ID is already in use.',
 ITEM_UNAVAILABLE:'A product is unavailable. Ask the owner to review the catalog.',
 PRICE_CHANGED:'A queued price does not match the current catalog. Review the order before retrying.',
 INSUFFICIENT_STOCK:'Not enough stock to finish this sale. Ask the owner to restock.',
 INSUFFICIENT_CASH:'Cash received is below the total.',
 INVALID_STOCK:'That change would leave stock outside the allowed range.'
};
class HttpError extends Error{constructor(status,code,message){super(message);Object.assign(this,{status,code})}}
const bad=(message,code='invalid_request')=>{throw new HttpError(400,code,message)};
const assert=(valid,message)=>{if(!valid)bad(message)};
const asText=(s,min,max)=>typeof s==='string'&&s.trim().length>=min&&s.trim().length<=max;
const isInt=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const asId=id=>{assert(typeof id==='string'&&uuid.test(id),'Invalid identifier.');return id};
const json=(data,status=200,more={})=>{
  return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...more}});
};
const initial=()=> {
  if(!process.env.DATABASE_URL)throw new HttpError(503,'database_unconfigured','Database is not configured.');
  return neon(process.env.DATABASE_URL,{fetchOptions:{signal:AbortSignal.timeout(8500)}});
};
async function passwordHash(pass,salt=token(16)){
  return salt+':'+(await scrypt(pass,salt,64)).toString('hex');
}
async function checkPassword(pass,actual){
  const candidate=await passwordHash(pass,actual?.split(':')[0]||'hoodspot-invalid-salt');
  const a=Buffer.from(candidate),b=Buffer.from(actual??'');
  return a.length===b.length&&timingSafeEqual(a,b);
}
function cookie(req,value,age=maxAge){
  const secure=new URL(req.url).protocol==='https:'||process.env.VERCEL==='1';
  return `${originCookie}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
}
function sessionToken(req){
  return (req.headers.get('cookie')??'').split(/;\s*/).find(v=>v.startsWith(originCookie+'='))?.split('=')[1]??'';
}
function sameOrigin(req){
  const origin=req.headers.get('origin');
  if(req.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==new URL(req.url).origin))throw new HttpError(403,'origin_denied','This action is only available from this site.');
}
async function body(req){
  if(!(req.headers.get('content-type')||'').startsWith('application/json'))bad('Send a JSON request.');
  if(Number(req.headers.get('content-length'))>32768)bad('Request is too large.');
  let raw;try{raw=await req.text()}catch{bad('Cannot read request body.')};
  if(raw.length>32768)bad('Request is too large.');
  try{const value=JSON.parse(raw);if(value&&typeof value==='object'&&!Array.isArray(value))return value}catch{}
  bad('Invalid JSON object.');
}
async function limit(sql,key,max){
  const [r]=await sql`insert into login_limits(key,hits,expires) values(${key},1,now()+interval '15 minutes')
    on conflict(key) do update set hits=case when login_limits.expires<now() then 1 else least(login_limits.hits+1,99999) end,
    expires=case when login_limits.expires<now() then now()+interval '15 minutes' else login_limits.expires end returning hits`;
  if(r.hits>max)throw new HttpError(429,'rate_limited','Too many attempts. Try again in 15 minutes.');
}
async function authenticated(req,sql){
  const raw=sessionToken(req);
  if(/^[a-f0-9]{64}$/.test(raw)){
    const [u]=await sql`select u.workspace,u.username,u.display_name,u.role,s.expires from sessions s
      join staff u on s.workspace=u.workspace and s.username=u.username
      where s.token_hash=${hash(raw)} and s.expires>now() and u.active`;
    if(u)return u;
  }
  throw new HttpError(401,'login_required','Sign in to continue.');
}
const ensureOwner=u=>{if(u.role!=='owner')throw new HttpError(403,'owner_only','Only the owner can access this.')};
const publicUser=u=>({workspace:u.workspace,username:u.username,name:u.display_name,role:u.role,expires:u.expires});

async function login(req,sql){
  const input=await body(req);
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
  const password=input.password;
  let workspace=typeof input.workspace==='string'?input.workspace.trim().toLowerCase():'';
  assert(usernamePattern.test(username)&&typeof password==='string'&&password.length>=8&&password.length<=128,'Enter a valid username and password.');
  assert(!workspace||codePattern.test(workspace),'The workspace code should be 32 characters.');
  const client=(req.headers.get('x-vercel-forwarded-for')||req.headers.get('x-real-ip')||'local').split(',')[0].trim().slice(0,100);
  await limit(sql,'auth:'+hash(client),55);
  if(!workspace){
    if(!Object.hasOwn(credentials,username)||password!==credentials[username])throw new HttpError(401,'login_invalid','Username, password or workspace code is incorrect.');
    await limit(sql,'create:'+hash(client),12);
    workspace=token(16);
    const [owner,cashier]=await Promise.all([passwordHash(credentials.owner),passwordHash(credentials.cashier)]);
    await sql`select make_demo(${workspace},${owner},${cashier})`;
  }else{
    await limit(sql,'workspace:'+hash(workspace+':'+username),30);
  }
  const [u]=await sql`select workspace,username,display_name,role,password_hash,active from staff where workspace=${workspace} and username=${username}`;
  const ok=await checkPassword(password,u?.password_hash);
  if(!ok||!u?.active)throw new HttpError(401,'login_invalid','Username, password or workspace code is incorrect.');
  const raw=token();
  const [s]=await sql`insert into sessions(token_hash,workspace,username) values(${hash(raw)},${workspace},${username}) returning expires`;
  if(sessionToken(req)) await sql`delete from sessions where token_hash=${hash(sessionToken(req))}`;
  return json({user:publicUser({...u,expires:s.expires})},200,{'Set-Cookie':cookie(req,raw)});
}

async function report(sql,u,range){
  const days={today:1,week:7,month:30}[range];
  assert(days,'Choose today, week or month.');
  const workspace=u.workspace;
  const [totals,series,top,recent,stocks,payments]=await sql.transaction([
    sql`select coalesce(sum(total),0)::integer revenue, coalesce(sum(cost),0)::integer cogs,
      coalesce(sum(total-cost),0)::integer profit, count(*)::int transactions, coalesce(round(avg(total)),0)::int average
      from sales where workspace=${workspace} and (sold_at at time zone 'Africa/Harare')::date
        between (now() at time zone 'Africa/Harare')::date-(${days}::int-1) and (now() at time zone 'Africa/Harare')::date`,
    sql`with bins as (
      select generate_series(date_trunc('day',now() at time zone 'Africa/Harare')-
         (${days}::int-1)*interval '1 day',
         case when ${days}::int=1 then date_trunc('day',now() at time zone 'Africa/Harare')+interval '23 hours'
           else date_trunc('day',now() at time zone 'Africa/Harare') end,
         case when ${days}::int=1 then interval '1 hour' else interval '1 day' end) as dt
      ), agg as (
      select date_trunc(case when ${days}::int=1 then 'hour' else 'day' end,sold_at at time zone 'Africa/Harare') as dt,sum(total)::int value
      from sales where workspace=${workspace} and (sold_at at time zone 'Africa/Harare')::date >= (now() at time zone 'Africa/Harare')::date-(${days}::int-1)
      group by 1)
      select to_char(b.dt,case when ${days}::int=1 then 'HH24:MI' else 'DD Mon' end) label,coalesce(a.value,0)::int value
      from bins b left join agg a using(dt) order by b.dt`,
    sql`select l->>'name' name,sum((l->>'qty')::int)::int qty,sum((l->>'qty')::int*(l->>'price')::int)::int revenue
      from sales cross join lateral jsonb_array_elements(lines) l where workspace=${workspace} and (sold_at at time zone 'Africa/Harare')::date
      between (now() at time zone 'Africa/Harare')::date-(${days}::int-1) and (now() at time zone 'Africa/Harare')::date
      group by 1 order by 2 desc, 1 limit 5`,
    sql`select s.id,s.payment,s.total,s.sold_at,coalesce(u.display_name,s.cashier) cashier
      from sales s left join staff u on s.workspace=u.workspace and s.cashier=u.username
      where s.workspace=${workspace} and (s.sold_at at time zone 'Africa/Harare')::date
      between (now() at time zone 'Africa/Harare')::date-(${days}::int-1) and (now() at time zone 'Africa/Harare')::date
      order by sold_at desc limit 12`,
    sql`select count(*) filter(where active and stock<=low)::int low,count(*) filter(where active)::int products,
        coalesce(sum(stock) filter(where active),0)::int units from products where workspace=${workspace}`,
    sql`select payment,sum(total)::int value,count(*)::int count from sales where workspace=${workspace} and
        (sold_at at time zone 'Africa/Harare')::date between (now() at time zone 'Africa/Harare')::date-(${days}::int-1)
        and (now() at time zone 'Africa/Harare')::date group by payment`
  ]);
  return {totals:totals[0],series,top,recent,inventory:stocks[0],payments,range};
}
function productData(b){
  assert(asText(b.name,2,64)&&categories.includes(b.category),'Enter a product name and category.');
  assert(isInt(b.price,1,100000)&&isInt(b.cost,0,100000)&&isInt(b.low,0,100000),'Enter valid price, cost and stock alert quantities.');
  return {name:b.name.trim(),category:b.category,price:b.price,cost:b.cost,low:b.low,active:b.active!==false};
}
async function complete(sql,u,b){
  const id=asId(b.id);
  assert(methods.includes(b.payment),'Choose Cash, EcoCash or Card.');
  assert(Array.isArray(b.items)&&b.items.length>0&&b.items.length<=40,'Add between 1 and 40 different items.');
  const used=new Set();
  const items=b.items.map(item=>{
    assert(item&&typeof item==='object','Invalid cart line.');
    const itemId=asId(item.id);
    assert(!used.has(itemId)&&isInt(item.qty,1,99)&&isInt(item.price,1,100000),'Invalid cart line.');
    used.add(itemId);
    return {id:itemId,qty:item.qty,price:item.price};
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const sold=new Date(b.soldAt);
  assert(typeof b.soldAt==='string'&&Number.isFinite(+sold)&&+sold>=Date.now()-7*86400000&&+sold<=Date.now()+300000,'This sale date cannot be synced. Records can be queued for up to seven days.');
  const amount=b.payment==='cash'?b.tendered:null;
  assert(amount===null||isInt(amount,0,400000000),'Enter a valid cash amount.');
  const fingerprint=hash(JSON.stringify({items,payment:b.payment,amount,soldAt:sold.toISOString()}));
  const [r]=await sql`select checkout_sale(${u.workspace},${u.username},${id}::uuid,${b.payment},${amount},${JSON.stringify(items)}::jsonb,${sold.toISOString()}::timestamptz,${fingerprint}) as receipt`;
  return r.receipt;
}
const endpointInfo={name:'Hood Spot POS REST API',version:'v1',docs:'/api-reference.html',status:'/api/v1/health',authentication:'HTTP-only session cookie acquired with POST /api/v1/session'};
export async function handle(req){
  try{
    const url=new URL(req.url),route=(url.searchParams.get('route')||url.pathname.replace(/^\/api\/v1\/?/,'')).replace(/^\/+|\/+$/g,'');
    const verb=req.method;
    if(verb==='GET'&&route==='')return json(endpointInfo);
    if(!['GET','HEAD','OPTIONS'].includes(verb))sameOrigin(req);
    const sql=initial();
    if(verb==='GET'&&route==='health'){
      await sql`select 1 from workspaces limit 1`;
      return json({status:'ok',service:'hood-spot-pos',mode:'demo',database:'connected',version:'v1'});
    }
    if(verb==='POST'&&route==='session')return login(req,sql);
    if(verb==='DELETE'&&route==='session'){
      const raw=sessionToken(req);
      if(raw) await sql`delete from sessions where token_hash=${hash(raw)}`;
      return json({ok:true},200,{'Set-Cookie':cookie(req,'',0)});
    }
    const u=await authenticated(req,sql);
    const workspace=u.workspace;
    if(verb==='GET'&&route==='session')return json({user:publicUser(u)});
    if(verb==='GET'&&route==='catalog'){
      const products=await sql`select id,name,category,price,stock,low from products where workspace=${workspace} and active order by category,name`;
      return json({products,currency:'USD',timezone:'Africa/Harare'});
    }
    if(verb==='GET'&&route==='sales'){
      const result=await sql`select id,payment,total,lines,sold_at,cashier,tendered from sales where workspace=${workspace}
        and cashier=${u.username} order by sold_at desc limit 30`;
      return json({sales:result});
    }
    if(verb==='POST'&&route==='sales')return json({receipt:await complete(sql,u,await body(req))},201);
    if(route==='report'||route==='stock'||route.startsWith('stock/')||route==='products'||route.startsWith('products/')||route==='staff'||route.startsWith('staff/'))ensureOwner(u);
    if(verb==='GET'&&route==='report')return json(await report(sql,u,url.searchParams.get('range')||'today'));
    if(verb==='GET'&&route==='stock'){
      const [products,movements]=await sql.transaction([
        sql`select id,name,category,price,cost,stock,low,active from products where workspace=${workspace} order by active desc,stock<=low desc,category,name`,
        sql`select m.id,p.name,m.delta,m.reason,m.actor,m.occurred_at from stock_movements m join products p on p.id=m.product
          where m.workspace=${workspace} order by m.occurred_at desc,m.id desc limit 30`
      ]);
      return json({products,movements});
    }
    if(verb==='POST'&&route==='products'){
      const b=await body(req),p=productData(b);
      assert(isInt(b.stock,0,100000),'Enter a valid opening stock quantity.');
      const [r]=await sql`with p as (insert into products(workspace,name,category,price,cost,stock,low,active)
        values(${workspace},${p.name},${p.category},${p.price},${p.cost},${b.stock},${p.low},${p.active}) returning id),
        m as (insert into stock_movements(workspace,product,delta,reason,actor) select ${workspace},id,${b.stock},'Opening stock',${u.username} from p where ${b.stock}::int>0)
        select id from p`;
      return json(r,201);
    }
    if(verb==='PATCH'&&route.startsWith('products/')){
      const id=asId(route.split('/')[1]),p=productData(await body(req));
      const [r]=await sql`update products set name=${p.name},category=${p.category},price=${p.price},cost=${p.cost},low=${p.low},active=${p.active}
        where workspace=${workspace} and id=${id}::uuid returning id`;
      if(!r)throw new HttpError(404,'not_found','Product not found.');
      return json(r);
    }
    if(verb==='POST'&&route.startsWith('stock/')&&route.endsWith('/adjustments')){
      const id=asId(route.split('/')[1]),b=await body(req);
      assert(isInt(b.delta,-100000,100000)&&b.delta!==0&&asText(b.reason,2,80),'Enter a non-zero stock change and a reason.');
      const [r]=await sql`select adjust_stock(${workspace},${id}::uuid,${b.delta},${b.reason.trim()},${u.username}) as stock`;
      return json(r,201);
    }
    if(verb==='GET'&&route==='staff'){
      const result=await sql`select username,display_name,role,active from staff where workspace=${workspace} order by role desc,username`;
      return json({staff:result});
    }
    if(verb==='POST'&&route==='staff'){
      const b=await body(req),name=typeof b.username==='string'?b.username.trim().toLowerCase():'';
      assert(usernamePattern.test(name)&&asText(b.name,2,64)&&typeof b.password==='string'&&b.password.length>=8&&b.password.length<=128,'Use a valid username, display name and a password with at least 8 characters.');
      const pass=await passwordHash(b.password);
      const [r]=await sql`insert into staff(workspace,username,display_name,role,password_hash)
        values(${workspace},${name},${b.name.trim()},'cashier',${pass}) on conflict do nothing returning username`;
      if(!r)throw new HttpError(409,'username_exists','That username is already in use.');
      return json(r,201);
    }
    if(verb==='PATCH'&&route.startsWith('staff/')){
      const name=route.split('/')[1],b=await body(req);
      assert(usernamePattern.test(name)&&asText(b.name,2,64)&&typeof b.active==='boolean','Invalid staff details.');
      assert(!b.password||(typeof b.password==='string'&&b.password.length>=8&&b.password.length<=128),'Use a password with at least 8 characters.');
      const pass=b.password?await passwordHash(b.password):null;
      const [rows]=await sql.transaction([
        sql`update staff set display_name=${b.name.trim()},active=${b.active},password_hash=coalesce(${pass},password_hash)
          where workspace=${workspace} and username=${name} and role='cashier' returning username`,
        sql`delete from sessions where workspace=${workspace} and username=${name} and (${!b.active||!!pass}::boolean)
          and exists(select 1 from staff where workspace=${workspace} and username=${name} and role='cashier')`
      ]);
      if(!rows[0])throw new HttpError(404,'not_found','Cashier account not found.');
      return json(rows[0]);
    }
    throw new HttpError(404,'not_found','This API resource does not exist.');
  }catch(e){
    if(e instanceof HttpError)return json({error:e.code,message:e.message},e.status);
    if(Object.hasOwn(errorLabels,e?.message))return json({error:e.message.toLowerCase(),message:errorLabels[e.message]},409);
    console.error('hoodspot_api_failure',{code:e?.code||e?.name||'unknown'});
    return json({error:'service_unavailable',message:'The service is temporarily unavailable. Check the connection and try again.'},503);
  }
}
