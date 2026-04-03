// ---------------------------------------------------------------------------
// storage.js — Cloudflare R2 service (Security-hardened)
//
// SECURITY FIXES APPLIED:
//   [FIX-1] Memory DoS: Replaced Buffer.concat + PutObjectCommand with
//           @aws-sdk/lib-storage Upload class. File data is streamed in
//           chunks directly to R2 — never fully buffered in RAM.
//   [FIX-2] Retry logic bug: Upload class handles internal retries with a
//           fresh multipart upload. It does NOT re-read an exhausted stream.
//   [FIX-3] console.log replaced with exported logger-compatible functions.
//           Callers must pass fastify.log as the logger parameter.
// ---------------------------------------------------------------------------
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
// [FIX-1] Import Upload from lib-storage for true streaming multipart upload
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'node:stream';

if (
  !process.env.R2_ENDPOINT ||
  !process.env.R2_ACCESS_KEY ||
  !process.env.R2_SECRET_KEY ||
  !process.env.R2_BUCKET
) {
  throw new Error(
    'R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET environment variables are required'
  );
}

const BUCKET = process.env.R2_BUCKET;

/**
 * Cloudflare R2 client (S3-compatible).
 * forcePathStyle = false is correct for R2 virtual-hosted-style.
 */
const s3 = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
  forcePathStyle: false,
});

/**
 * Upload a readable stream to R2 using multipart streaming.
 *
 * [FIX-1] Uses @aws-sdk/lib-storage Upload class instead of PutObjectCommand.
 *   - Data is piped in chunks (default 5 MB parts) — RAM usage is O(chunk)
 *     not O(file_size).
 *   - Automatic multipart upload for files > 5 MB.
 *
 * [FIX-2] Upload class internally manages retries per-part. It never attempts
 *   to re-read a stream from the beginning, which would fail on a Node.js
 *   Readable that has already been consumed.
 *
 * @param {string}   key         - storage key (e.g. "files/{uuid}")
 * @param {Readable} bodyStream  - readable stream from multipart (NOT buffered)
 * @param {string}   contentType - MIME type (validated upstream)
 * @param {number}   sizeBytes   - file size in bytes (for Content-Length hint)
 * @param {object}   log         - Fastify structured logger (fastify.log)
 */
export async function uploadFile(key, bodyStream, contentType, sizeBytes, log) {
  // [FIX-1] Stream directly to R2 — no Buffer.concat, no full-file RAM buffer
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: key,
      Body: bodyStream,           // Node.js Readable — streamed in parts
      ContentType: contentType,
      // ContentLength is omitted intentionally: lib-storage uses chunked transfer
    },
    // Part size: 8 MB chunks. Minimum allowed by S3 API is 5 MB.
    partSize: 8 * 1024 * 1024,
    // Max concurrent part uploads (controls memory ceiling)
    queueSize: 2,
  });

  // [FIX-2] lib-storage retries each individual part on transient errors
  // without needing to re-read the stream from the start.
  await upload.done();

  // [FIX-3] Use structured logger (passed by caller) instead of console.log
  log.info({ key, sizeBytes }, '[Storage] Upload complete');
}

/**
 * Get a readable stream for a file stored in R2.
 * Caller is responsible for piping to the HTTP response.
 *
 * @param {string} key - storage key
 * @returns {Promise<Readable>}
 */
export async function getFileStream(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const response = await s3.send(cmd);
  // response.Body is an AWS SdkStream; convert to Node.js Readable
  return Readable.from(response.Body);
}

/**
 * Delete a file from R2 storage.
 *
 * @param {string} key - storage key
 * @param {object} [log] - optional Fastify logger
 */
export async function deleteFile(key, log) {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
  await s3.send(cmd);
  // [FIX-3] Use structured logger when available, fall back to no-op
  if (log) {
    log.info({ key }, '[Storage] Deleted object');
  }
}
