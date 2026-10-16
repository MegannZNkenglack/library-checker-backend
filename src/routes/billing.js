// src/routes/billing.js
// Stripe Checkout session creation and webhook handling.

import { Hono } from "hono";
import Stripe   from "stripe";
import db       from "../db.js";
import { requireAuth } from "../auth.js";

const router = new Hono();
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe says a customer does not exist (for example an id saved while testing in Stripe's test
// mode, now being used with live keys). Such an account cannot have a live subscription.
const isMissingCustomer = (err) => err?.code === "resource_missing" && (!err.param || err.param === "customer");

function forgetStripeCustomer(userId) {
  db.prepare(`
    UPDATE users
    SET tier = 'free', subscription_status = 'inactive', stripe_customer_id = NULL, stripe_subscription_id = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(userId);
}

// ── POST /billing/checkout ────────────────────────────────────────────────────
// Creates a Stripe Checkout session and returns the URL.
// The extension opens this URL in a new tab.
// Auth is applied per-route (not via a wildcard in index.js) so that
// /billing/webhook — called by Stripe, not the extension — stays public.

router.post("/checkout", requireAuth, async (c) => {
  const userId    = c.get("userId");
  const userEmail = c.get("userEmail");
  const user      = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (user.tier === "premium" && user.subscription_status === "active") {
    return c.json({ error: "You already have an active premium subscription" }, 400);
  }

  // Create or reuse a Stripe customer
  const newCustomer = async () => {
    const customer = await stripe.customers.create({
      email:    userEmail,
      metadata: { userId: String(userId) },
    });
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customer.id, userId);
    return customer.id;
  };
  const startCheckout = (customerId) => stripe.checkout.sessions.create({
    customer:    customerId,
    line_items: [{
      price:    process.env.STRIPE_PRICE_ID,
      quantity: 1,
    }],
    // This Stripe account has Managed Payments on by default, which imposes
    // extra requirements (e.g. product tax codes) on Checkout Sessions.
    // Opt back into the classic flow this code was written for.
    managed_payments: { enabled: false },
    mode:        "subscription",
    success_url: process.env.STRIPE_SUCCESS_URL,
    cancel_url:  process.env.STRIPE_CANCEL_URL,
    metadata:    { userId: String(userId) },
  });

  try {
    let session;
    try {
      session = await startCheckout(user.stripe_customer_id || await newCustomer());
    } catch (err) {
      if (!user.stripe_customer_id || !isMissingCustomer(err)) throw err;
      // The saved customer id is not valid in this Stripe mode: start again with a new one.
      console.warn(`[Billing] stripe customer ${user.stripe_customer_id} for user ${userId} not found, creating a new one`);
      session = await startCheckout(await newCustomer());
    }
    return c.json({ url: session.url });
  } catch (err) {
    console.error("[Billing] checkout failed:", err.message);
    return c.json({ error: "We couldn't start the upgrade just now. Please try again in a moment, or contact us if it keeps happening." }, 502);
  }
});

// ── POST /billing/portal ──────────────────────────────────────────────────────
// Opens the Stripe customer portal so users can manage/cancel their subscription.

router.post("/portal", requireAuth, async (c) => {
  const userId = c.get("userId");
  const user   = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

  if (!user.stripe_customer_id) {
    return c.json({ error: "No paid subscription is linked to this account, so there is nothing to manage. If that looks wrong, please contact us." }, 400);
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: process.env.STRIPE_SUCCESS_URL,
    });
    return c.json({ url: session.url });
  } catch (err) {
    if (isMissingCustomer(err)) {
      console.warn(`[Billing] stripe customer ${user.stripe_customer_id} for user ${userId} not found: account set back to free`);
      forgetStripeCustomer(userId);
      return c.json({ error: "We couldn't find a paid subscription for this account, so it has been set back to the free plan. You can upgrade again from the Account tab.", planChanged: true }, 404);
    }
    console.error("[Billing] portal failed:", err.message);
    return c.json({ error: "We couldn't open the billing page just now. Please try again in a moment, or contact us if it keeps happening." }, 502);
  }
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
