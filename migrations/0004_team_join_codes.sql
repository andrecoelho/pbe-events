-- Team join codes (#44). Teams join by code instead of by team id, and one device holds each team.

-- Six characters from an alphabet without look-alikes (no 0/O, 1/I/L), e.g. 'K7P4QX'; shown as 'K7P-4QX'.
-- The bytes come from gen_random_uuid() (cryptographically random); bytes 0-5 have no fixed version bits.
CREATE FUNCTION new_join_code() RETURNS TEXT LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(b, i) % 31, 1), '' ORDER BY i)
  FROM (SELECT uuid_send(gen_random_uuid()) AS b) AS random_bytes, generate_series(0, 5) AS i
$$;

-- The default fills in every existing team (it runs once per row) and every new one.
ALTER TABLE teams ADD COLUMN join_code TEXT NOT NULL DEFAULT new_join_code();
ALTER TABLE teams ADD CONSTRAINT teams_join_code_key UNIQUE (join_code);

-- SHA-256 (hex) of the private token held by the device that joined the team; NULL when no device holds it.
ALTER TABLE teams ADD COLUMN device_token_hash TEXT;
ALTER TABLE teams ADD CONSTRAINT teams_device_token_hash_key UNIQUE (device_token_hash);
