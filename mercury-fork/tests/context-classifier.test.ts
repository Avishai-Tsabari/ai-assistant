import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as piAi from "@mariozechner/pi-ai";
import type { AppConfig } from "../src/config.js";
import { classifyContextNeeded } from "../src/core/context-classifier.js";

let tmpDir: string;
let sessionFile: string;
const baseConfig: AppConfig = {
  conditionalContextEnabled: true,
  contextClassifier: "heuristic",
  contextClassifierModel: undefined,
} as AppConfig;

function createSessionWithMessages(count: number) {
  const lines: string[] = [
    JSON.stringify({
      type: "session",
      version: 3,
      id: "test-id",
      timestamp: new Date().toISOString(),
      cwd: "/spaces/test",
    }),
  ];
  for (let i = 0; i < count; i++) {
    lines.push(
      JSON.stringify({
        type: "message",
        id: `msg-${i}`,
        parentId: i === 0 ? null : `msg-${i - 1}`,
        timestamp: new Date().toISOString(),
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    );
  }
  fs.writeFileSync(sessionFile, lines.join("\n"));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mercury-ctx-"));
  sessionFile = path.join(tmpDir, ".mercury.session.jsonl");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("classifyContextNeeded", () => {
  test("returns false when conditionalContextEnabled is false", async () => {
    createSessionWithMessages(5);
    const config = { ...baseConfig, conditionalContextEnabled: false };
    const result = await classifyContextNeeded(
      "what is 2+2?",
      sessionFile,
      config,
    );
    expect(result.useMinimal).toBe(false);
    expect(result.classifier.mode).toBe("off");
  });

  test("returns false when session file does not exist", async () => {
    const result = await classifyContextNeeded(
      "what is 2+2?",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(false);
    expect(result.classifier.mode).toBe("heuristic");
  });

  test("returns true for standalone prompt even with short session history", async () => {
    createSessionWithMessages(2);
    const result = await classifyContextNeeded(
      "what is 2+2?",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(true);
  });

  test("returns true for standalone prompt with enough history", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "what is 2+2?",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(true);
  });

  test("returns true for simple factual question", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "מהי מהירות הקול?",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(true);
  });

  test("returns false for summarize", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "please summarize what we discussed",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(false);
  });

  test("returns false for recap / today's chat phrasing", async () => {
    createSessionWithMessages(5);
    expect(
      (
        await classifyContextNeeded(
          "give me a quick recap of the thread",
          sessionFile,
          baseConfig,
        )
      ).useMinimal,
    ).toBe(false);
    expect(
      (
        await classifyContextNeeded(
          "what we said about the budget?",
          sessionFile,
          baseConfig,
        )
      ).useMinimal,
    ).toBe(false);
  });

  test("returns false for Hebrew conversation recap phrasing", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "מה שאמרנו על הנושא?",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(false);
  });

  test("returns false for as I said", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "as I said before, fix the bug",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(false);
  });

  test("returns false for Hebrew summarize (סכם)", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "סכם לי בבקשה את מה שדיברנו",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(false);
  });

  test("returns false for Hebrew summarize (תסכם)", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      "תסכם את השיחה",
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(false);
  });

  test("strips XML tags before matching", async () => {
    createSessionWithMessages(5);
    const result = await classifyContextNeeded(
      '<caller id="x" role="admin" />\n\nwhat is the capital of France?',
      sessionFile,
      baseConfig,
    );
    expect(result.useMinimal).toBe(true);
  });

  test("LLM mode returns false when no API key (uses full session)", async () => {
    createSessionWithMessages(5);
    const origGroq = process.env.MERCURY_GROQ_API_KEY;
    const origGroqRaw = process.env.GROQ_API_KEY;
    delete process.env.MERCURY_GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const config = {
        ...baseConfig,
        contextClassifier: "llm" as const,
        contextClassifierProvider: "groq",
        contextClassifierModel: "llama-3.3-70b-versatile",
      } as AppConfig;
      const result = await classifyContextNeeded(
        "what is 2+2?",
        sessionFile,
        config,
      );
      expect(result.useMinimal).toBe(false);
      expect(result.classifierUnavailable).toBe(true);
    } finally {
      if (origGroq !== undefined) process.env.MERCURY_GROQ_API_KEY = origGroq;
      if (origGroqRaw !== undefined) process.env.GROQ_API_KEY = origGroqRaw;
    }
  });

  test("LLM chain mode: skips legs without keys until all exhausted", async () => {
    createSessionWithMessages(5);
    const origGem = process.env.MERCURY_GEMINI_API_KEY;
    const origGroq = process.env.MERCURY_GROQ_API_KEY;
    delete process.env.MERCURY_GEMINI_API_KEY;
    delete process.env.MERCURY_GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const config = {
        ...baseConfig,
        contextClassifier: "llm" as const,
        contextClassifierProvider: undefined,
        contextClassifierModel: undefined,
        resolvedModelChain: [
          { provider: "google", model: "gemini-2.5-flash" },
          { provider: "groq", model: "llama-3.3-70b-versatile" },
        ],
      } as AppConfig;
      const result = await classifyContextNeeded(
        "what is 2+2?",
        sessionFile,
        config,
      );
      expect(result.useMinimal).toBe(false);
      expect(result.classifierUnavailable).toBe(true);
    } finally {
      if (origGem !== undefined) process.env.MERCURY_GEMINI_API_KEY = origGem;
      if (origGroq !== undefined) process.env.MERCURY_GROQ_API_KEY = origGroq;
    }
  });

  test("LLM chain mode: uses later leg when earlier leg returns API error", async () => {
    createSessionWithMessages(5);
    const origGem = process.env.MERCURY_GEMINI_API_KEY;
    const origGroq = process.env.MERCURY_GROQ_API_KEY;
    process.env.MERCURY_GEMINI_API_KEY = "test-gemini-key";
    process.env.MERCURY_GROQ_API_KEY = "test-groq-key";
    const stubModel = { id: "stub" } as Parameters<typeof piAi.complete>[0];

    let completeCalls = 0;
    const getModelSpy = spyOn(piAi, "getModel").mockImplementation(
      (_p: string, _m: string) => stubModel,
    );
    const completeSpy = spyOn(piAi, "complete").mockImplementation(async () => {
      completeCalls += 1;
      if (completeCalls === 1) {
        throw new Error("429 rate limit exceeded");
      }
      return {
        content: [{ type: "text" as const, text: "YES" }],
      };
    });

    try {
      const config = {
        ...baseConfig,
        contextClassifier: "llm" as const,
        contextClassifierProvider: undefined,
        contextClassifierModel: undefined,
        resolvedModelChain: [
          { provider: "google", model: "gemini-2.5-flash" },
          { provider: "groq", model: "llama-3.3-70b-versatile" },
        ],
      } as AppConfig;
      const result = await classifyContextNeeded(
        "what is 2+2?",
        sessionFile,
        config,
      );
      expect(result.useMinimal).toBe(true);
      expect(result.classifier.mode).toBe("llm");
      expect(completeCalls).toBe(2);
    } finally {
      getModelSpy.mockRestore();
      completeSpy.mockRestore();
      if (origGem !== undefined) process.env.MERCURY_GEMINI_API_KEY = origGem;
      else delete process.env.MERCURY_GEMINI_API_KEY;
      if (origGroq !== undefined) process.env.MERCURY_GROQ_API_KEY = origGroq;
      else delete process.env.MERCURY_GROQ_API_KEY;
    }
  });
});
