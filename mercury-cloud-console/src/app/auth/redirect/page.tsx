import { auth } from "@/auth";
import { assertAdmin } from "@/lib/admin-guard";
import { redirect } from "next/navigation";

export default async function AuthRedirectPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  if (assertAdmin(session)) {
    redirect("/admin/agents");
  }
  redirect("/dashboard");
}
