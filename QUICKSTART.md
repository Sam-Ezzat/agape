# 🚀 Quick Start Guide

Get Agape Conference Management System running on your local machine in 5 minutes!

## Prerequisites

Make sure you have these installed:
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/) (optional but recommended)
- **Git** - [Download here](https://git-scm.com/)

## Method 1: Docker (Recommended) 🐳

**Easiest way to get started!** Everything runs in containers.

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/agape-conference.git
cd agape-conference

# 2. Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start everything with one command!
docker-compose up

# That's it! 🎉
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:3000
# - PostgreSQL: localhost:5432
```

**To stop:** Press `Ctrl+C` or run `docker-compose down`

## Method 2: Manual Setup 🛠️

If you prefer not to use Docker:

### Step 1: Install Dependencies

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Setup Database

**Option A: Use Docker for PostgreSQL only**
```bash
docker run -d \
  --name agape-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=agape_conference \
  -p 5432:5432 \
  postgres:16-alpine
```

**Option B: Install PostgreSQL locally**
- Download from [postgresql.org](https://www.postgresql.org/download/)
- Create database: `CREATE DATABASE agape_conference;`

### Step 3: Configure Environment

```bash
# Backend .env
cp backend/.env.example backend/.env

# Edit backend/.env with your database URL:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agape_conference?schema=public"

# Frontend .env
cp frontend/.env.example frontend/.env
# (defaults should work for local development)
```

### Step 4: Run Database Migrations

```bash
cd backend
npx prisma migrate dev
npx prisma generate

# Optional: Seed with test data
npm run prisma:seed
```

### Step 5: Start Development Servers

Open **two terminal windows**:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Access the app:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Health Check: http://localhost:3000/health

## 🧪 Verify Installation

### Check Backend
```bash
curl http://localhost:3000/health
```

You should see:
```json
{
  "status": "ok",
  "timestamp": "2026-06-24T...",
  "uptime": 12.345,
  "environment": "development"
}
```

### Check Frontend
Open http://localhost:5173 in your browser. You should see the welcome page.

### Check Database (Optional)
```bash
cd backend
npm run prisma:studio
```

Opens Prisma Studio at http://localhost:5555 - a visual database browser.

## 📚 Next Steps

### Explore the System

1. **View seed data**: If you ran `npm run prisma:seed`, you'll have:
   - 1 conference house
   - 2 buildings
   - 5 floors
   - 40+ rooms
   - 8 sample attendees (including Arabic names for i18n testing)

2. **Check Prisma Studio**: Browse the database visually
   ```bash
   cd backend
   npm run prisma:studio
   ```

3. **Test the API**: Use the health check endpoint
   ```bash
   curl http://localhost:3000/health
   ```

### Development Workflow

```bash
# Run tests
npm test                    # Run tests in all workspaces
cd backend && npm test      # Backend tests only
cd frontend && npm test     # Frontend tests only

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build
```

### Make Your First Change

Try editing the frontend:

1. Open `frontend/src/App.tsx`
2. Change the welcome message
3. Save the file
4. Browser auto-refreshes! ⚡

## 🐛 Troubleshooting

### Port Already in Use

If you see `Port 3000 is already in use`:

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

### Database Connection Error

```bash
# Check if PostgreSQL is running
docker ps  # (if using Docker)

# Verify DATABASE_URL in backend/.env
# Make sure it matches your database setup
```

### Prisma Generate Error

```bash
cd backend
npx prisma generate
```

### Node Version Error

```bash
# Check your Node version
node -v

# Should be 18.x or higher
# If not, install from nodejs.org
```

### Module Not Found

```bash
# Clean install dependencies
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

## 🎯 What's Next?

- **Read the architecture**: Check [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Explore the codebase**: Start with `backend/src/server.ts` and `frontend/src/App.tsx`
- **Build features**: See the implementation plan in `/memories/session/plan.md`

## 💡 Tips

- **Hot Reload**: Both frontend and backend auto-reload on file changes
- **Database GUI**: Use Prisma Studio to browse data visually
- **API Testing**: Use Thunder Client (VS Code extension) or Postman
- **Debugging**: Set `LOG_LEVEL=debug` in backend/.env for verbose logs

## 📞 Need Help?

- Check [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed docs
- Open an issue on GitHub
- Check existing issues for solutions

---

Happy coding! 🎉
