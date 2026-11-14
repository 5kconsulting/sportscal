// ============================================================================
// setupAgent.js — proxy route for the SetupAgent chat assistant.
//
// POST /api/setup-agent/message
//   Body: { messages: [{ role: 'user'|'assistant', content }, ...],
//           platform?: 'mobile'|'web' }
//   Returns: { content }   // assistant's text response (may include ACTION:)
//
// The system prompt + APP_INSTRUCTIONS / DEMO_FEEDS live server-side in
// lib/setupAgentPrompt.js so a) the API key never ships in a Vite bundle,
// b) we can per-user rate-limit, and c) we get usage logging in one place.
// ============================================================================

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';

import { requireAuth } from '../middleware/auth.js';
import { getKidsByUser, query, ensureInboundToken, getUserPlanLimits, countUserSources } from '../db/index.js';
import { buildSystemPrompt, APP_INSTRUCTIONS } from '../lib/setupAgentPrompt.js';
import { linkFastPath } from '../lib/calendarLink.js';
import { recordOnboardingEvent } from './track.js';
import { assignKidsToNewestCalendar } from '../lib/assignKids.js';

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4-6 (Sonnet 4.6 alias) — same model the pdf worker uses.
// The setup-agent conversation is short enough that haiku's quality
// dropoff hurts more than sonnet's cost. ~$0.05/setup is well under the
// LTV uplift we'd see from even a single Premium upgrade attributable
// to faster activation. Previously pinned to claude-sonnet-4-20250514
// which was sunset by Anthropic — caused 'setup agent is having a
// moment' errors until the alias was updated.
const MODEL      = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;

// Generous per-user cap. Mean setup is 5-15 messages; this gives us 5x+
// headroom before we'd want a real "you've hit the limit" UX. Anyone
// blowing past 100/day is doing something pathological — let them get a
// 429 and move on.
const setupAgentLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24h
  max: 100,
  keyGenerator: (req) => `user:${req.user?.id || req.ip}`,
  message: { error: 'Setup agent daily limit reached — try again tomorrow.' },
  skip: (req) => process.env.NODE_ENV === 'development',
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// GET /api/setup-agent/apps
//
// Returns the APP_INSTRUCTIONS map so clients can render
// deterministic per-app step lists (e.g. tappable "I use TeamSnap"
// chips on the SetupAgent welcome screen) without duplicating the
// instruction data on the frontend. Single source of truth lives in
// lib/setupAgentPrompt.js. No rate-limit needed — small payload,
// auth-gated, and the data only changes when we ship a code update.
// ============================================================
router.get('/apps', (req, res) => {
  res.json({ apps: APP_INSTRUCTIONS });
});

