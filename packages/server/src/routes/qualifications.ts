import { Elysia, t } from 'elysia';
import {
  createQualification,
  getQualifications,
  getQualificationById,
  updateQualification,
  deleteQualification,
  getEnrichedProfilesForScoring,
  upsertQualificationResult,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { scoreProfileWithAI } from '../services/anthropic.js';

export const qualificationsRoutes = new Elysia({ prefix: '/api/qualifications' })
  .use(requireAuth)
  .post(
    '/',
    async ({ body, user, organizationId, set }) => {
      if (!organizationId) {
        set.status = 403;
        return { success: false, error: 'No organization selected' };
      }

      const { name, description, criteria } = body;

      const qualification = await createQualification(
        organizationId,
        name,
        description || null,
        criteria,
        user!.id
      );

      return { success: true, data: qualification };
    },
    {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
        criteria: t.Object({
          minConnections: t.Optional(t.Number()),
          minFollowers: t.Optional(t.Number()),
          requiredSkills: t.Optional(t.Array(t.String())),
          preferredSkills: t.Optional(t.Array(t.String())),
          minExperienceYears: t.Optional(t.Number()),
          requiredTitles: t.Optional(t.Array(t.String())),
          preferredTitles: t.Optional(t.Array(t.String())),
          requiredCompanies: t.Optional(t.Array(t.String())),
          preferredCompanies: t.Optional(t.Array(t.String())),
          requiredEducation: t.Optional(t.Array(t.String())),
          customPrompt: t.Optional(t.String()),
        }),
      }),
    }
  )
  .get('/', async ({ organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const qualifications = await getQualifications(organizationId);
    return { success: true, data: qualifications };
  })
  .get('/:id', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const id = parseInt(params.id, 10);
    const qualification = await getQualificationById(id, organizationId);

    if (!qualification) {
      set.status = 404;
      return { success: false, error: 'Qualification not found' };
    }

    return { success: true, data: qualification };
  })
  .patch(
    '/:id',
    async ({ params, body, organizationId, set }) => {
      if (!organizationId) {
        set.status = 403;
        return { success: false, error: 'No organization selected' };
      }

      const id = parseInt(params.id, 10);
      const qualification = await updateQualification(id, organizationId, body);

      if (!qualification) {
        set.status = 404;
        return { success: false, error: 'Qualification not found' };
      }

      return { success: true, data: qualification };
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        criteria: t.Optional(
          t.Object({
            minConnections: t.Optional(t.Number()),
            minFollowers: t.Optional(t.Number()),
            requiredSkills: t.Optional(t.Array(t.String())),
            preferredSkills: t.Optional(t.Array(t.String())),
            minExperienceYears: t.Optional(t.Number()),
            requiredTitles: t.Optional(t.Array(t.String())),
            preferredTitles: t.Optional(t.Array(t.String())),
            requiredCompanies: t.Optional(t.Array(t.String())),
            preferredCompanies: t.Optional(t.Array(t.String())),
            requiredEducation: t.Optional(t.Array(t.String())),
            customPrompt: t.Optional(t.String()),
          })
        ),
      }),
    }
  )
  .delete('/:id', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const id = parseInt(params.id, 10);
    const deleted = await deleteQualification(id, organizationId);

    if (!deleted) {
      set.status = 404;
      return { success: false, error: 'Qualification not found' };
    }

    return { success: true };
  })
  // Score all enriched profiles against this qualification
  .post('/:id/score', async ({ params, organizationId, set }) => {
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }

    const qualificationId = parseInt(params.id, 10);
    const qualification = await getQualificationById(qualificationId, organizationId);

    if (!qualification) {
      set.status = 404;
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
  });
