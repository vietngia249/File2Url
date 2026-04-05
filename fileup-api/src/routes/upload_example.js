// ---------------------------------------------------------------------------
// upload_example.js — Fastify Route showing GDrive Implementation
// ---------------------------------------------------------------------------
import { v4 as uuidv4 } from 'uuid';
import { getValidAccessToken } from '../services/storage/gdrive_auth.js';
import { uploadStreamToGDrive } from '../services/storage/gdrive.js';
import { query } from '../services/db.js';

export default async function uploadRoute(fastify) {
  fastify.post('/upload/gdrive', async (request, reply) => {
    // 1. JWT Authentication extraction (Assume pre-validated by hook)
    // const userId = request.user.id;
    const userId = "d0bc1c79-c5ab-4c22-b5e0-47b198b11abc"; // Mock Authenticated User

    let parts;
    try {
      parts = request.parts({ limits: { fileSize: NaN } }); // NaN = no hard buffer limit in fastify multipart
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid multipart request' });
    }

    const fileId = uuidv4();
    const managementKey = uuidv4();
    let fileMeta = null;
    let sizeBytes = 0;
    
    let uploadPromise = null;

    try {
      // 2. Fetch fresh Google Drive Access Token
      const currentAccessToken = await getValidAccessToken(userId);

      // 3. Process the multipart stream concurrently
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          fileMeta = {
            filename: part.filename || 'upload',
            mimeType: part.mimetype || 'application/octet-stream',
          };

          // ⚠️ IMPORTANT: We consume the part.file directly via our upload module.
          // We DO NOT await it here inside the loop. We keep the promise reference 
          // because we must consume the stream concurrently before Fastify hangs.
          uploadPromise = uploadStreamToGDrive(
            part.file,
            fileMeta,
            { access_token: currentAccessToken },
            request.log // Fastify structured logger
          );

        } else if (part.type === 'field') {
          // Parse expire_at, max_views ...
        }
      }

      if (!uploadPromise || !fileMeta) {
         return reply.code(400).send({ error: 'Missing required field: file' });
      }

      // 4. Wait for the chunked Google Drive upload to finalize
      const gDriveResult = await uploadPromise;
      
      const providerFileId = gDriveResult.fileId;
      sizeBytes = gDriveResult.size;

      // 5. Save to DB safely
      await query(
        `INSERT INTO files 
         (id, storage_provider, provider_file_id, original_filename, content_type, size_bytes, max_views, user_id, management_key)
         VALUES ($1, 'gdrive', $2, $3, $4, $5, $6, $7, $8)`,
        [fileId, providerFileId, fileMeta.filename, fileMeta.mimeType, sizeBytes, 10, userId, managementKey]
      );

      return reply.code(201).send({
         message: "Successfully uploaded to Google Drive using Resumable Stream",
         file_id: fileId,
         gdrive_id: providerFileId,
         bytes: sizeBytes
      });

    } catch (err) {
      request.log.error({ err }, '[Upload Route] GDrive upload pipeline failed');
      return reply.code(500).send({ error: "Upload failed: " + err.message });
    }
  });
}
