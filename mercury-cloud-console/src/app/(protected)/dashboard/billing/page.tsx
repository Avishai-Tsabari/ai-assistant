import { auth } from "@/auth";
import { getUserSubscription } from "@/lib/billing";
import BillingClient from "./BillingClient";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user!.id;
  const params = await searchParams;
  const successParam = params["success"] === "1";

  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const subscription = await getUserSubscription(userId);

  return (
    <BillingClient
      status={subscription?.status ?? "inactive"}
      priceId={subscription?.priceId ?? null}
      currentPeriodEnd={subscription?.currentPeriodEnd ?? null}
      stripeCustomerId={subscription?.stripeCustomerId ?? null}
      stripeConfigured={stripeConfigured}
      successParam={successParam}
    />
  );
}
