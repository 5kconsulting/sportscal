import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

import {
  getSourcesByUser,
  getSourceById,
  createSource,
  updateSource,
  deleteSource,
  setKidSources,
  getKidById,
  getUserPlanLimits,
  countUserSources,
  invalidateFeedCache,
  rebuildDisplayTitles,
  getKidsForSource,
} from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { enqueueIcalFetch, enqueueScrapeFetch } from '../workers/queue.js';
import { buildDisplayTitle } from '../normalizer.js';
import { intakeFromUrl } from '../lib/sourceIntake.js';

const router = Router();
router.use(requireAuth);

const VALID_APPS = ['teamsnap', 'teamsnapone', 'gamechanger', 'playmetrics', 'teamsideline', 'byga', 'sportsengine', 'teamreach', 'leagueapps', 'demosphere', '360player', 'sportsyou', 'band', 'rankone', 'google_classroom', 'custom'];
const VALID_FETCH_TYPES = ['ical', 'scrape', 'ical_with_scrape_fallback'];

// ============================================================
// GET /api/sources
// ============================================================
router.get('/', async (req, res) => {
  const sources = await getSourcesByUser(req.user.id);
  res.json({ sources });
});

// ============================================================
// POST /api/sources/intake
//
// Universal "turn raw input into a source candidate" endpoint. Backs all
// three Tier-A onboarding surfaces:
//   - iOS Share Extension      -> { url }
//   - Camera/screenshot        -> { image_b64, mime_type }
//   - Resend Inbound webhook   -> { email_text, email_from, email_subject }
//
// Returns a candidate the client can show in a "looks right? confirm + pick
// kid" UI, NOT a created source. Creating is still POST /api/sources so we
// can keep the validation + kid-assignment + first-fetch logic in one place.
//
// Response shape:
//   200 { kind: 'ical_source',     candidate: { name, app, ical_url, fetch_type } }
//   200 { kind: 'extracted_events', candidate: { ... } }   // future: image/email
//   422 { error: '...' }
//   501 { error: '...' }   // image/email paths until those phases land
// ============================================================
router.post('/intake', async (req, res) => {
  try {
    const { url, image_b64, email_text } = req.body || {};

    // Exactly one input must be provided. Easier to debug than silently
    // preferring one over another, and lets us add new intake types later
    // without changing the contract for old callers.
    const provided = [url, image_b64, email_text].filter(v => v != null);
    if (provided.length !== 1) {
      return res.status(422).json({
        error: 'Provide exactly one of: url, image_b64, email_text',
      });
    }

    if (typeof url === 'string') {
      const result = intakeFromUrl(url);
      if (!result) {
        return res.status(422).json({
          error: 'That doesn\'t look like a calendar URL. iCal links start with https:// or webcal://',
        });
      }
      return res.json(result);
    }

    if (typeof image_b64 === 'string') {
      // Wired up in Phase 2 (mobile camera/screenshot capture). Returns 501
      // for now so the route shape is stable and the share-extension can
      // ship without waiting on the vision pipeline.
      return res.status(501).json({
        error: 'Image intake is not available yet. Try a calendar URL for now.',
      });
    }

    if (typeof email_text === 'string') {
      // Wired up in Phase 4 (Resend Inbound webhook). The intake request
      // body shape will likely change once we see Resend's actual payload —
      // this stub just guarantees the URL space is reserved.
      return res.status(501).json({
        error: 'Email intake is not available yet.',
      });
    }

    res.status(422).json({ error: 'Unsupported intake type' });
  } catch (err) {
    console.error('[sources/intake] error:', err.message);
    res.status(500).json({ error: 'Intake failed — please try again.' });
  }
});

// ============================================================
// GET /api/sources/:id
// ============================================================
router.get('/:id',
  [param('id').isUUID()],
  async (req, res) => {
    const source = await getSourceById(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: 'Source not found' });
    res.json({ source });
  }
);

