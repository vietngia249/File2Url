// ---------------------------------------------------------------------------
// gdrive.js — Google Drive Resumable Upload + Streaming Service
// Produces memory-safe, chunked, retryable uploads.
// ---------------------------------------------------------------------------
import fetch from 'node-fetch'; // Requires node-fetch (or use native fetch in Node 18+)

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB (must be multiple of 256KB)

/**
 * Gets or creates the 'File2Url' folder in the user's Google Drive.
 * @param {string} accessToken
 * @param {Object} logger
 * @returns {Promise<string>} Folder ID
 */
async function getOrCreateFolder(accessToken, logger) {
  // 1. Check if folder exists
  const query = encodeURIComponent("name='File2Url' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name)`;
  
  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      if (logger) logger.info({ folderId: data.files[0].id }, '[GDrive] Found existing File2Url folder');
      return data.files[0].id;
    }
  }

  // 2. Create folder if not exists
  if (logger) logger.info('[GDrive] Creating new File2Url folder');
  const createUrl = 'https://www.googleapis.com/drive/v3/files';
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'File2Url',
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Failed to create File2Url folder: ${createRes.status} - ${errText}`);
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Creates a resumable upload session on Google Drive.
 * @param {string} accessToken - OAuth2 Access Token
 * @param {Object} metadata - File metadata (name, mimeType, parents)
 * @returns {Promise<string>} sessionUrl to be used for chunk uploads
 */
export async function createResumableSession(accessToken, metadata) {
  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': metadata.mimeType || 'application/octet-stream',
    },
    body: JSON.stringify({
      name: metadata.filename,
      mimeType: metadata.mimeType || 'application/octet-stream',
      ...(metadata.parents ? { parents: metadata.parents } : {})
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create upload session: ${response.status} - ${errText}`);
  }

  // The 'Location' header contains the session URL
  const sessionUrl = response.headers.get('Location');
  if (!sessionUrl) {
    throw new Error('Google did not return a Location header for resumable upload.');
  }

  return sessionUrl;
}

/**
 * Transforms an arbitrary async Node.js Readable stream into fixed-size chunks.
 * Ensures memory safety by keeping at most ~1.5x CHUNK_SIZE in memory.
 * Accurately detects the final chunk (isLast).
 * 
 * @param {import('stream').Readable} stream 
 * @param {number} chunkSize 
 */
export async function* streamToChunks(stream, chunkSize) {
  let buffer = Buffer.alloc(0);

  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    
    // We strictly wait until buffer is LARGER than chunkSize.
    // This allows us to guarantee that when we drain it, there is still data remaining.
    // Thus we know definitively when the stream has ended (isLast = true).
    while (buffer.length > chunkSize) {
      yield {
        data: buffer.subarray(0, chunkSize),
        isLast: false,
      };
      buffer = buffer.subarray(chunkSize);
    }
  }

  // Stream ended. Yield the remaining buffer as the final chunk.
  // Note: Google Drive supports 0-byte final chunk if stream was exact multiple of CHUNK_SIZE.
  yield {
    data: buffer,
    isLast: true,
  };
}

/**
 * Uploads a single chunk to the designated session URL.
 */
async function uploadChunk(sessionUrl, chunk, startByte, isLast, logger) {
  const endByte = startByte + chunk.length - 1;
  const totalSize = isLast ? (startByte + chunk.length) : '*';
  
  // Example: bytes 0-5242879/* (unknown total size) OR bytes 5242880-10485759/10485760 (final)
  const contentRange = chunk.length > 0
    ? `bytes ${startByte}-${endByte}/${totalSize}`
    : `bytes */${startByte}`; // 0-byte file edge case

  if (logger) logger.info({ startByte, endByte, totalSize, isLast }, '[GDrive] Uploading chunk');

  const response = await fetch(sessionUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': chunk.length.toString(),
      'Content-Range': contentRange
    },
    body: chunk
  });

  return response;
}

/**
 * Retrieves the current completed byte offset from Google servers if interrupted.
 */
