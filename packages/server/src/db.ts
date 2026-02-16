import pg from 'pg';
import type {
  Profile,
  ProfilesQuery,
  UpdateProfileRequest,
  User,
  Organization,
  OrganizationMember,
  OrganizationWithRole,
  JobQualification,
  QualificationCriteria,
  ProfileEnrichment,
  QualificationResult,
  EnrichmentJob,
  EnrichmentJobStatus,
} from '@saban/shared';

const { Pool } = pg;

export const pool = new Pool({
  user: process.env.PGUSER || 'linkedin',
  password: process.env.PGPASSWORD || 'linkedin',
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'linkedin_profiles',
});

interface RawProfile {
  profileUrl: string;
  vanityName?: string;
  firstName?: string;
  lastName?: string;
  memberUrn?: string;
  headline?: string;
  profilePictureUrl?: string;
  location?: string;
  connectionDegree?: string;
  profilePicturePayload?: string;
  raw?: Record<string, unknown>;
}

// ==================== USER FUNCTIONS ====================

export async function upsertUser(user: User): Promise<User> {
  const result = await pool.query(
    `INSERT INTO users (id, email, first_name, last_name, profile_picture_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       profile_picture_url = EXCLUDED.profile_picture_url
     RETURNING *`,
    [user.id, user.email, user.firstName, user.lastName, user.profilePictureUrl]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    profilePictureUrl: row.profile_picture_url,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    profilePictureUrl: row.profile_picture_url,
  };
}

// ==================== ORGANIZATION FUNCTIONS ====================

export async function createOrganization(id: string, name: string): Promise<Organization> {
  const result = await pool.query(
    `INSERT INTO organizations (id, name) VALUES ($1, $2) RETURNING *`,
    [id, name]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const result = await pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function getUserOrganizations(userId: string): Promise<OrganizationWithRole[]> {
  const result = await pool.query(
    `SELECT o.*, om.role
     FROM organizations o
     JOIN organization_members om ON o.id = om.organization_id
     WHERE om.user_id = $1
     ORDER BY o.name`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    role: row.role,
  }));
}

export async function addOrganizationMember(
  userId: string,
  organizationId: string,
  role: 'admin' | 'member' = 'member'
): Promise<void> {
  await pool.query(
    `INSERT INTO organization_members (user_id, organization_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`,
    [userId, organizationId, role]
  );
}

export async function removeOrganizationMember(
  userId: string,
  organizationId: string
): Promise<void> {
  await pool.query('DELETE FROM organization_members WHERE user_id = $1 AND organization_id = $2', [
    userId,
    organizationId,
  ]);
}

export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const result = await pool.query(
    `SELECT om.*, u.email, u.first_name, u.last_name, u.profile_picture_url
     FROM organization_members om
     JOIN users u ON om.user_id = u.id
     WHERE om.organization_id = $1
     ORDER BY om.joined_at`,
    [organizationId]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    joinedAt: row.joined_at,
    user: {
      id: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      profilePictureUrl: row.profile_picture_url,
    },
  }));
}

export async function isOrganizationMember(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2',
    [userId, organizationId]
  );
  return result.rows.length > 0;
}

