-- Migration number: 0001 	 2026-08-14T00:00:00.000Z

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('entry', 'reflection')),
  body TEXT NOT NULL,
  local_date TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  indexed_at INTEGER
);

CREATE INDEX entries_by_recency ON entries (captured_at DESC);
CREATE INDEX entries_pending_index ON entries (indexed_at) WHERE indexed_at IS NULL;
CREATE UNIQUE INDEX reflections_by_date ON entries (local_date) WHERE kind = 'reflection';

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  fired_at INTEGER
);

CREATE INDEX reminders_pending ON reminders (due_at) WHERE fired_at IS NULL;
