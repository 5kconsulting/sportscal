import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne, getUserById } from '../db/index.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Price IDs.
//   STRIPE_PRICE_ID_MONTHLY / STRIPE_PRICE_ID_ANNUAL — the new 2026 prices.
//   STRIPE_PRICE_ID — legacy single price (grandfathered $5/mo). Kept as a
//     fallback so older pricing-page / signup flows don't break while we
//     roll the new pricing out. Can be removed once the pricing page is live
//     and confirmed stable.
const PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY;
const PRICE_ID_ANNUAL  = process.env.STRIPE_PRICE_ID_ANNUAL;
const PRICE_ID_LEGACY  = process.env.STRIPE_PRICE_ID;

const APP_URL         = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';
const WEBHOOK_SECRET  = process.env.STRIPE_WEBHOOK_SECRET;

// Resolve which Stripe price to use for a checkout request.
// Defaults to annual (the encouraged choice). Falls back to the legacy
// single price if the new envs aren't set yet, so we can deploy this code
// before the new Stripe prices exist.
function resolvePriceForInterval(interval) {
  if (interval === 'month' && PRICE_ID_MONTHLY) return PRICE_ID_MONTHLY;
  if (interval === 'year'  && PRICE_ID_ANNUAL)  return PRICE_ID_ANNUAL;
  if (PRICE_ID_ANNUAL)  return PRICE_ID_ANNUAL;   // default nudge toward annual
  if (PRICE_ID_MONTHLY) return PRICE_ID_MONTHLY;
  return PRICE_ID_LEGACY;                         // old $5/mo fallback
}

// ============================================================
// POST /api/billing/checkout
// Creates a Stripe Checkout session and returns the URL.
// Body (optional): { interval: 'month' | 'year' }
// ============================================================
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    // If already premium just send to portal
    if (user.plan === 'premium') {
      return res.json({ url: `${APP_URL}/settings?already_premium=1` });
    }

    const interval = req.body?.interval === 'month' ? 'month' : 'year';
    const priceId  = resolvePriceForInterval(interval);

    if (!priceId) {
      console.error('[billing] no STRIPE_PRICE_ID_* env vars set');
      return res.status(500).json({ error: 'Billing is not configured' });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name:  user.name,
        metadata: {
          user_id: user.id,
          ...(user.referral_source && { referral_source: user.referral_source }),
        },
      });
      customerId = customer.id;
      await query(`UPDATE users SET stripe_customer_id = $1 WHERE id = $2`, [customerId, user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer:             customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode:                 'subscription',
      success_url:          `${APP_URL}/settings?upgraded=1`,
      cancel_url:           `${APP_URL}/settings?cancelled=1`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        interval,
        ...(user.referral_source && { referral_source: user.referral_source }),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ============================================================
// POST /api/billing/portal
// Creates a Stripe Customer Portal session for managing billing
// ============================================================
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: `${APP_URL}/settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal error:', err.message);
    res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

// ============================================================
// POST /api/billing/webhook
// Stripe sends events here — update plan + billing_interval
// ============================================================
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing] webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.payment_status === 'paid') {
          await activatePremium(session.customer, session.subscription);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        await activatePremium(invoice.customer, invoice.subscription);
        break;
      }

      case 'customer.subscription.updated': {
        // User switched monthly <-> annual via the portal, or Stripe
        // otherwise modified the subscription. Re-read to capture the
        // current billing interval.
        const sub = event.data.object;
        await activatePremium(sub.customer, sub.id);
        break;
      }

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj = event.data.object;
        const customerId = obj.customer;
        await query(
          `UPDATE users
              SET plan = 'free',
                  stripe_subscription_id = NULL,
                  billing_interval = NULL
            WHERE stripe_customer_id = $1`,
          [customerId]
        );
        console.log('[billing] downgraded to free:', customerId);
        break;
      }
    }
  } catch (err) {
    console.error('[billing] webhook handler error:', err.message);
  }

  res.json({ received: true });
});

// Fetches the subscription so we can read the actual billing interval
// from Stripe (source of truth), then updates the user row.
async function activatePremium(customerId, subscriptionId) {
  let interval = null;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });
    // Stripe returns interval as 'month' | 'year' on the price's recurring object
    const stripeInterval = sub.items?.data?.[0]?.price?.recurring?.interval;
    if (stripeInterval === 'month' || stripeInterval === 'year') {
      interval = stripeInterval;
    }
  } catch (err) {
    console.error('[billing] could not fetch subscription', subscriptionId, err.message);
  }

  await query(
    `UPDATE users
        SET plan = 'premium',
            stripe_subscription_id = $1,
            billing_interval = $2
      WHERE stripe_customer_id = $3`,
    [subscriptionId, interval, customerId]
  );
  console.log('[billing] activated premium for customer:', customerId, 'interval:', interval);
}

export default router;
