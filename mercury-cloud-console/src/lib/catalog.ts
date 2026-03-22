import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const __dirname = dirname(fileURLToPath(import.meta.url));

export function catalogPath(): string {
  return join(__dirname, "../catalog/extensions.yaml");
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
  // Replace repo prefix in mercury_add if same layout
  const rest = ext.mercury_add.replace(/^[^#]+#/, "");
  return `${repoOverride}#${rest}`;
}
