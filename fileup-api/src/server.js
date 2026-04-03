// ---------------------------------------------------------------------------
// server.js — Fastify server entry point (Security-hardened)
//
// SECURITY FIXES APPLIED:
//   [FIX-5] Rate limiting behind proxy: trustProxy: true tells Fastify to
//           trust X-Forwarded-For / CF-Connecting-IP headers. Rate limiter
//           uses the real client IP, not the proxy IP.
//   [FIX-5] Rate limiter keyGenerator uses CF-Connecting-IP (Cloudflare) with
//           fallback to X-Forwarded-For, then socket IP.
//   [FIX-8] CORS: @fastify/cors registered with an explicit allowed origin
//           from the ALLOWED_ORIGIN env var. Wildcard ("*") is deliberately
//           avoided to prevent cross-origin credential misuse.
//   [FIX-9] All console.log replaced with fastify.log (pino structured logger).
// ---------------------------------------------------------------------------
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
// [FIX-8] CORS plugin
import cors from '@fastify/cors';

import uploadRoute from './routes/upload.js';
import fileRoute from './routes/file.js';
import manageRoute from './routes/manage.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { pool } from './services/db.js';

// ---------------------------------------------------------------------------
// Server configuration
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// [FIX-8] CORS allowed origin — must be set explicitly in production.
// Example: ALLOWED_ORIGIN=https://yourfrontend.com
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

const fastify = Fastify({
  // [FIX-9] Fastify's built-in pino logger — structured JSON in production
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined, // In production, emit raw JSON (consumed by log aggregators)
  },

  // [FIX-5] Trust the proxy (Cloudflare / nginx) so that Fastify reads the
  // real client IP from X-Forwarded-For / CF-Connecting-IP instead of the
  // proxy's IP. Without this, ALL requests appear to come from one IP and
  // the rate limiter becomes useless.
  trustProxy: true,

  // Body limit covers multipart headers; actual file size is enforced in route
  bodyLimit: 110 * 1024 * 1024, // 110 MB headroom
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

// [FIX-8] CORS — explicit allowed origin only, no wildcard
await fastify.register(cors, {
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Credentials support if your frontend needs cookies/auth headers
  credentials: false,
});

// [FIX-5] Rate limiting — now reads real IP because trustProxy is enabled
await fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',

  // [FIX-5] Key function: prefer CF-Connecting-IP (set by Cloudflare CDN),
  // fall back to first entry in X-Forwarded-For, then socket remote address.
  keyGenerator(request) {
    return (
      request.headers['cf-connecting-ip'] ||
      (request.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      request.socket.remoteAddress
    );
  },

  errorResponseBuilder: (_req, context) => ({
    error: `Rate limit exceeded. Retry after ${context.after}.`,
  }),
});

// Multipart support for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB hard cap
    files: 1,                     // one file per request
    fields: 5,
  },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
await fastify.register(uploadRoute);
await fastify.register(fileRoute);
await fastify.register(manageRoute);

// Health check — useful for load balancers / uptime monitors
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = async (signal) => {
  // [FIX-9] Structured log
  fastify.log.info({ signal }, '[Server] Received signal, shutting down gracefully');
  await fastify.close();
  await pool.end();
  fastify.log.info('[Server] Server closed.');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info({ port: PORT, host: HOST }, '[Server] Listening');

  // Start background cleanup job after server is up
  startCleanupJob(fastify.log);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
