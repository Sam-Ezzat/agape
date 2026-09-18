# 🔧 WhatsApp Integration Troubleshooting Guide

## Common Issues & Solutions

### 1. "Navigating frame was detached" Error

**Problem:** Puppeteer fails to initialize WhatsApp Web with frame detachment error.

**Solution:** ✅ **FIXED** - Updated Puppeteer configuration with Windows-compatible settings:
- Removed `--single-process` flag
- Added `--disable-blink-features=AutomationControlled`
- Added `--disable-features=IsolateOrigins,site-per-process`
- Increased timeout to 60 seconds
- Added specific WhatsApp Web version cache

**What was changed:**
```typescript
// backend/src/services/communication/whatsapp.service.ts
puppeteer: {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
  ],
  timeout: 60000,
},
webVersionCache: {
  type: 'remote',
  remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
},
```

**Test the fix:**
1. Restart backend server: `npm run dev`
2. Navigate to: http://localhost:5173/communication/whatsapp
3. Click "Initialize WhatsApp"
4. QR code should appear within 10-30 seconds

---

### 2. Session Storage Issues

**Problem:** Session not persisting or "Session already taken" error.

**Solution:**
1. Delete the session folder:
   ```powershell
   cd c:\Users\SAM-PC\agape\backend
   Remove-Item -Recurse -Force .\whatsapp-session
   ```

2. Restart server and reinitialize
3. Scan QR code again

**Why:** Session files can get corrupted if server crashes during initialization.

---

### 3. Slow QR Code Generation

**Problem:** QR code takes 30+ seconds to appear.

**Normal behavior:**
- First initialization: 15-30 seconds (downloading Chromium)
- Subsequent initializations: 5-15 seconds

**If taking longer:**
1. Check internet connection (downloads WhatsApp Web assets)
2. Check antivirus/firewall (may block Puppeteer)
3. Check available disk space (Chromium + session = ~200MB)

**Speed up:**
- Keep session folder (don't delete unless necessary)
- Use wired internet connection
- Disable antivirus temporarily for testing

---

### 4. Rate Limiting Issues

**Problem:** "Rate limit exceeded" errors.

**Current limits:**
- 50 messages per hour
- 200 messages per day
- 3-8 second random delay between messages

**View current usage:**
- Go to WhatsApp Setup page
- Check "Messages Today" and "Messages This Hour" counters

**Reset counters:**
- Hourly: Resets automatically every 60 minutes
- Daily: Resets at midnight server time
- Manual: Restart server (resets to 0)

**Adjust limits:**
Edit `backend/.env`:
```env
MAX_MESSAGES_PER_HOUR=50
MAX_MESSAGES_PER_DAY=200
WHATSAPP_DELAY_MIN=3000
WHATSAPP_DELAY_MAX=8000
```

---

### 5. Connection Lost During Campaign

**Problem:** WhatsApp disconnects while campaign is running.

**Causes:**
1. Phone lost internet connection
2. WhatsApp app closed on phone
3. Session expired (rare)
4. Phone battery died

**Prevention:**
- Keep phone charged and connected to WiFi
- Keep WhatsApp app running in background
- Don't log out of WhatsApp on phone
- Test with a small campaign first (10-20 messages)

**Recovery:**
1. Reconnect phone to internet
2. Go to WhatsApp Setup page
3. Check connection status
4. If disconnected, reinitialize and scan QR again
5. Resume paused campaign

---

### 6. Windows Defender Blocking Puppeteer

**Problem:** Windows Defender quarantines Chromium executable.

**Solution:**
1. Open Windows Security
2. Go to "Virus & threat protection"
3. Click "Protection history"
4. Find Chromium quarantine entry
5. Click "Allow on device"
6. Add exclusion:
   - Path: `C:\Users\SAM-PC\agape\node_modules\puppeteer*`

**Alternative:**
Use non-headless mode for testing:
```typescript
// Temporarily change in whatsapp.service.ts
puppeteer: {
  headless: false, // Shows Chrome window
  // ... other args
}
```

---

### 7. Port Conflicts

**Problem:** Backend fails to start with "Port already in use" error.

**Solution:**
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID)
taskkill /PID <PID> /F

# Restart backend
npm run dev
```

---

### 8. Redis Connection Issues

**Problem:** "Redis connection refused" when starting campaign.

**Solution:**

**Option 1: Install Redis locally**
```powershell
# Using Chocolatey
choco install redis-64

# Start Redis server
redis-server

