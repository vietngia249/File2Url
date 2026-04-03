import { query } from '../services/db.js';
import { getFileStream } from '../services/storage.js';
import { pipeline } from 'node:stream/promises';

/**
 * GET /file/:id
 *
 * Streams a stored file to the client.
 *
 * Errors:
 *   404 — file not found in DB
 *   403 — link has expired
 *   500 — R2 retrieval failure
 */
export default async function fileRoute(fastify) {
  fastify.get('/file/:id', async (request, reply) => {
    const { id } = request.params;

    // -------------------------------------------------------
    // Lookup file metadata from DB
    // -------------------------------------------------------
    let file;
    try {
      const result = await query(
        `SELECT id, storage_key, original_filename, content_type, size_bytes, expires_at
         FROM files
         WHERE id = $1`,
        [id]
      );
      file = result.rows[0];
    } catch (err) {
      request.log.error({ err }, 'DB lookup failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }

    if (!file) {
      return reply.code(404).send({ error: 'File not found' });
    }

    // -------------------------------------------------------
    // Expiry check
    // -------------------------------------------------------
    if (new Date(file.expires_at) < new Date()) {
      return reply.code(403).send({
        error: 'This link has expired',
        expired_at: new Date(file.expires_at).toISOString(),
      });
    }

    // -------------------------------------------------------
    // Fetch from R2 and stream to client
    // -------------------------------------------------------
    let fileStream;
    try {
      fileStream = await getFileStream(file.storage_key);
    } catch (err) {
      request.log.error({ err }, 'R2 fetch failed');
      return reply.code(500).send({ error: 'Failed to retrieve file' });
    }

    const filename = file.original_filename || 'download';
    const contentType = file.content_type || 'application/octet-stream';

    // Set response headers before streaming
    reply.headers({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      ...(file.size_bytes ? { 'Content-Length': String(file.size_bytes) } : {}),
    });

    // Stream directly — do NOT buffer in memory
    try {
      await pipeline(fileStream, reply.raw);
    } catch (err) {
      // Client may have disconnected mid-stream — log but don't send a new response
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        request.log.error({ err }, 'Stream pipeline error');
      }
    }
  });
}
