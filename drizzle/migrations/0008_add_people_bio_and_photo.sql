-- Add bio and photo storage key for public speaker profiles (D5).
ALTER TABLE people ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE people ADD COLUMN IF NOT EXISTS photo_storage_key text;
