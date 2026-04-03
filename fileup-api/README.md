# 📖 README — Expiring File Link Service

A production-ready MVP that lets users upload files and receive temporary access links. Links expire after 1–7 days, and files can optionally be auto-deleted from Cloudflare R2 on expiry.

---

## 🗂️ Project Structure

```
fileup-api/
├── src/
│   ├── server.js              ← Fastify app entry point
│   ├── routes/
│   │   ├── upload.js          ← POST /upload
│   │   └── file.js            ← GET  /file/:id
│   ├── services/
│   │   ├── db.js              ← PostgreSQL pool + query helper
│   │   └── storage.js         ← Cloudflare R2 (S3 SDK v3)
│   └── jobs/
│       └── cleanup.js         ← Cleanup job (every 5 min)
├── migration.sql              ← Run once to create DB schema
├── .env.example               ← Copy to .env and fill values
└── package.json
```

---

## ⚡ Quick Start

### 1. Prerequisites

- Node.js >= 18
- A running PostgreSQL instance
- A Cloudflare R2 bucket with API credentials

### 2. Install Dependencies

```bash
cd fileup-api
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 4. Run Database Migration

```bash
psql $DATABASE_URL -f migration.sql
```

Or paste `migration.sql` contents directly into your DB client.

### 5. Start the Server

```bash
# Development (auto-restart on file change — Node 18+)
npm run dev

# Production
npm start
```

Server starts on `http://0.0.0.0:3000` by default.

---

## 📡 API Reference

### `POST /upload`

Upload a file and get an expiring link.

**Request** (`multipart/form-data`):

| Field                 | Type    | Required | Notes                              |
|-----------------------|---------|----------|------------------------------------|
| `file`                | file    | ✅        | Max 100 MB                         |
| `expire`              | number  | ❌        | Days until expiry: 1, 3, 5, 7 (default: 1) |
| `delete_after_expiry` | boolean | ❌        | `true` to auto-delete from R2 (default: false) |

**Response `201`**:
```json
{
  "url": "http://localhost:3000/file/abc-uuid",
  "expires_at": "2026-04-04T18:00:00.000Z",
  "delete_after_expiry": false
}
```

**Error codes**: `400` invalid params · `413` file too large · `500` upload failure

---

### `GET /file/:id`

Download a file by its ID.

**Response**: Streams the file with:
- `Content-Type`
- `Content-Disposition: inline; filename="..."`
- `Content-Length` (if known)

**Error codes**: `404` not found · `403` expired · `500` R2 failure

---

### `GET /health`

Health check endpoint.

```json
{ "status": "ok", "timestamp": "..." }
```

---

## 🧹 Cleanup Job

Runs every **5 minutes**. Finds files where:
- `expires_at < now()`
- `delete_after_expiry = true`

Deletes from R2 first, then from PostgreSQL. Processes in batches of 100. Errors are logged per-file and do not abort the batch.

---

## 🔒 Rate Limiting

- **Upload route**: 10 requests / minute / IP
- **Global**: 100 requests / minute / IP

---

## 🧪 Testing with curl

```bash
# Upload a file (expires in 3 days, auto-delete enabled)
curl -X POST http://localhost:3000/upload \
  -F "file=@/path/to/your/file.pdf" \
  -F "expire=3" \
  -F "delete_after_expiry=true"

# Download the file
curl -O -J http://localhost:3000/file/<id>

# Health check
curl http://localhost:3000/health
```
