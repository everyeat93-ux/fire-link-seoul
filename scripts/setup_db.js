const { Client } = require('pg');

const connectionString = 'postgresql://postgres.rymjkjizakeuhkueinig:h8CGRYh4TV3eQOrG@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres';

const sql = `
-- 1. 건물을 저장할 테이블 생성
create table if not exists buildings (
  id text primary key,
  name text,
  user_edited_name text,
  address text,
  user_edited_address text,
  lat double precision,
  lng double precision,
  floors text,
  has_photos boolean default false,
  visited_at timestamptz default now(),
  registered_at timestamptz,
  edited_by text,
  edited_at timestamptz,
  device_id text
);

-- 2. 보안 정책 설정
alter table buildings enable row level security;

-- 기존 정책이 있으면 삭제 후 재생성
drop policy if exists "Allow public read/write for buildings" on buildings;

-- 3. 사진 저장용 스토리지 버킷 생성
insert into storage.buckets (id, name, public) 
values ('building-photos', 'building-photos', true)
on conflict (id) do nothing;

-- 4. 스토리지 보안 정책 (누구나 업로드 및 조회 허용)
create policy "Public Access" on storage.objects for all using ( bucket_id = 'building-photos' );
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
