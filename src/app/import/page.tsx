import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ImportClient from "@/components/ImportClient";

export default async function Import() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return <ImportClient email={user.email} />;
}

