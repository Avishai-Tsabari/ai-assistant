/**
 * Tests for OAuth API routes: start, complete, poll.
 * Uses vi.mock() to isolate from auth, DB, and external HTTP.
 *
 * Route files are imported dynamically after mocks are established.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: next-auth ─────────────────────────────────────────────────────────
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// ─── Mock: DB ────────────────────────────────────────────────────────────────
const mockInsertRun = vi.fn();
const mockSelectGet = vi.fn();
const mockDeleteRun = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: mockInsertRun })) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ get: mockSelectGet })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ run: mockDeleteRun })) })),
  })),
  oauthSessions: {},
  providerKeys: {},
}));

// ─── Mock: encryption ────────────────────────────────────────────────────────
vi.mock("@/lib/encryption", () => ({
  getMasterKey: vi.fn(() => "a".repeat(64)),
  encryptSecret: vi.fn((plain: string) => `encrypted:${plain}`),
  decryptSecret: vi.fn((cipher: string) => cipher.replace("encrypted:", "")),
}));

// ─── Mock: oauth utilities ───────────────────────────────────────────────────
vi.mock("@/lib/oauth", () => ({
  generatePkceVerifier: vi.fn(() => "mock-verifier"),
  buildAnthropicAuthUrl: vi.fn(async () => "https://claude.ai/oauth/authorize?mock=1"),
  parseAnthropicPaste: vi.fn((v: string) =>
    v === "mycode#mystate" ? { code: "mycode", state: "mystate" } : null,
  ),
  exchangeAnthropicCode: vi.fn(async () => ({
    access: "acc-token",
    refresh: "ref-token",
    expires: Date.now() + 3600 * 1000,
  })),
  startGithubDeviceFlow: vi.fn(async () => ({
    deviceCode: "dev-code",
    userCode: "ABCD-1234",
    verificationUri: "https://github.com/login/device",
    interval: 5,
    expiresIn: 900,
  })),
  pollGithubDeviceFlow: vi.fn(async () => ({ status: "pending" })),
  refreshOAuthCredentials: vi.fn(),
}));

import { auth } from "@/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockSession(userId = "user-1") {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);
}

function mockNoSession() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(auth).mockResolvedValue(null as any);
}

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/user/oauth/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── /start route ────────────────────────────────────────────────────────────

describe("POST /api/user/oauth/[provider]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const { POST } = await import("@/app/api/user/oauth/[provider]/start/route");
    const res = await POST(makeRequest("POST"), { params: Promise.resolve({ provider: "anthropic" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for unsupported provider", async () => {
    mockSession();
    const { POST } = await import("@/app/api/user/oauth/[provider]/start/route");
    const res = await POST(makeRequest("POST"), { params: Promise.resolve({ provider: "openai" }) });
    expect(res.status).toBe(400);
  });

  it("returns sessionId and authUrl for anthropic", async () => {
    mockSession();
    mockInsertRun.mockReturnValue(undefined);
    const { POST } = await import("@/app/api/user/oauth/[provider]/start/route");
    const res = await POST(makeRequest("POST"), { params: Promise.resolve({ provider: "anthropic" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionId: string; authUrl: string };
    expect(body.sessionId).toBeTruthy();
    expect(body.authUrl).toContain("claude.ai");
  });

  it("returns sessionId, userCode and verificationUri for github-copilot", async () => {
    mockSession();
    mockInsertRun.mockReturnValue(undefined);
    const { POST } = await import("@/app/api/user/oauth/[provider]/start/route");
    const res = await POST(makeRequest("POST"), {
      params: Promise.resolve({ provider: "github-copilot" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { sessionId: string; userCode: string; verificationUri: string };
    expect(body.sessionId).toBeTruthy();
    expect(body.userCode).toBe("ABCD-1234");
    expect(body.verificationUri).toContain("github.com");
  });
});

// ─── /complete route ──────────────────────────────────────────────────────────

describe("POST /api/user/oauth/[provider]/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const { POST } = await import("@/app/api/user/oauth/[provider]/complete/route");
    const res = await POST(makeRequest("POST", { sessionId: "s1", pastedValue: "mycode#mystate" }), {
      params: Promise.resolve({ provider: "anthropic" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing sessionId or pastedValue", async () => {
    mockSession();
    const { POST } = await import("@/app/api/user/oauth/[provider]/complete/route");
    const res = await POST(makeRequest("POST", {}), {
      params: Promise.resolve({ provider: "anthropic" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when session not found or expired", async () => {
    mockSession();
    mockSelectGet.mockReturnValue(null);
    const { POST } = await import("@/app/api/user/oauth/[provider]/complete/route");
    const res = await POST(
      makeRequest("POST", { sessionId: "bad-session", pastedValue: "mycode#mystate" }),
      { params: Promise.resolve({ provider: "anthropic" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for unparseable paste", async () => {
    mockSession();
    mockSelectGet.mockReturnValue({
      id: "s1",
      userId: "user-1",
      provider: "anthropic",
      pkceVerifier: "mock-verifier",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    // parseAnthropicPaste returns null for this input
    const { POST } = await import("@/app/api/user/oauth/[provider]/complete/route");
    const res = await POST(
      makeRequest("POST", { sessionId: "s1", pastedValue: "bad-paste-no-state" }),
      { params: Promise.resolve({ provider: "anthropic" }) },
    );
    expect(res.status).toBe(400);
  });

  it("stores encrypted credentials and returns keyId on success", async () => {
    mockSession();
    mockSelectGet.mockReturnValue({
      id: "s1",
      userId: "user-1",
      provider: "anthropic",
      pkceVerifier: "mock-verifier",
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    mockInsertRun.mockReturnValue(undefined);
    mockDeleteRun.mockReturnValue(undefined);

    const { POST } = await import("@/app/api/user/oauth/[provider]/complete/route");
    const res = await POST(
      makeRequest("POST", { sessionId: "s1", pastedValue: "mycode#mystate" }),
      { params: Promise.resolve({ provider: "anthropic" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; keyId: string };
    expect(body.ok).toBe(true);
    expect(body.keyId).toBeTruthy();
  });
});

// ─── /poll route ──────────────────────────────────────────────────────────────

describe("GET /api/user/oauth/[provider]/poll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockNoSession();
    const { GET } = await import("@/app/api/user/oauth/[provider]/poll/route");
    const res = await GET(
      new Request("http://localhost/api/user/oauth/github-copilot/poll?sessionId=s1"),
      { params: Promise.resolve({ provider: "github-copilot" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when session not found", async () => {
    mockSession();
    mockSelectGet.mockReturnValue(null);
    const { GET } = await import("@/app/api/user/oauth/[provider]/poll/route");
    const res = await GET(
      new Request("http://localhost/api/user/oauth/github-copilot/poll?sessionId=bad"),
      { params: Promise.resolve({ provider: "github-copilot" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns { status: pending } while waiting", async () => {
    mockSession();
    mockSelectGet.mockReturnValue({
      id: "s1",
      userId: "user-1",
      provider: "github-copilot",
      deviceCode: "dev-code",
      deviceInterval: 5,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const { GET } = await import("@/app/api/user/oauth/[provider]/poll/route");
    const res = await GET(
      new Request("http://localhost/api/user/oauth/github-copilot/poll?sessionId=s1"),
      { params: Promise.resolve({ provider: "github-copilot" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("pending");
  });
});