export async function isOrganizationAdmin(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM organization_members
     WHERE user_id = $1 AND organization_id = $2 AND role = 'admin'`,
    [userId, organizationId]
  );
  return result.rows.length > 0;
}

// ==================== PROFILE FUNCTIONS ====================

export async function insertProfiles(
  profiles: RawProfile[],
  sourceProfileUrl: string,
  sourceSection: string,
  organizationId?: string,
  createdByUserId?: string
): Promise<{ inserted: number; newProfileIds: number[]; newProfileUrls: string[] }> {
  const client = await pool.connect();
  try {
    let inserted = 0;
    const newProfileIds: number[] = [];
    const newProfileUrls: string[] = [];

    for (const profile of profiles) {
      try {
        // First, try to update existing records that have null fields we now have data for
        // This supplements records from other sources (e.g., PYMK) with data from direct views
        if (profile.headline || profile.profilePictureUrl || profile.location || profile.connectionDegree) {
          const updateResult = await client.query(
            `UPDATE similar_profiles SET
              headline = COALESCE(headline, $1),
              profile_picture_url = COALESCE(profile_picture_url, $2),
              location = COALESCE(location, $3),
              connection_degree = COALESCE(connection_degree, $4),
              first_name = COALESCE(first_name, $5),
              last_name = COALESCE(last_name, $6),
              member_urn = COALESCE(member_urn, $7)
            WHERE profile_url = $8
              AND organization_id = $9
              AND (headline IS NULL OR profile_picture_url IS NULL OR location IS NULL OR connection_degree IS NULL)
            RETURNING id`,
            [
              profile.headline,
              profile.profilePictureUrl,
              profile.location,
              profile.connectionDegree,
              profile.firstName,
              profile.lastName,
              profile.memberUrn,
              profile.profileUrl,
              organizationId,
            ]
          );

          if (updateResult.rowCount && updateResult.rowCount > 0) {
            console.log(
              `Updated ${updateResult.rowCount} existing record(s) for ${profile.profileUrl} with new data from ${sourceSection}`
            );
          }
        }

        // Then insert new record, returning ID if inserted
        const insertResult = await client.query(
          `INSERT INTO similar_profiles
           (source_profile_url, source_section, profile_url, vanity_name, first_name, last_name, member_urn, headline, profile_picture_url, location, connection_degree, profile_picture_payload, raw_data, organization_id, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (source_profile_url, profile_url) DO NOTHING
           RETURNING id`,
          [
            sourceProfileUrl,
            sourceSection,
            profile.profileUrl,
            profile.vanityName,
            profile.firstName,
            profile.lastName,
            profile.memberUrn,
            profile.headline,
            profile.profilePictureUrl,
            profile.location,
            profile.connectionDegree,
            profile.profilePicturePayload,
            JSON.stringify(profile.raw),
            organizationId,
            createdByUserId,
          ]
        );

        if (insertResult.rows.length > 0) {
          inserted++;
          newProfileIds.push(insertResult.rows[0].id);
          newProfileUrls.push(profile.profileUrl);
        }
      } catch (err) {
        console.error('Error inserting profile:', (err as Error).message);
      }
    }
    return { inserted, newProfileIds, newProfileUrls };
  } finally {
    client.release();
  }
}

export async function getProfileCount(organizationId?: string): Promise<number> {
  if (organizationId) {
    const result = await pool.query(
      'SELECT COUNT(*) FROM similar_profiles WHERE organization_id = $1',
      [organizationId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  const result = await pool.query('SELECT COUNT(*) FROM similar_profiles');
  return parseInt(result.rows[0].count, 10);
}

export async function getProfiles(
  query: ProfilesQuery,
  organizationId?: string
): Promise<{ profiles: Profile[]; total: number }> {
  const {
    page = 1,
    limit = 50,
    search,
    status,
    tags,
    sortBy = 'captured_at',
    sortOrder = 'desc',
  } = query;

  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Always filter by organization if provided
  if (organizationId) {
    conditions.push(`organization_id = $${paramIndex}`);
    params.push(organizationId);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR vanity_name ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (tags && tags.length > 0) {
    conditions.push(`tags && $${paramIndex}`);
    params.push(tags);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const allowedSortColumns = ['captured_at', 'first_name', 'last_name'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'captured_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM similar_profiles ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT * FROM similar_profiles ${whereClause}
     ORDER BY ${safeSortBy} ${safeSortOrder}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return { profiles: result.rows as Profile[], total };
}

export async function getProfileById(id: number, organizationId?: string): Promise<Profile | null> {
  if (organizationId) {
    const result = await pool.query(
      'SELECT * FROM similar_profiles WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return (result.rows[0] as Profile) || null;
  }

  const result = await pool.query('SELECT * FROM similar_profiles WHERE id = $1', [id]);
  return (result.rows[0] as Profile) || null;
}

export async function updateProfile(
  id: number,
  updates: UpdateProfileRequest,
  organizationId?: string
): Promise<Profile | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.notes !== undefined) {
    setClauses.push(`notes = $${paramIndex}`);
    params.push(updates.notes);
    paramIndex++;
  }

  if (updates.tags !== undefined) {
    setClauses.push(`tags = $${paramIndex}`);
    params.push(updates.tags);
    paramIndex++;
  }

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex}`);
    params.push(updates.status);
    paramIndex++;
  }

  if (setClauses.length === 0) {
    return getProfileById(id, organizationId);
  }

  params.push(id);

  let query = `UPDATE similar_profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;

  if (organizationId) {
    params.push(organizationId);
    query += ` AND organization_id = $${paramIndex + 1}`;
  }

  query += ' RETURNING *';

  const result = await pool.query(query, params);
  return (result.rows[0] as Profile) || null;
}

export async function getAllTags(organizationId?: string): Promise<string[]> {
  if (organizationId) {
    const result = await pool.query(
      `SELECT DISTINCT unnest(tags) as tag FROM similar_profiles
       WHERE tags IS NOT NULL AND organization_id = $1 ORDER BY tag`,
      [organizationId]
    );
    return result.rows.map((row) => row.tag as string);
  }

  const result = await pool.query(
    `SELECT DISTINCT unnest(tags) as tag FROM similar_profiles WHERE tags IS NOT NULL ORDER BY tag`
  );
  return result.rows.map((row) => row.tag as string);
}

export async function exportProfiles(
  query: Omit<ProfilesQuery, 'page' | 'limit'>,
  organizationId?: string
): Promise<Profile[]> {
  const { search, status, tags, sortBy = 'captured_at', sortOrder = 'desc' } = query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (organizationId) {
    conditions.push(`organization_id = $${paramIndex}`);
    params.push(organizationId);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR vanity_name ILIKE $${paramIndex})`
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (tags && tags.length > 0) {
    conditions.push(`tags && $${paramIndex}`);
    params.push(tags);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const allowedSortColumns = ['captured_at', 'first_name', 'last_name'];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'captured_at';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const result = await pool.query(
    `SELECT * FROM similar_profiles ${whereClause} ORDER BY ${safeSortBy} ${safeSortOrder}`,
    params
  );

  return result.rows as Profile[];
}

