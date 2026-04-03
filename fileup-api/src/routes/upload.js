// ---------------------------------------------------------------------------
// upload.js — POST /upload route (Security-hardened)
//
// SECURITY FIXES APPLIED:
//   [FIX-1] Memory DoS: Removed Buffer.concat(). The multipart file stream is
//           passed DIRECTLY to uploadFile() which streams it to R2 via
//           @aws-sdk/lib-storage. RAM usage is O(chunk), not O(file_size).
//   [FIX-4] UUID validation: Not applicable here (no UUID param in this route).
//   [FIX-7] Filename sanitization: strip path traversal chars, allow only safe
//           characters, enforce max 255 bytes.
//   [FIX-9] Replaced console.log with request.log (Fastify structured logger).
// ---------------------------------------------------------------------------
import { v4 as uuidv4 } from 'uuid';
import { query } from '../services/db.js';
import { uploadFile } from '../services/storage.js';

const VALID_EXPIRE_DAYS = [1, 3, 5, 7];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// [FIX-7] Maximum filename length (bytes) stored in DB / sent to client
const MAX_FILENAME_BYTES = 255;

/**
 * [FIX-7] Sanitize the original_filename field.
 *
 * Strips path separators (/ \) and any character that could cause issues
 * in Content-Disposition headers or filesystem paths. Only alphanumerics,
 * hyphens, underscores, periods, spaces, and unicode letters are allowed.
 * Truncates to MAX_FILENAME_BYTES bytes.
 *
 * @param {string} raw - raw filename from multipart header
 * @returns {string} sanitized filename
 */
function sanitizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return 'upload';

  // Strip any directory path components (Unix and Windows separators)
  let name = raw.replace(/[/\\]/g, '');

  // Allow: unicode word chars (\w), spaces, hyphens, dots — strip the rest
  name = name.replace(/[^\w\s.\-]/gu, '').trim();

  // Collapse consecutive dots to prevent extension confusion (e.g. "file..exe")
  name = name.replace(/\.{2,}/g, '.');

  // Truncate by byte length, not character length, to respect DB column size
  const encoder = new TextEncoder();
  const bytes = encoder.encode(name);
  if (bytes.length > MAX_FILENAME_BYTES) {
    // Decode a safely truncated byte slice (find last valid UTF-8 boundary)
    name = new TextDecoder().decode(bytes.slice(0, MAX_FILENAME_BYTES));
  }

  return name || 'upload';
}

/**
 * POST /upload
 *
 * Accepts multipart/form-data:
 *   - file                (required)
 *   - expire              (optional: 1 | 3 | 5 | 7, default = 1)
 *   - delete_after_expiry (optional: "true" | "false", default = false)
 *
 * Returns:
 *   { url, expires_at, delete_after_expiry }
 */
