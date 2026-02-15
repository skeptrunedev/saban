-- Migration: Add users, organizations, and org-scoped profiles
-- This migration adds authentication and organization support

-- Users table (caches WorkOS user data)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- WorkOS user ID
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organizations table (caches WorkOS org data)
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,              -- WorkOS org ID
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organization membership (cache, source of truth is WorkOS)
CREATE TABLE IF NOT EXISTS organization_members (
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',       -- 'admin' or 'member'
  joined_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

-- Add org_id and created_by_user_id to similar_profiles
ALTER TABLE similar_profiles
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS created_by_user_id TEXT REFERENCES users(id);

-- Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_profiles_org ON similar_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_by ON similar_profiles(created_by_user_id);

-- Index for user email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for org membership lookups
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
