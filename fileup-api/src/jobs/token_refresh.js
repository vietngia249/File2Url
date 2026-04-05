// ---------------------------------------------------------------------------
// token_refresh.js — Background token renewal job
// Automatically checks for Google Drive refresh tokens close to expiry and renews them.
// ---------------------------------------------------------------------------
import { query } from '../services/db.js';
import { getValidAccessToken } from '../services/storage/gdrive_auth.js';

const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // Check every 1 hour

async function runTokenRefresh(log) {
  log.info('[TokenRefresh] Starting auto-refresh sweep');

  try {
    // Tìm các token sắp hết hạn trong vòng 2 tiếng tới
    const result = await query(
      `SELECT user_id 
       FROM user_storage_configs 
       WHERE provider = 'google_drive' 
         AND token_expires_at < now() + INTERVAL '2 hours'
         AND refresh_token IS NOT NULL`
    );

    const users = result.rows;

    if (users.length === 0) {
      log.info('[TokenRefresh] No tokens require immediate refresh');
      return;
    }

    log.info({ count: users.length }, '[TokenRefresh] Refreshing tokens');

    for (const row of users) {
      try {
        // Hàm này tự xử lý việc fetch API và update DB
        await getValidAccessToken(row.user_id);
      } catch (err) {
        log.error({ err, userId: row.user_id }, '[TokenRefresh] Failed to refresh token for user');
      }
    }
    
    log.info('[TokenRefresh] Sweep completed successfully');
  } catch (err) {
    log.error({ err }, '[TokenRefresh] Failed to query user configs');
  }
}

export function startTokenRefreshJob(log) {
  runTokenRefresh(log).catch(err => log.error({err}, '[TokenRefresh] Initial error'));

  const interval = setInterval(() => {
    runTokenRefresh(log).catch(err => log.error({err}, '[TokenRefresh] Interval error'));
  }, REFRESH_INTERVAL_MS);

  interval.unref();
  log.info('[TokenRefresh] Job scheduled');
}
