CREATE TABLE similar_profiles (
    id SERIAL PRIMARY KEY,
    source_profile_url TEXT,
    source_section TEXT,
    profile_url TEXT NOT NULL,
    vanity_name TEXT,
    first_name TEXT,
    last_name TEXT,
    member_urn TEXT,
    profile_picture_payload TEXT,
    raw_data JSONB,
    captured_at TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    tags TEXT[],
    status TEXT DEFAULT 'new',
    UNIQUE(source_profile_url, profile_url)
);

CREATE INDEX idx_captured_at ON similar_profiles(captured_at);
CREATE INDEX idx_vanity_name ON similar_profiles(vanity_name);
CREATE INDEX idx_status ON similar_profiles(status);
CREATE INDEX idx_tags ON similar_profiles USING GIN(tags);
