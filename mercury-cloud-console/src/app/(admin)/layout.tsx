import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin-guard";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  if (!assertAdmin(session)) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
