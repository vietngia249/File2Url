// ---------------------------------------------------------------------------
// index.js — Storage Abstraction Layer (StorageService)
// Proxies storage requests to either R2 or Google Drive dynamically.
// ---------------------------------------------------------------------------
import { uploadFile as uploadToR2, getFileStream as getR2Stream, deleteFile as deleteFromR2 } from '../storage.js'; // Fallback to existing logic
import { uploadStreamToGDrive } from './gdrive.js';
import { getValidAccessToken } from './gdrive_auth.js';
import { google } from 'googleapis';

export const StorageService = {
  /**
   * Upload dynamic router
   */
  async upload(config) {
    const { stream, provider, metadata, user_id, logger } = config;
    
    if (provider === 'gdrive') {
       if (!user_id) throw new Error('user_id required for gdrive upload');
       // Get token
       const token = await getValidAccessToken(user_id);
       // Upload using our chunked module
       const result = await uploadStreamToGDrive(stream, metadata, { access_token: token }, logger);
       return { provider_file_id: result.fileId, size: result.size };
    } 
    else if (provider === 'r2') {
       // Using original R2 logic (which uploads and returns via metadata.storageKey normally)
       const { storageKey } = metadata;
       await uploadToR2(storageKey, stream, metadata.mimeType, 0, logger);
       return { provider_file_id: storageKey, size: null /* size counted by stream outside usually */ };
    }
    throw new Error('Unknown storage provider: ' + provider);
  },

  /**
   * Download dynamic router
   */
  async getStream(fileRecord, logger) {
    if (fileRecord.storage_provider === 'gdrive') {
      const token = await getValidAccessToken(fileRecord.user_id);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: token });
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      try {
        const response = await drive.files.get(
          { fileId: fileRecord.provider_file_id, alt: 'media' },
          { responseType: 'stream' }
        );
        return response.data; // Raw node stream
      } catch (err) {
        logger.error({ err }, '[StorageService] GDrive getStream error');
        throw new Error('Failed to fetch stream from Google Drive');
      }
    } 
    else {
      // Default R2
      return await getR2Stream(fileRecord.storage_key || fileRecord.provider_file_id);
    }
  },

  /**
   * Delete dynamic router
   */
  async delete(fileRecord, logger) {
    if (fileRecord.storage_provider === 'gdrive') {
      const token = await getValidAccessToken(fileRecord.user_id);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: token });
      const drive = google.drive({ version: 'v3', auth: oauth2Client });

      try {
         await drive.files.delete({ fileId: fileRecord.provider_file_id });
         logger.info(`[StorageService] Deleted file ${fileRecord.provider_file_id} from GDrive`);
      } catch (err) {
         logger.error({ err }, '[StorageService] GDrive delete error');
         // Non-fatal if already deleted
      }
    } 
    else {
      await deleteFromR2(fileRecord.storage_key || fileRecord.provider_file_id, logger);
    }
  }
};
