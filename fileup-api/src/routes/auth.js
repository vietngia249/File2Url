// ---------------------------------------------------------------------------
// auth.js — User Authentication & Google OAuth Connecting Routes
// ---------------------------------------------------------------------------
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { google } from 'googleapis';
import { query } from '../services/db.js';
import { oauth2Client } from '../services/storage/gdrive_auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-v2-key-change-in-prod';

export default async function authRoutes(fastify) {
  
  // 1. Đăng ký Tài khoản nội bộ
  fastify.post('/auth/register', async (request, reply) => {
    const { email, password } = request.body;
    
    if (!email || !password || password.length < 6) {
      return reply.code(400).send({ error: "Invalid email or password too short." });
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await query(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
        [email, hash]
      );
      return reply.code(201).send(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') { // Postgres Unique Constraint Violation
        return reply.code(409).send({ error: "Email already exists." });
      }
      request.log.error({ err }, '[Auth] Register Error');
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  // 2. Đăng nhập và lấy JWT Token
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body;

    try {
      const result = await query(`SELECT id, password_hash FROM users WHERE email = $1`, [email]);
      const user = result.rows[0];

      if (!user) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
         return reply.code(401).send({ error: "Invalid credentials" });
      }

      // Generate JWT Token
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
      return reply.send({ token });

    } catch (err) {
      request.log.error({ err }, '[Auth] Login Error');
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  });

  // 3. Request URL đăng nhập Google OAuth để cấp quyền Google Drive & SSO
  fastify.get('/auth/google/url', async (request, reply) => {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/drive.file'
    ];

    const returnTo = request.query.returnTo || 'https://file2url-nsdd.onrender.com';
    const jwtToken = request.headers.authorization ? request.headers.authorization.split(' ')[1] : '';

    const stateObj = { jwt: jwtToken, returnTo };
    const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // BẮT BUỘC để lấy Refresh Token
      prompt: 'consent',      // Bắt buộc để Google chịu nhả Refresh Token
      scope: scopes,
      state: stateStr
    });

    return reply.send({ url });
  });

  // 4. Callback hứng code từ Google trả về
  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code, state } = request.query;

    if (!code || !state) {
      return reply.code(400).send({ error: "Thiếu code hoặc state" });
    }

    try {
      const stateObj = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      const jwtToken = stateObj.jwt;
      const returnTo = stateObj.returnTo;

      // Đổi auth code sang Access và Refresh Tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Fetch User Info từ Google
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      const googleEmail = userInfo.data.email;

      let userId = null;

      // Kịch bản 1: User đã đăng nhập sẵn trên web (Có truyền jwt)
      if (jwtToken) {
        try {
          const decoded = jwt.verify(jwtToken, JWT_SECRET);
          userId = decoded.id;
        } catch (err) {
           request.log.warn("Provided JWT in state was invalid, falling back to Google Email matching.");
        }
      }

      // Kịch bản 2: User chưa đăng nhập -> Tìm trong DB theo Google Email
      if (!userId) {
        const result = await query(`SELECT id FROM users WHERE email = $1`, [googleEmail]);
        if (result.rows.length > 0) {
          userId = result.rows[0].id;
        } else {
          // Kịch bản 3: Email lạ -> Tạo account mới tự động (SSO Register)
          const randomPass = crypto.randomBytes(16).toString('hex');
          const hash = await bcrypt.hash(randomPass, 10);
          const insertResult = await query(
            `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
            [googleEmail, hash]
          );
          userId = insertResult.rows[0].id;
        }
      }

      const newExpiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

      // Lưu trữ/Cập nhật Config Storage Drive
      await query(
        `INSERT INTO user_storage_configs (user_id, provider, access_token, refresh_token, token_expires_at)
         VALUES ($1, 'google_drive', $2, $3, $4)
         ON CONFLICT (user_id, provider) 
         DO UPDATE SET 
            access_token = EXCLUDED.access_token,
            refresh_token = COALESCE(EXCLUDED.refresh_token, user_storage_configs.refresh_token),
            token_expires_at = EXCLUDED.token_expires_at`,
        [userId, tokens.access_token, tokens.refresh_token, newExpiryDate]
      );

      // Generate lại JWT Token quyền lực mới
      const finalToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });

      // Redirect quay về Frontend Web
      return reply.redirect(`${returnTo}?token=${finalToken}`);
      
    } catch (err) {
      request.log.error({ err }, '[Auth] Google OAuth Callback Error');
      return reply.code(500).send({ error: "Google Integration Failed." });
    }
  });

}
