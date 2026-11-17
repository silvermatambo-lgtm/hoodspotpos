create table if not exists workspaces (
  id text primary key, created_at timestamptz not null default now()
);
create table if not exists staff (
  workspace text not null references workspaces on delete cascade, username text not null, display_name text not null,
  role text not null check(role in ('owner','cashier')), password_hash text not null, active boolean not null default true,
  primary key(workspace,username)
);
create table if not exists sessions (
  token_hash text primary key, workspace text not null, username text not null, expires timestamptz not null default now()+interval '12 hours',
  foreign key(workspace,username) references staff on delete cascade
);
create table if not exists login_limits (
  key text primary key, hits integer not null, expires timestamptz not null
);
create table if not exists products (
  id uuid primary key default gen_random_uuid(), workspace text not null references workspaces on delete cascade,
  name text not null, category text not null check(category in ('Beer','Cider','Spirits','Mixers','Soft drinks')),
  price integer not null check(price between 1 and 100000), cost integer not null check(cost between 0 and 100000),
  stock integer not null check(stock between 0 and 100000), low integer not null check(low between 0 and 100000),
  active boolean not null default true
);
create index if not exists products_workspace on products(workspace);
create table if not exists sales (
  id uuid primary key, workspace text not null references workspaces on delete cascade, cashier text not null,
  payment text not null check(payment in ('cash','ecocash','card')), total integer not null default 0,
  cost integer not null default 0, lines jsonb not null default '[]', recorded_at timestamptz not null default now(),
  sold_at timestamptz not null default now(), tendered integer, fingerprint text
);
create index if not exists sales_workspace_time on sales(workspace,sold_at desc);
create table if not exists stock_movements (
  id bigint generated always as identity primary key, workspace text not null references workspaces on delete cascade,
  product uuid not null references products on delete cascade, delta integer not null,
  reason text not null, actor text not null, occurred_at timestamptz not null default now()
);
create index if not exists stock_movements_workspace_time on stock_movements(workspace,occurred_at desc);

create or replace function make_demo(p_id text, p_owner_hash text, p_cashier_hash text) returns void
language plpgsql as $$
begin
  insert into workspaces(id) values(p_id);
  insert into staff(workspace,username,display_name,role,password_hash) values
    (p_id,'owner','Demo Owner','owner',p_owner_hash),(p_id,'cashier','Demo Cashier','cashier',p_cashier_hash);
  insert into products(workspace,name,category,price,cost,stock,low) values
    (p_id,'Castle Lager','Beer',200,105,58,12),(p_id,'Zambezi Lager','Beer',200,104,42,12),
    (p_id,'Carling Black Label','Beer',200,105,36,12),(p_id,'Lion Lager','Beer',150,80,30,10),
    (p_id,'Hunters Gold','Cider',250,133,21,8),(p_id,'Savanna Dry','Cider',300,160,6,10),
    (p_id,'Jameson · Single','Spirits',350,170,46,8),(p_id,'Gordon’s Gin · Single','Spirits',250,116,30,8),
    (p_id,'Coca-Cola','Soft drinks',150,65,28,8),(p_id,'Sprite','Soft drinks',150,62,22,8),
    (p_id,'Tonic Water','Mixers',150,62,7,8),(p_id,'Still Water','Soft drinks',100,40,33,8);
  insert into sales(id,workspace,cashier,payment,total,cost,lines,recorded_at,sold_at,tendered)
  select gen_random_uuid(), p_id, 'cashier', (array['cash','ecocash','card'])[1+(n % 3)],
     p.price*q, p.cost*q, jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'qty',q,'price',p.price)),
     (date_trunc('day', now() at time zone 'Africa/Harare') at time zone 'Africa/Harare') - (d * interval '1 day')
       + (greatest(1, extract(hour from now() at time zone 'Africa/Harare')::int - (n % 8)) * interval '1 hour')
       - interval '1 hour',
     (date_trunc('day', now() at time zone 'Africa/Harare') at time zone 'Africa/Harare') - (d * interval '1 day')
       + (greatest(1, extract(hour from now() at time zone 'Africa/Harare')::int - (n % 8)) * interval '1 hour')
       - interval '1 hour',
     case when n % 3=0 then p.price*q end
  from generate_series(0,27) d
  cross join lateral generate_series(1,4+(d % 4)) n
  cross join lateral (select * from products where workspace=p_id order by name offset ((d*5+n*7)%12) limit 1) p
  cross join lateral (select 1+((d+n)%3) as q) qty;
end $$;

create or replace function checkout_sale(p_workspace text, p_user text, p_id uuid, p_payment text, p_tendered integer, p_items jsonb, p_sold_at timestamptz, p_fingerprint text)
returns jsonb language plpgsql as $$
declare item record; p products%rowtype; s sales%rowtype; t integer:=0; c integer:=0; receipt jsonb:='[]';
begin
  insert into sales(id,workspace,cashier,payment,tendered,sold_at,fingerprint)
    values(p_id,p_workspace,p_user,p_payment,p_tendered,p_sold_at,p_fingerprint) on conflict(id) do nothing;
  if not found then
    select * into s from sales where id=p_id and workspace=p_workspace and cashier=p_user and fingerprint=p_fingerprint;
    if not found then raise exception 'SALE_ID_CONFLICT'; end if;
  else
    for item in select * from jsonb_to_recordset(p_items) as i(id uuid, qty integer, price integer) order by id loop
      select * into p from products where id=item.id and workspace=p_workspace and active for update;
      if not found then raise exception 'ITEM_UNAVAILABLE'; end if;
      if p.price<>item.price then raise exception 'PRICE_CHANGED'; end if;
      if p.stock<item.qty then raise exception 'INSUFFICIENT_STOCK'; end if;
      t:=t+p.price*item.qty;
      c:=c+p.cost*item.qty;
      receipt:=receipt||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'qty',item.qty,'price',p.price));
      update products set stock=stock-item.qty where id=p.id;
      insert into stock_movements(workspace,product,delta,reason,actor) values(p_workspace,p.id,-item.qty,'Sale '||left(p_id::text,8),p_user);
    end loop;
    if p_payment='cash' and (p_tendered is null or p_tendered<t) then raise exception 'INSUFFICIENT_CASH'; end if;
    update sales set total=t,cost=c,lines=receipt where id=p_id returning * into s;
  end if;
  return to_jsonb(s)-'cost'-'workspace'-'fingerprint';
end $$;

create or replace function adjust_stock(p_workspace text, p_id uuid, p_delta integer, p_reason text, p_user text)
returns integer language plpgsql as $$
declare total integer;
begin
  update products set stock=stock+p_delta where workspace=p_workspace and id=p_id and stock+p_delta between 0 and 100000 returning stock into total;
  if not found then raise exception 'INVALID_STOCK'; end if;
  insert into stock_movements(workspace,product,delta,reason,actor) values(p_workspace,p_id,p_delta,p_reason,p_user);
  return total;
end $$;
