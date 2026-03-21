export default function (mercury: {
  cli(opts: { name: string; install: string }): void;
  skill(relativePath: string): void;
  permission(opts: { defaultRoles: string[] }): void;
  on(event: string, handler: (event: any, ctx: any) => Promise<any>): void;
}) {
  mercury.cli({
    name: "pinchtab",
    install:
      "npm install -g pinchtab playwright && npx playwright install --with-deps chromium && CHROMIUM=$(find /root/.cache/ms-playwright -path '*chromium-[0-9]*' ! -path '*headless_shell*' -name chrome -type f | head -1) && ln -sf \"$CHROMIUM\" /usr/bin/chromium && rm -rf /var/lib/apt/lists/*",
  });
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.skill("./skill");

  // Chrome needs --no-sandbox when running as root inside Docker.
  // Also inject search engine preference into system prompt.
  mercury.on("before_container", async () => {
    return {
      env: {
        CHROME_BINARY: "/usr/bin/chromium",
        CHROME_FLAGS: "--no-sandbox --disable-dev-shm-usage",
      },
      systemPrompt: `## Web Search & Browsing

You have full access to web search and browser automation. Use them proactively for any query about current events, prices, news, or time-sensitive data — do not answer from training data when real-time information is needed.

### Fast search (preferred): Brave Search API
Use this for any search query. It is instant and reliable — no browser needed.

\`\`\`bash
curl -s "https://api.search.brave.com/res/v1/web/search?q=YOUR+QUERY+HERE&count=5" \\
  -H "Accept: application/json" \\
  -H "X-Subscription-Token: $BRAVE_API_KEY" | jq '.web.results[] | {title, description, url}'
\`\`\`

For news specifically:
\`\`\`bash
curl -s "https://api.search.brave.com/res/v1/news/search?q=YOUR+QUERY+HERE&count=5" \\
  -H "Accept: application/json" \\
  -H "X-Subscription-Token: $BRAVE_API_KEY" | jq '.results[] | {title, description, url, age}'
\`\`\`

### Full page reading: pinchtab browser
Use when you need to read the full content of a specific URL.

\`\`\`bash
# Start daemon (wait for it to be ready)
pinchtab &
sleep 5

# Navigate and read
pinchtab nav "https://example.com"
sleep 3
pinchtab text
\`\`\`

To check if pinchtab daemon is already running before starting:
\`\`\`bash
pinchtab text 2>/dev/null || (pinchtab & sleep 5)
\`\`\``,
    };
  });
}
