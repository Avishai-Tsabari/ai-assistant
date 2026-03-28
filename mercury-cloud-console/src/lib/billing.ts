import { eq } from "drizzle-orm";
import { getDb, subscriptions } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

/** Look up a subscription row by stripeCustomerId. */
export async function getUserSubscription(userId: string) {
  const rows = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return rows[0] ?? null;
}

/**
 * Look up the Stripe customer ID for the user.
 * If no subscription row exists, or it has no stripeCustomerId, create a
 * Stripe customer, save it to the DB, and return the ID.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const existing = await getUserSubscription(userId);
  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  const now = new Date().toISOString();
  if (existing) {
    await getDb()
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id, updatedAt: now })
      .where(eq(subscriptions.userId, userId));
  } else {
    await getDb()
      .insert(subscriptions)
      .values({
        userId,
        stripeCustomerId: customer.id,
        status: "inactive",
        updatedAt: now,
      });
  }

  return customer.id;
}

type SubscriptionUpdate = Partial<{
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  priceId: string;
  currentPeriodEnd: string;
  canceledAt: string;
  status: string;
}>;

/** Upsert a subscription row for the given userId. */
export async function upsertSubscription(
  userId: string,
  data: SubscriptionUpdate,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getUserSubscription(userId);

  if (existing) {
    await getDb()
      .update(subscriptions)
      .set({ ...data, updatedAt: now })
      .where(eq(subscriptions.userId, userId));
  } else {
    await getDb()
      .insert(subscriptions)
      .values({
        userId,
        status: data.status ?? "inactive",
        stripeCustomerId: data.stripeCustomerId,
        stripeSubscriptionId: data.stripeSubscriptionId,
        priceId: data.priceId,
        currentPeriodEnd: data.currentPeriodEnd,
        canceledAt: data.canceledAt,
        updatedAt: now,
      });
  }
}
