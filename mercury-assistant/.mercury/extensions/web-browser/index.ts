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
      systemPrompt: `When searching the web, always use Brave Search. Never use Google.

Example:
pinchtab &
sleep 3
pinchtab nav "https://search.brave.com/search?q=your+query+here"
sleep 3
pinchtab text`,
    };
  });
}
