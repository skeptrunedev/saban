import { Elysia, t } from 'elysia';
import {
  updateEnrichmentJob,
  upsertProfileEnrichment,
  upsertQualificationResult,
  upsertProfileEnrichmentByVanity,
  getEnrichedProfilesForScoring,
  getAllPendingScoring,
  getAllEnrichedProfiles,
  pool,
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
  // Auto-scores the profile against all qualifications in its organization
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

      // Auto-score against all qualifications if we have rawResponse
      let scoringResult = { profilesScored: 0, totalScored: 0, totalFailed: 0 };
      if (rawResponse) {
        console.log(`[Enrichment] Auto-scoring profiles for vanity: ${vanityName}`);
        scoringResult = await scoreProfilesByVanityAgainstAllQualifications(
          vanityName,
          rawResponse as Record<string, unknown>
        );
        console.log(
          `[Enrichment] Scored ${scoringResult.totalScored} qualifications for ${scoringResult.profilesScored} profiles`
        );
      }

      return {
        success: true,
        data: {
          profilesUpdated: result.profilesUpdated,
          scoring: scoringResult,
        },
      };
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
  // Score all pending profiles against all their org's qualifications
  .post(
    '/scoring/run',
    async ({ body }) => {
      const limit = body?.limit || 50;

      // Get all enriched profiles that need scoring
      const pendingProfiles = await getAllPendingScoring();

      if (pendingProfiles.length === 0) {
        return {
          success: true,
          data: { message: 'No profiles pending scoring', scored: 0, failed: 0 },
        };
      }

      // Limit how many we process
      const toProcess = pendingProfiles.slice(0, limit);
      console.log(`[Scoring] Processing ${toProcess.length} pending profile-qualification pairs`);

      let scored = 0;
      let failed = 0;

      for (const {
        profileId,
        qualificationId,
        qualificationName,
        criteria,
        rawResponse,
      } of toProcess) {
        try {
          const result = await scoreProfileWithAI(rawResponse as any, criteria);

          await upsertQualificationResult(
            profileId,
            qualificationId,
            result.score,
            result.reasoning,
            result.passed
          );

          console.log(
            `[Scoring] Profile ${profileId} vs "${qualificationName}": score=${result.score}, passed=${result.passed}`
          );
          scored++;
        } catch (err) {
          console.error(
            `[Scoring] Failed to score profile ${profileId} against qualification ${qualificationId}:`,
            err
          );
          failed++;
        }
      }

      return {
        success: true,
        data: {
          message: `Scored ${scored} profile-qualification pairs`,
          scored,
          failed,
          remaining: pendingProfiles.length - toProcess.length,
        },
      };
    },
    {
      body: t.Optional(
        t.Object({
          limit: t.Optional(t.Number()),
        })
      ),
    }
  )
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
  )
  // Rescore ALL enriched profiles against a qualification (even already scored ones)
  .post(
    '/qualifications/:id/rescore',
    async ({ params, body }) => {
      const qualificationId = parseInt(params.id, 10);
      const organizationId = body.organizationId;

      const qualification = await getQualificationByIdInternal(qualificationId);

      if (!qualification) {
        return { success: false, error: 'Qualification not found' };
      }

      // Get ALL enriched profiles (including already scored ones)
      const profilesToScore = await getAllEnrichedProfiles(organizationId);

      if (profilesToScore.length === 0) {
        return {
          success: true,
          data: { message: 'No profiles to rescore', scored: 0, failed: 0 },
        };
      }

      console.log(
        `[Rescore] Rescoring ${profilesToScore.length} profiles against qualification ${qualificationId}`
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

          console.log(`[Rescore] Profile ${profileId}: score=${result.score}, passed=${result.passed}`);
          scored++;
        } catch (err) {
          console.error(`[Rescore] Failed to score profile ${profileId}:`, err);
          failed++;
        }
      }

      return {
        success: true,
        data: {
          message: `Rescored ${scored} profiles`,
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
  )
  // Enrich profiles using People Data Labs (all organizations)
  .post(
    '/enrichment/pdl-all',
    async ({ body }) => {
      if (!isPDLConfigured()) {
        return { success: false, error: 'PDL_API_KEY not configured' };
      }

      const { limit = 50 } = body;

      // Get profiles that are missing experience data (across all orgs)
      const profilesNeedingEnrichment = await getProfilesMissingExperienceAll(limit);

      if (profilesNeedingEnrichment.length === 0) {
        return {
          success: true,
          data: { message: 'No profiles need PDL enrichment', enriched: 0, failed: 0, total: 0 },
        };
      }

      console.log(`[PDL] Enriching ${profilesNeedingEnrichment.length} profiles missing experience data`);

      let enriched = 0;
      let failed = 0;

      for (const profile of profilesNeedingEnrichment) {
        try {
          const pdlResponse = await enrichPerson({
            firstName: profile.first_name,
            lastName: profile.last_name,
            company: profile.current_company,
            linkedinUrl: profile.linkedin_url,
          });

          if (pdlResponse.status === 200 && pdlResponse.data) {
            const enrichmentData = convertPDLToEnrichment(pdlResponse.data);

            await upsertProfileEnrichment(profile.id, enrichmentData);

            // Auto-score the profile against all qualifications
            if (enrichmentData.rawResponse) {
              await scoreProfileAgainstAllQualifications(
                profile.id,
                enrichmentData.rawResponse as Record<string, unknown>
              );
            }

            console.log(
              `[PDL] Enriched profile ${profile.id} (${profile.first_name} ${profile.last_name}): ` +
                `${pdlResponse.data.experience?.length || 0} experiences found`
            );
            enriched++;
          } else if (pdlResponse.status === 404) {
            // Mark as not found so we don't retry
            await markPDLNotFound(profile.id);
            console.log(
              `[PDL] No match for profile ${profile.id} (${profile.first_name} ${profile.last_name}): marked as not found`
            );
            failed++;
          } else {
            console.log(
              `[PDL] Failed for profile ${profile.id} (${profile.first_name} ${profile.last_name}): status=${pdlResponse.status}`
            );
            failed++;
          }

          // Rate limit: PDL allows 100/min free, 1000/min paid
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`[PDL] Failed to enrich profile ${profile.id}:`, err);
          failed++;
        }
      }

      return {
        success: true,
        data: {
          message: `PDL enriched ${enriched} profiles`,
          enriched,
          failed,
          total: profilesNeedingEnrichment.length,
        },
      };
    },
    {
      body: t.Object({
        limit: t.Optional(t.Number()),
      }),
    }
  )
  // Enrich profiles using People Data Labs (by org - for manual use)
  .post(
    '/enrichment/pdl',
    async ({ body }) => {
      if (!isPDLConfigured()) {
        return { success: false, error: 'PDL_API_KEY not configured' };
      }

      const { organizationId, limit = 50 } = body;

      // Get profiles that are missing experience data
      const profilesNeedingEnrichment = await getProfilesMissingExperience(organizationId, limit);

      if (profilesNeedingEnrichment.length === 0) {
        return {
          success: true,
          data: { message: 'No profiles need PDL enrichment', enriched: 0, failed: 0 },
        };
      }

      console.log(`[PDL] Enriching ${profilesNeedingEnrichment.length} profiles missing experience data`);

      let enriched = 0;
      let failed = 0;

      for (const profile of profilesNeedingEnrichment) {
        try {
          const pdlResponse = await enrichPerson({
            firstName: profile.first_name,
            lastName: profile.last_name,
            company: profile.current_company,
            linkedinUrl: profile.linkedin_url,
          });

          if (pdlResponse.status === 200 && pdlResponse.data) {
            const enrichmentData = convertPDLToEnrichment(pdlResponse.data);

            await upsertProfileEnrichment(profile.id, enrichmentData);

            console.log(
              `[PDL] Enriched profile ${profile.id} (${profile.first_name} ${profile.last_name}): ` +
                `${pdlResponse.data.experience?.length || 0} experiences found`
            );
            enriched++;
          } else {
            console.log(
              `[PDL] No match for profile ${profile.id} (${profile.first_name} ${profile.last_name}): status=${pdlResponse.status}`
            );
            failed++;
          }

          // Rate limit: PDL allows 100/min free, 1000/min paid
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (err) {
          console.error(`[PDL] Failed to enrich profile ${profile.id}:`, err);
          failed++;
        }
      }

      return {
        success: true,
        data: {
          message: `PDL enriched ${enriched} profiles`,
          enriched,
          failed,
          total: profilesNeedingEnrichment.length,
        },
      };
    },
    {
      body: t.Object({
        organizationId: t.String(),
        limit: t.Optional(t.Number()),
      }),
    }
  )
  // Update profile status by vanity name
  .post(
    '/profile/update-status',
    async ({ body }) => {
      const { vanityName, status } = body;

      // Find profile by vanity name
      const result = await pool.query(
        `UPDATE similar_profiles
         SET status = $1, reviewed_at = NOW()
         WHERE vanity_name = $2
         RETURNING id, first_name, last_name, status`,
        [status, vanityName.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Profile not found' };
      }

      return {
        success: true,
        data: {
          message: `Updated ${result.rows.length} profile(s) to status: ${status}`,
          profiles: result.rows,
        },
      };
    },
    {
      body: t.Object({
        vanityName: t.String(),
        status: t.Union([
          t.Literal('new'),
          t.Literal('qualified'),
          t.Literal('disqualified'),
          t.Literal('contacted'),
          t.Literal('replied'),
        ]),
      }),
    }
  );

// Helper function to get profiles missing experience data (specific org)
async function getProfilesMissingExperience(
  organizationId: string,
  limit: number
): Promise<
  Array<{
    id: number;
    first_name: string;
    last_name: string;
    current_company: string;
    linkedin_url: string;
  }>
> {
  const result = await pool.query(
    `SELECT sp.id, sp.first_name, sp.last_name, sp.profile_url as linkedin_url,
            COALESCE(pe.raw_response->>'current_company_name', pe.raw_response->'current_company'->>'name') as current_company
     FROM similar_profiles sp
     JOIN profile_enrichments pe ON sp.id = pe.profile_id
     WHERE sp.organization_id = $1
       AND sp.first_name IS NOT NULL
       AND sp.last_name IS NOT NULL
       AND (
         pe.raw_response->'experience' IS NULL
         OR jsonb_typeof(pe.raw_response->'experience') != 'array'
         OR jsonb_array_length(pe.raw_response->'experience') = 0
       )
     ORDER BY sp.captured_at DESC
     LIMIT $2`,
    [organizationId, limit]
  );

  return result.rows;
}

// Helper function to get profiles missing experience data (all orgs)
async function getProfilesMissingExperienceAll(
  limit: number
): Promise<
  Array<{
    id: number;
    first_name: string;
    last_name: string;
    current_company: string;
    linkedin_url: string;
  }>
> {
  const result = await pool.query(
    `SELECT sp.id, sp.first_name, sp.last_name, sp.profile_url as linkedin_url,
            COALESCE(pe.raw_response->>'current_company_name', pe.raw_response->'current_company'->>'name') as current_company
     FROM similar_profiles sp
     JOIN profile_enrichments pe ON sp.id = pe.profile_id
     WHERE sp.organization_id IS NOT NULL
       AND sp.first_name IS NOT NULL
       AND sp.last_name IS NOT NULL
       AND COALESCE(pe.pdl_not_found, false) = false
       AND (
         pe.raw_response->'experience' IS NULL
         OR jsonb_typeof(pe.raw_response->'experience') != 'array'
         OR jsonb_array_length(pe.raw_response->'experience') = 0
       )
     ORDER BY sp.captured_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

// Mark a profile as not found in PDL
async function markPDLNotFound(profileId: number): Promise<void> {
  await pool.query(
    `UPDATE profile_enrichments SET pdl_not_found = true WHERE profile_id = $1`,
    [profileId]
  );
}

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
import { enrichPerson, isPDLConfigured, convertPDLToEnrichment } from '../services/pdl.js';

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

// Score a profile against all qualifications in its organization
async function scoreProfileAgainstAllQualifications(
  profileId: number,
  rawResponse: Record<string, unknown>
): Promise<{
  scored: number;
  failed: number;
  results: Array<{
    qualificationId: number;
    qualificationName: string;
    score: number;
    passed: boolean;
  }>;
}> {
  // Get the profile's organization
  const profileResult = await pool.query(
    `SELECT organization_id FROM similar_profiles WHERE id = $1`,
    [profileId]
  );

  if (profileResult.rows.length === 0 || !profileResult.rows[0].organization_id) {
    console.log(`[Scoring] Profile ${profileId} has no organization, skipping scoring`);
    return { scored: 0, failed: 0, results: [] };
  }

  const organizationId = profileResult.rows[0].organization_id;

  // Get all qualifications for this organization
  const qualificationsResult = await pool.query(
    `SELECT id, name, criteria FROM job_qualifications WHERE organization_id = $1`,
    [organizationId]
  );

  if (qualificationsResult.rows.length === 0) {
    console.log(`[Scoring] No qualifications found for organization ${organizationId}`);
    return { scored: 0, failed: 0, results: [] };
  }

  console.log(
    `[Scoring] Scoring profile ${profileId} against ${qualificationsResult.rows.length} qualifications`
  );

  let scored = 0;
  let failed = 0;
  const results: Array<{
    qualificationId: number;
    qualificationName: string;
    score: number;
    passed: boolean;
  }> = [];

  for (const qualification of qualificationsResult.rows) {
    try {
      const result = await scoreProfileWithAI(rawResponse as any, qualification.criteria);

      await upsertQualificationResult(
        profileId,
        qualification.id,
        result.score,
        result.reasoning,
        result.passed
      );

      console.log(
        `[Scoring] Profile ${profileId} vs "${qualification.name}": score=${result.score}, passed=${result.passed}`
      );
      scored++;
      results.push({
        qualificationId: qualification.id,
        qualificationName: qualification.name,
        score: result.score,
        passed: result.passed,
      });
    } catch (err) {
      console.error(
        `[Scoring] Failed to score profile ${profileId} against qualification ${qualification.id}:`,
        err
      );
      failed++;
    }
  }

  return { scored, failed, results };
}

// Score profiles by vanity name against all qualifications
async function scoreProfilesByVanityAgainstAllQualifications(
  vanityName: string,
  rawResponse: Record<string, unknown>
): Promise<{ profilesScored: number; totalScored: number; totalFailed: number }> {
  // Find all profiles with this vanity name
  const profileResult = await pool.query(`SELECT id FROM similar_profiles WHERE vanity_name = $1`, [
    vanityName.toLowerCase(),
  ]);

  if (profileResult.rows.length === 0) {
    return { profilesScored: 0, totalScored: 0, totalFailed: 0 };
  }

  let totalScored = 0;
  let totalFailed = 0;

  for (const row of profileResult.rows) {
    const result = await scoreProfileAgainstAllQualifications(row.id, rawResponse);
    totalScored += result.scored;
    totalFailed += result.failed;
  }

  return { profilesScored: profileResult.rows.length, totalScored, totalFailed };
}
