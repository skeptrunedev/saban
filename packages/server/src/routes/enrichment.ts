import { Elysia, t } from 'elysia';
import { randomUUID } from 'crypto';
import {
  createEnrichmentJob,
  updateEnrichmentJob,
  getEnrichmentJob,
  getEnrichmentJobs,
  getProfilesByIds,
  getProfileEnrichment,
  getProfileQualificationResults,
  upsertProfileEnrichment,
  getQualificationById,
  upsertQualificationResult,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  triggerScrape,
  pollForResults,
  isError,
  type BrightDataProfile,
} from '../services/brightdata.js';
import { scoreProfileWithAI } from '../services/anthropic.js';
import { enqueueJob, isQueueConfigured } from '../services/queue.js';

export const enrichmentRoutes = new Elysia({ prefix: '/api/enrichment' })
  .use(requireAuth)
  .post(
    '/enrich',
    async ({ body, organizationId, set }) => {
      if (!organizationId) {
        set.status = 403;
        return { success: false, error: 'No organization selected' };
      }

      const { profileIds, qualificationId } = body;

      if (!profileIds || profileIds.length === 0) {
        set.status = 400;
        return { success: false, error: 'profileIds required' };
      }

      // Verify qualification exists if provided
      if (qualificationId) {
        const qualification = await getQualificationById(qualificationId, organizationId);
        if (!qualification) {
          set.status = 404;
          return { success: false, error: 'Qualification not found' };
        }
      }

      // Get profiles to enrich
      const profiles = await getProfilesByIds(profileIds, organizationId);
      if (profiles.length === 0) {
        set.status = 404;
        return { success: false, error: 'No profiles found' };
      }

      // Create job record
      const jobId = randomUUID();
      const job = await createEnrichmentJob(
        jobId,
        profiles.map((p) => p.id),
        organizationId,
        qualificationId
      );

      // Check if CF Queue is configured
      if (isQueueConfigured()) {
        // Send to CF Queue for processing
        await enqueueJob({
          jobId,
          profileIds: profiles.map((p) => p.id),
          profileUrls: profiles.map((p) => p.profile_url),
          qualificationId,
          organizationId,
        });
        console.log(`Enqueued job ${jobId} to CF Queue`);
      } else {
        // Fallback to in-process for local dev
        console.log(`CF Queue not configured, processing job ${jobId} in-process`);
        processEnrichmentJob(jobId, profiles, organizationId, qualificationId).catch((err) => {
          console.error(`Enrichment job ${jobId} failed:`, err);
          updateEnrichmentJob(jobId, {
            status: 'failed',
            error: err.message,
            completedAt: new Date(),
          });
        });
      }

      return { success: true, data: { job } };
    },
    {
      body: t.Object({
        profileIds: t.Array(t.Number()),
        qualificationId: t.Optional(t.Number()),
      }),
    }
  )
  .get('/jobs', async ({ organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const jobs = await getEnrichmentJobs(organizationId);
    return { success: true, data: jobs };
  })
  .get('/jobs/:id', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const job = await getEnrichmentJob(params.id);

    if (!job || job.organization_id !== organizationId) {
      set.status = 404;
      return { success: false, error: 'Job not found' };
    }

    return { success: true, data: job };
  })
  .get('/profiles/:id', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const profileId = parseInt(params.id, 10);
    const enrichment = await getProfileEnrichment(profileId);

    return { success: true, data: enrichment };
  })
  .get('/profiles/:id/qualifications', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const profileId = parseInt(params.id, 10);
    const results = await getProfileQualificationResults(profileId);

    return { success: true, data: results };
  });

// Background processing function
async function processEnrichmentJob(
  jobId: string,
  profiles: { id: number; profile_url: string }[],
  organizationId: string,
  qualificationId?: number
) {
  console.log(`Starting enrichment job ${jobId} for ${profiles.length} profiles`);

  // Update status to scraping
  await updateEnrichmentJob(jobId, { status: 'scraping' });

  // Trigger BrightData scrape
  const profileUrls = profiles.map((p) => p.profile_url);
  const snapshotId = await triggerScrape(profileUrls);

  await updateEnrichmentJob(jobId, { snapshotId, status: 'scraping' });
  console.log(`Job ${jobId}: BrightData snapshot ${snapshotId} created`);

  // Poll for results
  const results = await pollForResults(snapshotId);
  console.log(`Job ${jobId}: Got ${results.length} results from BrightData`);

  // Update status to enriching
  await updateEnrichmentJob(jobId, { status: 'enriching' });

  // Process results and store enrichments
  const profileUrlToId = new Map(profiles.map((p) => [p.profile_url, p.id]));

  for (const result of results) {
    if (isError(result)) {
      console.error(`Job ${jobId}: Error for ${result.url}: ${result.error}`);
      continue;
    }

    const profileData = result as BrightDataProfile;
    const profileId = profileUrlToId.get(profileData.url);

    if (!profileId) {
      console.warn(`Job ${jobId}: No profile found for URL ${profileData.url}`);
      continue;
    }

    // Store enrichment data
    await upsertProfileEnrichment(profileId, {
      connectionCount: profileData.connection_count,
      followerCount: profileData.follower_count,
      experience: profileData.experience,
      education: profileData.education,
      skills: profileData.skills,
      certifications: profileData.certifications,
      languages: profileData.languages,
      about: profileData.about,
      rawResponse: profileData,
    });

    console.log(`Job ${jobId}: Stored enrichment for profile ${profileId}`);
  }

  // If qualification specified, run AI scoring
  if (qualificationId) {
    await updateEnrichmentJob(jobId, { status: 'qualifying' });

    const qualification = await getQualificationById(qualificationId, organizationId);
    if (qualification) {
      for (const result of results) {
        if (isError(result)) continue;

        const profileData = result as BrightDataProfile;
        const profileId = profileUrlToId.get(profileData.url);
        if (!profileId) continue;

        try {
          const { score, reasoning, passed } = await scoreProfileWithAI(
            profileData,
            qualification.criteria
          );

          await upsertQualificationResult(profileId, qualificationId, score, reasoning, passed);
          console.log(`Job ${jobId}: Scored profile ${profileId}: ${score}/100 (${passed ? 'PASS' : 'FAIL'})`);
        } catch (err) {
          console.error(`Job ${jobId}: Failed to score profile ${profileId}:`, err);
        }
      }
    }
  }

  // Mark job complete
  await updateEnrichmentJob(jobId, {
    status: 'completed',
    completedAt: new Date(),
  });

  console.log(`Job ${jobId}: Completed successfully`);
}
