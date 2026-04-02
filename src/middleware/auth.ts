import { google } from 'googleapis';
import cookieSession from 'cookie-session';
import { Express, Request, Response, NextFunction } from 'express';

export function setupAuth(app: Express, config: {
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  allowedEmails: string[];
  baseUrl: string;
}) {
  const callbackURL = `${config.baseUrl}/auth/callback`;

  function getOAuthClient() {
    return new google.auth.OAuth2(
      config.googleClientId,
      config.googleClientSecret,
      callbackURL,
    );
  }

  app.use(cookieSession({
    name: 'session',
    keys: [config.sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  }));

  app.get('/auth/login', (_req: Request, res: Response) => {
    const oAuth2Client = getOAuthClient();
    const url = oAuth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['email', 'profile'],
    });
    res.redirect(url);
  });

  app.get('/auth/callback', async (req: Request, res: Response) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    try {
      const oAuth2Client = getOAuthClient();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oAuth2Client });
      const { data } = await oauth2.userinfo.get();
      const email = data.email?.toLowerCase();

      if (!email || !config.allowedEmails.includes(email)) {
        return res.redirect('/auth/denied');
      }

      (req.session as any).user = { email, name: data.name };
      return res.redirect('/');
    } catch (err: any) {
      console.error('OAuth callback error:', err.message);
      return res.redirect('/auth/login');
    }
  });

  app.get('/auth/denied', (_req: Request, res: Response) => {
    res.status(403).send('Access denied. Your account is not on the allowlist.');
  });

  app.get('/auth/logout', (req: Request, res: Response) => {
    req.session = null;
    res.redirect('/auth/login');
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any)?.user) return next();
  res.redirect('/auth/login');
}