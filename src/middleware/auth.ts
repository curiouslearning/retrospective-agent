import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import session from 'express-session';
import { Express, Request, Response, NextFunction } from 'express';

export function setupAuth(app: Express, config: {
  googleClientId: string;
  googleClientSecret: string;
  sessionSecret: string;
  allowedEmails: string[];
  baseUrl: string;
}) {
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  console.log('OAuth callback URL:', `${config.baseUrl}/auth/callback`);
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
        passport.authenticate('google', { 
        failureRedirect: '/auth/denied',
        }),
        (_req: Request, res: Response) => res.redirect('/')
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