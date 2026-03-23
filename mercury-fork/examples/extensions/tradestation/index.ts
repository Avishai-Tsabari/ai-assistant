import {
  runTradeStationTokenRefresh,
  TRADESTATION_EXT,
} from "./host/refresh.js";

const API_BASE_DEFAULT = "https://api.tradestation.com/v3";

function apiBaseFromHost(): string {
  const raw = process.env.MERCURY_TS_API_BASE?.trim();
  if (raw) return raw.replace(/\/$/, "");
  const env = process.env.MERCURY_TS_ENVIRONMENT?.trim().toUpperCase();
  if (env === "LIVE" || env === "SIM") {
    return API_BASE_DEFAULT;
  }
  return API_BASE_DEFAULT;
}

/** Structural match for `MercuryExtensionAPI` (avoid package subpath imports). */
type MercuryExt = {
  permission(opts: { defaultRoles: string[] }): void;
  requires(
    capabilities: (
      | "tools"
      | "vision"
      | "audio_input"
      | "audio_output"
      | "extended_thinking"
    )[],
  ): void;
  job(
    name: string,
    def: {
      interval: number;
      run: (ctx: {
        db: {
          getExtState(e: string, k: string): string | null;
          setExtState(e: string, k: string, v: string): void;
          deleteExtState(e: string, k: string): boolean;
        };
        log: {
          info(m: string, x?: unknown): void;
          warn(m: string, x?: unknown): void;
          error(m: string, x?: unknown): void;
        };
      }) => Promise<void>;
    },
  ): void;
  on(
    event: "before_container",
    handler: (
      event: {
        spaceId: string;
        callerId: string;
      },
      ctx: {
        db: {
          getExtState(e: string, k: string): string | null;
        };
        hasCallerPermission(
          spaceId: string,
          callerId: string,
          permission: string,
        ): boolean;
      },
    ) => Promise<{ env?: Record<string, string> } | undefined>,
  ): void;
  skill(relativePath: string): void;
};

export default function (mercury: MercuryExt) {
  mercury.permission({ defaultRoles: [] });
  mercury.requires(["tools"]);

  mercury.job("ts-token-refresh", {
    interval: 600_000,
    run: async (ctx) => {
      await runTradeStationTokenRefresh(ctx.db, {
        info: (msg, extra) => ctx.log.info(msg, extra),
        warn: (msg, extra) => ctx.log.warn(msg, extra),
        error: (msg, err) => ctx.log.error(msg, err),
      });
    },
  });

  mercury.on("before_container", async (event, ctx) => {
    if (
      !ctx.hasCallerPermission(event.spaceId, event.callerId, TRADESTATION_EXT)
    ) {
      return undefined;
    }

    const base = apiBaseFromHost();
    const authError = ctx.db.getExtState(TRADESTATION_EXT, "auth_error");
    const token = ctx.db.getExtState(TRADESTATION_EXT, "access_token");

    const env: Record<string, string> = {
      TRADESTATION_API_BASE: base,
    };

    if (authError) {
      env.TRADESTATION_AUTH_ERROR = authError;
    }

    if (token) {
      env.TRADESTATION_ACCESS_TOKEN = token;
    }

    return { env };
  });

  mercury.skill("./skill");
}
