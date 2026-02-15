import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { authRoutes } from './routes/auth.js';
import { profilesRoutes } from './routes/profiles.js';
import { organizationsRoutes } from './routes/organizations.js';
import { getProfileCount, insertProfiles } from './db.js';
import { requireAuth } from './middleware/auth.js';

const PORT = process.env.PORT || 3847;

const app = new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: 'LinkedIn Leads API',
          version: '1.0.0',
          description: 'API for managing LinkedIn leads with organization support',
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Profiles', description: 'LinkedIn profile/lead management' },
          { name: 'Organizations', description: 'Organization management' },
        ],
      },
    })
  )
  .use(
    cors({
      origin: ['http://localhost:5173', /^chrome-extension:\/\//],
      credentials: true,
    })
  )
  // Routes
  .use(authRoutes)
  .use(profilesRoutes)
  .use(organizationsRoutes)
  // Legacy route for extension compatibility
  .use(requireAuth)
  .post(
    '/profiles',
    async ({ body, user, organizationId, set }) => {
      const { profiles, sourceProfileUrl, sourceSection } = body;

      if (!profiles || !Array.isArray(profiles)) {
        set.status = 400;
        return { error: 'profiles array required' };
      }

      if (!organizationId) {
        set.status = 403;
        return {
          error: 'No organization selected. Please authenticate with an organization.',
        };
      }

      const inserted = await insertProfiles(
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

      return { success: true, inserted, total };
    },
    {
      body: t.Object({
        profiles: t.Array(t.Any()),
        sourceProfileUrl: t.String(),
        sourceSection: t.String(),
      }),
    }
  )
  .get('/stats', async ({ user, organizationId }) => {
    const total = await getProfileCount(organizationId);
    return { total };
  })
  .listen(PORT);

console.log(`LinkedIn profiles server running on http://localhost:${PORT}`);