// ============================================================
// POST /api/sources
// ============================================================
router.post('/',
  [
    body('name').trim().notEmpty().isLength({ max: 100 }),
    body('app').isIn(VALID_APPS),
    body('fetch_type').isIn(VALID_FETCH_TYPES),
    body('ical_url').optional({ nullable: true }).custom(val => {
      if (!val) return true;
      const normalized = val.replace(/^webcal:\/\//i, 'https://');
      try { new URL(normalized); return true; } catch { throw new Error('Invalid iCal URL'); }
    }),
    body('scrape_url').optional({ nullable: true }).isURL(),
    body('scrape_config').optional({ nullable: true }).isObject(),
    body('refresh_interval_minutes').optional().isInt({ min: 30, max: 1440 }),
    body('kid_ids').optional().isArray(),
    body('kid_ids.*').optional().isUUID(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Validate fetch_type ↔ URL combination
    const { fetch_type, ical_url, scrape_url } = req.body;
    if ((fetch_type === 'ical' || fetch_type === 'ical_with_scrape_fallback') && !ical_url) {
      return res.status(422).json({ error: 'ical_url required for this fetch type' });
    }
    if ((fetch_type === 'scrape' || fetch_type === 'ical_with_scrape_fallback') && !scrape_url) {
      return res.status(422).json({ error: 'scrape_url required for this fetch type' });
    }

    // Enforce plan limits
    const [limits, count] = await Promise.all([
      getUserPlanLimits(req.user.id),
      countUserSources(req.user.id),
    ]);

    if (count >= limits.max_sources) {
      return res.status(403).json({
        error: `Your ${req.user.plan} plan supports up to ${limits.max_sources} sources. Upgrade to add more.`,
        limit: limits.max_sources,
        current: count,
      });
    }

    const source = await createSource({
      userId:                  req.user.id,
      name:                    req.body.name,
      app:                     req.body.app,
      fetchType:               fetch_type,
      icalUrl:                 ical_url || null,
      scrapeUrl:               scrape_url || null,
      scrapeConfig:            req.body.scrape_config || null,
      refreshIntervalMinutes:  req.body.refresh_interval_minutes || 120,
    });

    // Assign kids if provided
    if (req.body.kid_ids?.length) {
      await validateAndAssignKids(source.id, req.body.kid_ids, req.user.id, res);
      if (res.headersSent) return;
    }

    // Kick off an immediate first fetch
    await triggerFetch({ ...source, user_id: req.user.id });

    res.status(201).json({ source: await getSourceById(source.id, req.user.id) });
  }
);

// ============================================================
// PATCH /api/sources/:id
// ============================================================
router.patch('/:id',
  [
    param('id').isUUID(),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('app').optional().isIn(VALID_APPS),
    body('fetch_type').optional().isIn(VALID_FETCH_TYPES),
    body('ical_url').optional({ nullable: true }).custom(val => {
      if (!val) return true;
      const normalized = val.replace(/^webcal:\/\//i, 'https://');
      try { new URL(normalized); return true; } catch { throw new Error('Invalid iCal URL'); }
    }),
    body('scrape_url').optional({ nullable: true }).isURL(),
    body('scrape_config').optional({ nullable: true }).isObject(),
    body('refresh_interval_minutes').optional().isInt({ min: 30, max: 1440 }),
    body('enabled').optional().isBoolean(),
    body('kid_ids').optional().isArray(),
    body('kid_ids.*').optional().isUUID(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const source = await getSourceById(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: 'Source not found' });

    const updated = await updateSource(req.params.id, req.user.id, req.body);

    // If kid assignments changed, update them and rebuild display titles
    if (req.body.kid_ids !== undefined) {
      await validateAndAssignKids(source.id, req.body.kid_ids, req.user.id, res);
      if (res.headersSent) return;

      // Rebuild display titles for all events from this source
      const kids = await getKidsForSource(source.id);
      await rebuildDisplayTitles(source.id, (rawTitle, location) =>
        buildDisplayTitle(rawTitle, location, kids)
      );

      await invalidateFeedCache(req.user.id);
    }

    res.json({ source: await getSourceById(source.id, req.user.id) });
  }
);

// ============================================================
// DELETE /api/sources/:id
// ============================================================
router.delete('/:id',
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const deleted = await deleteSource(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Source not found' });

    await invalidateFeedCache(req.user.id);
    res.json({ ok: true });
  }
);

// ============================================================
// POST /api/sources/:id/refresh  — manual refresh trigger
// ============================================================
router.post('/:id/refresh',
  [param('id').isUUID()],
  async (req, res) => {
    const source = await getSourceById(req.params.id, req.user.id);
    if (!source) return res.status(404).json({ error: 'Source not found' });

    await triggerFetch({ ...source, user_id: req.user.id });

    res.json({ ok: true, message: 'Refresh queued' });
  }
);

// ============================================================
// Helpers
// ============================================================

async function validateAndAssignKids(sourceId, kidIds, userId, res) {
  // Verify all kid IDs belong to this user
  for (const kidId of kidIds) {
    const kid = await getKidById(kidId, userId);
    if (!kid) {
      res.status(422).json({ error: `Kid ${kidId} not found` });
      return false;
    }
  }
  await setKidSources(sourceId, kidIds);
  return true;
}

async function triggerFetch(source) {
  if (source.fetch_type === 'scrape') {
    await enqueueScrapeFetch(source, { priority: 1, force: true });
  } else {
    await enqueueIcalFetch(source, { priority: 1, force: true });
  }
}

export default router;
