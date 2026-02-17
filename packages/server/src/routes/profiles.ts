import { Elysia, t } from 'elysia';
import {
  insertProfiles,
  getProfileCount,
  getProfiles,
  getProfileById,
  updateProfile,
  getAllTags,
  exportProfiles,
  getProfileByVanityName,
  getReviewQueue,
  getNextReviewProfile,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { triggerScrape, isBrightDataConfigured } from '../services/brightdata.js';
import type { ProfilesQuery } from '@saban/shared';

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export const profilesRoutes = new Elysia({ prefix: '/api/profiles' })
  .use(requireAuth)
  .post(
    '/',
    async ({ body, user, organizationId, set }) => {
      const { profiles, sourceProfileUrl, sourceSection } = body;

      if (!profiles || !Array.isArray(profiles)) {
        set.status = 400;
        return { success: false, error: 'profiles array required' };
      }

      if (!organizationId) {
        set.status = 403;
        return {
          success: false,
          error: 'No organization selected. Please authenticate with an organization.',
        };
      }

      const { inserted, newProfileUrls } = await insertProfiles(
        profiles,
        sourceProfileUrl,
        sourceSection,
        organizationId,
        user!.id
      );
      const total = await getProfileCount(organizationId);

      console.log(
        `Inserted ${inserted} profiles from ${sourceProfileUrl} for org ${organizationId}. Total: ${total}`
      );

      // Auto-enrich new profiles if BrightData is configured
      if (isBrightDataConfigured() && newProfileUrls.length > 0) {
        try {
          const snapshotId = await triggerScrape(newProfileUrls);
          console.log(
            `Auto-enrichment triggered for ${newProfileUrls.length} profiles, snapshotId=${snapshotId}`
          );
        } catch (err) {
          console.error('Auto-enrichment trigger failed:', err);
          // Don't fail the insert if enrichment fails
        }
      }

      return { success: true, inserted, total };
    },
    {
      body: t.Object({
        profiles: t.Array(
          t.Object({
            profileUrl: t.String(),
            vanityName: t.Optional(t.String()),
            firstName: t.Optional(t.String()),
            lastName: t.Optional(t.String()),
            memberUrn: t.Optional(t.String()),
            headline: t.Optional(t.String()),
            profilePictureUrl: t.Optional(t.String()),
            location: t.Optional(t.String()),
            connectionDegree: t.Optional(t.String()),
            profilePicturePayload: t.Optional(t.String()),
            raw: t.Optional(t.Any()),
          })
        ),
        sourceProfileUrl: t.String(),
        sourceSection: t.String(),
      }),
    }
  )
  .get('/', async ({ query, organizationId }) => {
    const profilesQuery: ProfilesQuery = {
      page: query.page ? parseInt(query.page as string, 10) : 1,
      limit: query.limit ? parseInt(query.limit as string, 10) : 50,
      search: query.search as string | undefined,
      status: query.status as ProfilesQuery['status'],
      tags: query.tags ? (query.tags as string).split(',') : undefined,
      sortBy: query.sortBy as ProfilesQuery['sortBy'],
      sortOrder: query.sortOrder as ProfilesQuery['sortOrder'],
      qualificationId: query.qualificationId
        ? parseInt(query.qualificationId as string, 10)
        : undefined,
    };

    const { profiles, total } = await getProfiles(profilesQuery, organizationId);
    const totalPages = Math.ceil(total / (profilesQuery.limit || 50));

    return {
      success: true,
      data: {
        items: profiles,
        total,
        page: profilesQuery.page || 1,
        limit: profilesQuery.limit || 50,
        totalPages,
      },
    };
  })
  .get('/export', async ({ query, organizationId, set }) => {
    const exportQuery = {
      search: query.search as string | undefined,
      status: query.status as ProfilesQuery['status'],
      tags: query.tags ? (query.tags as string).split(',') : undefined,
      sortBy: query.sortBy as ProfilesQuery['sortBy'],
      sortOrder: query.sortOrder as ProfilesQuery['sortOrder'],
    };

    const profiles = await exportProfiles(exportQuery, organizationId);

    const headers = [
      'id',
      'first_name',
      'last_name',
      'headline',
      'location',
      'connection_degree',
      'vanity_name',
      'profile_url',
      'profile_picture_url',
      'status',
      'tags',
      'notes',
      'source_profile_url',
      'source_section',
      'captured_at',
    ];

    const csvRows = [headers.join(',')];

    for (const profile of profiles) {
      const row = [
        profile.id,
        escapeCSV(profile.first_name || ''),
        escapeCSV(profile.last_name || ''),
        escapeCSV(profile.headline || ''),
        escapeCSV(profile.location || ''),
        escapeCSV(profile.connection_degree || ''),
        escapeCSV(profile.vanity_name || ''),
        escapeCSV(profile.profile_url || ''),
        escapeCSV(profile.profile_picture_url || ''),
        escapeCSV(profile.status || 'new'),
        escapeCSV((profile.tags || []).join(';')),
        escapeCSV(profile.notes || ''),
        escapeCSV(profile.source_profile_url || ''),
        escapeCSV(profile.source_section || ''),
        profile.captured_at,
      ];
      csvRows.push(row.join(','));
    }

    set.headers['Content-Type'] = 'text/csv';
    set.headers['Content-Disposition'] = 'attachment; filename=leads-export.csv';
    return csvRows.join('\n');
  })
  .get('/tags', async ({ organizationId }) => {
    const tags = await getAllTags(organizationId);
    return { success: true, data: tags };
  })
  .get('/by-vanity/:vanityName', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const profile = await getProfileByVanityName(params.vanityName, organizationId);

    if (!profile) {
      set.status = 404;
      return { success: false, error: 'Profile not found' };
    }

    return { success: true, data: profile };
  })
  .get('/review-queue', async ({ query, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const limit = query.limit ? parseInt(query.limit as string, 10) : 50;
    const profiles = await getReviewQueue(organizationId, limit);

    return {
      success: true,
      data: {
        items: profiles,
        total: profiles.length,
      },
    };
  })
  .get('/next-review/:currentId', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const currentId = parseInt(params.currentId, 10);
    const nextProfile = await getNextReviewProfile(organizationId, currentId);

    if (!nextProfile) {
      return { success: true, data: null, message: 'No more profiles to review' };
    }

    return { success: true, data: nextProfile };
  })
  .get('/:id', async ({ params, organizationId, set }) => {
    const id = parseInt(params.id, 10);
    const profile = await getProfileById(id, organizationId);

    if (!profile) {
      set.status = 404;
      return { success: false, error: 'Profile not found' };
    }

    return { success: true, data: profile };
  })
  .patch(
    '/:id',
    async ({ params, body, organizationId, set }) => {
      const id = parseInt(params.id, 10);
      const { notes, tags, status, reviewedAt, contactedAt } = body;

      const profile = await updateProfile(id, { notes, tags, status, reviewedAt, contactedAt }, organizationId);

      if (!profile) {
        set.status = 404;
        return { success: false, error: 'Profile not found' };
      }

      return { success: true, data: profile };
    },
    {
      body: t.Object({
        notes: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        status: t.Optional(
          t.Union([
            t.Literal('new'),
            t.Literal('contacted'),
            t.Literal('replied'),
            t.Literal('qualified'),
            t.Literal('disqualified'),
          ])
        ),
        reviewedAt: t.Optional(t.Boolean()),
        contactedAt: t.Optional(t.Boolean()),
      }),
    }
  );
