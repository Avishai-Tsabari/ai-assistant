import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { agents, alertEvents, usageAlerts } from "@/lib/db/schema";

export default async function AgentAlertsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();

  const agentRow = await db
    .select({ id: agents.id, hostname: agents.hostname })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);

  if (!agentRow[0]) notFound();

  const agent = agentRow[0];

  const configuredAlerts = await db
    .select()
    .from(usageAlerts)
    .where(eq(usageAlerts.agentId, id));

  const recentEvents = await db
    .select()
    .from(alertEvents)
    .where(eq(alertEvents.agentId, id))
    .orderBy(desc(alertEvents.firedAt))
    .limit(20);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
        <Link href={`/admin/agents/${id}`} style={{ fontSize: "0.85rem" }}>
          &larr; Back to agent
        </Link>
      </div>

      <h2 style={{ marginTop: 0 }}>Usage Alerts &mdash; {agent.hostname}</h2>

      {/* Add Alert Form */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0 }}>Add Alert</h3>
        <form
          action={`/api/admin/usage/alerts`}
          method="POST"
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "400px" }}
        >
          <input type="hidden" name="agentId" value={id} />
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
              Threshold Type
            </label>
            <select
              name="thresholdType"
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem",
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "0.9rem",
              }}
            >
              <option value="daily_tokens">Daily Tokens</option>
              <option value="monthly_tokens">Monthly Tokens</option>
              <option value="daily_cost">Daily Cost ($)</option>
              <option value="monthly_cost">Monthly Cost ($)</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem" }}>
              Threshold Value
            </label>
            <input
              type="number"
              name="thresholdValue"
              step="any"
              min="0"
              required
              placeholder="e.g. 100000 or 5.00"
              style={{
                width: "100%",
                padding: "0.4rem 0.5rem",
                borderRadius: "4px",
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button type="submit" style={{ alignSelf: "flex-start" }}>
            Add Alert
          </button>
        </form>
      </div>

      {/* Configured Alerts */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h3 style={{ marginTop: 0 }}>Configured Alerts ({configuredAlerts.length})</h3>
        {configuredAlerts.length === 0 ? (
          <p className="muted">No alerts configured.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Threshold</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Enabled</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {configuredAlerts.map((alert) => (
                <tr key={alert.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{alert.thresholdType}</td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {alert.thresholdType.includes("cost")
                      ? `$${alert.thresholdValue.toFixed(4)}`
                      : alert.thresholdValue.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    <span
                      style={{
                        color: alert.enabled ? "#3fb950" : "var(--muted)",
                        fontWeight: 600,
                      }}
                    >
                      {alert.enabled ? "Yes" : "No"}
                    </span>
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }} className="muted">
                    {alert.createdAt.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Alert Events */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent Breach Events ({recentEvents.length})</h3>
        {recentEvents.length === 0 ? (
          <p className="muted">No alert events recorded.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Current</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Threshold</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Breach %</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Fired At</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Notified</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((event) => (
                <tr key={event.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{event.thresholdType}</td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {event.thresholdType.includes("cost")
                      ? `$${event.currentValue.toFixed(4)}`
                      : event.currentValue.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {event.thresholdType.includes("cost")
                      ? `$${event.thresholdValue.toFixed(4)}`
                      : event.thresholdValue.toLocaleString()}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {event.breachPct != null ? `${event.breachPct.toFixed(1)}%` : "\u2014"}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }} className="muted">
                    {event.firedAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    {event.notifiedAt ? (
                      <span style={{ color: "#3fb950" }}>
                        {event.notifiedAt.slice(0, 16).replace("T", " ")}
                      </span>
                    ) : (
                      <span className="muted">&mdash;</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
