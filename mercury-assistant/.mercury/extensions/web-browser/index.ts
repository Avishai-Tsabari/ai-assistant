import type { MercuryExtensionAPI } from "mercury-ai/extensions/types";

export default function (mercury: MercuryExtensionAPI) {
  mercury.cli({
    name: "pinchtab",
    install:
      "npm install -g pinchtab playwright && npx playwright install --with-deps chromium && CHROMIUM=$(find /root/.cache/ms-playwright -path '*chromium-[0-9]*' ! -path '*headless_shell*' -name chrome -type f | head -1) && ln -sf \"$CHROMIUM\" /usr/bin/chromium && rm -rf /var/lib/apt/lists/*",
  });
  mercury.cli({
    name: "web-search",
    install:
      "echo '#!/usr/bin/env bun' > /usr/local/bin/web-search; echo 'const q=process.argv.slice(2).join(\" \");const r=await(await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}`,{headers:{\"X-Subscription-Token\":process.env.BRAVE_API_KEY||\"\"}})).json();for(const x of (r.web?.results||[]))console.log(`${x.title}\\n${x.description}\\n`);' >> /usr/local/bin/web-search; chmod +x /usr/local/bin/web-search",
  });
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.skill("./skill");

  // Stealth mode helps avoid CAPTCHA; override via MERCURY_BRIDGE_STEALTH in .env
  mercury.env({ from: "MERCURY_BRIDGE_STEALTH" });
  mercury.env({ from: "MERCURY_BRAVE_API_KEY", as: "BRAVE_API_KEY" });

  mercury.on("before_container", async () => {
    return {
      env: {
        CHROME_BINARY: "/usr/bin/chromium",
        CHROME_FLAGS: "--no-sandbox --disable-dev-shm-usage",
        BRIDGE_STEALTH: process.env.MERCURY_BRIDGE_STEALTH || "full",
      },
      systemPrompt: `When the user asks about current events, recent information, real-time data (stocks, weather, sports, news), or anything beyond your knowledge cutoff, prefer **web-search** (API, fast, reliable) before replying. Fall back to pinchtab only if web-search fails or the task requires browser interaction (login, forms, screenshots, JS-rendered content).

Both are CLIs. Run them via the **bash** tool, NOT the subagent tool.
Subagent only supports "explore" and "worker".

**web-search** — for simple lookups (stocks, weather, news, facts):
web-search "SPY ETF price today"
web-search "weather Tel Aviv today"

The output appears in the bash result. Summarize it directly — do NOT read any file.

**pinchtab** — only when you need browser interaction (forms, screenshots, logged-in sites). Run as ONE bash command:
pinchtab & sleep 3 && pinchtab nav 'https://search.brave.com/search?q=YOUR_QUERY' && sleep 3 && pinchtab text

If web-search fails (e.g. no API key), try pinchtab. If both fail, suggest external sources.`,
    };
  });
}
