import { describe, it, expect } from "vitest";
import {
  providerEnvVar,
  oauthEnvVar,
  KNOWN_PROVIDERS,
} from "@/lib/providers";

describe("providerEnvVar", () => {
  it("returns known env var for anthropic", () => {
    expect(providerEnvVar("anthropic")).toBe("MERCURY_ANTHROPIC_API_KEY");
  });

  it("derives env var for unknown provider", () => {
    expect(providerEnvVar("custom-llm")).toBe("MERCURY_CUSTOM-LLM_API_KEY");
  });
});

describe("oauthEnvVar", () => {
  it("returns OAuth token env var for anthropic", () => {
    expect(oauthEnvVar("anthropic")).toBe("MERCURY_ANTHROPIC_OAUTH_TOKEN");
  });

  it("returns OAuth token env var for github-copilot", () => {
    expect(oauthEnvVar("github-copilot")).toBe("MERCURY_GITHUB_COPILOT_OAUTH_TOKEN");
  });

  it("derives fallback OAuth env var for unknown provider", () => {
    expect(oauthEnvVar("myprovider")).toBe("MERCURY_MYPROVIDER_OAUTH_TOKEN");
  });

  it("is distinct from providerEnvVar for anthropic", () => {
    expect(oauthEnvVar("anthropic")).not.toBe(providerEnvVar("anthropic"));
  });
});

describe("KNOWN_PROVIDERS OAuth metadata", () => {
  it("anthropic has oauthSupported=true with pkce type", () => {
    expect(KNOWN_PROVIDERS.anthropic.oauthSupported).toBe(true);
    expect(KNOWN_PROVIDERS.anthropic.oauthType).toBe("pkce");
  });

  it("github-copilot has oauthSupported=true with device type", () => {
    expect(KNOWN_PROVIDERS["github-copilot"].oauthSupported).toBe(true);
    expect(KNOWN_PROVIDERS["github-copilot"].oauthType).toBe("device");
  });

  it("openai does not have oauthSupported", () => {
    expect(KNOWN_PROVIDERS.openai.oauthSupported).toBeFalsy();
  });

  it("google does not have oauthSupported", () => {
    expect(KNOWN_PROVIDERS.google.oauthSupported).toBeFalsy();
  });
});
