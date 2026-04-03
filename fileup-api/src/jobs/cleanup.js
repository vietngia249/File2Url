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
import { deleteFile } from '../services/storage.js';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Batch size per cleanup run (prevents runaway DELETE transactions)
const BATCH_SIZE = 100;

// [FIX-6] Hard TTL — any file expired for more than this many days is
// unconditionally deleted from R2 and the database, regardless of
// delete_after_expiry setting. This prevents zombie record accumulation.
const HARD_TTL_DAYS = 30;

/**
 * Single cleanup run:
 *   Phase 1 — Delete files where delete_after_expiry = true (existing behavior)
 *   Phase 2 — [FIX-6] Delete ALL files expired > HARD_TTL_DAYS ago (new)
 *
 * Fault-tolerant: logs errors per-record, does not abort the loop.
 *
 * @param {object} log - Fastify structured logger (fastify.log)
 */
async function runCleanup(log) {
  log.info('[Cleanup] Starting cleanup run');

  // -------------------------------------------------------------------------
  // Phase 1: delete_after_expiry = true (immediate deletion on expiry)
  // -------------------------------------------------------------------------
  let softRows = [];
  try {
    const result = await query(
      `SELECT id, storage_key
       FROM files
       WHERE expires_at < now()
         AND delete_after_expiry = true
       LIMIT $1`,
      [BATCH_SIZE]
    );
    softRows = result.rows;
  } catch (err) {
    log.error({ err }, '[Cleanup] Phase 1 — Failed to query soft-delete files');
  }

  const softResult = await deleteRows(softRows, log, 'Phase 1 (soft-delete)');

  // -------------------------------------------------------------------------
  // [FIX-6] Phase 2: Hard TTL — delete anything expired over HARD_TTL_DAYS
  // regardless of the delete_after_expiry flag.
  //
  // This prevents:
  //   - Zombie DB records for files users "chose to keep" but never accessed
  //   - Unbounded R2 storage growth
  //   - Stale metadata in PostgreSQL accumulating forever
  // -------------------------------------------------------------------------
  let hardRows = [];
  try {
    const result = await query(
      `SELECT id, storage_key
       FROM files
       WHERE expires_at < now() - INTERVAL '${HARD_TTL_DAYS} days'
       LIMIT $1`,
      [BATCH_SIZE]
    );
    hardRows = result.rows;
  } catch (err) {
    log.error({ err }, '[Cleanup] Phase 2 — Failed to query hard-TTL files');
  }

  const hardResult = await deleteRows(hardRows, log, `Phase 2 (hard-TTL >${HARD_TTL_DAYS}d)`);

  log.info(
    {
      softDeleted: softResult.deleted,
      softFailed: softResult.failed,
      hardDeleted: hardResult.deleted,
      hardFailed: hardResult.failed,
    },
    '[Cleanup] Run complete'
  );
}

/**
 * Delete a set of rows from R2 and DB.
 * Fault-tolerant: continues on per-row errors.
 *
 * @param {Array<{id: string, storage_key: string}>} rows
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
      // 1. Delete object from R2 (idempotent — safe if already gone)
      await deleteFile(row.storage_key, log);

      // 2. Remove record from PostgreSQL
      await query('DELETE FROM files WHERE id = $1', [row.id]);

      deleted++;
      log.info({ fileId: row.id, key: row.storage_key }, `[Cleanup] ${phase} — Deleted`);
    } catch (err) {
      // Log and continue — do NOT let one failure abort others
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
    { intervalMs: CLEANUP_INTERVAL_MS, hardTtlDays: HARD_TTL_DAYS },
    '[Cleanup] Job scheduled'
  );
}
