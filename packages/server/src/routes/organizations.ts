import { Elysia, t } from 'elysia';
import { WorkOS } from '@workos-inc/node';
import { requireAuth } from '../middleware/auth.js';
import {
  createOrganization,
  getOrganizationById,
  getUserOrganizations,
  addOrganizationMember,
  removeOrganizationMember,
  getOrganizationMembers,
  isOrganizationMember,
  isOrganizationAdmin,
  upsertUser,
} from '../db.js';

let _workos: WorkOS | null = null;
function getWorkOS(): WorkOS {
  if (!_workos) {
    _workos = new WorkOS(process.env.WORKOS_API_KEY);
  }
  return _workos;
}

export const organizationsRoutes = new Elysia({ prefix: '/api/organizations' })
  .use(requireAuth)
  .post(
    '/',
    async ({ body, user, set }) => {
      const { name } = body;

      if (!name || name.trim().length === 0) {
        set.status = 400;
        return { success: false, error: 'Organization name is required' };
      }

      // Create organization in WorkOS
      const workosOrg = await getWorkOS().organizations.createOrganization({
        name: name.trim(),
      });

      // Cache locally
      const org = await createOrganization(workosOrg.id, workosOrg.name);

      // Ensure user exists in local DB before adding membership
      await upsertUser(user!);

      // Add current user as admin
      await addOrganizationMember(user!.id, org.id, 'admin');

      // Create organization membership in WorkOS
      try {
        await getWorkOS().userManagement.createOrganizationMembership({
          userId: user!.id,
          organizationId: org.id,
          roleSlug: 'admin',
        });
      } catch (err) {
        console.error('Failed to create WorkOS membership:', err);
      }

      return { success: true, data: org };
    },
    {
      body: t.Object({
        name: t.String(),
      }),
    }
  )
  .get('/', async ({ user }) => {
    const organizations = await getUserOrganizations(user!.id);
    return { success: true, data: organizations };
  })
  .get('/:id', async ({ params, user, set }) => {
    const { id } = params;

    // Check membership
    const isMember = await isOrganizationMember(user!.id, id);
    if (!isMember) {
      set.status = 403;
      return { success: false, error: 'Not a member of this organization' };
    }

    const org = await getOrganizationById(id);
    if (!org) {
      set.status = 404;
      return { success: false, error: 'Organization not found' };
    }

    return { success: true, data: org };
  })
  .post(
    '/:id/invitations',
    async ({ params, body, user, set }) => {
      const { id } = params;
      const { email, role = 'member' } = body;

      if (!email) {
        set.status = 400;
        return { success: false, error: 'Email is required' };
      }

      // Check if user is admin
      const isAdmin = await isOrganizationAdmin(user!.id, id);
      if (!isAdmin) {
        set.status = 403;
        return { success: false, error: 'Only admins can invite members' };
      }

      // Send invitation via WorkOS
      const invitation = await getWorkOS().userManagement.sendInvitation({
        email,
        organizationId: id,
        roleSlug: role,
      });

      return {
        success: true,
        data: {
          id: invitation.id,
          email: invitation.email,
          state: invitation.state,
          expiresAt: invitation.expiresAt,
        },
      };
    },
    {
      body: t.Object({
        email: t.String(),
        role: t.Optional(t.Union([t.Literal('admin'), t.Literal('member')])),
      }),
    }
  )
  .get('/:id/members', async ({ params, user, set }) => {
    const { id } = params;

    // Check membership
    const isMember = await isOrganizationMember(user!.id, id);
    if (!isMember) {
      set.status = 403;
      return { success: false, error: 'Not a member of this organization' };
    }

    const members = await getOrganizationMembers(id);
    return { success: true, data: members };
  })
  .delete('/:id/members/:userId', async ({ params, user, set }) => {
    const { id, userId } = params;

    // Check if requester is admin or removing themselves
    const isAdmin = await isOrganizationAdmin(user!.id, id);
    const isSelf = user!.id === userId;

    if (!isAdmin && !isSelf) {
      set.status = 403;
      return { success: false, error: 'Only admins can remove other members' };
    }

    // Remove from local DB
    await removeOrganizationMember(userId, id);

    // Try to remove from WorkOS
    try {
      const memberships = await getWorkOS().userManagement.listOrganizationMemberships({
        userId,
        organizationId: id,
      });

      if (memberships.data.length > 0) {
        await getWorkOS().userManagement.deleteOrganizationMembership(memberships.data[0].id);
      }
    } catch (err) {
      console.error('Failed to remove WorkOS membership:', err);
    }

    return { success: true };
  });
