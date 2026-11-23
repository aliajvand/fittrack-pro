-- Cloudflare D1 (SQLite) Schema for FitTrack Pro

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  mobile TEXT UNIQUE NOT NULL,
  full_name TEXT DEFAULT '',
  age INTEGER DEFAULT 24,
  height_cm REAL DEFAULT 180,
  start_weight_kg REAL DEFAULT 81.5,
  goal TEXT DEFAULT 'recomp',
  target_kcal INTEGER DEFAULT 2200,
  target_protein INTEGER DEFAULT 150,
  selected_template TEXT DEFAULT 'hybrid_calisthenics',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_mobile_created ON otp_codes(mobile, created_at);

CREATE TABLE IF NOT EXISTS user_states (
  user_id TEXT PRIMARY KEY,
  custom_program_json TEXT DEFAULT NULL,
  days_state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
