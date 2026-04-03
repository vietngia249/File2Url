import { v4 as uuidv4 } from 'uuid';
import { query } from '../services/db.js';
import { uploadFile } from '../services/storage.js';

const VALID_EXPIRE_DAYS = [1, 3, 5, 7];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

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

    let fileField = null;
    let expireDays = 1;
    let deleteAfterExpiry = false;
    let sizeBytes = 0;

    // -------------------------------------------------------
    // Parse multipart fields
    // -------------------------------------------------------
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        fileField = part;
        // We must consume the stream *inside* the loop while parts iterator is active
        // Collect metadata and buffer stream here
        const chunks = [];
        let exceeded = false;

        for await (const chunk of part.file) {
          sizeBytes += chunk.length;
          if (sizeBytes > MAX_FILE_SIZE_BYTES) {
            exceeded = true;
            // Drain remaining data to avoid hanging connection
            part.file.resume();
            break;
          }
          chunks.push(chunk);
        }

        if (exceeded) {
          return reply.code(413).send({ error: 'File too large. Maximum size is 100MB.' });
        }

        fileField = {
          filename: part.filename || 'unknown',
          mimetype: part.mimetype || 'application/octet-stream',
          buffer: Buffer.concat(chunks),
          size: sizeBytes,
        };
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
    if (!fileField) {
      return reply.code(400).send({ error: 'Missing required field: file' });
    }

    if (!VALID_EXPIRE_DAYS.includes(expireDays)) {
      return reply.code(400).send({
        error: `Invalid expire value. Must be one of: ${VALID_EXPIRE_DAYS.join(', ')}`,
      });
    }

    // -------------------------------------------------------
    // Upload to R2
    // -------------------------------------------------------
    const fileId = uuidv4();
    const storageKey = `files/${fileId}`;
    const expiresAt = new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000);

    try {
      // Storage service accepts a stream; wrap buffer as readable
      const { Readable } = await import('node:stream');
      const bufferStream = Readable.from(fileField.buffer);

      await uploadFile(storageKey, bufferStream, fileField.mimetype, fileField.size);
    } catch (err) {
      request.log.error({ err }, 'Upload to R2 failed');
      return reply.code(500).send({ error: 'File upload failed. Please try again.' });
    }

    // -------------------------------------------------------
    // Persist metadata to PostgreSQL
    // -------------------------------------------------------
    try {
      await query(
        `INSERT INTO files (id, storage_key, original_filename, content_type, size_bytes, expires_at, delete_after_expiry)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          fileId,
          storageKey,
          fileField.filename,
          fileField.mimetype,
          fileField.size,
          expiresAt,
          deleteAfterExpiry,
        ]
      );
    } catch (err) {
      request.log.error({ err }, 'DB insert failed after successful upload');
      // Best-effort: attempt to clean up orphaned R2 object
      import('../services/storage.js')
        .then(({ deleteFile }) => deleteFile(storageKey))
        .catch((e) => request.log.warn({ e }, 'Orphan R2 cleanup failed'));

      return reply.code(500).send({ error: 'Failed to save file metadata.' });
    }

    // -------------------------------------------------------
    // Build response
    // -------------------------------------------------------
    const baseUrl = `http://${request.headers.host || `localhost:${process.env.PORT || 3000}`}`;

    return reply.code(201).send({
      url: `${baseUrl}/file/${fileId}`,
      expires_at: expiresAt.toISOString(),
      delete_after_expiry: deleteAfterExpiry,
    });
  });
}
