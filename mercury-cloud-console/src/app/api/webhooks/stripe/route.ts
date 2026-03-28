import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, subscriptions } from "@/lib/db";
import { upsertSubscription } from "@/lib/billing";

export const runtime = "nodejs";

/** Resolve userId from a Stripe subscription or invoice object. */
async function resolveUserId(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  // First check if we have this customer in our subscriptions table
  const rows = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, customerId));

  if (rows[0]?.userId) {
    return rows[0].userId;
  }

  // Fall back to Stripe customer metadata
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted && customer.metadata?.userId) {
      return customer.metadata.userId;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 501 });
  }

  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid payload" },
      { status: 400 },
    );
  }

  console.info("[stripe webhook]", event.type, event.id);

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await resolveUserId(stripe, customerId);
      if (userId) {
        await upsertSubscription(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          status: sub.status,
          priceId: sub.items.data[0]?.price?.id,
          currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await resolveUserId(stripe, customerId);
      if (userId) {
        await upsertSubscription(userId, {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          status: "canceled",
          canceledAt: new Date().toISOString(),
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const rawCustomer = invoice.customer;
      if (!rawCustomer) break;
      const customerId =
        typeof rawCustomer === "string" ? rawCustomer : rawCustomer.id;
      const userId = await resolveUserId(stripe, customerId);
      if (userId) {
        await upsertSubscription(userId, {
          stripeCustomerId: customerId,
          status: "past_due",
        });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const rawCustomer = invoice.customer;
      if (!rawCustomer) break;
      const customerId =
        typeof rawCustomer === "string" ? rawCustomer : rawCustomer.id;
      const userId = await resolveUserId(stripe, customerId);
      if (userId) {
        await upsertSubscription(userId, {
          stripeCustomerId: customerId,
          status: "active",
        });
      }
      break;
    }

    default:
      // Unhandled event types — acknowledged but not processed
      break;
  }

  return NextResponse.json({ received: true });
}
