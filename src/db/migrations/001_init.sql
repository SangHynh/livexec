CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS code_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language VARCHAR(50) NOT NULL,
  source_code TEXT DEFAULT '',
  status VARCHAR(20) DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES code_sessions(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'QUEUED',
  stdout TEXT,
  stderr TEXT,
  execution_time_ms INTEGER,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_executions_session_id ON executions(session_id);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
