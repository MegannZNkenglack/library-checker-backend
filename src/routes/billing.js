// src/routes/billing.js
// Stripe Checkout session creation and webhook handling.

import { Hono } from "hono";
import Stripe   from "stripe";
import db       from "../db.js";

const router = new Hono();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── POST /billing/checkout ────────────────────────────────────────────────────
// Creates a Stripe Checkout session and returns the URL.
// The extension opens this URL in a new tab.

router.post("/checkout", async (c) => {
  const userId    = c.get("userId");
  const userEmail = c.get("userEmail");
  const user      = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (user.tier === "premium" && user.subscription_status === "active") {
    return c.json({ error: "You already have an active premium subscription" }, 400);
  }

  // Create or reuse a Stripe customer
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email:    userEmail,
      metadata: { userId: String(userId) },
    });
    customerId = customer.id;
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, userId);
  }

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    payment_method_types: ["card"],
    line_items: [{
      price:    process.env.STRIPE_PRICE_ID,
      quantity: 1,
    }],
    mode:        "subscription",
    success_url: process.env.STRIPE_SUCCESS_URL,
    cancel_url:  process.env.STRIPE_CANCEL_URL,
    metadata:    { userId: String(userId) },
  });

  return c.json({ url: session.url });
});

// ── POST /billing/portal ──────────────────────────────────────────────────────
// Opens the Stripe customer portal so users can manage/cancel their subscription.

router.post("/portal", async (c) => {
  const userId = c.get("userId");
  const user   = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user.stripe_customer_id) {
    return c.json({ error: "No billing account found" }, 400);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer:   user.stripe_customer_id,
    return_url: process.env.STRIPE_SUCCESS_URL,
  });

  return c.json({ url: session.url });
});

// ── POST /billing/webhook ─────────────────────────────────────────────────────
// Stripe sends events here. We listen for subscription changes and update
// the user's tier in the database accordingly.
// IMPORTANT: this route must NOT use the requireAuth middleware.

router.post("/webhook", async (c) => {
  const sig     = c.req.header("stripe-signature");
  const body    = await c.req.text(); // must be raw text for signature verification

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[Billing] Webhook signature verification failed:", err.message);
    return c.text("Webhook signature verification failed", 400);
  }

  const subscription = event.data?.object;

  switch (event.type) {

    // Subscription became active (new or renewed)
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const customerId = subscription.customer;
      const isActive   = subscription.status === "active" || subscription.status === "trialing";
      db.prepare(`
        UPDATE users
        SET tier = ?, subscription_status = ?, stripe_subscription_id = ?, updated_at = datetime('now')
        WHERE stripe_customer_id = ?
      `).run(
        isActive ? "premium" : "free",
        subscription.status,
        subscription.id,
        customerId
      );
      console.log(`[Billing] Subscription ${subscription.id} → ${subscription.status}`);
      break;
    }

    // Subscription cancelled or payment failed
    case "customer.subscription.deleted": {
      const customerId = subscription.customer;
      db.prepare(`
        UPDATE users
        SET tier = 'free', subscription_status = 'cancelled', updated_at = datetime('now')
        WHERE stripe_customer_id = ?
      `).run(customerId);
      console.log(`[Billing] Subscription ${subscription.id} deleted — user downgraded to free`);
      break;
    }

    // Payment failed — keep access until next retry
    case "invoice.payment_failed": {
      console.log("[Billing] Payment failed for subscription:", subscription.subscription);
      break;
    }

    default:
      break;
  }

  return c.text("OK", 200);
});

export default router;
