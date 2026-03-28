import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, providerKeys } from "@/lib/db";
import { KeysClient } from "./KeysClient";

export default async function KeysPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const rows = await getDb()
    .select({
      id: providerKeys.id,
      provider: providerKeys.provider,
      label: providerKeys.label,
      keyType: providerKeys.keyType,
      createdAt: providerKeys.createdAt,
    })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ margin: 0 }}>API Keys</h1>
        <Link href="/dashboard">← Dashboard</Link>
      </div>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        Keys are encrypted at rest. Only you can use them. Each agent uses the keys you assign
        to its model chain.
      </p>
      <div className="card" style={{ marginTop: "1rem" }}>
        <KeysClient initialKeys={rows} />
      </div>
    </main>
  );
}
