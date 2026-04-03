// ---------------------------------------------------------------------------
// upload.js — POST /upload route (Security-hardened & Stream Fixed)
//
// [FIX-1] Memory DoS: Streams directly to R2 bucket without buffering files into RAM.
// [FIX] Stream Deadlock: uploadFile() is called *concurrently* so the
//       multipart iterator does not hang while waiting for the stream to drain.
// ---------------------------------------------------------------------------
import { v4 as uuidv4 } from 'uuid';
import { query } from '../services/db.js';
import { uploadFile } from '../services/storage.js';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_FILENAME_BYTES = 255;

function sanitizeFilename(raw) {
  if (!raw || typeof raw !== 'string') return 'upload';
  let name = raw.replace(/[/\\]/g, '');
  name = name.replace(/[^\w\s.\-]/gu, '').trim();
  name = name.replace(/\.{2,}/g, '.');
  const encoder = new TextEncoder();
  const bytes = encoder.encode(name);
  if (bytes.length > MAX_FILENAME_BYTES) {
    name = new TextDecoder().decode(bytes.slice(0, MAX_FILENAME_BYTES));
  }
  return name || 'upload';
}

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

    const fileId = uuidv4();
    const managementKey = uuidv4(); 
    const storageKey = `files/${fileId}`;

    let fileMeta = null;     
    let expireDays = 1;      
    let deleteAfterExpiry = false;
    let sizeBytes = 0;
    
    let uploadPromise = null;

    // -------------------------------------------------------
    // Parse multipart fields AND consume stream concurrently
    // -------------------------------------------------------
    for await (const part of parts) {
      if (part.type === 'file' && part.fieldname === 'file') {
        const { Transform } = await import('node:stream');
        
        const countingStream = new Transform({
          transform(chunk, _encoding, callback) {
            sizeBytes += chunk.length;
            if (sizeBytes > MAX_FILE_SIZE_BYTES) {
              part.file.resume(); // drain remaining
              callback(new Error('FILE_TOO_LARGE'));
              return;
            }
            callback(null, chunk);
          },
        });

        fileMeta = {
          filename: sanitizeFilename(part.filename || 'upload'),
          mimetype: part.mimetype || 'application/octet-stream',
        };

        // Pipe to our transform
        part.file.pipe(countingStream);
        
        // --- STREAM DEADLOCK FIX ---
        // Instead of waiting for the for-await loop to finish, we MUST
        // start draining the stream immediately. Otherwise `part` stalls.
        uploadPromise = uploadFile(storageKey, countingStream, fileMeta.mimetype, 0, request.log);

      } else if (part.type === 'field') {
        if (part.fieldname === 'expire') {
          const parsedDays = parseInt(part.value, 10);
          if (!isNaN(parsedDays)) {
            expireDays = parsedDays;
          }
        } else if (part.fieldname === 'delete_after_expiry') {
          deleteAfterExpiry = part.value === 'true' || part.value === '1';
        }
      }
    }

    // -------------------------------------------------------
    // Validation Before Wait
    // -------------------------------------------------------
    if (!uploadPromise || !fileMeta) {
      return reply.code(400).send({ error: 'Missing required field: file' });
    }
    if (expireDays < 0) {
      return reply.code(400).send({ error: `Invalid expire value. Must be 0 or a positive number.` });
    }

    const expiresAt = expireDays > 0 
        ? new Date(Date.now() + expireDays * 24 * 60 * 60 * 1000) 
        : null;

    // -------------------------------------------------------
    // Await background R2 Upload
    // -------------------------------------------------------
    try {
      await uploadPromise;
    } catch (err) {
      if (err.message === 'FILE_TOO_LARGE') {
        return reply.code(413).send({ error: 'File too large. Maximum size is 100MB.' });
      }
      request.log.error({ err }, '[Upload] Upload to R2 failed');
      return reply.code(500).send({ error: 'File upload failed. Please try again.' });
    }

    // -------------------------------------------------------
    // Persist metadata to PostgreSQL
    // -------------------------------------------------------
    try {
      await query(
        `INSERT INTO files (id, storage_key, original_filename, content_type, size_bytes, expires_at, delete_after_expiry, management_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ fileId, storageKey, fileMeta.filename, fileMeta.mimetype, sizeBytes, expiresAt, deleteAfterExpiry, managementKey ]
      );
    } catch (err) {
      request.log.error({ err }, '[Upload] DB insert failed');
      import('../services/storage.js')
        .then(({ deleteFile }) => deleteFile(storageKey, request.log))
        .catch(() => {});
      return reply.code(500).send({ error: 'Failed to save file metadata.' });
    }

    const proto = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host || `localhost:${process.env.PORT || 3000}`;
    return reply.code(201).send({
      url: `${proto}://${host}/file/${fileId}`,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      delete_after_expiry: deleteAfterExpiry,
      management_key: managementKey
    });
  });
}
