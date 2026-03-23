import { Hono } from "hono";
import { checkPerm, type Env, getApiCtx, getAuth } from "../api-types.js";
import { getSessionContextEstimate } from "../session-context-estimate.js";

export const session = new Hono<Env>();

session.get("/context", (c) => {
  const { spaceId } = getAuth(c);
  const denied = checkPerm(c, "compact");
  if (denied) return denied;

  const { config } = getApiCtx(c);
  const result = getSessionContextEstimate(config, spaceId);
  c.header("Cache-Control", "no-store");
  return c.json(result);
});