// ============================================================
// POST /api/setup-agent/message
// ============================================================
router.post('/message', setupAgentLimiter, async (req, res) => {
  try {
    const { messages, platform } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(422).json({ error: 'messages must be a non-empty array' });
    }

    // Belt-and-suspenders: only allow user/assistant roles through. The
    // web client occasionally pushes role:'system' bubbles for inline
    // status events ("Added 'Tualatin Baseball'") and those should never
    // round-trip to the model.
    const apiMessages = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content }));

    if (apiMessages.length === 0) {
      return res.status(422).json({ error: 'no user/assistant messages to send' });
    }

    // Always fetch the kid roster server-side. The system prompt
    // hard-fences kid_name → kid_id resolution against this list, so
    // letting the client pass kids would let a model hallucinate a name
    // that the client could then forge into a source-create payload.
    const kids = await getKidsByUser(req.user.id);

    // The iPhone chat sends PDFs to the user's forwarding address, so the
    // model needs the real address to hand them. Best effort.
    let inboundAddress = null;
    if (platform === 'mobile') {
      const token = await ensureInboundToken(req.user.id).catch(() => null);
      if (token) inboundAddress = `add+${token}@${process.env.INBOUND_DOMAIN || 'inbox.sportscalapp.com'}`;
    }

    // A message that is only a link skips the model: we check the link
    // ourselves and either add it straight away or say exactly what it is
    // (lib/calendarLink.js). Faster, and it never interrogates someone who
    // already did the hard part.
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (lastMsg.role === 'user') {
      const fast = await linkFastPath({
        text: lastMsg.content,
        priorUserTexts: apiMessages.slice(0, -1).filter(m => m.role === 'user').map(m => m.content),
        kids,
        platform: platform === 'mobile' ? 'mobile' : 'web',
        inboundAddress,
        // Same neutral wording as POST /api/sources (no purchase language in the iOS app).
        limitMessage: async () => {
          const [limits, count] = await Promise.all([
            getUserPlanLimits(req.user.id),
            countUserSources(req.user.id),
          ]);
          return count >= limits.max_sources
            ? `You've reached the limit of ${limits.max_sources} calendars. Remove one to add a new one.`
            : null;
        },
      }).catch((err) => {
        console.error('[setup-agent] link fast path failed (falling back to model):', err.message);
        return null;
      });
      if (fast) {
        const platformTag = platform === 'mobile' ? 'mobile' : 'web';
        await query(
          `INSERT INTO setup_agent_messages (user_id, role, content, platform)
           VALUES ($1, 'user', $2, $3),
                  ($1, 'assistant', $4, $3)`,
          [req.user.id, lastMsg.content, platformTag, fast.content],
        ).catch((err) => console.error('[setup-agent] persist failed (non-fatal):', err.message));
        console.log(`[setup-agent] user=${req.user.id} platform=${platformTag} link-fast-path=${fast.kind}`);
        recordOnboardingEvent(req.user.id, 'link_pasted', { result: fast.kind }, platformTag).catch(() => {});
        return res.json({ content: fast.content, link: fast.kind });
      }
    }

    const systemPrompt = buildSystemPrompt(kids, {
      platform: platform === 'mobile' ? 'mobile' : 'web',
      inboundAddress,
    });

    const t0 = Date.now();
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: apiMessages,
    });
    const elapsed = Date.now() - t0;

    let content = resp.content?.[0]?.text || '';
    const usage   = resp.usage || {};

    // "Whose schedule is this?" → the model answers with assign_kids. We
    // carry that out here and take the action out of the reply, so it works
    // the same on every client (including app versions that predate it)
    // and no client can apply it twice.
    let assigned = null;
    const assignMatch = content.match(/ACTION:(\{[^{}]*"assign_kids"[^{}]*\})/s);
    if (assignMatch) {
      let names = [];
      try { names = JSON.parse(assignMatch[1]).kid_names || []; } catch { /* treated as no names */ }
      const result = await assignKidsToNewestCalendar(req.user.id, names).catch((err) => {
        console.error('[setup-agent] assign_kids failed:', err.message);
        return { ok: false, reason: 'error', message: 'I couldn\'t save whose calendar that is. Please try again.' };
      });
      if (result.ok) {
        assigned = { source_id: result.source.id, kids: result.kids };
        content = content.replace(assignMatch[0], '').trim()
          || `Done. That's ${result.kids.map(k => k.name).join(' and ')}'s schedule.`;
        recordOnboardingEvent(req.user.id, 'kid_assigned', { via: 'typed', kids: result.kids.length },
          platform === 'mobile' ? 'mobile' : 'web').catch(() => {});
      } else {
        // Don't let "all set!" stand when nothing was saved.
        content = result.message;
      }
    }

    // Persist this turn (the user's new message + the assistant's reply)
    // for debugging, training data, and future "resume conversation" UX.
    // Best-effort: a write failure here doesn't block the response — the
    // user has already paid the latency, no reason to fail their request
    // because our diagnostic write hiccupped.
    try {
      const lastUserMsg = apiMessages[apiMessages.length - 1];
      const platformTag = platform === 'mobile' ? 'mobile' : 'web';
      // Insert both rows in a single statement so they share their
      // created_at within microseconds — nicer for transcript reads.
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await query(
          `INSERT INTO setup_agent_messages (user_id, role, content, platform)
           VALUES ($1, 'user', $2, $3),
                  ($1, 'assistant', $4, $3)`,
          [req.user.id, lastUserMsg.content, platformTag, content],
        );
      } else {
        await query(
          `INSERT INTO setup_agent_messages (user_id, role, content, platform)
           VALUES ($1, 'assistant', $2, $3)`,
          [req.user.id, content, platformTag],
        );
      }
    } catch (err) {
      console.error('[setup-agent] persist failed (non-fatal):', err.message);
    }

    // Log usage so we can spot-check unit economics during launch. If this
    // gets noisy we can pipe to a usage table; for now console is enough.
    console.log(
      `[setup-agent] user=${req.user.id} platform=${platform || 'web'}`,
      `in=${usage.input_tokens || '?'} out=${usage.output_tokens || '?'}`,
      `t=${elapsed}ms turns=${apiMessages.length}`,
    );

    res.json(assigned ? { content, assigned } : { content });
  } catch (err) {
    console.error('[setup-agent] error:', err.message);
    // Don't leak Anthropic-specific error shapes to the client.
    res.status(502).json({ error: 'Setup agent is having a moment. Please try again.' });
  }
});

export default router;
