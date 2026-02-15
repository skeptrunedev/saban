import pg from 'pg';
import type {
  Profile,
  ProfilesQuery,
  UpdateProfileRequest,
  User,
  Organization,
  OrganizationMember,
  OrganizationWithRole,
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
): Promise<number> {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const profile of profiles) {
      try {
        await client.query(
          `INSERT INTO similar_profiles
           (source_profile_url, source_section, profile_url, vanity_name, first_name, last_name, member_urn, headline, profile_picture_url, location, connection_degree, profile_picture_payload, raw_data, organization_id, created_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (source_profile_url, profile_url) DO NOTHING`,
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
        inserted++;
      } catch (err) {
        console.error('Error inserting profile:', (err as Error).message);
      }
    }
    return inserted;
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
