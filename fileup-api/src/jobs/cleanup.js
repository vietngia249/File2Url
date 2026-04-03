import { query } from '../services/db.js';
import { deleteFile } from '../services/storage.js';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 100;

/**
 * Single cleanup run:
 * - Finds expired files with delete_after_expiry = true
 * - Deletes them from R2 and PostgreSQL
 * - Fault-tolerant: logs errors per-record, does not abort the loop
 */
async function runCleanup() {
  console.log('[Cleanup] Starting cleanup run...');

  let rows;
  try {
    const result = await query(
      `SELECT id, storage_key
       FROM files
       WHERE expires_at < now()
         AND delete_after_expiry = true
       LIMIT $1`,
      [BATCH_SIZE]
    );
    rows = result.rows;
  } catch (err) {
    console.error('[Cleanup] Failed to query expired files:', err.message);
    return;
  }

  if (rows.length === 0) {
    console.log('[Cleanup] No expired files to clean up.');
    return;
  }

  console.log(`[Cleanup] Found ${rows.length} expired file(s) to delete.`);

  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // 1. Delete from R2
      await deleteFile(row.storage_key);

      // 2. Delete from DB
      await query('DELETE FROM files WHERE id = $1', [row.id]);

      deleted++;
      console.log(`[Cleanup] Deleted file: ${row.id} (key: ${row.storage_key})`);
    } catch (err) {
      // Log and continue — do NOT let one failure abort others
      failed++;
      console.error(`[Cleanup] Failed to delete file ${row.id}: ${err.message}`);
    }
  }

  console.log(`[Cleanup] Run complete. Deleted: ${deleted}, Failed: ${failed}`);
}

/**
 * Start the recurring cleanup job.
 * Runs immediately on startup, then every CLEANUP_INTERVAL_MS.
 */
export function startCleanupJob() {
  // Run once immediately on startup (non-blocking)
  runCleanup().catch((err) => console.error('[Cleanup] Initial run error:', err.message));

  const interval = setInterval(() => {
    runCleanup().catch((err) => console.error('[Cleanup] Interval run error:', err.message));
  }, CLEANUP_INTERVAL_MS);

  // Prevent the interval from blocking Node.js process exit
  interval.unref();

  console.log(`[Cleanup] Job scheduled every ${CLEANUP_INTERVAL_MS / 1000}s`);
}
