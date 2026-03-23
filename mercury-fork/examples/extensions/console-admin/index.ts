export default function setup(mercury: {
  skill(relativePath: string): void;
  permission(opts: { defaultRoles: string[] }): void;
}) {
  mercury.skill("./skill");
  mercury.permission({ defaultRoles: ["admin"] });
}
