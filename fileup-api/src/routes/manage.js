// ---------------------------------------------------------------------------
// manage.js — GET/DELETE /manage/:key route (Security-hardened)
//
// Tính năng thêm: Cho phép dùng management_key thao tác với file
// ---------------------------------------------------------------------------
import { query } from '../services/db.js';
import { deleteFile } from '../services/storage.js';

export default async function manageRoute(fastify) {
  
  // 1. Xem thông tin file dựa trên secret key
  fastify.get('/manage/:key', async (request, reply) => {
    const { key } = request.params;

    // Reject chuỗi quá ngắn hoặc quá dài (dựa vào cấu trúc UUID/HEX của bạn)
    if (!key || key.length < 10 || key.length > 64) {
      return reply.code(400).send({ error: 'Invalid management key format' });
    }

    try {
      const result = await query(
        `SELECT id, original_filename, size_bytes, expires_at, created_at
         FROM files
         WHERE management_key = $1`,
        [key]
      );
      
      const file = result.rows[0];
      if (!file) {
        return reply.code(404).send({ error: 'File not found or already deleted' });
      }

      // Xây dựng response
      const proto = request.headers['x-forwarded-proto'] || 'http';
      const host = request.headers['x-forwarded-host'] || request.headers.host || `localhost:${process.env.PORT || 3000}`;
      const baseUrl = `${proto}://${host}`;

      return reply.send({
        id: file.id,
        filename: file.original_filename,
        size_bytes: file.size_bytes,
        url: `${baseUrl}/file/${file.id}`,
        created_at: file.created_at,
        expires_at: file.expires_at || null,       // null = không bao giờ hết hạn
        is_expired: file.expires_at ? new Date(file.expires_at) < new Date() : false
      });

    } catch (err) {
      request.log.error({ err }, '[Manage] DB lookup failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // 2. Xoá file vĩnh viễn bằng secret key
  fastify.delete('/manage/:key', async (request, reply) => {
    const { key } = request.params;

    if (!key || key.length < 10 || key.length > 64) {
      return reply.code(400).send({ error: 'Invalid management key format' });
    }

    try {
      const result = await query(
        `SELECT id, storage_key FROM files WHERE management_key = $1`,
        [key]
      );
      
      const file = result.rows[0];
      if (!file) {
        return reply.code(404).send({ error: 'File not found or already deleted' });
      }

      // 1. Xoá trên storage
      await deleteFile(file.storage_key, request.log);
      
      // 2. Xoá trên db
      await query(`DELETE FROM files WHERE id = $1`, [file.id]);

      return reply.send({ success: true, message: 'File has been deleted successfully.' });

    } catch (err) {
      request.log.error({ err }, '[Manage] Delete failed');
      return reply.code(500).send({ error: 'Deletion failed. Please try again.' });
    }
  });
}
