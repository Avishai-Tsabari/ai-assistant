import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const ExtensionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  display_name: z.string(),
  description: z.string(),
  mercury_add: z.string().min(1),
  monthly_price_usd: z.number().nonnegative(),
  required_env: z.array(z.string()),
  model_capabilities: z.array(z.string()).optional().default([]),
});

const CatalogFileSchema = z.object({
  extensions: z.array(ExtensionSchema),
});

export type CatalogExtension = z.infer<typeof ExtensionSchema>;

export type Catalog = {
  extensions: CatalogExtension[];
};

export function catalogPath(): string {
  return join(process.cwd(), "src/catalog/extensions.yaml");
}

export function loadCatalog(): Catalog {
  const raw = readFileSync(catalogPath(), "utf8");
  const parsed = parseYaml(raw);
  return CatalogFileSchema.parse(parsed);
}

export function getExtensionById(id: string): CatalogExtension | undefined {
  return loadCatalog().extensions.find((e) => e.id === id);
}

export function resolveMercuryAdd(
  extensionId: string,
  repoOverride?: string,
): string {
  const ext = getExtensionById(extensionId);
  if (!ext) throw new Error(`Unknown extension id: ${extensionId}`);
  if (!repoOverride || repoOverride === "Michaelliv/mercury") {
    return ext.mercury_add;
  }
  const spec = ext.mercury_add;
  // Catalog uses git:… so published mercury-cli resolves via clone (GitHub shorthand is missing in some releases).
  if (spec.startsWith("git:")) {
    return spec.replaceAll("Michaelliv/mercury", repoOverride.replace(/\.git$/, ""));
  }
  const rest = spec.replace(/^[^#]+#/, "");
  return `${repoOverride}#${rest}`;
}
