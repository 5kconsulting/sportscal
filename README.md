# SportsCal

Multi-tenant sports schedule aggregator. Pulls from TeamSnap, GameChanger,
PlayMetrics, TeamSideline, and BYGA into a single iCal feed per family.

## Quick start

### 1. Prerequisites
- Node.js 20+
- Docker Desktop (running)

### 2. Start database and Redis
```bash
docker-compose up -d
```

### 3. Set up backend
```bash
cd backend
cp .env.example .env
# Edit .env — generate JWT_SECRET with:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm install
npm run dev
```

### 4. Start workers (separate terminal)
```bash
cd backend
npm run worker
```

### 5. Verify
```bash
curl http://localhost:3001/health
```

## Project structure
```
sportscal/
├── docker-compose.yml
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── normalizer.js
│       ├── db/
│       │   ├── schema.sql
│       │   └── index.js
│       ├── middleware/
│       │   └── auth.js
│       ├── routes/
│       │   ├── auth.js
│       │   ├── kids.js
│       │   ├── sources.js
│       │   ├── events.js
│       │   └── calendar.js
│       ├── workers/
│       │   ├── queue.js
│       │   ├── icalWorker.js
│       │   ├── scrapeWorker.js
│       │   ├── emailWorker.js
│       │   ├── scheduler.js
│       │   └── runner.js
│       └── scrapers/
│           └── index.js
└── frontend/          ← coming in Step 5
```

## API endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/signup | Create account |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/kids | List kids |
| POST | /api/kids | Add a kid |
| GET | /api/sources | List sources |
| POST | /api/sources | Add a source |
| POST | /api/sources/:id/refresh | Manual refresh |
| GET | /api/events | Upcoming events |
| GET | /api/events/today | Today's events |
| GET | /feed/:token.ics | iCal feed (public) |
| GET | /health | Server health |
