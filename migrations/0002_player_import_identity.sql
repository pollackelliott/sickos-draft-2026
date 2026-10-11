ALTER TABLE players ADD COLUMN espn_id TEXT;
ALTER TABLE players ADD COLUMN import_status TEXT;
ALTER TABLE players ADD COLUMN import_generation TEXT;

CREATE UNIQUE INDEX players_espn_id_unique
  ON players(espn_id)
  WHERE espn_id IS NOT NULL AND espn_id <> '';
