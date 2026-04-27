/**
 * Supabase REST API를 통해 photo1_path, photo2_path 컬럼을 추가합니다.
 * (직접 DB 연결이 안 될 때 사용)
 */

const SUPABASE_URL = 'https://rymjkjizakeuhkueinig.supabase.co';
// service_role key가 필요합니다. anon key로는 DDL 실행 불가.
// Supabase 대시보드 > Project Settings > API > service_role key를 여기에 붙여넣으세요.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function runMigration() {
  if (!SERVICE_ROLE_KEY) {
    console.log('\n⚠️  SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
    console.log('Supabase 대시보드에서 수동으로 SQL을 실행해 주세요:\n');
    console.log(`-- Supabase SQL Editor에서 실행하세요:`);
    console.log(`ALTER TABLE buildings ADD COLUMN IF NOT EXISTS photo1_path text;`);
    console.log(`ALTER TABLE buildings ADD COLUMN IF NOT EXISTS photo2_path text;`);
    console.log(`ALTER TABLE buildings ADD COLUMN IF NOT EXISTS registered_at timestamptz;`);
    console.log(`ALTER TABLE buildings ADD COLUMN IF NOT EXISTS edited_by text;`);
    console.log(`ALTER TABLE buildings ADD COLUMN IF NOT EXISTS edited_at timestamptz;`);
    return;
  }

  const sql = `
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS photo1_path text;
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS photo2_path text;
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS registered_at timestamptz;
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS edited_by text;
    ALTER TABLE buildings ADD COLUMN IF NOT EXISTS edited_at timestamptz;
  `;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });

  const result = await response.json();
  console.log('Migration result:', result);
}

runMigration();
