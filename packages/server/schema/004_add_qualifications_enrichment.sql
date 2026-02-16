-- Migration: Add job qualifications, profile enrichments, and tracking tables
-- This migration adds support for AI-powered lead qualification

-- Job qualification criteria per organization
CREATE TABLE IF NOT EXISTS job_qualifications (
  id SERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  criteria JSONB NOT NULL DEFAULT '{}',
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enriched profile data from BrightData
CREATE TABLE IF NOT EXISTS profile_enrichments (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES similar_profiles(id) ON DELETE CASCADE UNIQUE,
  connection_count INTEGER,
  follower_count INTEGER,
  experience JSONB,
  education JSONB,
  skills JSONB,
  certifications JSONB,
  languages JSONB,
  about TEXT,
  raw_response JSONB,
  enriched_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI qualification scores
CREATE TABLE IF NOT EXISTS qualification_results (
  id SERIAL PRIMARY KEY,
  profile_id INTEGER REFERENCES similar_profiles(id) ON DELETE CASCADE,
  qualification_id INTEGER REFERENCES job_qualifications(id) ON DELETE CASCADE,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  reasoning TEXT,
  passed BOOLEAN,
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, qualification_id)
);

-- Async enrichment job tracking
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT,
  profile_ids INTEGER[],
  qualification_id INTEGER REFERENCES job_qualifications(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'scraping', 'enriching', 'qualifying', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for job qualifications
CREATE INDEX IF NOT EXISTS idx_qualifications_org ON job_qualifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_qualifications_created_by ON job_qualifications(created_by_user_id);

-- Indexes for profile enrichments
CREATE INDEX IF NOT EXISTS idx_enrichments_profile ON profile_enrichments(profile_id);

-- Indexes for qualification results
CREATE INDEX IF NOT EXISTS idx_qual_results_profile ON qualification_results(profile_id);
CREATE INDEX IF NOT EXISTS idx_qual_results_qualification ON qualification_results(qualification_id);
CREATE INDEX IF NOT EXISTS idx_qual_results_passed ON qualification_results(passed);

-- Indexes for enrichment jobs
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_org ON enrichment_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_snapshot ON enrichment_jobs(snapshot_id);
