import { describe, expect, test } from "bun:test";
import { classifyPiFailure } from "../src/agent/pi-failure-class.js";

describe("classifyPiFailure", () => {
  test("failFast on auth", () => {
    expect(classifyPiFailure("Error 401 unauthorized")).toBe("failFast");
    expect(classifyPiFailure("invalid api key")).toBe("failFast");
  });

  test("failFast on removed cursor provider", () => {
    expect(
      classifyPiFailure(
        'provider "cursor" is no longer supported. Use anthropic.',
      ),
    ).toBe("failFast");
  });

  test("fallbackable on context limits", () => {
    expect(classifyPiFailure("maximum context length exceeded")).toBe(
      "fallbackable",
    );
    expect(classifyPiFailure("token limit reached")).toBe("fallbackable");
  });

  test("fallbackable on tool / function-calling unsupported", () => {
    expect(classifyPiFailure("This model does not support tools")).toBe(
      "fallbackable",
    );
    expect(
      classifyPiFailure("function calling not available for this endpoint"),
    ).toBe("fallbackable");
  });

  test("retryable on transient signals", () => {
    expect(classifyPiFailure("429 rate limit exceeded")).toBe("retryable");
    expect(classifyPiFailure("503 service unavailable")).toBe("retryable");
    expect(classifyPiFailure("ETIMEDOUT")).toBe("retryable");
  });
});
