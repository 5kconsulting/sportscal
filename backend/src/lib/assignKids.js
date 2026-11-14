// ============================================================================
// assignKids.js — "Whose schedule is this?" answered in the setup chat.
//
// A pasted calendar link is added first and the question comes after. When
// the parent types a name, the model emits an assign_kids action and the
// SERVER carries it out here, rather than the app. That matters because a
// fresh install runs the app's built-in code for its whole first session
// (over-the-air updates only apply from the next launch) — and that older
// code has never heard of assign_kids.
// ============================================================================

import {
  queryOne, getKidsByUser, createKid, countUserKids, getUserPlanLimits,
  setKidSources, rebuildDisplayTitles, invalidateFeedCache,
} from '../db/index.js';
import { buildDisplayTitle } from '../normalizer.js';

const KID_PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#eab308'];

/**
 * Put the named kids on the calendar this user just added.
 *   { ok: true,  source: { id, name }, kids: [{ id, name, color }] }
 *   { ok: false, reason: 'no_source' | 'no_names' | 'kid_limit', message }
 *
 * "Just added" = their newest calendar from the last two hours that nobody
 * is assigned to yet. Requiring it to be unassigned means a name typed after
 * a failed add can't land on an older, already-sorted calendar.
 */
export async function assignKidsToNewestCalendar(userId, names) {
  const wanted = [...new Set((names || []).map(n => String(n).trim()).filter(Boolean))]
    .map(n => n.slice(0, 50)).slice(0, 8);
  if (wanted.length === 0) return { ok: false, reason: 'no_names', message: 'I didn\'t catch a name.' };

  const source = await queryOne(
    `SELECT s.id, s.name FROM sources s
      WHERE s.user_id = $1 AND s.name <> '__manual__'
        AND s.created_at > NOW() - INTERVAL '2 hours'
        AND NOT EXISTS (SELECT 1 FROM kid_sources ks WHERE ks.source_id = s.id)
      ORDER BY s.created_at DESC LIMIT 1`,
    [userId],
  );
  if (!source) {
    return {
      ok: false, reason: 'no_source',
      message: 'I don\'t have a newly added calendar to put that name on. Paste the team\'s calendar link and I\'ll add it.',
    };
  }

  const existing = await getKidsByUser(userId);
  const limits = await getUserPlanLimits(userId);
  let count = await countUserKids(userId);
  const assigned = [];
  for (const name of wanted) {
    let kid = existing.find(k => k.name.toLowerCase() === name.toLowerCase());
    if (!kid) {
      if (count >= limits.max_kids) {
        // Same neutral wording as POST /api/kids (no purchase language in the iOS app).
        if (assigned.length === 0) {
          return {
            ok: false, reason: 'kid_limit',
            message: `You've reached the limit of ${limits.max_kids} kids, so I couldn't add ${name}. Remove one to add a new one.`,
          };
        }
        break;
      }
      kid = await createKid({ userId, name, color: KID_PALETTE[count % KID_PALETTE.length], sortOrder: count });
      existing.push(kid);
      count += 1;
    }
    assigned.push(kid);
  }

  await setKidSources(source.id, assigned.map(k => ({ kid_id: k.id, title_contains: null })));
  await rebuildDisplayTitles(source.id, (rawTitle, location, kids) => buildDisplayTitle(rawTitle, location, kids));
  await invalidateFeedCache(userId);

  return {
    ok: true,
    source: { id: source.id, name: source.name },
    kids: assigned.map(k => ({ id: k.id, name: k.name, color: k.color })),
  };
}
