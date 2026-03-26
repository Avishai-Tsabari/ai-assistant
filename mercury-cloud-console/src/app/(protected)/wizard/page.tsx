import { redirect } from "next/navigation";
import { auth } from "@/auth";
import WizardClient from "./WizardClient";

export default async function WizardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }

  return <WizardClient />;
}
