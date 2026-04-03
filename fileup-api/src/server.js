// ---------------------------------------------------------------------------
// Imports — env vars are loaded by --env-file=.env Node flag (see package.json)
// This ensures process.env is populated BEFORE any ESM module is evaluated.
// ---------------------------------------------------------------------------
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';

import uploadRoute from './routes/upload.js';
import fileRoute from './routes/file.js';
import { startCleanupJob } from './jobs/cleanup.js';
import { pool } from './services/db.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  },
  // Increase body limit to allow multipart headers; actual file size is enforced in route
  bodyLimit: 110 * 1024 * 1024, // 110 MB headroom
});

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

// Rate limiting (global default)
await fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, context) => ({
    error: `Rate limit exceeded. Retry after ${context.after}.`,
  }),
});

// Multipart support for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files: 1,                     // one file per request
    fields: 5,
  },
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
await fastify.register(uploadRoute);
await fastify.register(fileRoute);

// Health check — useful for load balancers / uptime monitors
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = async (signal) => {
  fastify.log.info(`[Server] Received ${signal}, shutting down gracefully...`);
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
  fastify.log.info(`[Server] Listening on http://${HOST}:${PORT}`);

  // Start background cleanup job after server is up
  startCleanupJob();
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
