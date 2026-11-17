import {icon,drink} from './icons.js';
import {productPhoto} from './product-photos.js';
const app=document.querySelector('#app'), modal=document.querySelector('#modal'), toast=document.querySelector('#toast'), printArea=document.querySelector('#print-area');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((v||0)/100);
const number=v=>new Intl.NumberFormat('en-US').format(v||0);
const formatDate=(iso,opts={month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})=>new Intl.DateTimeFormat('en-ZW',{timeZone:'Africa/Harare',...opts}).format(new Date(iso));
const labels={cash:'Cash',ecocash:'EcoCash',card:'Card'};
const paymentIcons={cash:'cash',ecocash:'phone',card:'card'};
const tabs={pos:['Register','pos'],dashboard:['Overview','dashboard'],inventory:['Inventory','stock'],receipts:['Receipts','receipt'],staff:['Team','staff']};
const groups=['Beer','Cider','Spirits','Mixers','Soft drinks'];
const key='hoodspot:v1:';
const store={get(k,f=null){try{return JSON.parse(localStorage.getItem(key+k))??f}catch{return f}},set(k,v){localStorage.setItem(key+k,JSON.stringify(v))},del(k){localStorage.removeItem(key+k)}};
const requestedWorkspace=new URLSearchParams(location.hash.slice(1)).get('workspace')||new URLSearchParams(location.search).get('workspace')||'';
if(requestedWorkspace){try{store.set('workspace',requestedWorkspace);history.replaceState({},'',location.pathname)}catch{}}
const s={user:null,view:'pos',products:[],cart:new Map(),category:'All drinks',search:'',online:navigator.onLine,range:'today',report:null,inventory:null,receipts:null,staff:null,loading:false,loadError:'',busy:false,printing:store.get('printing',true),role:'cashier',workspace:store.get('workspace',''),cashierDrawer:false,syncing:false,catalogLoading:false};
const errorNotice=e=>e?.message||'Something went wrong. Please try again.';
function say(msg){toast.textContent=msg;toast.hidden=false;clearTimeout(s.toastTimer);s.toastTimer=setTimeout(()=>{toast.hidden=true},4800)}
function headerBrand(){return '<a class="brand" href="/" aria-label="Hood Spot POS"><img src="/logo.svg" width="39" height="39" alt=""><span>HOOD SPOT<span class="brand-sub">POINT OF SALE</span></span></a>'}
function badge(on=s.online){return `<span class="connection ${on?'':'offline'}"><i></i>${on?'Cloud connected':'Offline mode'}</span>`}
async function api(path,opts={}){
 const {body,method='GET'}=opts;
 let response;try{response=await fetch('/api/v1/'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(11000),cache:'no-store'})}catch{throw Object.assign(new Error('Connection lost. Try again when you are back online.'),{network:true})}
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(data.message||'The service is not responding. Try again shortly.'),{status:response.status,code:data.error});
 return data;
}
const scope=()=>s.user?`${s.user.workspace}:${s.user.username}`:'';
function queue(){
 if(!scope())return [];
 const prefix=key+'queue:'+scope()+':';
 const result=[];
 for(let i=0;i<localStorage.length;i++){const n=localStorage.key(i);if(n?.startsWith(prefix)){const item=store.get(n.slice(key.length));if(item)result.push(item)}}
 return result.sort((a,b)=>a.input.soldAt.localeCompare(b.input.soldAt));
}
function saveQueue(entry,sc=scope()){store.set('queue:'+sc+':'+entry.input.id,entry)}
function removeQueue(id,sc=scope()){store.del('queue:'+sc+':'+id)}
function registerCache(){if(s.user){try{store.set('catalog:'+scope(),s.products)}catch{}}}
function startUser(user,remember=true){
 s.user=user;s.workspace=user.workspace;s.cart.clear();s.products=store.get('catalog:'+scope(),[]);s.search='';s.category='All drinks';
 s.range='today';s.report=null;s.staff=null;s.receipts=null;s.inventory=null;s.loadError='';
 s.view=location.pathname==='/workstation'?'pos':user.role==='owner'?'dashboard':'pos';
 if(remember){try{store.set('workspace',user.workspace);store.set('offline-user',user);store.del('local-lock')}catch{}}
 render();
 if(s.online){refreshCatalog();loadView();syncQueue()}
}
function stopUser(){s.user=null;s.cart.clear();s.products=[];s.receipts=null;s.report=null;s.staff=null;s.inventory=null;s.cashed=null;s.checkoutTender='';s.cashierDrawer=false;try{store.del('offline-user')}catch{};if(modal.open)modal.close();render()}
function canOffline(){return !!s.user&&+new Date(s.user.expires)>Date.now()}
async function refreshCatalog(){
 if(!s.user||!s.online||s.catalogLoading)return;
 const sc=scope();s.catalogLoading=true;
 try{const res=await api('catalog');if(sc!==scope())return;s.products=res.products;registerCache();if(s.view==='pos')refreshRegister()}catch(e){if(sc===scope()){if(e.status===401)stopUser();else if(e.network)updateConnectivity(false)}}finally{s.catalogLoading=false}
}
async function loadView(background=false){
 if(!s.user||!s.online||s.view==='pos')return;
 const v=s.view,sc=scope(),range=s.range;
 if(!background){s.loading=true;s.loadError='';render()}
 try{
  const data=await api(({dashboard:'report?range='+range,inventory:'stock',staff:'staff',receipts:'sales'})[v]);
  if(v!==s.view||sc!==scope()||range!==s.range)return;
  s[v==='dashboard'?'report':v]=v==='receipts'?data.sales:data;
  s.loadError='';
 }catch(e){
  if(v!==s.view||sc!==scope()||range!==s.range)return;
  if(e.status===401){stopUser();return}
  if(e.network)updateConnectivity(false);
  if(!background)s.loadError=errorNotice(e);
 }finally{if(v===s.view&&sc===scope()&&range===s.range){s.loading=false;render()}}
}
function nav(v){
 if(v!=='pos'&&v!=='receipts'&&s.user.role!=='owner')return;
 s.view=v;s.loadError='';s.cashierDrawer=false;s.loading=false;render();scrollTo({top:0,behavior:'instant'});if(v==='pos')refreshCatalog();else loadView();
}
function updateConnectivity(next){
 const changed=s.online!==next;s.online=next;
 if(changed&&s.user){render();if(next){syncQueue();refreshCatalog();loadView(true)}}
}
function viewTitle(overline,title,sub,right=''){
 return `<div class="view-title"><div><p class="eyebrow">${overline}</p><h1>${title}</h1><p class="subtitle">${sub}</p></div>${right}</div>`;
}
function loginView(){
 return `<div class="welcome"><header class="welcome-header">${headerBrand()}<div class="welcome-actions"><a href="/api-reference.html" class="quiet-link">REST API</a><button class="btn subtle" data-install>${icon('install',17)} <span>Install app</span></button></div></header>
 <main class="welcome-main"><section class="welcome-copy">
 <span class="hero-kicker"><i></i> CLOUD POS FOR BARS</span><h1>Run the bar.<br><em>Own the night.</em></h1>
 <p>Keep the till moving, stay ahead of stock, and see how the bar is doing from wherever you are.</p>
 <div class="hero-sample" aria-hidden="true"><div class="hero-sample-top"><span>${icon('chart',17)} SHIFT SNAPSHOT</span><span><i></i> DEMO DATA</span></div><div class="hero-metrics"><div><small>Sales overview</small><strong>$842.50</strong><span>Sample turnover</span></div><div class="hero-bars">${[25,45,36,68,53,91,74,98,69,81,59,85].map((h,i)=>`<i style="--height:${h}%;--i:${i}"></i>`).join('')}</div></div></div>
 <div class="hero-features"><span>${icon('pos',17)} Fast checkout</span><span>${icon('sync',17)} Offline queue</span><span>${icon('lock',17)} Role-based access</span></div>
 </section><section class="login-panel" aria-labelledby="loginHeading">
 <div class="login-card-top"><span class="tile-icon">${icon('lock',22)}</span><span class="tag">INTERACTIVE DEMO</span></div>
 <h2 id="loginHeading">Sign in to Hood Spot</h2><p>Choose a role to try the register or the owner dashboard.</p>
 <div class="role-options" aria-label="Demo role selector">
 <button data-role="cashier" class="${s.role==='cashier'?'selected':''}" aria-pressed="${s.role==='cashier'}">${icon('pos')}<strong>Cashier</strong><small>Run the till</small></button>
 <button data-role="owner" class="${s.role==='owner'?'selected':''}" aria-pressed="${s.role==='owner'}">${icon('dashboard')}<strong>Owner</strong><small>Manage the bar</small></button></div>
 <form id="loginForm">
 <div class="login-fields"><label>Username<input name="username" autocomplete="username" value="${s.role}" required maxlength="32"></label>
 <label>Password<input name="password" type="password" autocomplete="current-password" value="${s.role==='owner'?'Owner@2026':'Till@2026'}" required maxlength="128"></label></div>
 <details class="workspace-entry" ${s.workspace?'open':''}><summary>${s.workspace?'Using an existing workspace':'Join an existing workspace'}</summary>
 <label>Workspace code <input name="workspace" placeholder="Optional 32-character code" value="${esc(s.workspace)}" spellcheck="false" autocomplete="off" maxlength="32"></label>
 <small>Leave this blank to start a separate demo with sample data.</small></details>
 <div class="form-error" id="loginError" role="alert" hidden></div>
 <button type="submit" class="btn primary login-submit">Open ${s.role==='owner'?'owner dashboard':'register'} ${icon('arrow',19)}</button>
 </form>
 <div class="login-foot">${icon('lock',15)} Demo data only. No real payments are processed.</div>
 </section></main>
 <footer class="welcome-footer"><span>HOOD SPOT POS <b>•</b> Sell smart. Track everything. Stay in control.</span><span>Designed by WebDevPro</span></footer></div>`;
}
function shell(){
 const owner=s.user.role==='owner';
 const list=owner?['dashboard','pos','inventory','receipts','staff']:['pos','receipts'];
 const navMarkup=(cls)=>`<nav class="${cls}" aria-label="${cls==='mobile-bottom'?'Mobile navigation':'Workspace navigation'}">${list.map(v=>`<button class="${s.view===v?'active':''}" data-nav="${v}" ${s.view===v?'aria-current="page"':''}>${icon(tabs[v][1])}<span>${tabs[v][0]}</span></button>`).join('')}</nav>`;
 return `<div class="workspace"><aside class="sidebar">${headerBrand()}<span class="nav-label">WORKSPACE</span>${navMarkup('nav-list')}<div class="sidebar-foot"><button data-action="settings">${icon('settings',18)} Workspace settings</button><button data-install>${icon('install',18)} Install app</button><small>HOOD SPOT POS · DEMO</small></div></aside>
 <div class="workspace-main"><header class="topbar"><div class="crumb"><span class="top-logo"><img width="34" height="34" src="/logo.svg" alt=""></span><span>Hood Spot</span><b>/</b><strong>${tabs[s.view][0]}</strong></div>
 <div class="top-actions">${badge()}<button title="Workspace settings" aria-label="Workspace settings" class="icon-btn mobile-settings" data-action="settings">${icon('settings',20)}</button><button class="user-pill" data-action="settings" title="Workspace settings"><span class="avatar">${esc(s.user.name[0]||'H')}</span><span><strong>${esc(s.user.name)}</strong><small>${owner?'OWNER':'CASHIER'}</small></span></button><button class="icon-btn" data-action="logout" aria-label="Sign out" title="Sign out">${icon('exit',20)}</button></div></header>
 <main class="work-content" id="workContent">${s.view==='pos'?register():s.view==='dashboard'?dashboard():s.view==='inventory'?inventory():s.view==='receipts'?receipts():staffView()}</main>
 </div>${navMarkup('mobile-bottom')}</div>`;
}
function render(){app.innerHTML=s.user?shell():loginView()}
function pendingCount(){return queue().length}
function effective(p){const queued=queue().filter(v=>!v.error||v.error.code==='insufficient_stock').reduce((n,o)=>n+(o.input.items.find(i=>i.id===p.id)?.qty||0),0);return Math.max(0,p.stock-queued)}
function register(){
 return `<div class="register-layout"><section class="catalog">
 ${viewTitle('POINT OF SALE','Register','Tap a product to add it to the current order.',`<button class="btn outline sync-btn" data-action="queue" title="View offline sync queue">${icon('sync',17)} <span>Sync queue <b id="queueCount">${pendingCount()}</b></span></button>`)}
 ${!s.online?`<div class="notice">${icon('alert',18)} ${canOffline()?'Selling offline. Orders will sync when this device reconnects.':'Offline access expired. Reconnect and sign in to continue.'}</div>`:''}
 <div class="catalog-filter"><div class="search">${icon('search',19)}<input id="catalogSearch" aria-label="Search drinks" placeholder="Search drinks…" value="${esc(s.search)}" maxlength="100"><kbd>⌕</kbd></div>
 <div class="categories" aria-label="Filter drinks">${['All drinks',...groups].map(c=>`<button class="${s.category===c?'selected':''}" data-category="${esc(c)}" aria-pressed="${s.category===c}">${esc(c)}</button>`).join('')}</div></div>
 <div class="product-grid" id="productGrid">${productCards()}</div></section>
 <aside class="order ${s.cashierDrawer?'drawer-open':''}" id="orderBox">${order()}</aside>
 <button class="mobile-cart btn primary" data-action="toggle-cart">${icon('cart',19)} <span id="mobileCartLabel">${cartQty()} items · ${amount(cartTotal())}</span> ${icon('arrow',19)}</button></div>`;
}
function photoMarkup(p,thumb=false){
 const src=productPhoto(p.category,p.name);
 if(!src)return thumb?'':drink(p.category,p.name);
 const fallback=thumb?'':drink(p.category,p.name);
 return `<img data-product-photo class="${thumb?'inventory-photo':'catalog-photo'}" src="${src}" alt="" width="320" height="320" decoding="async">${fallback?`<span class="photo-fallback" hidden>${fallback}</span>`:''}`;
}
document.addEventListener('error',e=>{
 const image=e.target;
 if(!image.matches?.('[data-product-photo]'))return;
 image.hidden=true;
 const fallback=image.nextElementSibling;
 if(fallback?.classList.contains('photo-fallback'))fallback.hidden=false;
},true);
function productCards(){
 const filtered=s.products.filter(p=>(s.category==='All drinks'||p.category===s.category)&&(`${p.name} ${p.category}`).toLowerCase().includes(s.search.toLowerCase().trim()));
 return filtered.length?filtered.map(p=>{
  const count=effective(p), hasPhoto=Boolean(productPhoto(p.category,p.name)), tone=({'Beer':'beer','Cider':'cider','Spirits':'spirit','Mixers':'mixer','Soft drinks':'soft'})[p.category]||'beer';
  return `<button class="product" data-add="${p.id}" ${!count||(!s.online&&!canOffline())?'disabled':''}><div class="product-art ${tone}${hasPhoto?' has-photo':''}"><span class="product-category">${esc(p.category)}</span>${photoMarkup(p)}${count<=p.low?`<span class="stock-chip ${count?'':'out'}">${count?'LOW':'SOLD OUT'}</span>`:''}</div><div class="product-meta"><strong>${esc(p.name)}</strong><div><span>${amount(p.price)}</span><small>${number(count)} in stock</small></div></div></button>`;
 }).join(''):`<div class="empty catalog-empty">${icon('search',28)}<strong>${s.products.length?'No drinks match your search':s.online?'Loading the drink catalog…':'No cached catalog available'}</strong><span>${s.products.length?'Try another category or search.':s.online?'Check your connection if this takes a while.':'Sign in online on this device to enable offline selling.'}</span></div>`;
}
const cartQty=()=>[...s.cart.values()].reduce((sum,i)=>sum+i.qty,0);
const cartTotal=()=>[...s.cart.values()].reduce((sum,i)=>sum+i.price*i.qty,0);
function order(){
 return `<div class="order-head"><div class="tile-icon">${icon('cart',20)}</div><div><h2>Current order</h2><span>${cartQty()} ${cartQty()===1?'item':'items'} · USD</span></div><button class="icon-btn drawer-close" data-action="toggle-cart" aria-label="Close order">${icon('close',20)}</button></div>
 <div class="order-items">${s.cart.size?[...s.cart.values()].map(p=>`<div class="order-item"><div><strong>${esc(p.name)}</strong><small>${amount(p.price)} each</small><div class="stepper"><button data-dec="${p.id}" aria-label="Remove one ${esc(p.name)}">${icon('minus',13)}</button><b>${p.qty}</b><button data-add="${p.id}" aria-label="Add one ${esc(p.name)}">${icon('plus',13)}</button></div></div><strong>${amount(p.price*p.qty)}</strong></div>`).join(''):`<div class="empty cart-empty">${icon('receipt',30)}<strong>Your order is empty</strong><span>Tap any drink to start.</span></div>`}</div>
 <div class="order-end"><div class="subtotal"><span>Subtotal</span><span>${amount(cartTotal())}</span></div><div class="order-total"><strong>Total due</strong><strong>${amount(cartTotal())}</strong></div>
 <button class="btn primary pay-btn" data-action="checkout" ${!s.cart.size||s.busy?'disabled':''}>Review & pay ${icon('arrow',20)}</button><button class="text-btn clear-btn" data-action="clear" ${!s.cart.size?'disabled':''}>Clear order</button></div>`;
}
function refreshRegister(){
 const orderBox=document.querySelector('#orderBox'),grid=document.querySelector('#productGrid'),label=document.querySelector('#mobileCartLabel'),q=document.querySelector('#queueCount');
 if(orderBox){orderBox.innerHTML=order();orderBox.classList.toggle('drawer-open',s.cashierDrawer)}
 if(grid)grid.innerHTML=productCards();
 if(label)label.textContent=`${cartQty()} items · ${amount(cartTotal())}`;
 if(q)q.textContent=pendingCount();
}
function increment(id,delta){
 const p=s.products.find(p=>p.id===id),item=s.cart.get(id);
 if(delta<0&&item){if(item.qty===1)s.cart.delete(id);else item.qty--}
 if(delta>0&&p){
  if(!s.online&&!canOffline()){say('Reconnect and sign in to sell.');return}
  if((item?.qty||0)>=Math.min(effective(p),99)){say('No more units are available for this order.');return}
  if(item)item.qty++;
  else s.cart.set(id,{id,name:p.name,price:p.price,qty:1});
 }
 refreshRegister();
}
function blank(iconName,title,sub=''){return `<div class="empty pane-empty">${icon(iconName,29)}<strong>${title}</strong><span>${sub}</span></div>`}
function unavailable(){return blank('alert',!s.online?'Reconnect to see this view':s.loadError?esc(s.loadError):'Loading…',!s.online?'The register remains available offline.':'')}
function stat(name,value,iconName,hint,tone='teal'){
 return `<article class="stat"><div><span>${name}</span><span class="tile-icon ${tone}">${icon(iconName,18)}</span></div><strong>${value}</strong><small>${hint}</small></article>`;
}
function dashboard(){
 const d=s.report;
 const ranges=`<div class="segments" aria-label="Reporting period">${[['today','Today'],['week','7 days'],['month','30 days']].map(([r,l])=>`<button class="${r===s.range?'selected':''}" data-range="${r}" aria-pressed="${r===s.range}">${l}</button>`).join('')}</div>`;
 const top=viewTitle('OWNER DASHBOARD','Shift overview','Sales, margins and stock across your bar. Figures in USD · Harare time.',ranges);
 if(!d||s.loadError||!s.online)return top+unavailable();
 const values=d.series,high=Math.max(100,...values.map(p=>p.value)),max=Math.ceil(high/100)*100;
 const stats=d.totals;
 return `${top}<div class="stats">${stat('Total sales',amount(stats.revenue),'cash','Recorded payments')}${stat('Gross profit',amount(stats.profit),'chart','Sales minus product cost','purple')}${stat('Transactions',number(stats.transactions),'receipt',`${amount(stats.average)} average order`,'blue')}${stat('Low stock',number(d.inventory.low),'alert',`of ${number(d.inventory.products)} active products`,'amber')}</div>
 <div class="dashboard-grid"><section class="pane chart"><div class="pane-head"><div><h2>Sales activity</h2><p>${({today:'Hourly sales today',week:'Daily sales over the last 7 days',month:'Daily sales over the last 30 days'})[d.range]}</p></div><span class="chart-legend"><i></i> Sales</span></div>
 <div class="chart-area"><div class="axis">${[1,.75,.5,.25,0].map(n=>`<span>${amount(max*n).replace(/\.00$/,'')}</span>`).join('')}</div><div class="bars">${values.map((p,i)=>`<div><i class="${p.value===high?'peak':''}" style="--value:${Math.max(0,p.value/max*100)}%;--i:${i}" title="${esc(p.label)} · ${amount(p.value)}" aria-label="${esc(p.label)} · ${amount(p.value)}"></i><span>${values.length<8||i%(values.length>25?5:4)===0?esc(p.label):''}</span></div>`).join('')}</div></div></section>
 <section class="pane best"><div class="pane-head"><div><h2>Best sellers</h2><p>Ranked by units sold</p></div><span class="tile-icon amber">${icon('chart',17)}</span></div>
 ${d.top.length?`<ul class="top-products">${d.top.map((p,i)=>`<li><span class="rank">${String(i+1).padStart(2,'0')}</span><div><strong>${esc(p.name)}</strong><small>${number(p.qty)} sold</small></div><b>${amount(p.revenue)}</b></li>`).join('')}</ul>`:blank('stock','No sales in this period')}</section></div>
 <div class="dashboard-grid"><section class="pane"><div class="pane-head"><div><h2>Recent transactions</h2><p>Latest recorded orders for this period</p></div><button class="btn outline compact" data-action="refresh">${icon('sync',15)} Refresh</button></div>
 ${d.recent.length?`<div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Cashier</th><th>Payment</th><th>Time</th><th>Total</th></tr></thead><tbody>${d.recent.map(r=>`<tr><td class="mono">#${esc(r.id.slice(0,8).toUpperCase())}</td><td>${esc(r.cashier)}</td><td><span class="soft-tag">${labels[r.payment]}</span></td><td>${formatDate(r.sold_at)}</td><td><strong>${amount(r.total)}</strong></td></tr>`).join('')}</tbody></table></div>`:blank('receipt','No transactions yet')}</section>
 <section class="pane"><div class="pane-head"><div><h2>Payment mix</h2><p>Recorded by method</p></div></div><ul class="top-products">${Object.keys(labels).map(k=>{const p=d.payments.find(p=>p.payment===k);return `<li><span class="rank">${icon(paymentIcons[k],17)}</span><div><strong>${labels[k]}</strong><small>${number(p?.count)} sales</small></div><b>${amount(p?.value)}</b></li>`}).join('')}</ul><p class="pane-tip">Gross profit excludes rent, staff and other expenses.</p></section></div>`;
}
function inventory(){
 const d=s.inventory;
 const top=viewTitle('STOCK CONTROL','Inventory','Manage prices, costs, stock and low-stock alerts.',`<button class="btn primary" data-action="new-product" ${!s.online?'disabled':''}>${icon('plus',18)} New product</button>`);
 if(!d||!s.online||s.loadError)return top+unavailable();
 const low=d.products.filter(p=>p.active&&p.stock<=p.low).length;
 return `${top}${low?`<div class="notice">${icon('alert',18)} <strong>${low} ${low===1?'product is':'products are'} at or below its stock alert level.</strong> Use Adjust stock after receiving new stock.</div>`:''}
 <section class="pane"><div class="pane-head"><div><h2>Product catalog</h2><p>${d.products.length} products · prices in USD</p></div></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Cost</th><th>On hand</th><th>Alert at</th><th>Actions</th></tr></thead><tbody>${d.products.map(p=>`<tr><td><span class="inventory-product">${photoMarkup(p,true)}<strong>${esc(p.name)}</strong></span>${p.active?'':' <span class="soft-tag">Hidden</span>'}</td><td>${esc(p.category)}</td><td>${amount(p.price)}</td><td>${amount(p.cost)}</td><td><span class="soft-tag ${p.active&&p.stock<=p.low?'warning':''}">${number(p.stock)}${p.active&&p.stock<=p.low?' · Low':''}</span></td><td>${number(p.low)}</td><td><div class="table-actions"><button class="btn outline compact" data-restock="${p.id}">Adjust stock</button><button class="btn outline compact" data-product="${p.id}">Edit</button></div></td></tr>`).join('')}</tbody></table></div></section>
 <section class="pane sub-pane"><div class="pane-head"><div><h2>Stock activity</h2><p>Latest sales and manual stock adjustments</p></div></div>${d.movements.length?`<div class="table-wrap"><table><thead><tr><th>Product</th><th>Change</th><th>Reason</th><th>By</th><th>Time</th></tr></thead><tbody>${d.movements.map(m=>`<tr><td><strong>${esc(m.name)}</strong></td><td>${m.delta>0?'+':''}${m.delta}</td><td>${esc(m.reason)}</td><td>${esc(m.actor)}</td><td>${formatDate(m.occurred_at)}</td></tr>`).join('')}</tbody></table></div>`:blank('stock','No stock movements yet','New sales and manual stock adjustments will appear here.')}</section>`;
}
function staffView(){
 const d=s.staff;
 const top=viewTitle('OWNER CONTROLS','Team','Create cashier accounts and manage who can use the register.',`<button class="btn primary" data-action="new-staff" ${!s.online?'disabled':''}>${icon('plus',18)} Add cashier</button>`);
 if(!d||!s.online||s.loadError)return top+unavailable();
 return `${top}<section class="pane"><div class="pane-head"><div><h2>Workspace access</h2><p>Only owners can access sales reports, margins, stock management and team controls.</p></div><span class="tile-icon">${icon('lock',17)}</span></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.staff.map(p=>`<tr><td><strong>${esc(p.display_name)}</strong></td><td>${esc(p.username)}</td><td><span class="soft-tag">${p.role==='owner'?'Owner':'Cashier'}</span></td><td>${p.active?'Active':'Disabled'}</td><td>${p.role==='cashier'?`<button class="btn outline compact" data-staff="${esc(p.username)}">Edit access</button>`:'<span class="quiet">Owner account</span>'}</td></tr>`).join('')}</tbody></table></div></section>
 <div class="notice secondary">${icon('lock',18)} Share the workspace code and the new cashier’s own credentials with them. Do not share the owner’s credentials for a real business.</div>`;
}
function receipts(){
 const top=viewTitle('TRANSACTION HISTORY','Receipts','View and reprint sales recorded by this account.',`<button class="btn outline" data-action="queue">${icon('sync',17)} Sync queue <b>${pendingCount()}</b></button>`);
 if(!s.receipts||!s.online||s.loadError)return top+unavailable();
 return `${top}<section class="pane"><div class="pane-head"><div><h2>Recent receipts</h2><p>Up to 30 receipts from this account</p></div></div>
 ${s.receipts.length?`<div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Time</th><th>Payment</th><th>Total</th><th>Action</th></tr></thead><tbody>${s.receipts.map(r=>`<tr><td class="mono">#${r.id.slice(0,8).toUpperCase()}</td><td>${formatDate(r.sold_at)}</td><td><span class="soft-tag">${labels[r.payment]}</span></td><td><strong>${amount(r.total)}</strong></td><td><button class="btn outline compact" data-print="${r.id}">${icon('printer',16)} View receipt</button></td></tr>`).join('')}</tbody></table></div>`:blank('receipt','No receipts yet','Complete a sale at the register to see it here.')}</section>`;
}
function openModal(title,content){
 modal.innerHTML=`<div class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close',22)}</button></div>${content}`;
 if(!modal.open)modal.showModal();
}
function actions(label){return `<div class="actions"><button type="button" class="btn outline" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${label}</button></div>`}
function formError(){return '<div class="form-error" role="alert" hidden></div>'}
function checkout(){
 if(!s.cart.size)return;
 s.payment='cash';s.checkoutTender='';
 openModal('Complete sale',`<form id="checkoutForm"><div class="checkout-total"><div><small>Amount due</small><strong>${amount(cartTotal())}</strong></div><span class="soft-tag">${cartQty()} items · USD</span></div>
 <div class="payment-options" aria-label="Payment method">${Object.keys(labels).map(k=>`<button type="button" data-payment="${k}" class="${k==='cash'?'selected':''}" aria-pressed="${k==='cash'}">${icon(paymentIcons[k],20)}${labels[k]}</button>`).join('')}</div>
 <div id="paymentDetails">${paymentDetails()}</div><label class="checkbox"><input type="checkbox" name="print" ${s.printing?'checked':''}> Open receipt print dialog after sale</label>${formError()}
 ${actions(s.online?'Complete sale':'Save offline sale')}</form>`);
}
function paymentDetails(){
 return s.payment==='cash'?`<label>Cash received (USD)<input name="tendered" type="number" inputmode="decimal" min="${(cartTotal()/100).toFixed(2)}" max="4000000" step="0.01" value="${(cartTotal()/100).toFixed(2)}" required></label><div class="subtotal change"><span>Change</span><strong id="changeGiven">${amount(0)}</strong></div>`:`<div class="notice secondary">${icon('alert',17)} Record a ${labels[s.payment]} payment only after confirming it on your payment device. This demo does not charge or verify payments.</div><label class="checkbox"><input type="checkbox" name="confirmed" required> I confirm the payment has been received</label>`;
}
function receiptHtml(r,pending=false){
 return `<div class="receipt-paper"><div class="receipt-brand"><img src="/logo.svg" alt="" width="35" height="35"><h3>HOOD SPOT POS</h3><span>BAR SALES · USD</span></div><div class="receipt-meta"><span>Receipt #${esc(r.id.slice(0,8).toUpperCase())}</span><span>${formatDate(r.sold_at)}</span></div>
 ${pending?'<p class="receipt-warning">OFFLINE · NOT YET SYNCED</p>':''}<div class="receipt-lines">${r.lines.map(l=>`<div><span>${l.qty} × ${esc(l.name)}</span><strong>${amount(l.qty*l.price)}</strong></div>`).join('')}</div><div class="receipt-line receipt-sum"><strong>Total</strong><strong>${amount(r.total)}</strong></div><div class="receipt-line"><span>Payment</span><strong>${labels[r.payment]}</strong></div>${r.payment==='cash'?`<div class="receipt-line"><span>Cash received</span><span>${amount(r.tendered)}</span></div><div class="receipt-line"><span>Change</span><span>${amount((r.tendered||0)-r.total)}</span></div>`:''}<p>Thank you for stopping by.</p><small>DEMO RECEIPT · NOT A FISCAL INVOICE</small></div>`;
}
function printReceipt(r,p=false){printArea.innerHTML=receiptHtml(r,p);window.print()}
function showReceipt(r,p=false,auto=false){
 s.lastReceipt={r,p};openModal(p?'Sale saved offline':'Receipt',`${receiptHtml(r,p)}<div class="actions"><button class="btn outline" data-action="close-modal">Done</button><button class="btn primary" data-action="print-last">${icon('printer',18)} Print 80 mm receipt</button></div>`);
 if(auto)setTimeout(()=>printReceipt(r,p),180);
}
function queueDialog(){
 const orders=queue();
 openModal('Offline sync queue',`<p class="muted">Orders on this device retry automatically when it reconnects. Resolve flagged orders before discarding them.</p>
 ${orders.length?`<div class="queue-list">${orders.map(o=>`<div class="queue-item"><div><strong>#${o.input.id.slice(0,8).toUpperCase()} · ${amount(o.receipt.total)}</strong><small>${formatDate(o.input.soldAt)} · ${labels[o.input.payment]}</small>${o.error?`<small class="queue-error">${esc(o.error.message)}</small>`:''}</div><div class="table-actions"><button class="btn outline compact" data-pending-receipt="${o.input.id}">Receipt</button>${o.error?`<button class="btn outline compact" data-discard="${o.input.id}">Remove</button>`:''}</div></div>`).join('')}</div>`:blank('check','All caught up','No sales are waiting to sync.')}
 <div class="actions"><button class="btn outline" data-action="close-modal">Close</button><button class="btn primary" data-action="retry-queue" ${!s.online||!orders.length||s.syncing?'disabled':''}>${icon('sync',17)} Sync now</button></div>`);
}
async function syncQueue(manual=false){
 if(!s.user||!s.online||s.syncing)return;
 const sc=scope();s.syncing=true;let count=0;
 try{
  for(const item of queue()){
   if(sc!==scope()||!s.online)break;
   if(item.error&&!manual&&item.error.code!=='insufficient_stock')continue;
   try{await api('sales',{method:'POST',body:item.input});removeQueue(item.input.id,sc);count++}
   catch(e){
    if(e.network){if(sc===scope())updateConnectivity(false);break}
    if(e.status===401){if(sc===scope())stopUser();break}
    if(e.status>=500||e.status===429)break;
    saveQueue({...item,error:{code:e.code,message:e.message}},sc);
   }
  }
  if(count&&sc===scope()){say(`${count} queued ${count===1?'sale':'sales'} synced.`);refreshCatalog();if(s.view==='receipts'||s.view==='dashboard')loadView(true)}
 }finally{s.syncing=false;if(sc===scope()&&s.view==='pos')refreshRegister()}
}
function productDialog(p){
 openModal(p?'Edit product':'New product',`<form id="productForm" data-id="${p?.id||''}">
 <label>Product name<input name="name" value="${esc(p?.name)}" required minlength="2" maxlength="64"></label>
 <label>Category<select name="category">${groups.map(g=>`<option ${p?.category===g?'selected':''}>${g}</option>`).join('')}</select></label>
 <div class="form-grid"><label>Selling price (USD)<input name="price" type="number" inputmode="decimal" min=".01" max="1000" step=".01" value="${p?(p.price/100).toFixed(2):''}" required></label>
 <label>Unit cost (USD)<input name="cost" type="number" inputmode="decimal" min="0" max="1000" step=".01" value="${p?(p.cost/100).toFixed(2):''}" required></label>
 <label>Low-stock alert level<input name="low" type="number" min="0" max="100000" step="1" value="${p?.low??8}" required></label>
 ${p?'':`<label>Opening stock<input name="stock" type="number" min="0" max="100000" step="1" value="0" required></label>`}</div>
 <label class="checkbox"><input name="active" type="checkbox" ${p?.active===false?'':'checked'}> Show on the register</label>${formError()}${actions('Save product')}</form>`);
}
function stockDialog(p){
 openModal('Adjust stock',`<form id="stockForm" data-id="${p.id}"><p class="muted">${esc(p.name)} · ${number(p.stock)} units on hand</p>
 <label>Quantity change<input name="delta" type="number" min="-${p.stock}" max="${100000-p.stock}" step="1" placeholder="e.g. 12 or −2" required></label>
 <label>Reason<input name="reason" required minlength="2" maxlength="80" placeholder="e.g. Delivery received"></label>
 <small class="muted">Use a positive number to add units or a negative number to remove them.</small>${formError()}${actions('Save adjustment')}</form>`);
}
function staffDialog(p){
 openModal(p?'Edit cashier access':'Add cashier',`<form id="staffForm" data-id="${esc(p?.username)}"><label>Display name<input name="name" value="${esc(p?.display_name)}" required minlength="2" maxlength="64"></label>
 <label>Username<input name="username" value="${esc(p?.username)}" ${p?'readonly':''} required minlength="3" maxlength="32" pattern="[a-zA-Z][a-zA-Z0-9._\\-]{2,31}"></label>
 <label>${p?'New password (optional)':'Password'}<input name="password" autocomplete="new-password" ${p?'':'required'} type="password" minlength="8" maxlength="128"></label>
 ${p?`<label class="checkbox"><input name="active" type="checkbox" ${p.active?'checked':''}> Account active</label>`:'<p class="muted">Cashiers can sell and view their own receipts. They cannot see costs or profits.</p>'}
 ${formError()}${actions('Save account')}</form>`);
}
function settings(){
 openModal('Workspace settings',`<p class="muted">Use this code on another device to connect to the same demo. Choose the desired role on the sign-in screen and enter this code.</p>
 <label>Workspace code<input id="visibleWorkspace" value="${esc(s.user.workspace)}" readonly></label><div class="settings-row"><button class="btn outline" data-action="copy-code">${icon('copy',16)} Copy code</button><button class="btn outline" data-action="copy-join">${icon('copy',16)} Copy join link</button></div>
 <div class="notice secondary">${icon('lock',17)} Demo logins are public. Only share this code with people who should use your demo data.</div>
 <label class="checkbox"><input id="printPreference" type="checkbox" ${s.printing?'checked':''}> Auto-open browser print dialog after a sale</label>
 <p class="muted">Set your 80 mm thermal printer as the browser’s destination, use actual size, and turn off headers and footers. Unattended printing requires a kiosk or print bridge.</p>
 <div class="actions"><button class="btn outline" data-install>${icon('install',18)} Install app</button><button class="btn primary" data-action="close-modal">Done</button></div>`);
}
function disableForm(form,busy){const btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=busy;form.setAttribute('aria-busy',String(busy))}
function showError(form,e){const el=form.querySelector('.form-error');if(el){el.textContent=errorNotice(e);el.hidden=false}else say(errorNotice(e))}
async function submitCheckout(form,f){
 if(s.busy||!s.cart.size||(!s.online&&!canOffline()))return;
 const total=cartTotal(), tendered=s.payment==='cash'?Math.round(Number(f.get('tendered'))*100):null;
 if((s.payment==='cash'&&tendered<total)||(s.payment!=='cash'&&!f.has('confirmed'))){showError(form,new Error('Confirm the payment amount first.'));return}
 const cart=[...s.cart.values()],input={id:crypto.randomUUID(),items:cart.map(({id,qty,price})=>({id,qty,price})),payment:s.payment,tendered,soldAt:new Date().toISOString()};
 const receipt={id:input.id,lines:cart,total,payment:input.payment,tendered,sold_at:input.soldAt};
 let saved=receipt,pending=true;
 const sc=scope();
 try{saveQueue({input,receipt},sc)}catch{showError(form,new Error('This device cannot safely save an order. Free up browser storage or use another device.'));return}
 s.busy=true;disableForm(form,true);
 try{
  if(s.online){
   try{const res=await api('sales',{method:'POST',body:input});saved=res.receipt;pending=false;removeQueue(input.id,sc)}
   catch(e){
    if(e.status===401){stopUser();say('Sign in again with the same account to sync this order.');return}
    if(e.network)updateConnectivity(false);
    else if(e.status<500&&e.status!==429){removeQueue(input.id,sc);showError(form,e);refreshCatalog();return}
   }
  }
  if(sc!==scope())return;
  s.cart.clear();s.cashierDrawer=false;s.printing=f.has('print');try{store.set('printing',s.printing)}catch{};
  refreshRegister();if(!pending)refreshCatalog();
  showReceipt(saved,pending,s.printing);
 }finally{s.busy=false;disableForm(form,false);if(sc===scope()&&s.view==='pos')refreshRegister()}
}
async function signOut(){
 const remaining=queue().length;
 if(remaining&&!confirm(`There are ${remaining} unsynced orders on this device. Sign back in as the same user to sync them. Sign out anyway?`))return;
 try{store.set('local-lock',true)}catch{}
 stopUser();
 try{await api('session',{method:'DELETE'});store.del('local-lock')}catch{}
}
async function copy(text){
 try{await navigator.clipboard.writeText(text);say('Copied.')}
 catch{document.querySelector('#visibleWorkspace')?.select();say('Clipboard not available. Copy the selected code.')}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 const d=b.dataset;
 if(d.role){s.role=d.role;s.workspace=new FormData(document.querySelector('#loginForm')).get('workspace');render();document.querySelector(`[data-role="${d.role}"]`)?.focus();return}
 if(!s.user)return;
 if(d.nav){nav(d.nav);return}
 if(d.category){s.category=d.category;document.querySelectorAll('[data-category]').forEach(t=>{t.classList.toggle('selected',t.dataset.category===s.category);t.setAttribute('aria-pressed',String(t.dataset.category===s.category))});refreshRegister();return}
 if(d.add||d.dec){increment(d.add||d.dec,d.add?1:-1);return}
 if(d.range){s.range=d.range;s.report=null;loadView();return}
 if(d.product){const p=s.inventory?.products.find(p=>p.id===d.product);if(p)productDialog(p);return}
 if(d.restock){const p=s.inventory?.products.find(p=>p.id===d.restock);if(p)stockDialog(p);return}
 if(d.staff){const p=s.staff?.staff.find(p=>p.username===d.staff);if(p)staffDialog(p);return}
 if(d.payment){s.payment=d.payment;document.querySelector('#paymentDetails').innerHTML=paymentDetails();b.parentElement.querySelectorAll('button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b))});return}
 if(d.print){const r=s.receipts?.find(r=>r.id===d.print);if(r)showReceipt(r);return}
 if(d.pendingReceipt){const q=queue().find(q=>q.input.id===d.pendingReceipt);if(q)showReceipt(q.receipt,true);return}
 if(d.discard&&confirm('Remove this unsynced sale from this device? This will not change the cloud register.')){removeQueue(d.discard);refreshRegister();queueDialog();return}
 switch(d.action){
 case 'logout':signOut();break;
 case 'close-modal':if(!s.busy)modal.close();break;
 case 'clear':s.cart.clear();refreshRegister();break;
 case 'checkout':checkout();break;
 case 'toggle-cart':s.cashierDrawer=!s.cashierDrawer;refreshRegister();break;
 case 'new-product':productDialog();break;
 case 'new-staff':staffDialog();break;
 case 'settings':settings();break;
 case 'queue':queueDialog();break;
 case 'retry-queue':b.disabled=true;await syncQueue(true);if(s.user&&modal.open)queueDialog();break;
 case 'refresh':loadView();break;
 case 'print-last':if(s.lastReceipt)printReceipt(s.lastReceipt.r,s.lastReceipt.p);break;
 case 'copy-code':copy(s.user.workspace);break;
 case 'copy-join':copy(`${location.origin}/#workspace=${encodeURIComponent(s.user.workspace)}`);break;
 }
});
modal.addEventListener('cancel',e=>{if(s.busy)e.preventDefault()});
document.addEventListener('input',e=>{
 if(e.target.id==='catalogSearch'){s.search=e.target.value;document.querySelector('#productGrid').innerHTML=productCards()}
 if(e.target.name==='tendered'){const el=document.querySelector('#changeGiven');if(el)el.textContent=amount(Math.max(0,Math.round(Number(e.target.value)*100)-cartTotal()))}
 if(e.target.id==='printPreference'){s.printing=e.target.checked;try{store.set('printing',s.printing)}catch{}}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!(form instanceof HTMLFormElement))return;
 e.preventDefault();
 const f=new FormData(form),id=form.dataset.id;
 if(form.id==='checkoutForm'){await submitCheckout(form,f);return}
 disableForm(form,true);
 try{
  if(form.id==='loginForm'){
   const data=await api('session',{method:'POST',body:{username:f.get('username'),password:f.get('password'),workspace:f.get('workspace')}});
   s.online=true;startUser(data.user);say(data.user.role==='owner'?'Owner dashboard unlocked.':'Register ready.');return;
  }
  if(form.id==='productForm'){
   await api(id?'products/'+id:'products',{method:id?'PATCH':'POST',body:{name:f.get('name'),category:f.get('category'),price:Math.round(Number(f.get('price'))*100),cost:Math.round(Number(f.get('cost'))*100),low:Number(f.get('low')),stock:Number(f.get('stock')),active:f.has('active')}});
   say('Product saved.');refreshCatalog();
  }else if(form.id==='stockForm'){
   await api('stock/'+id+'/adjustments',{method:'POST',body:{delta:Number(f.get('delta')),reason:f.get('reason')}});say('Stock updated.');refreshCatalog();
  }else if(form.id==='staffForm'){
   await api(id?'staff/'+id:'staff',{method:id?'PATCH':'POST',body:{username:f.get('username'),name:f.get('name'),password:f.get('password'),active:f.has('active')}});
   say('Cashier account saved.');
  }else return;
  modal.close();loadView();
 }catch(e){showError(form,e);if(e.status===401&&s.user)stopUser()}finally{disableForm(form,false)}
});
window.addEventListener('online',()=>updateConnectivity(true));
window.addEventListener('offline',()=>updateConnectivity(false));
window.addEventListener('storage',e=>{if(e.key?.startsWith(key+'queue:'+scope())&&s.view==='pos'&&s.user)refreshRegister()});
setInterval(async()=>{
 if(!s.user||document.hidden||!navigator.onLine)return;
 if(!s.online){try{await api('health');updateConnectivity(true)}catch{};return}
 syncQueue();
 if(s.view==='dashboard')loadView(true);
 if(s.view==='pos')refreshCatalog();
},12000);
(async function boot(){
 s.role=location.pathname==='/owner'?'owner':'cashier';
 if(store.get('local-lock')||requestedWorkspace){render();return}
 try{
  if(navigator.onLine){const data=await api('session');startUser(data.user);return}
 }catch(e){if(e.status===401){try{store.del('offline-user')}catch{};render();return}if(e.network||e.status>=500)s.online=false}
 const cached=store.get('offline-user');
 if(cached&&+new Date(cached.expires)>Date.now()&&store.get('catalog:'+cached.workspace+':'+cached.username,[]).length){s.online=false;startUser(cached,false);s.view='pos';render();return}
 render();
})();
