-- Add additional profile fields
ALTER TABLE similar_profiles
ADD COLUMN IF NOT EXISTS headline TEXT,
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS connection_degree TEXT;

-- Create index on headline for search
CREATE INDEX IF NOT EXISTS idx_similar_profiles_headline ON similar_profiles USING gin(to_tsvector('english', COALESCE(headline, '')));