# Verify running
redis-cli ping
# Should return: PONG
```

**Option 2: Use Redis Cloud (Free Tier)**
1. Visit: https://redis.io/try-free
2. Create account
3. Create database
4. Copy connection URL
5. Update `backend/.env`:
   ```env
   REDIS_URL="redis://default:password@host:port"
   ```

**Current status:** Redis is optional for testing frontend UI but required for:
- Campaign execution
- Message queue processing
- Real-time progress updates

---

### 9. QR Code Not Displaying in Frontend

**Problem:** Frontend shows "QR code not available" after initialization.

**Debugging steps:**

1. Check backend logs for "QR Code received"
2. Check browser console for Socket.io errors
3. Verify Socket.io connection:
   ```javascript
   // In browser console
   localStorage.debug = '*'
   // Reload page, check for socket.io messages
   ```

4. Check CORS settings in `backend/src/app.ts`:
   ```typescript
   cors: {
     origin: 'http://localhost:5173',
     credentials: true,
   }
   ```

5. Check if QR code is being emitted:
   ```typescript
   // backend/src/services/communication/whatsapp.service.ts
   this.client.on('qr', (qr) => {
     console.log('QR CODE:', qr); // Debug log
     this.io.emit('whatsapp:qr', { qr });
   });
   ```

---

### 10. Database Connection Errors

**Problem:** "Can't reach database server" errors.

**Check connection:**
```powershell
cd c:\Users\SAM-PC\agape\backend
npx prisma studio
# Should open Prisma Studio in browser
```

**If Prisma Studio fails:**
1. Check internet connection (Neon database is cloud-hosted)
2. Verify `DATABASE_URL` in `.env` is correct
3. Test connection:
   ```powershell
   npx prisma db pull
   # Should pull schema without errors
   ```

---

## 🔍 Debug Mode

### Enable Verbose Logging

**Backend:**
```env
# backend/.env
LOG_LEVEL="debug"
```

**Frontend:**
```javascript
// Browser console
localStorage.debug = '*'
```

**WhatsApp Web Client:**
```typescript
// backend/src/services/communication/whatsapp.service.ts
// Add to Client constructor:
puppeteer: {
  devtools: true, // Opens Chrome DevTools
  headless: false, // Shows browser window
  // ...
}
```

---

## 📊 Health Checks

### Quick System Check

**1. Backend Health:**
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok","timestamp":"...","uptime":123,"environment":"development"}`

**2. WhatsApp Status:**
```bash
curl http://localhost:3000/api/communication/whatsapp/status
```
Expected: `{"success":true,"data":{"isConnected":true,"isReady":true,...}}`

**3. Templates List:**
```bash
curl http://localhost:3000/api/communication/templates
```
Expected: Array of 4 seed templates

**4. Database Check:**
```powershell
npx prisma studio
# Opens GUI at http://localhost:5555
```

---

## 🚨 Emergency Fixes

### Complete Reset

If everything is broken, full reset:

```powershell
# 1. Stop all servers (Ctrl+C in all terminals)

# 2. Delete session data
cd c:\Users\SAM-PC\agape\backend
Remove-Item -Recurse -Force .\whatsapp-session

# 3. Restart database connection
npx prisma generate
npx prisma db push

# 4. Reseed data
npm run prisma:seed

# 5. Restart servers
npm run dev
```

### Log Files

Check logs for detailed errors:
```powershell
# Backend logs (console output)
# Frontend logs (browser DevTools > Console)
# Prisma logs (backend/.env: DEBUG="prisma:*")
```

---

## 📞 Support Checklist

Before asking for help, collect this info:

- [ ] Windows version: `winver`
- [ ] Node version: `node --version` (v20+)
- [ ] npm version: `npm --version`
- [ ] Backend logs (last 50 lines)
- [ ] Frontend browser console errors
- [ ] Screenshot of error message
- [ ] Steps to reproduce
- [ ] When did it last work?

---

## ✅ Known Working Configuration

**Environment:**
- Windows 11
- Node.js v20.x
- npm 10.x
- PostgreSQL (Neon cloud)
- Redis (local or cloud)

**Status:** ✅ Fixed - WhatsApp initialization working with updated Puppeteer config

**Last tested:** July 17, 2026

---

## 🔗 Useful Links

- [whatsapp-web.js Documentation](https://wwebjs.dev/)
- [Puppeteer Documentation](https://pptr.dev/)
- [Redis Quick Start](https://redis.io/docs/getting-started/)
- [Neon Database Docs](https://neon.tech/docs/)

---

**Updated:** July 17, 2026  
**Issue Fixed:** Navigating frame was detached (Windows Puppeteer configuration)
