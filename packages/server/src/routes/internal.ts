import { Elysia, t } from 'elysia';
import {
  updateEnrichmentJob,
  upsertProfileEnrichment,
  upsertQualificationResult,
  getQualificationById,
  upsertProfileEnrichmentByVanity,
} from '../db.js';

function getInternalKey() {
  return process.env.INTERNAL_API_KEY || process.env.JWT_SECRET || 'dev-internal-key';
}

/**
 * Internal API routes for worker callbacks
 * These endpoints are protected by an internal key, not user auth
 */
export const internalRoutes = new Elysia({ prefix: '/api/internal' })
  // Middleware to check internal key
  .derive(({ request, set }) => {
    const key = request.headers.get('X-Internal-Key');
    const internalKey = getInternalKey();
    console.log('[Internal] Auth check:', { key: key?.slice(0, 10), expected: internalKey?.slice(0, 10), match: key === internalKey });
    if (key !== internalKey) {
      set.status = 401;
      return { authError: 'Invalid internal key' };
    }
    return { authError: undefined };
  })
  .onBeforeHandle(({ authError, set }) => {
    if (authError) {
      set.status = 401;
      return { success: false, error: authError };
    }
  })
  // Update job status
  .post(
    '/jobs/status',
    async ({ body }) => {
      const { jobId, status, snapshotId, error } = body;

      await updateEnrichmentJob(jobId, {
        status: status as any,
        snapshotId,
        error,
      });

      return { success: true };
    },
    {
      body: t.Object({
        jobId: t.String(),
        status: t.String(),
        snapshotId: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    }
  )
  // Mark job as complete
  .post(
    '/jobs/complete',
    async ({ body }) => {
      const { jobId } = body;

      await updateEnrichmentJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
      });

      return { success: true };
    },
    {
      body: t.Object({
        jobId: t.String(),
      }),
    }
  )
  // Store enrichment data by profile ID
  .post(
    '/enrichments',
    async ({ body }) => {
      const {
        profileId,
        connectionCount,
        followerCount,
        experience,
        education,
        skills,
        certifications,
        languages,
        about,
        rawResponse,
      } = body;

      await upsertProfileEnrichment(profileId, {
        connectionCount,
        followerCount,
        experience,
        education,
        skills,
        certifications,
        languages,
        about,
        rawResponse,
      });

      return { success: true };
    },
    {
      body: t.Object({
        profileId: t.Number(),
        connectionCount: t.Optional(t.Number()),
        followerCount: t.Optional(t.Number()),
        experience: t.Optional(t.Any()),
        education: t.Optional(t.Any()),
        skills: t.Optional(t.Array(t.String())),
        certifications: t.Optional(t.Any()),
        languages: t.Optional(t.Any()),
        about: t.Optional(t.String()),
        rawResponse: t.Optional(t.Any()),
      }),
    }
  )
  // Store enrichment data by vanity name (for cron worker)
  .post(
    '/enrichments/by-vanity',
    async ({ body, set }) => {
      const {
        vanityName,
        connectionCount,
        followerCount,
        experience,
        education,
        skills,
        certifications,
        languages,
        about,
        rawResponse,
      } = body;

      const result = await upsertProfileEnrichmentByVanity(vanityName, {
        connectionCount,
        followerCount,
        experience,
        education,
        skills,
        certifications,
        languages,
        about,
        rawResponse,
      });

      if (!result) {
        set.status = 404;
        return { success: false, error: `No profile found with vanity name: ${vanityName}` };
      }

      return { success: true, data: { profilesUpdated: result.profilesUpdated } };
    },
    {
      body: t.Object({
        vanityName: t.String(),
        connectionCount: t.Optional(t.Number()),
        followerCount: t.Optional(t.Number()),
        experience: t.Optional(t.Any()),
        education: t.Optional(t.Any()),
        skills: t.Optional(t.Array(t.String())),
        certifications: t.Optional(t.Any()),
        languages: t.Optional(t.Any()),
        about: t.Optional(t.String()),
        rawResponse: t.Optional(t.Any()),
      }),
    }
  )
  // Store qualification result
  .post(
    '/qualifications/result',
    async ({ body }) => {
      const { profileId, qualificationId, score, reasoning, passed } = body;

      await upsertQualificationResult(profileId, qualificationId, score, reasoning, passed);

      return { success: true };
    },
    {
      body: t.Object({
        profileId: t.Number(),
        qualificationId: t.Number(),
        score: t.Number(),
        reasoning: t.String(),
        passed: t.Boolean(),
      }),
    }
  )
  // Get qualification by ID (for worker to fetch criteria)
  .get('/qualifications/:id', async ({ params, set }) => {
    const id = parseInt(params.id, 10);

    // Note: We don't have organizationId here, but internal calls are trusted
    // We'll need to fetch without org check for internal use
    const result = await getQualificationByIdInternal(id);

    if (!result) {
      set.status = 404;
      return { success: false, error: 'Qualification not found' };
    }

    return { success: true, data: result };
  });

// Helper function to get qualification without org check (for internal use)
import { pool } from '../db.js';

async function getQualificationByIdInternal(id: number) {
  const result = await pool.query(`SELECT * FROM job_qualifications WHERE id = $1`, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    criteria: row.criteria,
  };
}
