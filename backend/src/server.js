import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { runMigrations, healthCheck } from './db/index.js';
import { getQueueStats } from './workers/queue.js';

import authRoutes          from './routes/auth.js';
import kidsRoutes          from './routes/kids.js';
import sourcesRoutes       from './routes/sources.js';
import eventsRoutes        from './routes/events.js';
import calendarRoutes      from './routes/calendar.js';
import manualRoutes        from './routes/manual.js';
import passwordResetRoutes from './routes/passwordReset.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// Trust Railway's proxy
app.set('trust proxy', 1);

// ============================================================
// Security middleware
// ============================================================
app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:4173',
    ].filter(Boolean);
    if (!origin || allowed.some(a => origin.startsWith(a))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Global rate limit — generous ceiling, per-route limits are tighter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      500,
  standardHeaders: true,
  legacyHeaders:   false,
}));

app.use(express.json({ limit: '64kb' }));

// ============================================================
// Routes
// ============================================================
app.use('/api/auth',     authRoutes);
app.use('/api/auth',     passwordResetRoutes);
app.use('/api/kids',     kidsRoutes);
app.use('/api/sources',  sourcesRoutes);
app.use('/api/events',   eventsRoutes);
app.use('/api/manual',   manualRoutes);
app.use('/feed',         calendarRoutes); // public: /feed/:token.ics

// ============================================================
// Health check (used by Railway / Render / Docker)
// ============================================================
app.get('/health', async (_req, res) => {
  const [db, queues] = await Promise.all([
    healthCheck(),
    getQueueStats().catch(() => null),
  ]);
  const status = db ? 200 : 503;
  res.status(status).json({ ok: db, db, queues });
});

// ============================================================
// 404 + global error handler
// ============================================================
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Boot
// ============================================================
async function start() {
  await runMigrations();

  // In production run workers in the same process to save resources.
  // When you scale, move workers to a separate Railway service.
  if (process.env.NODE_ENV === 'production') {
    const { default: startWorkers } = await import('./workers/runner.js');
  }

  app.listen(PORT, () => {
    console.log(`[server] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});

export default app;
