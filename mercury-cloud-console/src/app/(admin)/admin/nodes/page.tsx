import { getDb, computeNodes } from "@/lib/db";
import { NodesClient } from "./NodesClient";

export default function AdminNodesPage() {
  const db = getDb();
  const nodes = db.select().from(computeNodes).all();

  const envDefaults = {
    hetznerApiToken: process.env.HETZNER_API_TOKEN ?? "",
    hetznerDnsToken: process.env.HETZNER_DNS_API_TOKEN ?? "",
    baseDomain: process.env.BASE_DOMAIN ?? "",
    acmeEmail: process.env.ACME_EMAIL ?? "",
    serverType: process.env.HETZNER_SERVER_TYPE ?? "cpx31",
    location: process.env.HETZNER_LOCATION ?? "nbg1",
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Compute Nodes ({nodes.length})</h2>
      <p className="muted" style={{ marginTop: 0, marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Compute nodes run agent containers. Set <code>PROVISIONER_MODE=container</code> on the
        console to enable container-based provisioning.
      </p>
      <NodesClient
        initialNodes={nodes.map((n) => ({ ...n, apiToken: "***" }))}
        envDefaults={envDefaults}
      />
    </>
  );
}
