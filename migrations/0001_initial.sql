PRAGMA defer_foreign_keys = on;

CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  draft_position INTEGER NOT NULL UNIQUE CHECK (draft_position > 0),
  code TEXT NOT NULL UNIQUE,
  is_commissioner INTEGER NOT NULL DEFAULT 0 CHECK (is_commissioner IN (0, 1))
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  school TEXT NOT NULL,
  conference TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  normalized_school TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('IMPORTED', 'WRITE_IN')),
  year TEXT,
  position TEXT,
  height TEXT
);

CREATE UNIQUE INDEX players_name_school_unique
  ON players(normalized_name, normalized_school);
CREATE INDEX players_name_idx ON players(normalized_name);
CREATE INDEX players_school_idx ON players(school);
CREATE INDEX players_conference_idx ON players(conference);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  rounds INTEGER NOT NULL CHECK (rounds > 0),
  clock_duration_ms INTEGER NOT NULL CHECK (clock_duration_ms > 0),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE')),
  paused INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  active_slot_id TEXT,
  active_deadline_ms INTEGER,
  paused_remaining_ms INTEGER,
  started_at_ms INTEGER,
  completed_at_ms INTEGER,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

CREATE TABLE draft_slots (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  round INTEGER NOT NULL CHECK (round > 0),
  round_pick INTEGER NOT NULL CHECK (round_pick > 0),
  overall_pick INTEGER NOT NULL CHECK (overall_pick > 0),
  owner_id TEXT NOT NULL REFERENCES owners(id),
  status TEXT NOT NULL CHECK (status IN ('FUTURE', 'ON_CLOCK', 'OWED', 'COMPLETE')),
  player_id TEXT REFERENCES players(id),
  selected_conference TEXT,
  selected_at_ms INTEGER,
  selection_kind TEXT CHECK (selection_kind IS NULL OR selection_kind IN ('NORMAL', 'BACKFILL')),
  UNIQUE (draft_id, overall_pick),
  UNIQUE (draft_id, round, round_pick)
);

CREATE UNIQUE INDEX draft_slots_player_unique
  ON draft_slots(draft_id, player_id)
  WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX draft_slots_owner_conference_unique
  ON draft_slots(draft_id, owner_id, selected_conference)
  WHERE selected_conference IS NOT NULL;

CREATE INDEX draft_slots_owner_idx ON draft_slots(draft_id, owner_id);
CREATE INDEX draft_slots_status_idx ON draft_slots(draft_id, status);

CREATE TABLE draft_mutation_claims (
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  claimed_at_ms INTEGER NOT NULL,
  PRIMARY KEY (draft_id, expected_revision)
);

CREATE TABLE draft_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_owner_id TEXT REFERENCES owners(id),
  slot_id TEXT REFERENCES draft_slots(id),
  player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  created_at_ms INTEGER NOT NULL,
  details_json TEXT
);

CREATE INDEX draft_events_time_idx ON draft_events(draft_id, created_at_ms DESC);
