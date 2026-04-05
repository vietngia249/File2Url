// ---------------------------------------------------------------------------
// manage.js — GET/DELETE /manage/:key route (Security-hardened)
//
// Tính năng thêm: Cho phép dùng management_key thao tác với file
// ---------------------------------------------------------------------------
import { query } from '../services/db.js';
import { StorageService } from '../services/storage/index.js';

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
        `SELECT id, original_filename, size_bytes, expires_at, created_at,
                max_views, current_views, storage_provider
         FROM files
         WHERE management_key = $1`,
        [key]
      );
      
      const file = result.rows[0];
      if (!file) {
        return reply.code(404).send({ error: 'File not found or already deleted' });
      }

      // Tái cấu trúc response V2
      const proto = request.headers['x-forwarded-proto'] || 'http';
      const host = request.headers['x-forwarded-host'] || request.headers.host || `localhost:${process.env.PORT || 3000}`;
      const baseUrl = `${proto}://${host}`;

      return reply.send({
        id: file.id,
        filename: file.original_filename,
        size_bytes: file.size_bytes,
        url: `${baseUrl}/file/${file.id}`,
        created_at: file.created_at,
        expires_at: file.expires_at || null,
        max_views: file.max_views,
        current_views: file.current_views,
        storage_provider: file.storage_provider,
        is_expired: file.expires_at ? new Date(file.expires_at) < new Date() : false
      });

    } catch (err) {
      request.log.error({ err }, '[Manage] DB lookup failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // 2. Chỉnh sửa tham số cấu hình bằng secret key
  fastify.patch('/manage/:key', async (request, reply) => {
    const { key } = request.params;
    const { expires_at, max_views } = request.body || {};

    if (!key || key.length < 10 || key.length > 64) {
      return reply.code(400).send({ error: 'Invalid management key format' });
    }

    try {
      const result = await query(`SELECT id FROM files WHERE management_key = $1`, [key]);
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: 'File not found' });
      }

      await query(
        `UPDATE files 
         SET expires_at = COALESCE($1, expires_at), 
             max_views = COALESCE($2, max_views) 
         WHERE management_key = $3`,
        [expires_at !== undefined ? expires_at : null, max_views !== undefined ? max_views : null, key]
      );

      return reply.send({ success: true, message: 'Settings updated successfully' });
    } catch (err) {
      request.log.error({ err }, '[Manage] Update failed');
      return reply.code(500).send({ error: 'Update failed. Please try again.' });
    }
  });

  // 3. Xoá file vĩnh viễn bằng secret key
  fastify.delete('/manage/:key', async (request, reply) => {
    const { key } = request.params;

    if (!key || key.length < 10 || key.length > 64) {
      return reply.code(400).send({ error: 'Invalid management key format' });
    }

    try {
      const result = await query(
        `SELECT id, storage_key, provider_file_id, storage_provider, user_id FROM files WHERE management_key = $1`,
        [key]
      );
      
      const file = result.rows[0];
      if (!file) {
        return reply.code(404).send({ error: 'File not found or already deleted' });
      }

      // 1. Xoá trên storage abstract layer
      await StorageService.delete(file, request.log);
      
      // 2. Xoá trên db
      await query(`DELETE FROM files WHERE id = $1`, [file.id]);

      return reply.send({ success: true, message: 'File has been deleted successfully.' });

    } catch (err) {
      request.log.error({ err }, '[Manage] Delete failed');
      return reply.code(500).send({ error: 'Deletion failed. Please try again.' });
    }
  });
}
