import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { assertUserOrThrow } from "@/lib/admin-guard";
import { loadCatalog } from "@/lib/catalog";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = assertUserOrThrow(session);
  if (userId instanceof NextResponse) return userId;

  try {
    const catalog = loadCatalog();
    return NextResponse.json({
      extensions: catalog.extensions.map((e) => ({
        id: e.id,
        display_name: e.display_name,
        description: e.description,
        monthly_price_usd: e.monthly_price_usd,
      })),
    });
  } catch (err) {
    console.error("Failed to load catalog:", err);
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
