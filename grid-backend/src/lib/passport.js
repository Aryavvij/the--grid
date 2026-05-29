const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/auth/google/callback`,
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name  = profile.displayName;

      if (!email) {
        return done(new Error('No email returned from Google'), null);
      }

      // Upsert: find by googleId or email, create if not found
      let user = await db.user.findFirst({
        where: {
          OR: [
            { googleId: profile.id },
            { email },
          ],
        },
      });

      if (user) {
        // Link googleId if they previously signed up with email/password
        if (!user.googleId) {
          user = await db.user.update({
            where: { id: user.id },
            data:  { googleId: profile.id, name: user.name || name },
          });
        }
      } else {
        // Brand-new user via Google
        user = await db.user.create({
          data: {
            email,
            name,
            googleId: profile.id,
          },
        });
      }

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

// We use JWT cookies, not Passport sessions — these are no-ops but required
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => done(null, { id }));
