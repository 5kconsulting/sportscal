import { Router } from 'express';
import express from 'express';
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

// ============================================================
// POST /api/billing/revenuecat/webhook
//
// RevenueCat sends webhooks for every iOS in-app purchase event:
// INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, PRODUCT_CHANGE,
// TRANSFER, BILLING_ISSUE, etc. We treat any event that leaves the user
// with an active "premium" entitlement as plan='premium' (with the
// expiry mirrored into plan_expires_at), and any event that leaves the
// entitlement inactive as plan='free'.
//
// app_user_id on the event matches the userId we passed to RevenueCat.configure
// on the mobile side (which is our internal users.id UUID).
//
// Auth: RevenueCat dashboard lets you set an Authorization header sent
// with every webhook. Configure REVENUECAT_WEBHOOK_AUTH in Railway env
// to whatever string you set there; we just compare equality.
//
// PUBLIC route — no requireAuth — RevenueCat doesn't have a session.
// ============================================================
router.post('/revenuecat/webhook', express.json(), async (req, res) => {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || req.headers.authorization !== expected) {
    console.warn('[revenuecat] webhook auth failed');
    return res.status(401).end();
  }

  // RevenueCat payload shape: { event: { type, app_user_id,
  //   entitlement_ids[], expiration_at_ms, product_id, ... } }
  const event = req.body?.event;
  if (!event) return res.status(400).json({ error: 'No event payload' });

  const userId   = event.app_user_id;
  const type     = event.type;
  const entIds   = event.entitlement_ids || [];
  const expMs    = event.expiration_at_ms;
  const productId = event.product_id || null;

  // Validate user exists (RevenueCat may send a stale app_user_id if the
  // user was deleted; just no-op rather than 500).
  const user = await queryOne(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!user) {
    console.warn('[revenuecat] unknown app_user_id, ignoring:', userId);
    return res.status(200).json({ ok: true, ignored: true });
  }

  // Entitlement-active events vs entitlement-inactive events.
  // The official RC docs list these as "ACTIVE" / "INACTIVE" lifecycle
  // markers; we just check if the premium entitlement is in the list.
  const grantsPremium = entIds.includes('premium') &&
    ['INITIAL_PURCHASE','RENEWAL','PRODUCT_CHANGE','TRANSFER','UNCANCELLATION']
      .includes(type);

  const revokesPremium =
    ['CANCELLATION','EXPIRATION','REFUND','SUBSCRIPTION_PAUSED']
      .includes(type);

  if (grantsPremium) {
    const expiresAt = expMs ? new Date(expMs) : null;
    await query(
      `UPDATE users
          SET plan = 'premium',
              apple_product_id = $1,
              plan_expires_at = $2
        WHERE id = $3`,
      [productId, expiresAt, userId]
    );
    console.log('[revenuecat] premium granted to', userId, 'via', type);
  } else if (revokesPremium) {
    // Cancellation just stops auto-renewal — the subscription remains
    // active until expiration. Only EXPIRATION/REFUND should flip the
    // plan back; CANCELLATION just leaves the expiration date in place
    // and lets the cron OR the next entitlement check downgrade later.
    if (type === 'EXPIRATION' || type === 'REFUND') {
      await query(
        `UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = $1`,
        [userId]
      );
      console.log('[revenuecat] premium revoked from', userId, 'via', type);
    } else {
      console.log('[revenuecat]', type, 'received — leaving active subscription until expiration');
    }
  } else {
    console.log('[revenuecat] unhandled event type:', type);
  }

  res.json({ ok: true });
});

export default router;
