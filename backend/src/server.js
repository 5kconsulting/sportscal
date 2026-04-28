import 'dotenv/config';
import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Initialize Sentry before anything else
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.2,
  });
  console.log('[sentry] initialized');
}

import { runMigrations, healthCheck } from './db/index.js';
import { getQueueStats } from './workers/queue.js';

import authRoutes             from './routes/auth.js';
import kidsRoutes             from './routes/kids.js';
import sourcesRoutes          from './routes/sources.js';
import eventsRoutes           from './routes/events.js';
import calendarRoutes         from './routes/calendar.js';
import manualRoutes           from './routes/manual.js';
import passwordResetRoutes    from './routes/passwordReset.js';
import billingRoutes          from './routes/billing.js';
import adminRoutes            from './routes/admin.js';
import emailVerificationRoutes from './routes/emailVerification.js';
import contactsRoutes         from './routes/contacts.js';
import logisticsRoutes        from './routes/logistics.js';
import overridesRoutes        from './routes/overrides.js';
import ingestionsRoutes       from './routes/ingestions.js';
import twilioRoutes           from './routes/twilio.js';
import teamsRoutes            from './routes/teams.js';
import respondRoutes          from './routes/respond.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// Trust Railway's proxy (required for rate limiting and IP detection)
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
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
}));

// Raw body for Stripe webhooks — must come before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '64kb' }));

// ============================================================
// Routes
// ============================================================
app.use('/api/auth',        authRoutes);
app.use('/api/auth',        passwordResetRoutes);
app.use('/api/auth',        emailVerificationRoutes);
app.use('/api/kids',        kidsRoutes);
app.use('/api/sources',     sourcesRoutes);
app.use('/api/events',      eventsRoutes);
app.use('/api/manual',      manualRoutes);
app.use('/api/billing',     billingRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/contacts',    contactsRoutes);
app.use('/api/logistics',   logisticsRoutes);
app.use('/api/overrides',   overridesRoutes);
app.use('/api/ingestions',  ingestionsRoutes);
app.use('/api/teams',       teamsRoutes);
app.use('/api/twilio',      twilioRoutes);   // public: Twilio inbound webhook (signature-verified)
app.use('/feed',            calendarRoutes); // public: /feed/:token.ics
app.use('/r',               respondRoutes);  // public: team-request landing page

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
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
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
