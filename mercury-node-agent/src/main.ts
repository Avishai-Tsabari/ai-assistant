import { serve } from "bun";
import { loadConfig } from "./config.js";
import { createRoutes } from "./routes.js";

const config = loadConfig();
const app = createRoutes(config);

console.log(`Mercury Node Agent starting on port ${config.port}`);
console.log(`  Base domain: ${config.baseDomain}`);
console.log(`  Docker network: ${config.dockerNetwork}`);

serve({
  port: config.port,
  fetch: app.fetch,
});

console.log(`Mercury Node Agent listening on http://0.0.0.0:${config.port}`);