// ==================== QUALIFICATION FUNCTIONS ====================

export async function createQualification(
  organizationId: string,
  name: string,
  description: string | null,
  criteria: QualificationCriteria,
  createdByUserId: string
): Promise<JobQualification> {
  const result = await pool.query(
    `INSERT INTO job_qualifications (organization_id, name, description, criteria, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [organizationId, name, description, JSON.stringify(criteria), createdByUserId]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    criteria: row.criteria,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getQualifications(organizationId: string): Promise<JobQualification[]> {
  const result = await pool.query(
    `SELECT * FROM job_qualifications WHERE organization_id = $1 ORDER BY created_at DESC`,
    [organizationId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    criteria: row.criteria,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function getQualificationById(
  id: number,
  organizationId: string
): Promise<JobQualification | null> {
  const result = await pool.query(
    `SELECT * FROM job_qualifications WHERE id = $1 AND organization_id = $2`,
    [id, organizationId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    criteria: row.criteria,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function updateQualification(
  id: number,
  organizationId: string,
  updates: { name?: string; description?: string; criteria?: QualificationCriteria }
): Promise<JobQualification | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex}`);
    params.push(updates.name);
    paramIndex++;
  }

  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex}`);
    params.push(updates.description);
    paramIndex++;
  }

  if (updates.criteria !== undefined) {
    setClauses.push(`criteria = $${paramIndex}`);
    params.push(JSON.stringify(updates.criteria));
    paramIndex++;
  }

  params.push(id, organizationId);

  const result = await pool.query(
    `UPDATE job_qualifications SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
     RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    description: row.description,
    criteria: row.criteria,
    created_by_user_id: row.created_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function deleteQualification(id: number, organizationId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM job_qualifications WHERE id = $1 AND organization_id = $2`,
    [id, organizationId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ==================== ENRICHMENT FUNCTIONS ====================

export async function upsertProfileEnrichment(
  profileId: number,
  data: {
    connectionCount?: number;
    followerCount?: number;
    experience?: unknown;
    education?: unknown;
    skills?: string[];
    certifications?: unknown;
    languages?: unknown;
    about?: string;
    rawResponse?: unknown;
  }
): Promise<ProfileEnrichment> {
  const result = await pool.query(
    `INSERT INTO profile_enrichments
     (profile_id, connection_count, follower_count, experience, education, skills, certifications, languages, about, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (profile_id) DO UPDATE SET
       connection_count = COALESCE(EXCLUDED.connection_count, profile_enrichments.connection_count),
       follower_count = COALESCE(EXCLUDED.follower_count, profile_enrichments.follower_count),
       experience = COALESCE(EXCLUDED.experience, profile_enrichments.experience),
       education = COALESCE(EXCLUDED.education, profile_enrichments.education),
       skills = COALESCE(EXCLUDED.skills, profile_enrichments.skills),
       certifications = COALESCE(EXCLUDED.certifications, profile_enrichments.certifications),
       languages = COALESCE(EXCLUDED.languages, profile_enrichments.languages),
       about = COALESCE(EXCLUDED.about, profile_enrichments.about),
       raw_response = COALESCE(EXCLUDED.raw_response, profile_enrichments.raw_response),
       enriched_at = NOW()
     RETURNING *`,
    [
      profileId,
      data.connectionCount,
      data.followerCount,
      data.experience ? JSON.stringify(data.experience) : null,
      data.education ? JSON.stringify(data.education) : null,
      data.skills,
      data.certifications ? JSON.stringify(data.certifications) : null,
      data.languages ? JSON.stringify(data.languages) : null,
      data.about,
      data.rawResponse ? JSON.stringify(data.rawResponse) : null,
    ]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    profile_id: row.profile_id,
    connection_count: row.connection_count,
    follower_count: row.follower_count,
    experience: row.experience,
    education: row.education,
    skills: row.skills,
    certifications: row.certifications,
    languages: row.languages,
    about: row.about,
    raw_response: row.raw_response,
    enriched_at: row.enriched_at,
  };
}

export async function upsertProfileEnrichmentByVanity(
  vanityName: string,
  data: {
    connectionCount?: number;
    followerCount?: number;
    experience?: unknown;
    education?: unknown;
    skills?: string[];
    certifications?: unknown;
    languages?: unknown;
    about?: string;
    rawResponse?: unknown;
  }
): Promise<{ profilesUpdated: number } | null> {
  // Find all profiles with this vanity name (could be multiple from different sources)
  const profileResult = await pool.query(
    `SELECT id FROM similar_profiles WHERE vanity_name = $1`,
    [vanityName.toLowerCase()]
  );

  if (profileResult.rows.length === 0) {
    return null;
  }

  // Upsert enrichment for each matching profile
  for (const row of profileResult.rows) {
    await upsertProfileEnrichment(row.id, data);
  }

  return { profilesUpdated: profileResult.rows.length };
}

export async function getProfileEnrichment(profileId: number): Promise<ProfileEnrichment | null> {
  const result = await pool.query(
    `SELECT * FROM profile_enrichments WHERE profile_id = $1`,
    [profileId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    profile_id: row.profile_id,
    connection_count: row.connection_count,
    follower_count: row.follower_count,
    experience: row.experience,
    education: row.education,
    skills: row.skills,
    certifications: row.certifications,
    languages: row.languages,
    about: row.about,
    raw_response: row.raw_response,
    enriched_at: row.enriched_at,
  };
}

// ==================== QUALIFICATION RESULT FUNCTIONS ====================

export async function upsertQualificationResult(
  profileId: number,
  qualificationId: number,
  score: number,
  reasoning: string | null,
  passed: boolean
): Promise<QualificationResult> {
  const result = await pool.query(
    `INSERT INTO qualification_results (profile_id, qualification_id, score, reasoning, passed)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (profile_id, qualification_id) DO UPDATE SET
       score = EXCLUDED.score,
       reasoning = EXCLUDED.reasoning,
       passed = EXCLUDED.passed,
       evaluated_at = NOW()
     RETURNING *`,
    [profileId, qualificationId, score, reasoning, passed]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    profile_id: row.profile_id,
    qualification_id: row.qualification_id,
    score: row.score,
    reasoning: row.reasoning,
    passed: row.passed,
    evaluated_at: row.evaluated_at,
  };
}

export async function getProfileQualificationResults(
  profileId: number
): Promise<QualificationResult[]> {
  const result = await pool.query(
    `SELECT qr.*, jq.name as qualification_name, jq.criteria
     FROM qualification_results qr
     JOIN job_qualifications jq ON qr.qualification_id = jq.id
     WHERE qr.profile_id = $1
     ORDER BY qr.evaluated_at DESC`,
    [profileId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    profile_id: row.profile_id,
    qualification_id: row.qualification_id,
    score: row.score,
    reasoning: row.reasoning,
    passed: row.passed,
    evaluated_at: row.evaluated_at,
    qualification: {
      id: row.qualification_id,
      organization_id: '',
      name: row.qualification_name,
      description: null,
      criteria: row.criteria,
      created_by_user_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  }));
}

// ==================== ENRICHMENT JOB FUNCTIONS ====================

export async function createEnrichmentJob(
  id: string,
  profileIds: number[],
  organizationId: string,
  qualificationId?: number
): Promise<EnrichmentJob> {
  const result = await pool.query(
    `INSERT INTO enrichment_jobs (id, profile_ids, organization_id, qualification_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, profileIds, organizationId, qualificationId]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    snapshot_id: row.snapshot_id,
    profile_ids: row.profile_ids,
    qualification_id: row.qualification_id,
    organization_id: row.organization_id,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export async function updateEnrichmentJob(
  id: string,
  updates: {
    snapshotId?: string;
    status?: EnrichmentJobStatus;
    error?: string;
    completedAt?: Date;
  }
): Promise<EnrichmentJob | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.snapshotId !== undefined) {
    setClauses.push(`snapshot_id = $${paramIndex}`);
    params.push(updates.snapshotId);
    paramIndex++;
  }

  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex}`);
    params.push(updates.status);
    paramIndex++;
  }

  if (updates.error !== undefined) {
    setClauses.push(`error = $${paramIndex}`);
    params.push(updates.error);
    paramIndex++;
  }

  if (updates.completedAt !== undefined) {
    setClauses.push(`completed_at = $${paramIndex}`);
    params.push(updates.completedAt);
    paramIndex++;
  }

  params.push(id);

  const result = await pool.query(
    `UPDATE enrichment_jobs SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    snapshot_id: row.snapshot_id,
    profile_ids: row.profile_ids,
    qualification_id: row.qualification_id,
    organization_id: row.organization_id,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export async function getEnrichmentJob(id: string): Promise<EnrichmentJob | null> {
  const result = await pool.query(`SELECT * FROM enrichment_jobs WHERE id = $1`, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    snapshot_id: row.snapshot_id,
    profile_ids: row.profile_ids,
    qualification_id: row.qualification_id,
    organization_id: row.organization_id,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  };
}

export async function getEnrichmentJobs(organizationId: string): Promise<EnrichmentJob[]> {
  const result = await pool.query(
    `SELECT * FROM enrichment_jobs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [organizationId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    snapshot_id: row.snapshot_id,
    profile_ids: row.profile_ids,
    qualification_id: row.qualification_id,
    organization_id: row.organization_id,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  }));
}

export async function getPendingScrapingJobs(): Promise<EnrichmentJob[]> {
  const result = await pool.query(
    `SELECT * FROM enrichment_jobs WHERE status = 'scraping' ORDER BY created_at ASC LIMIT 100`
  );

  return result.rows.map((row) => ({
    id: row.id,
    snapshot_id: row.snapshot_id,
    profile_ids: row.profile_ids,
    qualification_id: row.qualification_id,
    organization_id: row.organization_id,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  }));
}

export async function getProfilesByIds(ids: number[], organizationId: string): Promise<Profile[]> {
  if (ids.length === 0) return [];

  const result = await pool.query(
    `SELECT * FROM similar_profiles WHERE id = ANY($1) AND organization_id = $2`,
    [ids, organizationId]
  );

  return result.rows as Profile[];
}
