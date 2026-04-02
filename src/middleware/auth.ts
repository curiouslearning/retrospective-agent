import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import cookieSession from 'cookie-session';
import { Express, Request, Response, NextFunction } from 'express';

export function setupAuth(app: Express, config: {
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  allowedEmails: string[];
  baseUrl: string;
}) {
  app.use(cookieSession({
    name: 'session',
    keys: [config.sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  }));

  // Passport compatibility shim for cookie-session
  app.use((req: any, _res: any, next: any) => {
    if (req.session && !req.session.regenerate) {
      req.session.regenerate = (cb: any) => cb();
    }
    if (req.session && !req.session.save) {
      req.session.save = (cb: any) => cb();
    }
    next();
  });

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new GoogleStrategy(
    {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: `${config.baseUrl}/auth/callback`,
      proxy: true,
    },
    (_accessToken, _refreshToken, profile, done) => {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(null, false);
      if (!config.allowedEmails.includes(email.toLowerCase())) {
        return done(null, false);
      }
      return done(null, { email, name: profile.displayName });
    }
  ));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user as Express.User));

  // Auth routes
  app.get('/auth/login', passport.authenticate('google', {
    scope: ['email', 'profile'],
  }));

  app.get('/auth/callback',
    (req: Request, res: Response, next: NextFunction) => {
      passport.authenticate('google', {
        failureRedirect: '/auth/denied',
      }, (err: any, user: any) => {
        if (err) return next(err);
        if (!user) return res.redirect('/auth/denied');
        req.logIn(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          return res.redirect('/');
        });
      })(req, res, next);
    }
  );

  app.get('/auth/denied', (_req: Request, res: Response) => {
    res.status(403).send('Access denied. Your account is not on the allowlist.');
  });

  app.get('/auth/logout', (req: Request, res: Response) => {
    req.logout(() => res.redirect('/auth/login'));
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.redirect('/auth/login');
}