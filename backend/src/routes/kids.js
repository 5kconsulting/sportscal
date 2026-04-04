import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

import {
  getKidsByUser,
  getKidById,
  createKid,
  updateKid,
  deleteKid,
  getUserPlanLimits,
  countUserKids,
} from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/kids
// ============================================================
router.get('/', async (req, res) => {
  const kids = await getKidsByUser(req.user.id);
  res.json({ kids });
});

// ============================================================
// POST /api/kids
// ============================================================
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Name is required')
      .isLength({ max: 50 }).withMessage('Name too long'),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/).withMessage('Invalid color hex'),
    body('sort_order').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Enforce plan limits
    const [limits, count] = await Promise.all([
      getUserPlanLimits(req.user.id),
      countUserKids(req.user.id),
    ]);

    if (count >= limits.max_kids) {
      return res.status(403).json({
        error: `Your ${req.user.plan} plan supports up to ${limits.max_kids} kids. Upgrade to add more.`,
        limit: limits.max_kids,
        current: count,
      });
    }

    const kid = await createKid({
      userId:    req.user.id,
      name:      req.body.name,
      color:     req.body.color || '#6366f1',
      sortOrder: req.body.sort_order ?? count,
    });

    res.status(201).json({ kid });
  }
);

// ============================================================
// PATCH /api/kids/:id
// ============================================================
router.patch('/:id',
  [
    param('id').isUUID(),
    body('name').optional().trim().notEmpty().isLength({ max: 50 }),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/),
    body('sort_order').optional().isInt({ min: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const kid = await getKidById(req.params.id, req.user.id);
    if (!kid) return res.status(404).json({ error: 'Kid not found' });

    const updated = await updateKid(req.params.id, req.user.id, req.body);
    res.json({ kid: updated });
  }
);

// ============================================================
// DELETE /api/kids/:id
// ============================================================
router.delete('/:id',
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const deleted = await deleteKid(req.params.id, req.user.id);
    if (!deleted) return res.status(404).json({ error: 'Kid not found' });

    res.json({ ok: true });
  }
);

export default router;
