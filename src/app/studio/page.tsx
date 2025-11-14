import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import StudioClient from "@/components/StudioClient";

export default async function Studio() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  return <StudioClient email={user.email} />;
}

