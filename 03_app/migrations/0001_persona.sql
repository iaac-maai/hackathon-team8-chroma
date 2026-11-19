-- Adds the listener type to a database made before 19 November (run once):
-- npx wrangler d1 execute chroma-db --remote --file=migrations/0001_persona.sql
ALTER TABLE scenes ADD COLUMN persona TEXT;
ALTER TABLE live_views ADD COLUMN persona TEXT;
