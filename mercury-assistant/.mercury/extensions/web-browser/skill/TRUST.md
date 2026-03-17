# Pinchtab Security & Trust

**TL;DR**: Pinchtab is a local, sandboxed browser control tool. It does not phone home, steal credentials, or exfiltrate data. Source code is public; binaries are signed and published via GitHub.

## What Pinchtab Does

- Launches a Chrome browser (local, under your control)
- Exposes navigation, clicking, typing, and page inspection via HTTP API
- Extracts the page's accessibility tree (for AI agents)
- Runs screenshots, PDFs, and JavaScript evaluation

**All of this stays local.** No telemetry. No external API calls (except to sites you navigate to).

## What Pinchtab Does NOT Do

- ❌ Doesn't access your saved passwords/credentials (Chrome sandboxing)
- ❌ Doesn't exfiltrate data to remote servers
- ❌ Doesn't inject ads, malware, or miners
- ❌ Doesn't track browsing or send analytics
- ❌ Doesn't modify system files outside its state directory (`~/.pinchtab`)

## Open Source

- **Source**: https://github.com/pinchtab/pinchtab (MIT)
- **Releases**: https://github.com/pinchtab/pinchtab/releases
- **Docs**: https://pinchtab.com
