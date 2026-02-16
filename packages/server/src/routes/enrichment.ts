import { Elysia, t } from 'elysia';
import {
  getProfilesByIds,
  getProfileEnrichment,
  getProfileQualificationResults,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { triggerScrape, isBrightDataConfigured } from '../services/brightdata.js';

export const enrichmentRoutes = new Elysia({ prefix: '/api/enrichment' })
  .use(requireAuth)
  .post(
    '/enrich',
    async ({ body, organizationId, set }) => {
      if (!organizationId) {
        set.status = 403;
        return { success: false, error: 'No organization selected' };
      }

      const { profileIds } = body;

      if (!profileIds || profileIds.length === 0) {
        set.status = 400;
        return { success: false, error: 'profileIds required' };
      }

      if (!isBrightDataConfigured()) {
        set.status = 500;
        return { success: false, error: 'BrightData not configured' };
      }

      // Get profiles to enrich
      const profiles = await getProfilesByIds(profileIds, organizationId);
      if (profiles.length === 0) {
        set.status = 404;
        return { success: false, error: 'No profiles found' };
      }

      // Trigger BrightData scrape - results delivered to R2, processed by cron worker
      const profileUrls = profiles.map((p) => p.profile_url);
      const snapshotId = await triggerScrape(profileUrls);

      console.log(`Triggered BrightData scrape for ${profiles.length} profiles, snapshotId=${snapshotId}`);

      return {
        success: true,
        data: {
          message: `Enrichment triggered for ${profiles.length} profiles`,
          snapshotId,
          profileCount: profiles.length,
        },
      };
    },
    {
      body: t.Object({
        profileIds: t.Array(t.Number()),
      }),
    }
  )
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
