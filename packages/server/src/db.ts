import pg from 'pg';
import type { Profile, ProfilesQuery, UpdateProfileRequest } from '@saban/shared';

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
  profilePicturePayload?: string;
  raw?: Record<string, unknown>;
}

export async function insertProfiles(
  profiles: RawProfile[],
  sourceProfileUrl: string,
  sourceSection: string
): Promise<number> {
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const profile of profiles) {
      try {
        await client.query(
          `INSERT INTO similar_profiles
           (source_profile_url, source_section, profile_url, vanity_name, first_name, last_name, member_urn, profile_picture_payload, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (source_profile_url, profile_url) DO NOTHING`,
          [
            sourceProfileUrl,
            sourceSection,
            profile.profileUrl,
            profile.vanityName,
            profile.firstName,
            profile.lastName,
            profile.memberUrn,
            profile.profilePicturePayload,
            JSON.stringify(profile.raw),
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

export async function getProfileCount(): Promise<number> {
  const result = await pool.query('SELECT COUNT(*) FROM similar_profiles');
  return parseInt(result.rows[0].count, 10);
}

export async function getProfiles(query: ProfilesQuery): Promise<{ profiles: Profile[]; total: number }> {
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

export async function getProfileById(id: number): Promise<Profile | null> {
  const result = await pool.query('SELECT * FROM similar_profiles WHERE id = $1', [id]);
  return result.rows[0] as Profile | null;
}

export async function updateProfile(id: number, updates: UpdateProfileRequest): Promise<Profile | null> {
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
    return getProfileById(id);
  }

  params.push(id);
  const result = await pool.query(
    `UPDATE similar_profiles SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  return result.rows[0] as Profile | null;
}

export async function getAllTags(): Promise<string[]> {
  const result = await pool.query(
    `SELECT DISTINCT unnest(tags) as tag FROM similar_profiles WHERE tags IS NOT NULL ORDER BY tag`
  );
  return result.rows.map((row) => row.tag as string);
}

export async function exportProfiles(query: Omit<ProfilesQuery, 'page' | 'limit'>): Promise<Profile[]> {
  const { search, status, tags, sortBy = 'captured_at', sortOrder = 'desc' } = query;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

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
