import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { agents, alertEvents } from "@/lib/db/schema";

export default function UsageAlertsOverviewPage() {
  const db = getDb();

  // Fetch recent alert events joined with agent hostname
  const recentEventRows = db
    .select({
      id: alertEvents.id,
      agentId: alertEvents.agentId,
      hostname: agents.hostname,
      thresholdType: alertEvents.thresholdType,
      currentValue: alertEvents.currentValue,
      thresholdValue: alertEvents.thresholdValue,
      breachPct: alertEvents.breachPct,
      firedAt: alertEvents.firedAt,
      notifiedAt: alertEvents.notifiedAt,
    })
    .from(alertEvents)
    .innerJoin(agents, eq(alertEvents.agentId, agents.id))
    .orderBy(desc(alertEvents.firedAt))
    .limit(50)
    .all();

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Usage Alerts Overview</h2>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recent Alert Events ({recentEventRows.length})</h3>
        {recentEventRows.length === 0 ? (
          <p className="muted">No alert events recorded yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Agent</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Type</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Current</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Threshold</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Breach %</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Fired At</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem" }}>Notified</th>
              </tr>
            </thead>
            <tbody>
              {recentEventRows.map((event) => (
                <tr key={event.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0.75rem" }}>
                    <Link
                      href={`/admin/agents/${event.agentId}/alerts`}
                      style={{ fontSize: "0.85rem" }}
                    >
                      {event.hostname}
                    </Link>
                  </td>
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
