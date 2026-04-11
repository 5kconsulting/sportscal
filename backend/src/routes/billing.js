import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { query, queryOne, getUserById } from '../db/index.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_ID    = process.env.STRIPE_PRICE_ID;
const APP_URL     = process.env.FRONTEND_URL || 'https://www.sportscalapp.com';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// ============================================================
// POST /api/billing/checkout
// Creates a Stripe Checkout session and returns the URL
// ============================================================
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    // If already premium just send to portal
    if (user.plan === 'premium') {
      return res.json({ url: `${APP_URL}/settings?already_premium=1` });
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
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      mode:                 'subscription',
      success_url:          `${APP_URL}/settings?upgraded=1`,
      cancel_url:           `${APP_URL}/settings?cancelled=1`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
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
// Stripe sends events here — update plan on subscription changes
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

      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj = event.data.object;
        const customerId = obj.customer;
        await query(
          `UPDATE users SET plan = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = $1`,
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

async function activatePremium(customerId, subscriptionId) {
  await query(
    `UPDATE users SET plan = 'premium', stripe_subscription_id = $1 WHERE stripe_customer_id = $2`,
    [subscriptionId, customerId]
  );
  console.log('[billing] activated premium for customer:', customerId);
}

export default router;
