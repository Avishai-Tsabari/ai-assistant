/** Built-in space config keys (trigger + ambient). */

export const BUILTIN_CONFIG_KEYS = new Set([
  "trigger.match",
  "trigger.patterns",
  "trigger.case_sensitive",
  "trigger.media_in_groups",
  "ambient.enabled",
  "context.mode",
  "context.reply_chain_depth",
]);

const BUILTIN_VALIDATORS: Record<string, (v: string) => string | null> = {
  "trigger.match": (v) =>
    ["prefix", "mention", "always"].includes(v)
      ? null
      : "Invalid trigger.match value. Valid: prefix, mention, always",
  "trigger.case_sensitive": (v) =>
    ["true", "false"].includes(v)
      ? null
      : "Invalid trigger.case_sensitive value. Valid: true, false",
  "trigger.media_in_groups": (v) =>
    ["true", "false"].includes(v)
      ? null
      : "Invalid trigger.media_in_groups value. Valid: true, false",
  "ambient.enabled": (v) =>
    ["true", "false"].includes(v)
      ? null
      : "Invalid ambient.enabled value. Valid: true, false",
  "context.mode": (v) =>
    ["clear", "context"].includes(v)
      ? null
      : "Invalid context.mode value. Valid: clear, context",
  "context.reply_chain_depth": (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n >= 1 && n <= 50
      ? null
      : "Invalid context.reply_chain_depth value. Must be an integer between 1 and 50";
  },
};

export function isBuiltinConfigKey(key: string): boolean {
  return BUILTIN_CONFIG_KEYS.has(key);
}

/**
 * Validate a built-in space config key/value. Returns an error message or null if valid.
 * Call only when the key is known to be built-in, or use {@link validateDashboardBuiltinConfig}.
 */
export function validateBuiltinConfigValue(
  key: string,
  value: string,
): string | null {
  const validator = BUILTIN_VALIDATORS[key];
  if (validator) return validator(value);
  return null;
}

/** For dashboard-only updates: key must be built-in. */
export function validateDashboardBuiltinConfig(
  key: string,
  value: string,
): string | null {
  if (!isBuiltinConfigKey(key)) {
    return "Invalid config key for dashboard";
  }
  return validateBuiltinConfigValue(key, value);
}
