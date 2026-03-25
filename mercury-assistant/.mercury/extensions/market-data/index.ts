/**
 * market-data Mercury extension.
 *
 * Provides broker-agnostic, credential-free market data (quotes, bars, search)
 * via the Yahoo Finance public REST API. Available to all members by default —
 * no API key or brokerage account required.
 */
export default function (mercury: {
  permission(opts: { defaultRoles: string[] }): void;
  requires(capabilities: string[]): void;
  skill(relativePath: string): void;
}) {
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.requires(["tools"]);
  mercury.skill("./skill");
}
