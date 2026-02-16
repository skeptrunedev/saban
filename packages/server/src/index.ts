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
import { qualificationsRoutes } from './routes/qualifications.js';
import { enrichmentRoutes } from './routes/enrichment.js';
import { internalRoutes } from './routes/internal.js';
import { getProfileCount, insertProfiles } from './db.js';
import { requireAuth } from './middleware/auth.js';

const PORT = process.env.PORT || 3847;

new Elysia()
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
          { name: 'Qualifications', description: 'Job qualification criteria' },
          { name: 'Enrichment', description: 'Profile enrichment and AI scoring' },
        ],
      },
    })
  )
  .use(
    cors({
      origin: ['http://localhost:5173', 'https://saban.skeptrune.com', /^chrome-extension:\/\//],
      credentials: true,
    })
  )
  // Image proxy (public, no auth required) - must be before auth middleware
  .get('/api/image-proxy', async ({ query, set }) => {
    const url = query.url;
    if (!url || typeof url !== 'string') {
      set.status = 400;
      return { error: 'url parameter required' };
    }

    try {
      // Decode the URL (it should be base64 encoded)
      const decodedUrl = Buffer.from(url, 'base64').toString('utf-8');

      // Only allow proxying from known image domains
      const allowedDomains = [
        'media.licdn.com',
        'media-exp1.licdn.com',
        'media-exp2.licdn.com',
        'static.licdn.com',
        'platform-lookaside.fbsbx.com',
      ];

      const urlObj = new URL(decodedUrl);
      if (!allowedDomains.some((domain) => urlObj.hostname.endsWith(domain))) {
        set.status = 403;
        return { error: 'Domain not allowed' };
      }

      const response = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        set.status = response.status;
        return { error: 'Failed to fetch image' };
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      set.headers['Content-Type'] = contentType;
      set.headers['Cache-Control'] = 'public, max-age=86400'; // Cache for 1 day

      return buffer;
    } catch (err) {
      console.error('Image proxy error:', err);
      set.status = 500;
      return { error: 'Failed to proxy image' };
    }
  })
  // Routes
  .use(authRoutes)
  .use(profilesRoutes)
  .use(organizationsRoutes)
  .use(qualificationsRoutes)
  .use(enrichmentRoutes)
  .use(internalRoutes)
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
  .get('/stats', async ({ organizationId }) => {
    const total = await getProfileCount(organizationId);
    return { total };
  })
  .listen(PORT);

console.log(`LinkedIn profiles server running on http://localhost:${PORT}`);