async function resumeUpload(sessionUrl) {
  const response = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Range': 'bytes */*' }
  });

  if (response.status === 308) {
    const rangeHeader = response.headers.get('Range');
    // Range looks like: bytes=0-5242879
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=0-(\d+)/);
      if (match) {
        return parseInt(match[1], 10) + 1; // Next expected byte
      }
    }
    return 0; // No bytes stored
  }
  
  if (response.status === 200 || response.status === 201) {
    return -1; // Upload already complete
  }

  throw new Error(`Cannot resume, Google returned status: ${response.status}`);
}

/**
 * Streams an entire file to Google Drive using the Resumable protocol with retries.
 * 
 * @param {import('stream').Readable} stream Incoming file stream
 * @param {Object} metadata File metadata { filename, mimeType }
 * @param {Object} tokens User's OAuth tokens (must contain access_token)
 * @param {Object} logger Logger instance
 */
export async function uploadStreamToGDrive(stream, metadata, tokens, logger = console) {
  // 1. Get or create File2Url folder
  let folderId = null;
  try {
    folderId = await getOrCreateFolder(tokens.access_token, logger);
    metadata.parents = [folderId];
  } catch (e) {
    logger.warn({ err: e }, '[GDrive] Failed to structure into File2Url folder. Falling back to root directory.');
  }

  // 2. Create the session
  const sessionUrl = await createResumableSession(tokens.access_token, metadata);
  logger.info('[GDrive] Resumable session created successfully.');

  let startByte = 0;
  let fileData = null;

  // 2. Consume stream via our constant-memory chunk generator
  for await (const { data: chunk, isLast } of streamToChunks(stream, CHUNK_SIZE)) {
    let attempt = 0;
    const maxRetries = 3;
    let chunkUploadSuccess = false;

    while (attempt < maxRetries && !chunkUploadSuccess) {
      try {
        const response = await uploadChunk(sessionUrl, chunk, startByte, isLast, logger);

        // 308 Resume Incomplete -> Chunk accepted, expect more
        if (response.status === 308) {
          chunkUploadSuccess = true;
          startByte += chunk.length;
        } 
        // 200 / 201 Created -> Upload fully complete
        else if (response.status === 200 || response.status === 201) {
          fileData = await response.json();
          chunkUploadSuccess = true;
        } 
        // 4xx or 5xx -> Server error, throw to trigger retry
        else {
          throw new Error(`Google returned status ${response.status}: ${await response.text()}`);
        }
      } catch (err) {
        attempt++;
        logger.warn({ err, attempt }, '[GDrive] Chunk upload failed. Retrying...');
        
        if (attempt >= maxRetries) {
          throw new Error('Upload aborted: Maximum retries reached for chunk.');
        }

        // Wait before retrying (Exponential Backoff: 1s, 2s)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));

        // CRITICAL RETRY SYNC: Ask Google how many bytes it actually received
        // In case our connection dropped but Google received the previous PUT safely.
        try {
          const nextExpectedByte = await resumeUpload(sessionUrl);
          if (nextExpectedByte === -1) {
            // Unlikely case where the chunk we failed on actually finished the upload
            chunkUploadSuccess = true; 
            break; 
          }
          if (nextExpectedByte > startByte) {
            // Google successfully buffered part of the stream already
            // We adjust our chunk pointer forward so we don't upload duplicate bytes
            const diff = nextExpectedByte - startByte;
            if (diff >= chunk.length) {
              // Google got the whole chunk. We can move on.
              startByte += diff;
              chunkUploadSuccess = true;
            } else {
               // We only upload the remaining unsaved portion of our chunk
               const slicedChunk = chunk.subarray(diff);
               const newStartByte = startByte + diff;
               // Overwrite response of upload directly
               const res = await uploadChunk(sessionUrl, slicedChunk, newStartByte, isLast, logger);
               if (res.status === 308 || res.status === 200 || res.status === 201) {
                 chunkUploadSuccess = true;
                 if (res.status === 200 || res.status === 201) {
                   fileData = await res.json();
                 }
                 startByte += chunk.length; // Move global pointer by original chunk length
               } else {
                 throw new Error('Slicing chunk upload failed');
               }
            }
          }
        } catch (resumeErr) {
          logger.error({ resumeErr }, '[GDrive] Failed to query resume status.');
        }
      }
    } // end retry loop
  } // end stream consumption

  if (!fileData) {
    throw new Error('Stream finished but Google did not return a valid file completion JSON.');
  }

  logger.info({ fileId: fileData.id }, '[GDrive] Upload completely fully!');
  return {
    fileId: fileData.id,
    size: startByte, // Ensure final byte total matches
  };
}
