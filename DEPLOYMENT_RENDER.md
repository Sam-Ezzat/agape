# 🚢 Production Deployment Guide (Render & Neon)

Complete guide for deploying Agape Conference Management to Render (for WebSockets support) and Neon PostgreSQL.

## Prerequisites

- GitHub account
- Render account ([render.com](https://render.com))
- Neon account ([neon.tech](https://neon.tech))

---

## Step 1: Setup Database on Neon

1. Sign up at [neon.tech](https://neon.tech) and create a new project.
2. Select your preferred PostgreSQL version and region (closest to your users or closest to Render's servers, e.g., Oregon `us-west-2` or Frankfurt `eu-central-1`).
3. Copy your project connection string from the dashboard:
   - Connection URL look like: `postgresql://[user]:[password]@[host]/neondb?sslmode=require`
   - Paste this as your `DATABASE_URL` and `DIRECT_URL`.

---

## Step 2: Push Latest Changes to GitHub

If you have uncommitted files, wrap them up and push:
```bash
git add .
git commit -m "feat: configure render and neon deployment with websocket support"
git push origin dev
```

---

## Step 3: Deploy Backend to Render (Web Service)

Since Render natively supports continuous Node.js processes, **WebSockets (Socket.io) works perfectly out of the box.**

### 3.1 Create Web Service on Render
1. Go to the [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Set the following details:
   - **Name**: `agape-backend` (or similar)
   - **Environment**: `Node`
   - **Region**: Same region as your Neon database (highly recommended for performance).
   - **Branch**: `dev` or `main` (the branch you want to deploy).
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm start`
   - **Instance Type**: `Free` (or any individual paid tier)

### 3.2 Configure Environment Variables
In the **Environment** tab of your Render Web Service, add:
- `DATABASE_URL`: Your pooled Neon connection string.
- `DIRECT_URL`: Your direct/non-pooled Neon connection string (useful for migrations, though often same on Neon).
- `NODE_ENV`: `production`
- `PORT`: `10000` (Render will bind automatically, but Express defaults to 10000 on Render).
- `JWT_SECRET`: A secure random secret key (e.g. `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`).
- `FRONTEND_URL`: `https://agape-frontend.onrender.com` (use your actual frontend URL once created).
- `SOCKET_CORS_ORIGIN`: `https://agape-frontend.onrender.com`

---

## Step 4: Deploy Frontend to Render (Static Site)

### 4.1 Create Static Site on Render
1. Click **New +** → **Static Site**.
2. Connect the same GitHub repository.
3. Set the following details:
   - **Name**: `agape-frontend` (or similar)
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

### 4.2 Configure Environment Variables & Rewrite rules
In your Static Site settings:
1. Go to **Environment** tab and add:
   - `VITE_API_URL`: `https://agape-backend.onrender.com/api` (use your Render Web Service URL)
   - `VITE_WS_URL`: `https://agape-backend.onrender.com` (use your Render Web Service URL, **no `/api` suffix**)
   - `VITE_APP_NAME`: `Agape Conference Management`
   - `VITE_APP_VERSION`: `1.0.0`

2. Go to the **Redirects/Rewrites** tab:
   - Add a rule to handle client-side routing (React Router):
     - **Source**: `/*`
     - **Destination**: `/index.html`
     - **Action**: `Rewrite`

---

## Step 5: Updating Environment Configuration
Ensure your frontend can contact the Render backend with WebSocket protocols over TLS (`https://` matches with `wss://` internally under Socket.io).

Everything is configured dynamically through `import.meta.env.VITE_API_URL` and `import.meta.env.VITE_WS_URL`!

---

## 🔒 Post-Deployment Checklist
- [ ] Confirm WebSockets are working by opening the browser console and looking for `✅ Socket connected: ...`.
- [ ] Ensure Neon DB connection is secured with SSL (`?sslmode=require`).
- [ ] Confirm rooming changes and check-ins trigger live-update toasts on other connected clients instantly.
