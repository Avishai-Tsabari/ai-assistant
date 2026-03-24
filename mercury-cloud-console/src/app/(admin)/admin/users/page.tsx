import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export default function AdminUsersPage() {
  const db = getDb();

  const rows = db.all<{
    id: string;
    email: string;
    role: string;
    createdAt: string;
    subscriptionStatus: string | null;
    agentCount: number;
  }>(sql`
    SELECT
      u.id,
      u.email,
      u.role,
      u.created_at AS createdAt,
      s.status AS subscriptionStatus,
      (SELECT COUNT(*) FROM agents a WHERE a.user_id = u.id) AS agentCount
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.created_at DESC
  `);

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Users ({rows.length})</h2>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.9rem",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border)",
                textAlign: "left",
              }}
            >
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Signed Up</th>
              <th style={thStyle}>Subscription</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Agents</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr
                key={u.id}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={tdStyle}>{u.email}</td>
                <td style={tdStyle}>
                  <span
                    style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "9999px",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      background:
                        u.role === "admin"
                          ? "rgba(88,166,255,0.15)"
                          : "rgba(139,148,158,0.15)",
                      color:
                        u.role === "admin" ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    {u.role}
                  </span>
                </td>
                <td style={tdStyle} className="muted">
                  {u.createdAt?.slice(0, 10) ?? "—"}
                </td>
                <td style={tdStyle}>
                  <SubBadge status={u.subscriptionStatus} />
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {u.agentCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  whiteSpace: "nowrap",
};

function SubBadge({ status }: { status: string | null }) {
  if (!status)
    return <span className="muted">—</span>;

  const color =
    status === "active" ? "#3fb950" : "var(--muted)";

  return (
    <span style={{ color, fontWeight: 500, fontSize: "0.85rem" }}>
      {status}
    </span>
  );
}
