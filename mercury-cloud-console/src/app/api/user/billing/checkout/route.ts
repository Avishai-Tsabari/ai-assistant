import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getOrCreateStripeCustomer } from "@/lib/billing";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/user/billing/checkout — create a Stripe Checkout session */
export async function POST() {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 501 });
  }

  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const email = session!.user!.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "STRIPE_PRICE_ID not configured" }, { status: 501 });
  }

  const authUrl = process.env.AUTH_URL ?? "http://localhost:3131";

  let stripeCustomerId: string;
  try {
    stripeCustomerId = await getOrCreateStripeCustomer(userId, email);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create customer" },
      { status: 500 },
    );
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${authUrl}/dashboard/billing?success=1`,
    cancel_url: `${authUrl}/dashboard/billing`,
    metadata: { userId },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
