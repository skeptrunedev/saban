import { Elysia, t } from 'elysia';
import {
  updateEnrichmentJob,
  upsertProfileEnrichment,
  upsertQualificationResult,
  upsertProfileEnrichmentByVanity,
  getEnrichedProfilesForScoring,
  getAllPendingScoring,
} from '../db.js';
import { scoreProfileWithAI } from '../services/anthropic.js';

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
    console.log('[Internal] Auth check:', {
      key: key?.slice(0, 10),
      expected: internalKey?.slice(0, 10),
      match: key === internalKey,
    });
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
  // Get profiles pending scoring (for scoring worker)
  .get('/scoring/pending', async () => {
    const profiles = await getAllPendingScoring();
    return { success: true, data: profiles };
  })
  // Get unenriched profile URLs (for periodic scraping worker)
  .get('/enrichment/pending', async ({ query }) => {
    const limit = query.limit ? parseInt(query.limit as string, 10) : 50;
    const urls = await getUnenrichedProfileUrls(limit);
    return { success: true, data: { urls, count: urls.length } };
  })
  // Trigger scrapes for unenriched profiles (called by worker cron)
  .post(
    '/enrichment/trigger-scrape',
    async ({ body }) => {
      const limit = body.limit || 50;
      const result = await triggerUnenrichedScrapes(limit);
      return {
        success: true,
        data: {
          triggered: result.triggered,
          snapshotId: result.snapshotId,
          message:
            result.triggered > 0
              ? `Triggered scrape for ${result.triggered} profiles`
              : 'No unenriched profiles to scrape',
        },
      };
    },
    {
      body: t.Object({
        limit: t.Optional(t.Number()),
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
  })
  // Score all enriched profiles against a qualification
  .post(
    '/qualifications/:id/score',
    async ({ params, body }) => {
      const qualificationId = parseInt(params.id, 10);
      const organizationId = body.organizationId;

      const qualification = await getQualificationByIdInternal(qualificationId);

      if (!qualification) {
        return { success: false, error: 'Qualification not found' };
      }

      // Get all enriched profiles that haven't been scored yet
      const profilesToScore = await getEnrichedProfilesForScoring(organizationId, qualificationId);

      if (profilesToScore.length === 0) {
        return {
          success: true,
          data: { message: 'No profiles to score', scored: 0, failed: 0 },
        };
      }

      console.log(
        `Scoring ${profilesToScore.length} profiles against qualification ${qualificationId}`
      );

      let scored = 0;
      let failed = 0;

      for (const { profileId, rawResponse } of profilesToScore) {
        try {
          const result = await scoreProfileWithAI(rawResponse as any, qualification.criteria);

          await upsertQualificationResult(
            profileId,
            qualificationId,
            result.score,
            result.reasoning,
            result.passed
          );

          console.log(`Profile ${profileId}: score=${result.score}, passed=${result.passed}`);
          scored++;
        } catch (err) {
          console.error(`Failed to score profile ${profileId}:`, err);
          failed++;
        }
      }

      return {
        success: true,
        data: {
          message: `Scored ${scored} profiles`,
          scored,
          failed,
          total: profilesToScore.length,
        },
      };
    },
    {
      body: t.Object({
        organizationId: t.String(),
      }),
    }
  );

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

// Get unenriched profile URLs for periodic scraping
async function getUnenrichedProfileUrls(limit: number = 50): Promise<string[]> {
  const result = await pool.query(
    `SELECT profile_url FROM (
       SELECT DISTINCT ON (sp.profile_url) sp.profile_url, sp.captured_at
       FROM similar_profiles sp
       LEFT JOIN profile_enrichments pe ON sp.id = pe.profile_id
       WHERE pe.id IS NULL
         AND sp.organization_id IS NOT NULL
         AND sp.vanity_name IS NOT NULL
         AND sp.vanity_name NOT LIKE 'ACo%'
       ORDER BY sp.profile_url, sp.captured_at DESC
     ) sub
     ORDER BY captured_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => row.profile_url);
}

// Trigger scrapes for unenriched profiles
import { triggerScrape, isBrightDataConfigured } from '../services/brightdata.js';

async function triggerUnenrichedScrapes(
  limit: number = 50
): Promise<{ triggered: number; snapshotId?: string }> {
  if (!isBrightDataConfigured()) {
    console.log('[Internal] BrightData not configured, skipping scrape trigger');
    return { triggered: 0 };
  }

  const urls = await getUnenrichedProfileUrls(limit);

  if (urls.length === 0) {
    console.log('[Internal] No unenriched profiles to scrape');
    return { triggered: 0 };
  }

  console.log(`[Internal] Triggering scrape for ${urls.length} unenriched profiles`);
  const snapshotId = await triggerScrape(urls);

  return { triggered: urls.length, snapshotId };
}
