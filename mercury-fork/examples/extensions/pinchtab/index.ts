export default function (mercury: {
  cli(opts: { name: string; install: string }): void;
  skill(relativePath: string): void;
  permission(opts: { defaultRoles: string[] }): void;
  /** biome-ignore lint/suspicious/noExplicitAny: minimal stub matching MercuryExtensionAPI subset */
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
    echo "No executable Chromium (CHROME_BINARY=\${CHROME_BINARY:-}; tried /usr/local/bin/chromium, /usr/bin/chromium). Rebuild mercury-agent-ext (restart Mercury)." | tee -a "$log"
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
        CHROME_BINARY: "/usr/local/bin/chromium",
        CHROME_FLAGS: "--no-sandbox --disable-dev-shm-usage",
      },
      systemPrompt: `When searching the web, always use Brave Search. Never use Google.

Before any pinchtab CLI use in Docker, define and run:

\`\`\`bash
${pinchtabEnsure}
pinchtab_ensure || exit 1
pinchtab nav "https://search.brave.com/search?q=your+query+here"
sleep 3
pinchtab text
\`\`\``,
    };
  });
}
