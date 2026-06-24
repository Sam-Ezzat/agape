# 🚢 Deployment Guide

Complete guide for deploying Agape Conference Management to Vercel.

## Prerequisites

- GitHub account
- Vercel account ([vercel.com](https://vercel.com))
- PostgreSQL database (Supabase, Neon, or Railway)

## Step 1: Setup Database (Production)

### Option A: Supabase (Recommended - Free Tier)

1. Go to [supabase.com](https://supabase.com) and create account
2. Create new project
3. Go to **Settings** → **Database**
4. Copy connection strings:
   - **Connection string** (for `DATABASE_URL`)
   - **Connection pooling string** (for `DIRECT_URL`)

### Option B: Neon (Serverless PostgreSQL)

1. Go to [neon.tech](https://neon.tech) and create account
2. Create new project
3. Copy connection string
4. Enable connection pooling

### Option C: Railway

1. Go to [railway.app](https://railway.app) and create account
2. Create new PostgreSQL database
3. Copy connection URL

## Step 2: Push Code to GitHub

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit: Agape Conference Management System"

# Create GitHub repository and push
git remote add origin https://github.com/yourusername/agape-conference.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy Backend to Vercel

### 3.1 Create Vercel Project for Backend

1. Go to [vercel.com](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. **Root Directory**: Select `backend`
5. **Framework Preset**: Other
6. Click **Deploy**

### 3.2 Configure Backend Environment Variables

In Vercel project settings, add these environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
DIRECT_URL=postgresql://user:password@host:5432/database?sslmode=require

# Server
NODE_ENV=production
PORT=3000

# Frontend URL (will update after frontend deployment)
FRONTEND_URL=https://your-frontend.vercel.app

# JWT Secret (generate random string)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Logging
LOG_LEVEL=info

# Socket.io
SOCKET_CORS_ORIGIN=https://your-frontend.vercel.app
```

**Generate secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3.3 Run Database Migrations

After backend deploys, run migrations:

```bash
# Install Vercel CLI
npm install -g vercel

# Link project
cd backend
vercel link

# Run migrations
vercel env pull .env.production
npx prisma migrate deploy
```

## Step 4: Deploy Frontend to Vercel

### 4.1 Create Vercel Project for Frontend

1. In Vercel dashboard, click **Add New** → **Project**
2. Import same GitHub repository
3. **Root Directory**: Select `frontend`
4. **Framework Preset**: Vite
5. Click **Deploy**

### 4.2 Configure Frontend Environment Variables

In Vercel project settings, add:

```env
# Backend API URL (from Step 3)
VITE_API_URL=https://your-backend.vercel.app/api

# WebSocket URL
VITE_WS_URL=https://your-backend.vercel.app

# App metadata
VITE_APP_NAME=Agape Conference Management
VITE_APP_VERSION=1.0.0
```

### 4.3 Update Backend CORS Settings

1. Go back to backend Vercel project
2. Update environment variables:
   ```env
   FRONTEND_URL=https://your-frontend.vercel.app
   SOCKET_CORS_ORIGIN=https://your-frontend.vercel.app
   ```
3. Redeploy backend

## Step 5: Setup Automatic Deployments

### 5.1 Configure GitHub Secrets

In your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:

```env
# Vercel tokens and IDs
VERCEL_TOKEN=<your-vercel-token>
VERCEL_ORG_ID=<your-org-id>
VERCEL_PROJECT_ID_BACKEND=<backend-project-id>
VERCEL_PROJECT_ID_FRONTEND=<frontend-project-id>

# Database URL for migrations
DATABASE_URL=<your-production-database-url>

# Deployment URLs for health checks
BACKEND_URL=https://your-backend.vercel.app
FRONTEND_URL=https://your-frontend.vercel.app
```

**Get Vercel credentials:**
```bash
# Login to Vercel CLI
vercel login

# Get tokens and IDs
vercel whoami
vercel project ls
```

### 5.2 Test Automatic Deployment

```bash
# Make a change and push
git add .
git commit -m "test: verify CI/CD pipeline"
git push origin main
```

GitHub Actions will:
1. Run CI tests
2. Deploy backend to Vercel
3. Run database migrations
4. Deploy frontend to Vercel
5. Run health checks

## Step 6: Verify Deployment

### Check Backend Health

```bash
curl https://your-backend.vercel.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-24T...",
  "uptime": 123.45,
  "environment": "production"
}
```

### Check Frontend

Open `https://your-frontend.vercel.app` in browser.

### Check Database

```bash
# Install dependencies locally
cd backend
npm install

# Set production database URL
export DATABASE_URL="your-production-db-url"

# Open Prisma Studio
npx prisma studio
```

## 🔒 Security Checklist

Before going live:

- [ ] Changed default JWT_SECRET
- [ ] Enabled SSL for database connections
- [ ] Set correct CORS origins (no wildcards)
- [ ] Reviewed environment variables (no sensitive data in frontend)
- [ ] Enabled Vercel authentication (if needed)
- [ ] Setup domain name with HTTPS
- [ ] Configured rate limiting (future enhancement)
- [ ] Enabled database backups

## 🎯 Custom Domain (Optional)

### Setup Custom Domain

1. Go to Vercel project settings
2. Click **Domains**
3. Add your domain (e.g., `conference.yourdomain.com`)
4. Update DNS records as instructed by Vercel
5. Update environment variables with new domain

### Update Environment Variables

Backend:
```env
FRONTEND_URL=https://conference.yourdomain.com
SOCKET_CORS_ORIGIN=https://conference.yourdomain.com
```

Frontend:
```env
VITE_API_URL=https://api.yourdomain.com/api
VITE_WS_URL=https://api.yourdomain.com
```

## 📊 Monitoring & Logs

### View Logs

**Vercel Dashboard:**
- Go to project → **Logs** tab
- View real-time function logs
- Filter by deployment, function, status

**Backend Logs:**
```bash
vercel logs <deployment-url>
```

### Error Tracking (Optional)

Consider integrating:
- **Sentry** for error tracking
- **LogRocket** for session replay
- **Logtail** for centralized logging

## 🔄 Database Migrations

### Add New Migration

```bash
# Local development
cd backend
npx prisma migrate dev --name add-new-feature

# Commit migration files
git add prisma/migrations
git commit -m "feat: add new database schema"
git push
```

Migrations run automatically on deployment via GitHub Actions.

### Rollback Migration (if needed)

```bash
# Download production env
vercel env pull .env.production

# Rollback last migration
npx prisma migrate resolve --rolled-back <migration-name>
```

## 📦 Deployment Checklist

Before each production deployment:

- [ ] All tests pass (`npm test`)
- [ ] No linter errors (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Database migrations tested locally
- [ ] Environment variables updated
- [ ] Changelog updated
- [ ] Release notes prepared

## 🚨 Troubleshooting

### Deployment Fails

1. Check GitHub Actions logs
2. Verify environment variables in Vercel
3. Check build logs in Vercel dashboard
4. Ensure all dependencies in package.json

### Database Connection Error

1. Verify DATABASE_URL format
2. Check database is accessible (IP whitelist)
3. Ensure SSL mode is set: `?sslmode=require`
4. Test connection locally with same URL

### Migration Fails

```bash
# Force reset (CAUTION: deletes all data)
npx prisma migrate reset

# Or manually fix migration
npx prisma migrate resolve --applied <migration-name>
```

### CORS Issues

1. Verify FRONTEND_URL matches exactly (no trailing slash)
2. Check SOCKET_CORS_ORIGIN
3. Redeploy backend after changes

## 📞 Support

If you encounter issues:

1. Check [Vercel Status](https://www.vercel-status.com/)
2. Review GitHub Actions logs
3. Check Vercel deployment logs
4. Open GitHub issue with error details

---

🎉 **Congratulations!** Your application is now live in production!
