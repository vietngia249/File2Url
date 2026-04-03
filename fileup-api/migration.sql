-- =============================================================
-- Migration: Initial Schema for Expiring File Link Service
-- Run once against your PostgreSQL database
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- needed for gen_random_uuid() fallback

CREATE TABLE IF NOT EXISTS files (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key         TEXT        NOT NULL,
  original_filename   TEXT,
  content_type        TEXT,
  size_bytes          BIGINT,
  expires_at          TIMESTAMP   NOT NULL,
  delete_after_expiry BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMP   NOT NULL DEFAULT now()
);

-- Speeds up cleanup job queries
CREATE INDEX IF NOT EXISTS idx_expires_at ON files(expires_at);

-- =============================================================
-- To run:
--   psql $DATABASE_URL -f migration.sql
-- =============================================================
