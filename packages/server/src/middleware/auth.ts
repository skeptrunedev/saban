import type { Request, Response, NextFunction } from 'express';
import { getIronSession } from 'iron-session';
import type { User } from '@saban/shared';

export interface SessionData {
  user?: User;
}

const sessionOptions = {
  password: process.env.WORKOS_COOKIE_PASSWORD || 'a-secure-32-character-password!!',
  cookieName: 'saban_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },
};

export async function getSession(req: Request, res: Response) {
  return getIronSession<SessionData>(req, res, sessionOptions);
}

export async function withAuth(req: Request, res: Response, next: NextFunction) {
  const session = await getSession(req, res);

  if (!session.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  (req as Request & { user: User }).user = session.user;
  next();
}
