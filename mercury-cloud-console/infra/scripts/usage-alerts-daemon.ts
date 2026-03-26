// Run: bun run infra/scripts/usage-alerts-daemon.ts
import { pollAllAgentUsage } from "../../src/lib/usage-poller";
import { evaluateAlerts } from "../../src/lib/alert-evaluator";
import { sendAlertNotifications } from "../../src/lib/email-notifier";

async function run() {
  console.log("[usage-alerts] Polling agent usage...");
  await pollAllAgentUsage();
  console.log("[usage-alerts] Evaluating alert thresholds...");
  const events = evaluateAlerts();
  console.log(`[usage-alerts] ${events.length} new alert(s)`);
  await sendAlertNotifications(events);
  console.log("[usage-alerts] Done.");
}

run().catch(console.error);
