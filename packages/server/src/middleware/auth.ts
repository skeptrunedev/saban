import { Elysia } from 'elysia';
import * as jose from 'jose';
import type { User } from '@saban/shared';

// JWT secret for extension tokens - read lazily to ensure dotenv has loaded
function getJwtSecret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET ||
      process.env.WORKOS_COOKIE_PASSWORD ||
      'a-secure-32-character-password!!'
  );
}

// Admin API key for testing - read at runtime
function getAdminApiKey() {
  return process.env.ADMIN_API_KEY;
}

// Admin user used when authenticating with admin API key
const ADMIN_USER: User = {
  id: 'admin-test-user',
  email: 'admin@test.local',
  firstName: 'Admin',
  lastName: 'Test',
  profilePictureUrl: null,
};

// Session data stored in cookies
export interface SessionData {
  user?: User;
  organizationId?: string;
}

// Verify JWT token for extension auth
async function verifyJWT(token: string): Promise<{ user: User; organizationId?: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getJwtSecret(), {
      algorithms: ['HS256'],
    });

    if (!payload.sub || !payload.email) {
      return null;
    }

    const user: User = {
      id: payload.sub as string,
      email: payload.email as string,
      firstName: (payload.firstName as string) || null,
      lastName: (payload.lastName as string) || null,
      profilePictureUrl: (payload.profilePictureUrl as string) || null,
      currentOrganizationId: (payload.organizationId as string) || null,
    };

    return {
      user,
      organizationId: payload.organizationId as string | undefined,
    };
  } catch (err) {
    console.error('JWT verification failed:', err);
    return null;
  }
}

// Generate JWT for extension
export async function generateExtensionToken(
  user: User,
  organizationId?: string,
  organizationName?: string,
  expiresIn: string = '30d'
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(Date.now() / 1000) + parseExpiry(expiresIn);

  const token = await new jose.SignJWT({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePictureUrl: user.profilePictureUrl,
    organizationId,
    organizationName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  return { token, expiresAt };
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([dhms])$/);
  if (!match) return 30 * 24 * 60 * 60; // default 30 days

  const [, num, unit] = match;
  const value = parseInt(num, 10);

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60;
    case 'h':
      return value * 60 * 60;
    case 'm':
      return value * 60;
    case 's':
      return value;
    default:
      return 30 * 24 * 60 * 60;
  }
}

// Simple session encoding/decoding (for cookie storage)
function encodeSession(data: SessionData): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

function decodeSession(encoded: string): SessionData {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return {};
  }
}

// Auth plugin that provides session management and auth checking
export const authPlugin = new Elysia({ name: 'auth' }).derive({ as: 'global' }, ({ cookie }) => {
  // Get session from cookie
  const sessionCookie = cookie.saban_session;
  const cookieValue = sessionCookie?.value;
  const session: SessionData =
    typeof cookieValue === 'string' && cookieValue ? decodeSession(cookieValue) : {};

  return {
    session,
    saveSession: (data: SessionData) => {
      const isProduction = !!process.env.COOKIE_DOMAIN || process.env.NODE_ENV === 'production';
      const cookieOptions: {
        value: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'lax';
        maxAge: number;
        path: string;
        domain?: string;
      } = {
        value: encodeSession(data),
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      };
      // Set domain for cross-subdomain cookie sharing in production
      if (process.env.COOKIE_DOMAIN) {
        cookieOptions.domain = process.env.COOKIE_DOMAIN;
      }
      cookie.saban_session.set(cookieOptions);
    },
    destroySession: () => {
      cookie.saban_session.remove();
    },
  };
});

// Auth guard plugin - requires authentication
export const requireAuth = new Elysia({ name: 'requireAuth' })
  .use(authPlugin)
  .derive({ as: 'global' }, async ({ session, headers, request }) => {
    // Skip auth for internal API routes (they have their own auth)
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/internal')) {
      return {
        user: null as User | null,
        organizationId: undefined as string | undefined,
        authError: undefined as string | undefined,
        skipAuth: true,
      };
    }

    // First, check for admin API key (for testing)
    const adminKey = headers['x-admin-api-key'];
    const adminApiKey = getAdminApiKey();
    console.log('[Auth] Admin key check:', {
      adminKey,
      expected: adminApiKey,
      match: adminKey === adminApiKey,
    });
    if (adminApiKey && adminKey === adminApiKey) {
      // Get organization ID from header if provided
      const orgId = headers['x-organization-id'] as string | undefined;
      return {
        user: ADMIN_USER,
        organizationId: orgId,
        authError: undefined as string | undefined,
      };
    }

    // Second, try Bearer token (for extension)
    const authHeader = headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const result = await verifyJWT(token);

      if (result) {
        return {
          user: result.user,
          organizationId: result.organizationId,
          authError: undefined as string | undefined,
        };
      }

      // Invalid token - will be caught by onBeforeHandle
      return {
        user: null as User | null,
        organizationId: undefined as string | undefined,
        authError: 'Invalid or expired token',
      };
    }

    // Fall back to session cookie (for web app)
    if (session && session.user) {
      return {
        user: session.user,
        organizationId: session.organizationId,
        authError: undefined as string | undefined,
      };
    }

    return {
      user: null as User | null,
      organizationId: undefined as string | undefined,
      authError: 'Unauthorized',
    };
  })
  .onBeforeHandle({ as: 'global' }, ({ user, authError, skipAuth, set }) => {
    // Skip auth check for internal routes
    if (skipAuth) return;

    if (!user) {
      set.status = 401;
      return { success: false, error: authError || 'Unauthorized' };
    }
  });

// Auth guard that also requires an organization
export const requireOrgAuth = new Elysia({ name: 'requireOrgAuth' })
  .use(requireAuth)
  .onBeforeHandle({ as: 'global' }, ({ user, organizationId, set }) => {
    if (!user) {
      set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }
    if (!organizationId) {
      set.status = 403;
      return { success: false, error: 'No organization selected' };
    }
  });
