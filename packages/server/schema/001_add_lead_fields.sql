-- Migration: Add notes, tags, and status columns to similar_profiles
-- Run this if you have an existing database

ALTER TABLE similar_profiles ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE similar_profiles ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE similar_profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_status ON similar_profiles(status);
CREATE INDEX IF NOT EXISTS idx_tags ON similar_profiles USING GIN(tags);
