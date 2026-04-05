// ---------------------------------------------------------------------------
// file.js — GET /file/:id route (Security-hardened)
//
// SECURITY FIXES APPLIED:
//   [FIX-2] XSS & unsafe Content-Type: MIME type whitelist. Types not on the
//           "safe to inline" list are served with Content-Disposition: attachment,
//           forcing a browser download instead of rendering (prevents XSS via
//           SVG, HTML, JS, etc.).
//   [FIX-2] Added X-Content-Type-Options: nosniff header to prevent MIME
//           sniffing attacks in older browsers.
//   [FIX-4] UUID path param validation: regex check before any DB query to
//           prevent unnecessary DB load and potential injection vectors.
//   [FIX-9] Replaced console.log with request.log (Fastify structured logger).
// ---------------------------------------------------------------------------
import { query, pool } from '../services/db.js';
import { StorageService } from '../services/storage/index.js';
import { pipeline } from 'node:stream/promises';

// [FIX-4] UUID v4 regex — validate :id param before touching the database
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// [FIX-2] MIME types that browsers can safely render inline without XSS risk.
// Everything NOT in this set will be forced to download (attachment).
const SAFE_INLINE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'application/pdf',
  'text/plain',         // plain text is safe; HTML/JS/SVG are NOT
]);

/**
 * GET /file/:id
 *
 * Streams a stored file to the client.
 *
 * Security headers added:
 *   - X-Content-Type-Options: nosniff          [FIX-2]
 *   - Content-Disposition: attachment (unsafe types) [FIX-2]
 *
 * Errors:
 *   400 — invalid UUID format
 *   404 — file not found in DB
 *   403 — link has expired
 *   500 — R2 retrieval failure
 */
export default async function fileRoute(fastify) {
  
  // Endpoint Metadata cho Frontend Download Page (Không trừ view)
  fastify.get('/file/:id/info', async (request, reply) => {
    const { id } = request.params;
    if (!UUID_REGEX.test(id)) {
      return reply.code(400).send({ error: 'Invalid file ID format' });
    }

    try {
      const result = await query(
        `SELECT original_filename as "name", size_bytes as "size", expires_at, max_views, current_views 
         FROM files WHERE id = $1`, 
        [id]
      );
      const file = result.rows[0];
      
      if (!file) {
        return reply.code(404).send({ error: 'File not found' });
      }

      if (file.expires_at && new Date(file.expires_at) < new Date()) {
         return reply.code(403).send({ error: 'Link Expired' });
      }

      if (file.max_views !== null && file.current_views >= file.max_views) {
         return reply.code(403).send({ error: 'Max views reached' });
      }

      return reply.send({
        metadata: {
          name: file.name,
          size: file.size
        },
        expires_at: file.expires_at,
        max_views: file.max_views,
        current_views: file.current_views,
        url: `${request.protocol}://${request.hostname}/file/${id}`
      });

    } catch (err) {
      request.log.error({ err }, '[File Info] Lookup failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/file/:id', async (request, reply) => {
    const { id } = request.params;

    // [FIX-4] Validate UUID format BEFORE running any DB query.
    // Rejects obviously malformed IDs immediately (no DB round-trip).
    if (!UUID_REGEX.test(id)) {
      return reply.code(400).send({ error: 'Invalid file ID format' });
    }

    // -------------------------------------------------------
    // Lookup file metadata from DB with Atomic Lock (FOR UPDATE)
    // -------------------------------------------------------
    let file;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT id, storage_key, provider_file_id, storage_provider, user_id, 
                original_filename, content_type, size_bytes, expires_at,
                max_views, current_views
         FROM files
         WHERE id = $1 FOR UPDATE`,
        [id]
      );
      file = result.rows[0];

      if (!file) {
        await client.query('ROLLBACK');
        client.release();
        return reply.code(404).send({ error: 'File not found' });
      }

      // -------------------------------------------------------
      // Dual-Kill Expiry Check
      // -------------------------------------------------------
      if (file.expires_at && new Date(file.expires_at) < new Date()) {
        await client.query('ROLLBACK');
        client.release();
        return reply.code(403).send({
          error: 'This link has expired',
          expired_at: new Date(file.expires_at).toISOString(),
        });
      }

      if (file.max_views !== null && file.current_views >= file.max_views) {
        await client.query('ROLLBACK');
        client.release();
        return reply.code(403).send({ error: 'Maximum views reached for this file.' });
      }

      // Increment views
      await client.query('UPDATE files SET current_views = current_views + 1 WHERE id = $1', [id]);
      await client.query('COMMIT');
      
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      request.log.error({ err }, '[File] DB lookup/transaction failed');
      return reply.code(500).send({ error: 'Internal server error' });
    } finally {
      // Must release back to pool unless released in catch
      if (client) client.release();
    }

    // -------------------------------------------------------
    // Fetch from Provider (R2 or Google Drive) and stream to client
    // -------------------------------------------------------
    let fileStream;
    try {
      fileStream = await StorageService.getStream(file, request.log);
    } catch (err) {
      request.log.error({ err }, '[File] Storage provider fetch failed');
      return reply.code(500).send({ error: 'Failed to retrieve file' });
    }

    // [FIX-2] Determine disposition based on MIME type whitelist.
    // Unsafe types (HTML, SVG, JS, XML, etc.) are forced to download.
    const contentType = file.content_type || 'application/octet-stream';
    const filename = file.original_filename || 'download';

    const isSafeInline = SAFE_INLINE_TYPES.has(contentType.toLowerCase().split(';')[0].trim());
    
    // Cờ đặc biệt từ Frontend để cưỡng bức tải xuống thay vì View
    const forceDownload = request.query.download === '1';

    const disposition = (isSafeInline && !forceDownload)
      ? `inline; filename="${encodeURIComponent(filename)}"`
      : `attachment; filename="${encodeURIComponent(filename)}"`;   // force download

    // [FIX-2] Set security headers before streaming
    reply.headers({
      // Serve the Content-Type exactly as stored — do NOT allow the browser to sniff
      'Content-Type': contentType,
      // [FIX-2] Prevent MIME sniffing (e.g. treating text/plain as text/html)
      'X-Content-Type-Options': 'nosniff',
      // [FIX-2] Inline only for safe types; everything else forces a download
      'Content-Disposition': disposition,
      // Content-Length assists browsers with progress bars — safe to include
      ...(file.size_bytes ? { 'Content-Length': String(file.size_bytes) } : {}),
    });

    // Stream directly — do NOT buffer in memory
    try {
      await pipeline(fileStream, reply.raw);
    } catch (err) {
      // Client may have disconnected mid-stream — log but don't send a new response
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        request.log.error({ err }, '[File] Stream pipeline error');
      }
    }
  });
}
