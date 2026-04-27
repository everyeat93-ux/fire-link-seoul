const { Client } = require('pg');

const connectionString = 'postgresql://postgres:h8CGRYh4TV3eQOrG@db.rymjkjizakeuhkueinig.supabase.co:5432/postgres';

const sql = `
-- 1. 건물을 저장할 테이블이 없으면 생성
create table if not exists buildings (
  id text primary key,
  name text,
  address text,
  lat double precision,
  lng double precision,
  has_photos boolean default false
);

-- 2. 누락된 컬럼들 추가 (이미 있으면 무시)
do $$ 
begin 
  if not exists (select 1 from information_schema.columns where table_name='buildings' and column_name='field_note') then
    alter table buildings add column field_note text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='buildings' and column_name='photo1_x') then
    alter table buildings add column photo1_x double precision;
    alter table buildings add column photo1_y double precision;
    alter table buildings add column photo2_x double precision;
    alter table buildings add column photo2_y double precision;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='buildings' and column_name='user_edited_name') then
    alter table buildings add column user_edited_name text;
    alter table buildings add column user_edited_address text;
    alter table buildings add column floors text;
    alter table buildings add column visited_at timestamptz default now();
    alter table buildings add column device_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='buildings' and column_name='registered_at') then
    alter table buildings add column registered_at timestamptz;
    alter table buildings add column edited_by text;
    alter table buildings add column edited_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='buildings' and column_name='photo1_path') then
    alter table buildings add column photo1_path text;
    alter table buildings add column photo2_path text;
  end if;
end $$;

-- 3. 보안 정책 설정
alter table buildings enable row level security;
drop policy if exists "Allow public read/write for buildings" on buildings;
create policy "Allow public read/write for buildings" on buildings for all using (true) with check (true);
`;

async function setup() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Connected to Supabase DB.');
    await client.query(sql);
    console.log('Tables and policies created successfully!');
  } catch (err) {
    console.error('Error setting up database:', err);
  } finally {
    await client.end();
  }
}

setup();
