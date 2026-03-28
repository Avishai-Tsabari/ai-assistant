import { and, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { alertEvents, usageAlerts, usageSnapshots } from "@/lib/db/schema";

export type AlertEvent = typeof alertEvents.$inferSelect;

/** Returns ISO string for N hours ago. */
function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

/** Returns ISO string for N days ago. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

export async function evaluateAlerts(): Promise<AlertEvent[]> {
  const db = getDb();

  // Load all enabled alerts
  const alerts = await db
    .select()
    .from(usageAlerts)
    .where(eq(usageAlerts.enabled, 1));

  const newEvents: AlertEvent[] = [];

  for (const alert of alerts) {
    // Determine time window for aggregation
    const isDailyType =
      alert.thresholdType === "daily_tokens" || alert.thresholdType === "daily_cost";
    const periodStart = isDailyType ? hoursAgo(24) : daysAgo(30);

    // Get totals snapshots (spaceId IS NULL) for this agent in the window
    const snapshots = await db
      .select()
      .from(usageSnapshots)
      .where(
        and(
          eq(usageSnapshots.agentId, alert.agentId),
          isNull(usageSnapshots.spaceId),
          gte(usageSnapshots.snapshotAt, periodStart),
        ),
      );

    if (snapshots.length === 0) continue;

    // Use the latest snapshot's cumulative values as the current period total
    const latest = snapshots.reduce((a, b) =>
      a.snapshotAt > b.snapshotAt ? a : b,
    );

    const isTokenType =
      alert.thresholdType === "daily_tokens" || alert.thresholdType === "monthly_tokens";
    const currentValue = isTokenType ? latest.totalTokens : latest.totalCost;

    if (currentValue < alert.thresholdValue) continue;

    // Check: has an alert event already fired for this alert in the current period?
    const existingEvent = await db
      .select()
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.alertId, alert.id),
          gte(alertEvents.firedAt, periodStart),
        ),
      )
      .limit(1);

    if (existingEvent.length > 0) continue;

    // Fire a new alert event
    const breachPct =
      alert.thresholdValue > 0
        ? (currentValue / alert.thresholdValue) * 100
        : null;

    const inserted = await db
      .insert(alertEvents)
      .values({
        agentId: alert.agentId,
        alertId: alert.id,
        snapshotId: latest.id,
        thresholdType: alert.thresholdType,
        currentValue,
        thresholdValue: alert.thresholdValue,
        breachPct,
        firedAt: new Date().toISOString(),
        notifiedAt: null,
      })
      .returning();

    newEvents.push(...inserted);
  }

  return newEvents;
}
