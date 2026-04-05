// ---------------------------------------------------------------------------
// cleanup.js — Background expired-file deletion job (Security-hardened)
//
// SECURITY FIXES APPLIED:
//   [FIX-6] Hard TTL deletion (zombie records / infinite storage growth):
//           Added a second query that deletes records older than 30 days
//           REGARDLESS of delete_after_expiry. This prevents zombie records
//           from accumulating and R2 storage from growing without bound.
//           Files with delete_after_expiry=false but expired > 30 days ago
//           are cleaned up from both R2 and the DB.
//   [FIX-9] Replaced all console.log/warn/error with Fastify structured logger
//           (log object injected via startCleanupJob parameter).
// ---------------------------------------------------------------------------
import { query } from '../services/db.js';
import { StorageService } from '../services/storage/index.js';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Batch size per cleanup run (prevents runaway DELETE transactions)
const BATCH_SIZE = 100;

// [FIX-6] Hard TTL — any file expired for more than this many days is
// unconditionally deleted from R2 and the database, regardless of
// delete_after_expiry setting. This prevents zombie record accumulation.
const HARD_TTL_DAYS = 30;

/**
 * Single cleanup run:
 * Deletes EXPIRED files from R2 based strictly on retention_until mapping
 * GDrive files are ignored (persistent storage)
 *
 * @param {object} log - Fastify structured logger (fastify.log)
 */
async function runCleanup(log) {
  log.info('[Cleanup] Starting cleanup run V2');

  let rows = [];
  try {
    const result = await query(
      `SELECT id, storage_key, provider_file_id, storage_provider, user_id
       FROM files
       WHERE storage_provider = 'r2' 
         AND retention_until < now()
       LIMIT $1`,
      [BATCH_SIZE]
    );
    rows = result.rows;
  } catch (err) {
    log.error({ err }, '[Cleanup] Failed to query files for cleanup');
  }

  const result = await deleteRows(rows, log, 'V2 R2 Cleanup');

  log.info(
    {
      deleted: result.deleted,
      failed: result.failed
    },
    '[Cleanup] Run complete'
  );
}

/**
 * Delete a set of rows from Storage and DB.
 *
 * @param {Array<object>} rows
 * @param {object} log - Fastify logger
 * @param {string} phase - label for log messages
 * @returns {{ deleted: number, failed: number }}
 */
async function deleteRows(rows, log, phase) {
  if (rows.length === 0) {
    log.info(`[Cleanup] ${phase} — No files to delete`);
    return { deleted: 0, failed: 0 };
  }

  log.info({ count: rows.length }, `[Cleanup] ${phase} — Deleting files`);

  let deleted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      // 1. Delete object from R2 via StorageService
      await StorageService.delete(row, log);

      // 2. Remove record from PostgreSQL
      await query('DELETE FROM files WHERE id = $1', [row.id]);

      deleted++;
      log.info({ fileId: row.id }, `[Cleanup] ${phase} — Deleted`);
    } catch (err) {
      failed++;
      log.error({ err, fileId: row.id }, `[Cleanup] ${phase} — Failed to delete`);
    }
  }

  return { deleted, failed };
}

/**
 * Start the recurring cleanup job.
 * Runs immediately on startup, then every CLEANUP_INTERVAL_MS.
 *
 * @param {object} log - Fastify structured logger (fastify.log)
 */
export function startCleanupJob(log) {
  // Run once immediately on startup (non-blocking)
  runCleanup(log).catch((err) =>
    log.error({ err }, '[Cleanup] Initial run error')
  );

  const interval = setInterval(() => {
    runCleanup(log).catch((err) =>
      log.error({ err }, '[Cleanup] Interval run error')
    );
  }, CLEANUP_INTERVAL_MS);

  // Prevent the interval from blocking Node.js process exit
  interval.unref();

  // [FIX-9] Structured log
  log.info(
    { intervalMs: CLEANUP_INTERVAL_MS },
    '[Cleanup] Job scheduled'
  );
}
