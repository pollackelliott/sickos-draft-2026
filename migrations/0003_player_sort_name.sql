ALTER TABLE players ADD COLUMN sort_name TEXT;

UPDATE players
   SET sort_name = normalized_name
 WHERE sort_name IS NULL OR sort_name = '';

CREATE INDEX players_sort_name_idx ON players(sort_name);
