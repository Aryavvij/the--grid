# The Grid — Backend API

Node.js + Express + PostgreSQL backend for The Grid personal OS.

## Stack

- **Runtime**: Node.js 18+
- **Framework**: Express
- **Database**: Supabase (PostgreSQL) via Prisma ORM
- **Auth**: JWT (httpOnly cookies) + Google OAuth 2.0
- **Deploy**: Railway (backend) + Supabase (database)

---

## Local Setup

### 1. Install dependencies

```bash
cd grid-backend
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DATABASE_URL` + `DIRECT_URL` — from Supabase (see Supabase Setup below)
- `JWT_SECRET` — run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` to generate one
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `FRONTEND_URL` — your Vercel URL (or `http://localhost:3000` for local dev)

### 3. Set up the database

```bash
# Create and run migrations
npm run db:migrate

# Generate Prisma client
npm run db:generate
```

### 4. Start the server

```bash
# Development (auto-restarts on save)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:4000`
Health check: `http://localhost:4000/health`

---

## Supabase Setup

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `the-grid`, choose a strong DB password, pick the closest region
3. Once created, go to **Settings → Database → Connection string**
4. Copy two URLs into your `.env`:
   - **Transaction mode** (port `6543`) → paste as `DATABASE_URL`, append `?pgbouncer=true`
   - **Session mode / Direct** (port `5432`) → paste as `DIRECT_URL`
5. Run `npm run db:migrate` — this creates all tables in your Supabase database

You can verify the tables appeared in **Supabase → Table Editor**.

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable **Google+ API** and **Google OAuth2 API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - Local: `http://localhost:4000/api/auth/google/callback`
   - Production: `https://your-railway-app.up.railway.app/api/auth/google/callback`
7. Copy the Client ID and Secret into your `.env`

---

## Deploy to Railway (backend only — DB is on Supabase)

1. Push this folder to GitHub (inside the `aryavvij` repo, under `grid-backend/`)
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select the `aryavvij` repo, set root directory to `grid-backend`
4. In **Variables**, add all env vars from your `.env` (DATABASE_URL, DIRECT_URL, JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL, BACKEND_URL)
5. Set `BACKEND_URL` to your Railway app URL (e.g. `https://grid-backend.up.railway.app`)
6. Railway auto-deploys on every push to main — `railway.toml` handles running migrations on deploy

---

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Create account |
| POST | /api/auth/login | — | Login with email/password |
| GET | /api/auth/google | — | Start Google OAuth flow |
| GET | /api/auth/google/callback | — | Google OAuth callback |
| POST | /api/auth/logout | ✓ | Clear auth cookie |
| GET | /api/auth/me | ✓ | Get current user |
| GET/PUT | /api/profile | ✓ | User profile details |
| GET/POST | /api/habits | ✓ | Habits CRUD |
| POST | /api/habits/:id/log | ✓ | Toggle habit completion |
| GET | /api/habits/logs | ✓ | Habit logs by date range |
| GET/PUT | /api/gym/split | ✓ | Gym split config |
| GET/POST | /api/gym/logs | ✓ | Workout logs |
| GET/POST | /api/finance/categories | ✓ | Budget categories |
| GET/POST | /api/finance/transactions | ✓ | Transactions |
| GET/POST | /api/calendar/events | ✓ | Calendar events |
| GET/POST | /api/projects | ✓ | Work projects |
| GET/PUT | /api/resume | ✓ | Resume data |
