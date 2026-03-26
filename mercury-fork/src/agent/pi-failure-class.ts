/**
 * Classify pi CLI failures for retry vs next-model vs fail-fast.
 * Uses stderr/stdout text heuristics (pi does not expose structured HTTP codes here).
 */
export type PiFailureClass = "failFast" | "retryable" | "fallbackable";

export function classifyPiFailure(text: string): PiFailureClass {
  if (/provider ["']cursor["'] is no longer supported/i.test(text)) {
    return "failFast";
  }

  if (
    /\b401\b|\b403\b|invalid\s+api\s+key|incorrect\s+api\s+key|authentication\s+failed|invalid\s+authentication|unauthorized|access\s+denied/i.test(
      text,
    )
  ) {
    return "failFast";
  }

  if (
    /context\s+length|maximum\s+context|token\s+limit|too\s+many\s+tokens|prompt\s+is\s+too\s+long|max\s+tokens|request\s+too\s+large|maximum\s+tokens/i.test(
      text,
    )
  ) {
    return "fallbackable";
  }

  if (
    /tool\s+(use|calling)\s+not\s+supported|tools?\s+not\s+supported|function\s+calling\s+not\s+(supported|available)|does\s+not\s+support\s+tools?|model\s+does\s+not\s+support\s+(tools?|function)|no\s+tool\s+use|unsupported.*\btools?\b/i.test(
      text,
    )
  ) {
    return "fallbackable";
  }

  if (
    /tool\s+call\s+validation\s+failed|attempted\s+to\s+call\s+tool.*which\s+was\s+not\s+in\s+request\.tools/i.test(
      text,
    )
  ) {
    return "fallbackable";
  }

  if (/\b429\b|rate[_\s]+limit/i.test(text)) {
    return "fallbackable";
  }

  if (
    /\b402\b|insufficient\s+credits?|not\s+enough\s+credits?|purchase\s+(more\s+)?credits?|no\s+credits?/i.test(
      text,
    )
  ) {
    return "fallbackable";
  }

  if (
    /\b502\b|\b503\b|\b504\b|timeout|timed\s+out|ETIMEDOUT|ECONNRESET|temporarily\s+unavailable|overload|try\s+again|service\s+unavailable|bad\s+gateway|gateway\s+timeout/i.test(
      text,
    )
  ) {
    return "retryable";
  }

  // Default: assume transient; bounded retries + chain limit prevent infinite spin.
  return "retryable";
}
