// Database schema, applied when the Durable Object starts (CREATE IF NOT EXISTS, so it is safe on every start).
export const SCHEMA = `-- Oddclue: imposter word game for group chats. No accounts; a player is a nickname + secret token.
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_id INTEGER,
  packs TEXT NOT NULL,            -- JSON array of pack ids
  show_category INTEGER NOT NULL DEFAULT 1,
  limit_secs INTEGER NOT NULL DEFAULT 10800, -- per phase; 0 = no limit
  round_no INTEGER NOT NULL DEFAULT 0,       -- 0 = lobby
  version INTEGER NOT NULL DEFAULT 1,        -- bumped on every change; clients poll it
  created_at INTEGER NOT NULL,
  active_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  left_at INTEGER
);
CREATE INDEX IF NOT EXISTS members_game ON members(game_id);
-- state: clue -> vote -> reveal
CREATE TABLE IF NOT EXISTS rounds (
  game_id TEXT NOT NULL,
  no INTEGER NOT NULL,
  word TEXT NOT NULL,
  category TEXT NOT NULL,
  imposter_id INTEGER NOT NULL,
  players TEXT NOT NULL,          -- JSON array of member ids dealt into this round
  state TEXT NOT NULL DEFAULT 'clue',
  deadline INTEGER,               -- unix seconds; NULL = no limit
  guess TEXT,                     -- imposter's guess of the word
  started_at INTEGER NOT NULL,
  revealed_at INTEGER,
  PRIMARY KEY (game_id, no)
);
CREATE TABLE IF NOT EXISTS clues (
  game_id TEXT NOT NULL,
  no INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, no, member_id)
);
CREATE TABLE IF NOT EXISTS votes (
  game_id TEXT NOT NULL,
  no INTEGER NOT NULL,
  voter_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  PRIMARY KEY (game_id, no, voter_id)
);
CREATE TABLE IF NOT EXISTS rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
`;
