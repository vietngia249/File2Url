// ---------------------------------------------------------------------------
// upload.js — POST /upload route (Security-hardened & Stream Fixed)
//
// [FIX-1] Memory DoS: Streams directly to R2 bucket without buffering files into RAM.
// [FIX] Stream Deadlock: uploadFile() is called *concurrently* so the
//       multipart iterator does not hang while waiting for the stream to drain.
// ---------------------------------------------------------------------------
import { v4 as uuidv4 } from 'uuid';
import { query } from '../services/db.js';
import { StorageService } from '../services/storage/index.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-v2-key-change-in-prod';

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
    config: {
      rateLimit: {
        // Allow unmetered uploads for authenticated users (GDrive), strict limits for anonymous (R2)
        max: (request) => request.headers.authorization ? 10000 : 5,
        timeWindow: '1 hour'
      }
    },
  }, async (request, reply) => {

    // 1. Detect User Auth
    let userId = null;
    if (request.headers.authorization) {
      try {
        const token = request.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch (err) {
        return reply.code(401).send({ error: "Invalid auth token" });
      }
    }

    // 2. Hardware Kill-Switch: 9GB R2 Capacity Check (Billing Protection)
    if (!userId) {
      try {
        const usageRes = await query(`SELECT SUM(size_bytes) as total_bytes FROM files WHERE storage_provider = 'r2'`);
        const totalR2Bytes = parseInt(usageRes.rows[0].total_bytes || '0', 10);
        const R2_CAPACITY_LIMIT = 9n * 1024n * 1024n * 1024n; // BigInt to avoid precision issues just in case, though 9GB is within safe integer limit

        if (BigInt(totalR2Bytes) >= R2_CAPACITY_LIMIT) {
          return reply.code(507).send({
            error: "Public R2 Storage has reached its capacity limit. Please Login and connect Google Drive to continue uploading."
          });
        }
      } catch (err) {
        request.log.error({ err }, '[Upload] Failed to query R2 quota');
      }
    }

    const MAX_GUEST_SIZE = 50 * 1024 * 1024; // 50 MB
    const MAX_AUTH_SIZE = 2000 * 1024 * 1024; // 2000 MB (2GB)
    const currentLimitBytes = userId ? MAX_AUTH_SIZE : MAX_GUEST_SIZE;

    let parts;
    try {
      parts = request.parts({ limits: { fileSize: currentLimitBytes } });
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid multipart request' });
    }

    const fileId = uuidv4();
    const managementKey = uuidv4();
    const storageKey = `files/${fileId}`; // Default for R2

    let fileMeta = null;
    let exactExpiresAt = null;
    let maxViews = null;
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
            if (sizeBytes > currentLimitBytes) {
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

        const provider = userId ? 'gdrive' : 'r2';

        uploadPromise = StorageService.upload({
          stream: countingStream,
          provider,
          user_id: userId,
          metadata: {
            filename: fileMeta.filename,
            mimeType: fileMeta.mimetype,
            storageKey
          },
          logger: request.log
        });

      } else if (part.type === 'field') {
        if (part.fieldname === 'exact_expires_at') {
          const parsedDate = new Date(part.value);
          if (!isNaN(parsedDate.getTime())) {
            exactExpiresAt = parsedDate;
          }
        } else if (part.fieldname === 'max_views') {
          const pViews = parseInt(part.value, 10);
          if (!isNaN(pViews) && pViews > 0) {
            maxViews = pViews;
          }
        }
      }
    }

    // -------------------------------------------------------
    // Validation Before Wait
    // -------------------------------------------------------
    if (!uploadPromise || !fileMeta) {
      return reply.code(400).send({ error: 'Missing required field: file' });
    }

    // -------------------------------------------------------
    // Await background R2/GDrive Upload
    // -------------------------------------------------------
    let providerFileId = storageKey;
    try {
      const result = await uploadPromise;
      if (result && result.provider_file_id) {
        providerFileId = result.provider_file_id;
      }
    } catch (err) {
      if (err.message === 'FILE_TOO_LARGE') {
        const limitMB = userId ? 2000 : 50;
        return reply.code(413).send({ error: `File too large. Maximum size is ${limitMB}MB.` });
      }
      request.log.error({ err }, '[Upload] Storage upload failed');
      return reply.code(500).send({ error: 'File upload failed. Please try again.' });
    }

    // -------------------------------------------------------
    // Persist metadata to PostgreSQL
    // -------------------------------------------------------
    const storageProvider = userId ? 'gdrive' : 'r2';
    const retentionUntil = (!userId)
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null; // R2 keeps 30 days. GDrive is persistent.

    try {
      await query(
        `INSERT INTO files 
         (id, storage_provider, provider_file_id, storage_key, original_filename, content_type, size_bytes, expires_at, max_views, retention_until, user_id, management_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          fileId, storageProvider, providerFileId, storageKey,
          fileMeta.filename, fileMeta.mimetype, sizeBytes,
          exactExpiresAt, maxViews, retentionUntil, userId, managementKey
        ]
      );
    } catch (err) {
      request.log.error({ err }, '[Upload] DB insert failed');
      StorageService.delete({ storage_provider: storageProvider, provider_file_id: providerFileId, storage_key: storageKey, user_id: userId }, request.log).catch(() => { });
      return reply.code(500).send({ error: 'Failed to save file metadata.' });
    }

    const proto = request.headers['x-forwarded-proto'] || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host || `localhost:${process.env.PORT || 3000}`;
    return reply.code(201).send({
      url: `${proto}://${host}/file/${fileId}`,
      expires_at: exactExpiresAt ? exactExpiresAt.toISOString() : null,
      max_views: maxViews,
      management_key: managementKey
    });
  });
}
