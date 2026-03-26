import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generatePkceVerifier,
  derivePkceChallenge,
  buildAnthropicAuthUrl,
  parseAnthropicPaste,
  exchangeAnthropicCode,
  refreshAnthropicToken,
  startGithubDeviceFlow,
  pollGithubDeviceFlow,
  fetchCopilotToken,
  refreshCopilotToken,
  refreshOAuthCredentials,
} from "@/lib/oauth";

// ─── PKCE ────────────────────────────────────────────────────────────────────

describe("generatePkceVerifier", () => {
  it("returns a URL-safe base64 string of sufficient length", () => {
    const v = generatePkceVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("returns different values on each call", () => {
    expect(generatePkceVerifier()).not.toBe(generatePkceVerifier());
  });
});

describe("derivePkceChallenge", () => {
  it("returns a URL-safe base64 SHA-256 hash", async () => {
    const challenge = await derivePkceChallenge("test-verifier");
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("is deterministic for the same input", async () => {
    const v = "deterministic-input";
    const a = await derivePkceChallenge(v);
    const b = await derivePkceChallenge(v);
    expect(a).toBe(b);
  });
});

describe("buildAnthropicAuthUrl", () => {
  it("returns a URL pointing to claude.ai/oauth/authorize", async () => {
    const url = await buildAnthropicAuthUrl("my-verifier");
    expect(url).toContain("https://claude.ai/oauth/authorize");
  });

  it("includes required OAuth parameters", async () => {
    const url = await buildAnthropicAuthUrl("my-verifier");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("my-verifier");
    expect(parsed.searchParams.get("redirect_uri")).toContain("console.anthropic.com");
  });
});

// ─── parseAnthropicPaste ─────────────────────────────────────────────────────

describe("parseAnthropicPaste", () => {
  it("parses full redirect URL", () => {
    const result = parseAnthropicPaste(
      "https://console.anthropic.com/oauth/code/callback?code=mycode#mystate",
    );
    expect(result).toEqual({ code: "mycode", state: "mystate" });
  });

  it("parses code#state form", () => {
    const result = parseAnthropicPaste("mycode#mystate");
    expect(result).toEqual({ code: "mycode", state: "mystate" });
  });

  it("returns null for bare code without state", () => {
    expect(parseAnthropicPaste("justcode")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAnthropicPaste("")).toBeNull();
  });
});

// ─── exchangeAnthropicCode ───────────────────────────────────────────────────

describe("exchangeAnthropicCode", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns credentials on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "acc-123",
          refresh_token: "ref-456",
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );

    const creds = await exchangeAnthropicCode("mycode", "myverifier");
    expect(creds.access).toBe("acc-123");
    expect(creds.refresh).toBe("ref-456");
    expect(creds.expires).toBeGreaterThan(Date.now());
  });

  it("throws on non-200 response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    await expect(exchangeAnthropicCode("bad-code", "verifier")).rejects.toThrow(
      "Anthropic token exchange failed",
    );
  });

  it("throws when access_token is missing from response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ refresh_token: "ref" }), { status: 200 }),
    );
    await expect(exchangeAnthropicCode("code", "verifier")).rejects.toThrow(
      "missing access_token",
    );
  });
});

// ─── refreshAnthropicToken ───────────────────────────────────────────────────

describe("refreshAnthropicToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns new credentials on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-acc", refresh_token: "new-ref", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const creds = await refreshAnthropicToken({ access: "old", refresh: "old-ref", expires: 0 });
    expect(creds.access).toBe("new-acc");
    expect(creds.refresh).toBe("new-ref");
  });

  it("keeps old refresh token if response omits it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ access_token: "new-acc", expires_in: 3600 }), { status: 200 }),
    );

    const creds = await refreshAnthropicToken({ access: "old", refresh: "kept-ref", expires: 0 });
    expect(creds.refresh).toBe("kept-ref");
  });

  it("throws on failure", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("error", { status: 401 }));
    await expect(
      refreshAnthropicToken({ access: "old", refresh: "ref", expires: 0 }),
    ).rejects.toThrow("Anthropic token refresh failed");
  });
});

// ─── startGithubDeviceFlow ───────────────────────────────────────────────────

describe("startGithubDeviceFlow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns device flow parameters on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: "dev-code",
          user_code: "USER-CODE",
          verification_uri: "https://github.com/login/device",
          interval: 5,
          expires_in: 900,
        }),
        { status: 200 },
      ),
    );

    const result = await startGithubDeviceFlow();
    expect(result.deviceCode).toBe("dev-code");
    expect(result.userCode).toBe("USER-CODE");
    expect(result.verificationUri).toBe("https://github.com/login/device");
    expect(result.interval).toBe(5);
  });

  it("throws on non-200 response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("error", { status: 500 }));
    await expect(startGithubDeviceFlow()).rejects.toThrow("GitHub device code request failed");
  });
});

// ─── pollGithubDeviceFlow ────────────────────────────────────────────────────

describe("pollGithubDeviceFlow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns pending when authorization_pending", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "authorization_pending" }), { status: 200 }),
    );

    const result = await pollGithubDeviceFlow("dev-code");
    expect(result.status).toBe("pending");
  });

  it("returns slow_down with updated interval", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "slow_down", interval: 15 }), { status: 200 }),
    );

    const result = await pollGithubDeviceFlow("dev-code");
    expect(result.status).toBe("slow_down");
    if (result.status === "slow_down") expect(result.interval).toBe(15);
  });

  it("throws on expired_token", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "expired_token" }), { status: 200 }),
    );

    await expect(pollGithubDeviceFlow("dev-code")).rejects.toThrow("expired");
  });

  it("returns complete with credentials on success", async () => {
    // First fetch: GitHub token
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gh-token" }), { status: 200 }),
      )
      // Second fetch: Copilot token
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ token: "copilot-token", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
          { status: 200 },
        ),
      );

    const result = await pollGithubDeviceFlow("dev-code");
    expect(result.status).toBe("complete");
    if (result.status === "complete") {
      expect(result.credentials.access).toBe("copilot-token");
      expect(result.credentials.refresh).toBe("gh-token");
    }
  });
});

// ─── refreshOAuthCredentials dispatcher ─────────────────────────────────────

describe("refreshOAuthCredentials", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("delegates to Anthropic refresh for 'anthropic'", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new", refresh_token: "ref", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    const creds = await refreshOAuthCredentials("anthropic", {
      access: "old",
      refresh: "ref",
      expires: 0,
    });
    expect(creds.access).toBe("new");
  });

  it("delegates to Copilot refresh for 'github-copilot'", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ token: "copilot-new", expires_at: Math.floor(Date.now() / 1000) + 3600 }),
        { status: 200 },
      ),
    );

    const creds = await refreshOAuthCredentials("github-copilot", {
      access: "old",
      refresh: "gh-ref",
      expires: 0,
    });
    expect(creds.access).toBe("copilot-new");
  });

  it("throws for unsupported provider", async () => {
    await expect(
      refreshOAuthCredentials("openai", { access: "a", refresh: "r", expires: 0 }),
    ).rejects.toThrow("not supported");
  });
});
