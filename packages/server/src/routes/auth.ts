import { Router, type Router as RouterType } from 'express';
import { WorkOS } from '@workos-inc/node';
import { getSession } from '../middleware/auth.js';
import type { User } from '@saban/shared';

const router: RouterType = Router();

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

router.get('/login', (_req, res) => {
  const authorizationUrl = getWorkOS().userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: getClientId(),
    redirectUri: getRedirectUri(),
  });
  res.redirect(authorizationUrl);
});

router.get('/callback', async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    res.redirect('http://localhost:5173/login?error=no_code');
    return;
  }

  try {
    const { user: workosUser } = await getWorkOS().userManagement.authenticateWithCode({
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

    const session = await getSession(req, res);
    session.user = user;
    await session.save();

    res.redirect('http://localhost:5173/');
  } catch (error) {
    console.error('Auth callback error:', error);
    res.redirect('http://localhost:5173/login?error=auth_failed');
  }
});

router.post('/logout', async (req, res) => {
  const session = await getSession(req, res);
  session.destroy();
  res.json({ success: true });
});

router.get('/me', async (req, res) => {
  const session = await getSession(req, res);

  if (!session.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  res.json({ success: true, data: { user: session.user } });
});

export default router;
