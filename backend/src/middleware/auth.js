import jwt from 'jsonwebtoken';
import { getUserById, getHouseholdMemberIds } from '../db/index.js';

// ============================================================
// requireAuth middleware
//
// Validates Bearer JWT, attaches req.user for downstream routes.
// Usage: router.get('/protected', requireAuth, handler)
// ============================================================
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await getUserById(payload.sub);

    if (!user) return res.status(401).json({ error: 'User not found' });

    // Populate the household member array so downstream handlers can
    // scope their queries by household with `WHERE user_id = ANY($N)`
    // instead of a single user_id. Falls back to [user.id] if the
    // household backfill hasn't run yet (shouldn't happen post-deploy).
    user.householdMemberIds = await getHouseholdMemberIds(user.id);

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============================================================
// requirePlan middleware factory
// Usage: router.post('/digest', requireAuth, requirePlan('pro'), handler)
// ============================================================
export function requirePlan(...plans) {
  return (req, res, next) => {
    if (!plans.includes(req.user.plan)) {
      return res.status(403).json({
        error: 'Plan upgrade required',
        required: plans,
        current: req.user.plan,
      });
    }
    next();
  };
}
