-- Where people use Chroma from (20 November). Run once on a database made before this:
--   npx wrangler d1 execute chroma-jam-db --remote --file=migrations/0003_country_timezone.sql
-- Only the country, the time zone and a rough area (whole degrees, ~100 km), from Cloudflare's request.cf
-- (no permission, no GPS, no IP address stored). The dashboard uses the area to draw the sky there now.
ALTER TABLE users ADD COLUMN country TEXT;      -- ISO code, e.g. ES, IN, CN (latest seen)
ALTER TABLE users ADD COLUMN timezone TEXT;     -- IANA name, e.g. Europe/Madrid (latest seen)
ALTER TABLE users ADD COLUMN area_lat REAL;     -- rough area only: latitude rounded to whole degrees (~100 km), for the sun
ALTER TABLE users ADD COLUMN area_lon REAL;     -- rough area only: longitude rounded to whole degrees
ALTER TABLE logins ADD COLUMN country TEXT;     -- where this login came from
