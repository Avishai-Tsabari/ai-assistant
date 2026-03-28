import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { getUserSubscription } from "@/lib/billing";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/user/billing/portal — create a Stripe Customer Portal session */
export async function POST() {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 501 });
  }

  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  const subscription = await getUserSubscription(userId);
  if (!subscription?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 400 });
  }

  const authUrl = process.env.AUTH_URL ?? "http://localhost:3131";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${authUrl}/dashboard/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
