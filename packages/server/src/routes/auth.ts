import { Elysia, t } from 'elysia';
import { WorkOS } from '@workos-inc/node';
import { authPlugin, requireAuth, generateExtensionToken } from '../middleware/auth.js';
import {
  upsertUser,
  getUserOrganizations,
  getOrganizationById,
  isOrganizationMember,
  addOrganizationMember,
  createOrganization,
} from '../db.js';
import type { User } from '@saban/shared';

let _workos: WorkOS | null = null;
function getWorkOS(): WorkOS {
  if (!_workos) {
    _workos = new WorkOS(process.env.WORKOS_API_KEY);
  }
  return _workos;
}

function getClientId(): string {
  return process.env.WORKOS_CLIENT_ID || '';
}

function getRedirectUri(): string {
  return process.env.WORKOS_REDIRECT_URI || 'http://localhost:3847/api/auth/callback';
}

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(authPlugin)
  .get('/login', ({ redirect }) => {
    const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
      provider: 'authkit',
      clientId: getClientId(),
      redirectUri: getRedirectUri(),
    });
    return redirect(authorizationUrl);
  })
  .get('/callback', async ({ query, redirect, saveSession }) => {
    const code = query.code as string;

    if (!code) {
      return redirect('http://localhost:5173/login?error=no_code');
    }

    try {
      const { user: workosUser, organizationId } =
        await getWorkOS().userManagement.authenticateWithCode({
          clientId: getClientId(),
          code,
        });

      const user: User = {
        id: workosUser.id,
        email: workosUser.email,
        firstName: workosUser.firstName,
        lastName: workosUser.lastName,
        profilePictureUrl: workosUser.profilePictureUrl,
      };

      // Sync user to local DB
      await upsertUser(user);

      // Sync organization memberships from WorkOS
      try {
        const memberships = await getWorkOS().userManagement.listOrganizationMemberships({
          userId: user.id,
        });

        for (const membership of memberships.data) {
          // Ensure org exists locally
          let org = await getOrganizationById(membership.organizationId);
          if (!org) {
            // Fetch from WorkOS and cache
            const workosOrg = await getWorkOS().organizations.getOrganization(
              membership.organizationId
            );
            org = await createOrganization(workosOrg.id, workosOrg.name);
          }

          // Sync membership
          const role = membership.role?.slug === 'admin' ? 'admin' : 'member';
          await addOrganizationMember(user.id, membership.organizationId, role);
        }
      } catch (err) {
        console.error('Failed to sync org memberships:', err);
      }

      // Save session
      const sessionData: { user: User; organizationId?: string } = { user };
      if (organizationId) {
        sessionData.organizationId = organizationId;
      }
      saveSession(sessionData);

      // Check if user has organizations
      const userOrgs = await getUserOrganizations(user.id);

      if (userOrgs.length === 0) {
        return redirect('http://localhost:5173/organizations/new');
      } else if (userOrgs.length === 1 && !organizationId) {
        // Only one org - auto-select it
        saveSession({ user, organizationId: userOrgs[0].id });
        return redirect('http://localhost:5173/');
      } else if (!organizationId) {
        return redirect('http://localhost:5173/organizations/select');
      } else {
        return redirect('http://localhost:5173/');
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      return redirect('http://localhost:5173/login?error=auth_failed');
    }
  })
  .post('/logout', ({ destroySession }) => {
    destroySession();
    return { success: true };
  })
  .get('/me', async ({ session }) => {
    if (!session.user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get user's organizations
    const organizations = await getUserOrganizations(session.user.id);

    // Get current organization details
    let currentOrganization = null;
    if (session.organizationId) {
      currentOrganization = await getOrganizationById(session.organizationId);
    }

    return {
      success: true,
      data: {
        user: {
          ...session.user,
          currentOrganizationId: session.organizationId,
        },
        organizations,
        currentOrganization,
      },
    };
  })
  .use(requireAuth)
  .post(
    '/select-organization',
    async ({ body, user, saveSession, session, set }) => {
      const { organizationId } = body;

      if (!organizationId) {
        set.status = 400;
        return { success: false, error: 'Organization ID is required' };
      }

      // Verify user is a member
      const isMember = await isOrganizationMember(user!.id, organizationId);
      if (!isMember) {
        set.status = 403;
        return { success: false, error: 'Not a member of this organization' };
      }

      saveSession({ user: session.user!, organizationId });

      const organization = await getOrganizationById(organizationId);

      return {
        success: true,
        data: { organization },
      };
    },
    {
      body: t.Object({
        organizationId: t.String(),
      }),
    }
  )
  .get('/extension-token', async ({ user, session, set }) => {
    if (!session.organizationId) {
      set.status = 400;
      return {
        success: false,
        error: 'Please select an organization before connecting the extension',
      };
    }

    const organization = await getOrganizationById(session.organizationId);

    const { token, expiresAt } = await generateExtensionToken(
      user!,
      session.organizationId,
      organization?.name
    );

    return {
      success: true,
      data: {
        token,
        user,
        organization,
        expiresAt,
      },
    };
  });
