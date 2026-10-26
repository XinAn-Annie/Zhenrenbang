PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL CHECK (channel_id IN ('camera','office','plant')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  steps_json TEXT NOT NULL DEFAULT '[]',
  result TEXT NOT NULL DEFAULT '',
  scope_note TEXT NOT NULL DEFAULT '',
  risk_note TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_url TEXT,
  video_url TEXT,
  media_license TEXT,
  authorized INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'draft',
  publish_status TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL,
  published_at TEXT,
  withdrawn_at TEXT
);

CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  raw_input_json TEXT NOT NULL,
  context_card_json TEXT NOT NULL,
  help_mode TEXT NOT NULL DEFAULT 'now',
  budget_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_sessions (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  provider_id TEXT,
  mode TEXT NOT NULL DEFAULT 'now',
  room_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ready',
  result_json TEXT,
  case_consent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  ended_at TEXT,
  FOREIGN KEY (request_id) REFERENCES help_requests(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('seeker','provider','system')),
  client_message_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES service_sessions(id) ON DELETE CASCADE,
  UNIQUE (session_id, client_message_id)
);

-- WebRTC only stores short-lived SDP/ICE signalling. Video streams are never stored.
CREATE TABLE IF NOT EXISTS webrtc_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('seeker','provider')),
  signal_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES service_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cases_public ON cases
  (publish_status, review_status, authorized, channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages
  (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_session ON webrtc_signals
  (session_id, id);
