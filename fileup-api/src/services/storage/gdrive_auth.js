// ---------------------------------------------------------------------------
// gdrive_auth.js — Google OAuth2 Authentication & Token Refresh Service
// ---------------------------------------------------------------------------
import { google } from 'googleapis';
import { query } from '../db.js'; // Assuming standard DB pool from v1

/**
 * Singleton OAuth2 Client initialized with environment secrets
 */
export const oauth2Client = new google.auth.OAuth2(
  process.env.GDRIVE_CLIENT_ID,
  process.env.GDRIVE_CLIENT_SECRET,
  process.env.GDRIVE_REDIRECT_URI
);

/**
 * Retrieves a valid access token for a given user.
 * Automatically refreshes the token via Google API if it has expired.
 * 
 * @param {string} userId - UUID of the user in database
 * @returns {Promise<string>} Valid access_token
 */
export async function getValidAccessToken(userId) {
  // 1. Fetch user's stored tokens from the DB
  const result = await query(
    `SELECT access_token, refresh_token, token_expires_at 
     FROM user_storage_configs 
     WHERE user_id = $1 AND provider = 'google_drive'`,
    [userId]
  );

  const config = result.rows[0];
  if (!config) {
    throw new Error('User does not have Google Drive configured.');
  }

  const { access_token, refresh_token, token_expires_at } = config;

  // 2. Check if token is expired (adding 5 minute safety buffer)
  const isExpired = new Date() >= new Date(new Date(token_expires_at).getTime() - 5 * 60 * 1000);

  if (!isExpired) {
    return access_token;
  }

  if (!refresh_token) {
    throw new Error('Access token expired and no refresh token available to renew it.');
  }

  // 3. Token is expired. Perform automatic refresh using googleapis.
  oauth2Client.setCredentials({
    access_token,
    refresh_token,
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();

    // 4. Persist newly acquired tokens back to Database
    const newExpiryDate = new Date(credentials.expiry_date);
    
    await query(
      `UPDATE user_storage_configs 
       SET access_token = $1, 
           refresh_token = $2, 
           token_expires_at = $3
       WHERE user_id = $4 AND provider = 'google_drive'`,
      [
        credentials.access_token,
        credentials.refresh_token || refresh_token, // Google sometimes omits refresh_token on refresh
        newExpiryDate,
        userId
      ]
    );

    return credentials.access_token;
  } catch (err) {
    throw new Error(`Failed to refresh Google Drive token: ${err.message}`);
  }
}
