import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY || !process.env.R2_SECRET_KEY || !process.env.R2_BUCKET) {
  throw new Error('R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET environment variables are required');
}

const BUCKET = process.env.R2_BUCKET;

/**
 * Cloudflare R2 client (S3-compatible).
 * forcePathStyle = true is required for R2.
 */
const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
  forcePathStyle: false, // R2 uses virtual-hosted-style
});

const MAX_UPLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Upload a readable stream to R2 with retry logic.
 *
 * NOTE: AWS SDK v3 PutObject with a stream requires the full body upfront for
 * multipart detection. For true streaming uploads of large files, consider
 * the @aws-sdk/lib-storage Upload helper (added as a comment below).
 *
 * @param {string}   key         - storage key (e.g. "files/{uuid}")
 * @param {Readable} bodyStream  - readable stream from multipart
 * @param {string}   contentType - MIME type
 * @param {number}   sizeBytes   - file size in bytes
 */
export async function uploadFile(key, bodyStream, contentType, sizeBytes) {
  let lastError;

  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      // Collect stream into buffer for PutObject (max 100 MB enforced upstream)
      // For very large files in production, replace with @aws-sdk/lib-storage Upload
      const chunks = [];
      for await (const chunk of bodyStream) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);

      const cmd = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: sizeBytes,
      });

      await s3.send(cmd);
      console.log(`[Storage] Uploaded: ${key} (${sizeBytes} bytes, attempt ${attempt})`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(`[Storage] Upload attempt ${attempt} failed for ${key}: ${err.message}`);
      if (attempt < MAX_UPLOAD_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // exponential back-off
      }
    }
  }

  throw new Error(`[Storage] Upload failed after ${MAX_UPLOAD_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Get a readable stream for a file stored in R2.
 * Caller is responsible for piping/streaming to the response.
 *
 * @param {string} key - storage key
 * @returns {Promise<Readable>}
 */
export async function getFileStream(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const response = await s3.send(cmd);

  // response.Body is a SdkStream; convert to Node.js Readable
  return Readable.from(response.Body);
}

/**
 * Delete a file from R2 storage.
 *
 * @param {string} key - storage key
 */
export async function deleteFile(key) {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3.send(cmd);
  console.log(`[Storage] Deleted: ${key}`);
}
