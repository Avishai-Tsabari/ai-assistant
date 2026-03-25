export default function (mercury: {
  cli(opts: { name: string; install: string }): void;
  skill(relativePath: string): void;
  permission(opts: { defaultRoles: string[] }): void;
  on(event: string, handler: (event: any, ctx: any) => Promise<any>): void;
}) {
  mercury.cli({
    name: "pinchtab",
    install:
      'npm install -g pinchtab playwright && npx playwright install --with-deps chromium && CHROMIUM=$(NODE_PATH="$(npm root -g)" node -e "try{process.stdout.write(require(\'playwright\').chromium.executablePath())}catch(e){}" 2>/dev/null) && { test -x "$CHROMIUM" || CHROMIUM=$(find /root/.cache/ms-playwright -type f -path \'*/chrome-linux/chrome\' ! -path \'*headless_shell*\' 2>/dev/null | head -1); } && test -n "$CHROMIUM" && test -x "$CHROMIUM" && ln -sf "$CHROMIUM" /usr/local/bin/chromium && ln -sf "$CHROMIUM" /usr/bin/chromium && rm -rf /var/lib/apt/lists/*',
  });
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.skill("./skill");

  // Chrome needs --no-sandbox when running as root inside Docker.
  // Also inject search engine preference into system prompt.
  mercury.on("before_container", async () => {
    // Bash ${...} must be escaped as \${...} so this TS template is valid.
    const pinchtabEnsure = `pinchtab_ensure() {
  local bind="\${BRIDGE_BIND:-127.0.0.1}"
  local port="\${BRIDGE_PORT:-9867}"
  local log="\${PINCHTAB_LOG:-/tmp/pinchtab.log}"
  local max_wait="\${1:-120}"
  mkdir -p "$(dirname "$log")" 2>/dev/null || true
  : >"$log"
  if [ ! -x "\${CHROME_BINARY:-}" ]; then
    for _c in /usr/local/bin/chromium /usr/bin/chromium; do
      if [ -x "$_c" ]; then export CHROME_BINARY="$_c"; break; fi
    done
  fi
  if [ ! -x "\${CHROME_BINARY:-}" ]; then
    echo "No executable Chromium (CHROME_BINARY=\${CHROME_BINARY:-}; tried /usr/local/bin/chromium, /usr/bin/chromium). Mercury base image uses /usr/local/bin/chromium; minimal images need the web-browser derived layer. Rebuild mercury-agent-ext (restart Mercury)." | tee -a "$log"
    return 1
  fi
  _pinchtab_port_open() { (echo >/dev/tcp/$bind/$port) 2>/dev/null; }
  if command -v pinchtab >/dev/null 2>&1 && _pinchtab_port_open; then
    return 0
  fi
  pkill -f '[p]inchtab' 2>/dev/null || true
  nohup pinchtab >>"$log" 2>&1 &
  local pid=$!
  sleep 2
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "pinchtab exited immediately (pid $pid). Log:" >&2
    tail -120 "$log" >&2
    return 1
  fi
  local i=0
  while [ "$i" -lt "$max_wait" ]; do
    if _pinchtab_port_open; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "pinchtab died during startup. Log:" >&2
      tail -120 "$log" >&2
      return 1
    fi
    sleep 1
    i=$((i+1))
  done
  echo "pinchtab did not listen on $bind:$port within \${max_wait}s. Log:" >&2
  tail -120 "$log" >&2
  return 1
}`;

    return {
      env: {
        // Must match mercury-fork/container/Dockerfile (Playwright symlink target).
        CHROME_BINARY: "/usr/local/bin/chromium",
        CHROME_FLAGS: "--no-sandbox --disable-dev-shm-usage",
      },
      systemPrompt: `## Web Search & Browsing

You have full access to web search and browser automation. Use them proactively for any query about current events, prices, news, or time-sensitive data — do not answer from training data when real-time information is needed.

### Fast search (preferred): Brave Search API
Use this for any search query. It is instant and reliable — no browser needed. Guard \`jq\` when the API returns no results (missing key, invalid token, or rate limit):

\`\`\`bash
curl -sS "https://api.search.brave.com/res/v1/web/search?q=YOUR+QUERY+HERE&count=5" \\
  -H "Accept: application/json" \\
  -H "X-Subscription-Token: $BRAVE_API_KEY" \\
  | jq '.web.results // [] | .[] | {title, description, url}'
\`\`\`

For news specifically:
\`\`\`bash
curl -sS "https://api.search.brave.com/res/v1/news/search?q=YOUR+QUERY+HERE&count=5" \\
  -H "Accept: application/json" \\
  -H "X-Subscription-Token: $BRAVE_API_KEY" \\
  | jq '.results // [] | .[] | {title, description, url, age}'
\`\`\`

If Brave returns an error (non-zero HTTP status, {"message":...}, or empty web.results), fall back immediately to a pinchtab Google search — do **not** tell the user you cannot search:

\`\`\`bash
pinchtab_ensure || { echo "pinchtab failed — see /tmp/pinchtab.log"; exit 1; }
pinchtab nav "https://www.google.com/search?q=YOUR+QUERY+HERE"
sleep 3
pinchtab text
\`\`\`

### Search fallback & full page reading: pinchtab (Mercury Docker)
**Always** call \`pinchtab_ensure\` before \`pinchtab nav\`, \`pinchtab snap\`, \`pinchtab text\`, etc. The host sets \`CHROME_BINARY\` (default \`/usr/local/bin/chromium\`, matching the Mercury agent base image) and \`CHROME_FLAGS\` (\`--no-sandbox\` as root in Docker). If that path is missing, \`pinchtab_ensure\` falls back to \`/usr/bin/chromium\`. A fixed \`sleep 5\` after \`pinchtab &\` is unreliable — the bridge may not be listening yet, which causes \`connection refused\` on port 9867.

Define once per shell session (or source the same block):

\`\`\`bash
${pinchtabEnsure}
\`\`\`

To search the web via pinchtab (use when Brave fails):

\`\`\`bash
pinchtab_ensure || { echo "pinchtab failed — see /tmp/pinchtab.log"; exit 1; }
pinchtab nav "https://www.google.com/search?q=YOUR+QUERY+HERE"
sleep 3
pinchtab text
\`\`\`

For navigating to a specific page:

\`\`\`bash
pinchtab_ensure || { echo "pinchtab failed — see /tmp/pinchtab.log"; exit 1; }
pinchtab nav "https://example.com"
sleep 3
pinchtab text
\`\`\`

If \`pinchtab_ensure\` fails, read \`/tmp/pinchtab.log\` and report the last lines to the user — do not silently retry with only a longer sleep.

To reuse an already-running daemon (same container session), \`pinchtab_ensure\` returns immediately when the port is open.`,
    };
  });
}
