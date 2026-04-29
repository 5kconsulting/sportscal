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
import { getKidsByUser } from '../db/index.js';
import { buildSystemPrompt } from '../lib/setupAgentPrompt.js';

const router = Router();
router.use(requireAuth);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// claude-sonnet-4 — same model the pdf worker uses. The setup-agent
// conversation is short enough that haiku's quality dropoff hurts more than
// sonnet's cost. ~$0.05/setup is well under the LTV uplift we'd see from
// even a single Premium upgrade attributable to faster activation.
const MODEL      = 'claude-sonnet-4-20250514';
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

    const systemPrompt = buildSystemPrompt(kids, {
      platform: platform === 'mobile' ? 'mobile' : 'web',
    });

    const t0 = Date.now();
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: apiMessages,
    });
    const elapsed = Date.now() - t0;

    const content = resp.content?.[0]?.text || '';
    const usage   = resp.usage || {};

    // Log usage so we can spot-check unit economics during launch. If this
    // gets noisy we can pipe to a usage table; for now console is enough.
    console.log(
      `[setup-agent] user=${req.user.id} platform=${platform || 'web'}`,
      `in=${usage.input_tokens || '?'} out=${usage.output_tokens || '?'}`,
      `t=${elapsed}ms turns=${apiMessages.length}`,
    );

    res.json({ content });
  } catch (err) {
    console.error('[setup-agent] error:', err.message);
    // Don't leak Anthropic-specific error shapes to the client.
    res.status(502).json({ error: 'Setup agent is having a moment. Please try again.' });
  }
});

export default router;