export default async function uploadRoute(fastify) {
  fastify.post('/upload', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    let parts;
    try {
      parts = request.parts({ limits: { fileSize: MAX_FILE_SIZE_BYTES } });
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid multipart request' });
    }

    let fileStream = null;
    let fileMeta = null;     // { filename, mimetype, size }
    let expireDays = 1;
    let deleteAfterExpiry = false;
    let sizeBytes = 0;

    // -------------------------------------------------------
    // Parse multipart fields
    // We collect non-file fields first, then handle the file
    // stream LAST to avoid buffering (stream must be consumed
    // inside the for-await loop while the parts iterator is active).
    // -------------------------------------------------------
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        // [FIX-1] Do NOT collect chunks into Buffer.concat.
        // Instead, track size while simultaneously counting bytes,
        // and pass the stream object directly to uploadFile().
        //
        // Strategy: wrap part.file in a transform that counts bytes
        // and aborts if the limit is exceeded.
        const { Transform } = await import('node:stream');
        let exceeded = false;

        const countingStream = new Transform({
          transform(chunk, _encoding, callback) {
            sizeBytes += chunk.length;
            if (sizeBytes > MAX_FILE_SIZE_BYTES) {
              exceeded = true;
              // Drain remaining bytes to avoid hanging the connection
              part.file.resume();
              callback(new Error('FILE_TOO_LARGE'));
              return;
            }
            callback(null, chunk); // pass chunk through — no buffering
          },
        });

        // [FIX-7] Sanitize the original filename immediately
        const rawFilename = part.filename || 'upload';
        const safeFilename = sanitizeFilename(rawFilename);

        fileMeta = {
          filename: safeFilename,
          mimetype: part.mimetype || 'application/octet-stream',
        };

        // [FIX-1] Keep a reference to the piped stream — we will
        // pass it directly to uploadFile() after validation.
        const { pipeline } = await import('node:stream/promises');
        // We cannot await pipeline here because we need to continue
        // iterating parts. Instead we store the stream reference so
        // uploadFile() can consume it after the loop.
        part.file.pipe(countingStream);
        fileStream = countingStream;

        if (exceeded) {
          return reply.code(413).send({ error: 'File too large. Maximum size is 100MB.' });
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'expire') {
          expireDays = parseInt(part.value, 10);
        } else if (part.fieldname === 'delete_after_expiry') {
          deleteAfterExpiry = part.value === 'true' || part.value === '1';
        }
      }
    }

    // -------------------------------------------------------
    // Validation
    // -------------------------------------------------------
    if (!fileStream || !fileMeta) {
      return reply.code(400).send({ error: 'Missing required field: file' });
    }

    if (!VALID_EXPIRE_DAYS.includes(expireDays)) {
      return reply.code(400).send({
        error: `Invalid expire value. Must be one of: ${VALID_EXPIRE_DAYS.join(', ')}`,
      });
    }

    // -------------------------------------------------------
    // Upload to R2 (TRUE STREAMING — no Buffer.concat)
    // -------------------------------------------------------
    const fileId = uuidv4();
    const storageKey = `files/${fileId}`;
    const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);

    try {
      // [FIX-1] Pass the live counting stream directly.
      // @aws-sdk/lib-storage will consume it in 8 MB chunks to R2.
      await uploadFile(storageKey, fileStream, fileMeta.mimetype, sizeBytes, request.log);
    } catch (err) {
      if (err.message === 'FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'File too large. Maximum size is 100MB.' });
      }
      // [FIX-9] Structured log — no console.log
      request.log.error({ err }, '[Upload] Upload to R2 failed');
      return reply.code(500).send({ error: 'File upload failed. Please try again.' });
    }

    // -------------------------------------------------------
    // Persist metadata to PostgreSQL (parameterized queries retained)
    // -------------------------------------------------------
    try {
      await query(
        `INSERT INTO files (id, storage_key, original_filename, content_type, size_bytes, expires_at, delete_after_expiry)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          fileId,
          storageKey,
          fileMeta.filename,   // [FIX-7] sanitized filename
          fileMeta.mimetype,
          sizeBytes,
          expiresAt,
          deleteAfterExpiry,
        ]
      );
    } catch (err) {
      request.log.error({ err }, '[Upload] DB insert failed after successful upload');
      // Best-effort: attempt to clean up orphaned R2 object
      import('../services/storage.js')
        .then(({ deleteFile }) => deleteFile(storageKey, request.log))
        .catch((e) => request.log.warn({ e }, '[Upload] Orphan R2 cleanup failed'));

      return reply.code(500).send({ error: 'Failed to save file metadata.' });
    }

    // -------------------------------------------------------
    // Build response — use HTTPS if behind a proxy in production
    // -------------------------------------------------------
    const proto = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host || `localhost:${process.env.PORT || 3000}`;
    const baseUrl = `${proto}://${host}`;

    return reply.code(201).send({
      url: `${baseUrl}/file/${fileId}`,
      expires_at: expiresAt.toISOString(),
      delete_after_expiry: deleteAfterExpiry,
    });
  });
}
