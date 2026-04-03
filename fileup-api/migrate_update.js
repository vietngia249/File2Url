import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('Running DB updates for Management Key feature...');
    // 1. Add management_key column
    await pool.query('ALTER TABLE files ADD COLUMN IF NOT EXISTS management_key VARCHAR(64);');
    // 2. Create index
    await pool.query('CREATE INDEX IF NOT EXISTS idx_management_key ON files(management_key);');
    // 3. Drop NOT NULL constraint on expires_at to allow "never expire" (0 days)
    await pool.query('ALTER TABLE files ALTER COLUMN expires_at DROP NOT NULL;');
    
    console.log('✅ DB migrated successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await pool.end();
  }
}

runMigration();
