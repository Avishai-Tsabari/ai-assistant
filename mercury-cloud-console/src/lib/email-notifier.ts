import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agents, alertEvents, alertNotifications, users } from "@/lib/db/schema";
import type { AlertEvent } from "@/lib/alert-evaluator";

/**
 * Send alert notification emails for newly fired alert events.
 * Groups events by userId and respects alertNotifications preferences.
 * If RESEND_API_KEY is not set, logs a warning and skips sending.
 */
export async function sendAlertNotifications(events: AlertEvent[]): Promise<void> {
  if (events.length === 0) return;

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.ALERT_FROM_EMAIL ?? "alerts@example.com";

  if (!resendApiKey) {
    console.warn("[email-notifier] RESEND_API_KEY not set — skipping alert email notifications");
    return;
  }

  const db = getDb();

  // Look up agent -> userId/hostname mapping
  const agentIds = [...new Set(events.map((e) => e.agentId))];
  const agentRows = db
    .select({ id: agents.id, userId: agents.userId, hostname: agents.hostname })
    .from(agents)
    .where(inArray(agents.id, agentIds))
    .all();

  const agentMap = new Map(agentRows.map((a) => [a.id, a]));

  // Group events by userId
  const eventsByUser = new Map<string, { events: AlertEvent[]; hostname: string }[]>();
  for (const event of events) {
    const agent = agentMap.get(event.agentId);
    if (!agent) continue;
    if (!eventsByUser.has(agent.userId)) {
      eventsByUser.set(agent.userId, []);
    }
    const existing = eventsByUser.get(agent.userId)!.find((g) => g.hostname === agent.hostname);
    if (existing) {
      existing.events.push(event);
    } else {
      eventsByUser.get(agent.userId)!.push({ events: [event], hostname: agent.hostname });
    }
  }

  for (const [userId, groups] of eventsByUser) {
    // Load user notification preferences
    const prefs = db
      .select()
      .from(alertNotifications)
      .where(eq(alertNotifications.userId, userId))
      .limit(1)
      .all();

    const pref = prefs[0];

    // If no preference row, default to enabled + immediate
    const alertEnabled = pref ? pref.alertEnabled === 1 : true;
    const digestFrequency = pref?.digestFrequency ?? "immediate";

    if (!alertEnabled || digestFrequency !== "immediate") continue;

    // Determine recipient email: from pref or fall back to user table
    let toEmail = pref?.email;
    if (!toEmail) {
      const userRow = db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .all();
      toEmail = userRow[0]?.email;
    }
    if (!toEmail) continue;

    // Build email body
    const lines: string[] = ["Usage alert(s) fired for your Mercury agents:", ""];
    for (const group of groups) {
      lines.push(`Agent: ${group.hostname}`);
      for (const event of group.events) {
        const valueStr =
          event.thresholdType.includes("cost")
            ? `$${event.currentValue.toFixed(4)}`
            : event.currentValue.toLocaleString();
        const threshStr =
          event.thresholdType.includes("cost")
            ? `$${event.thresholdValue.toFixed(4)}`
            : event.thresholdValue.toLocaleString();
        const pctStr = event.breachPct != null ? ` (${event.breachPct.toFixed(1)}%)` : "";
        lines.push(
          `  - ${event.thresholdType}: ${valueStr} >= threshold ${threshStr}${pctStr}`,
        );
      }
      lines.push("");
    }

    const emailBody = lines.join("\n");

    // Send via Resend API
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject: "Mercury Usage Alert",
          text: emailBody,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[email-notifier] Resend API error ${res.status}: ${body}`);
        continue;
      }

      // Mark events as notified
      const notifiedAt = new Date().toISOString();
      const allEvents = groups.flatMap((g) => g.events);
      for (const event of allEvents) {
        db.update(alertEvents)
          .set({ notifiedAt })
          .where(eq(alertEvents.id, event.id))
          .run();
      }
    } catch (err) {
      console.error("[email-notifier] Failed to send email:", err);
    }
  }
}
