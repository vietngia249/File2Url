// ---------------------------------------------------------------------------
// auth.js — User Authentication & Google OAuth Connecting Routes
// ---------------------------------------------------------------------------
import bcrypt from 'bcrypt'; // Needs npm install bcrypt
import jwt from 'jsonwebtoken'; // Needs npm install jsonwebtoken
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

  // 3. Request URL đăng nhập Google OAuth để cấp quyền Google Drive
  fastify.get('/auth/google/url', async (request, reply) => {
    const scopes = [
      'https://www.googleapis.com/auth/drive.file', // Chỉ lấy quyền ném file vào Drive do App này tạo
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // BẮT BUỘC để lấy Refresh Token
      prompt: 'consent',      // Bắt buộc để Google chịu nhả Refresh Token cho lần cấp quyền lại
      scope: scopes,
      // Gắn state an toàn chống CSRF (Ví dụ jwt token của user)
      state: request.headers.authorization ? request.headers.authorization.split(' ')[1] : ''
    });

    return reply.send({ url });
  });

  // 4. Callback hứng code từ Google trả về
  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code, state: jwtToken } = request.query;

    if (!code || !jwtToken) {
      return reply.code(400).send({ error: "Thiếu code hoặc User Session Auth" });
    }

    try {
      let decoded;
      try {
        decoded = jwt.verify(jwtToken, JWT_SECRET);
      } catch (err) {
         return reply.code(401).send({ error: "Token chứng thực không hợp lệ." });
      }

      const userId = decoded.id;

      // Đổi auth code sang Access và Refresh Tokens
      const { tokens } = await oauth2Client.getToken(code);
      
      const newExpiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

      // Lưu trữ/Cập nhật vào Database (Bảng user_storage_configs)
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

      return reply.send({ success: true, message: "Drive Integration Successful!" });
    } catch (err) {
      request.log.error({ err }, '[Auth] Google OAuth Callback Error');
      return reply.code(500).send({ error: "Google Integration Failed." });
    }
  });

}
